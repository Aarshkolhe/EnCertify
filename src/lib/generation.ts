import { prisma } from "@/lib/db";
import {
  CERTIFICATE_DIR,
  TEMPLATE_DIR,
  ZIP_DIR,
  TMP_DIR,
  safeFilename,
  getObject,
  putObject,
  deleteStoredFile
} from "@/lib/storage";
import { parseWorkbookBuffer, buildParticipants, type ColumnMapping } from "@/lib/excelParser";
import { generateBatchCertificateIds } from "@/lib/certId";
import { renderCertificate } from "@/lib/certificateRenderer";
import { loadImage, type Image } from "@napi-rs/canvas";
import { createZipBuffer, safeArcFilename, type ZipEntry } from "@/lib/zip";
import { formatCertificateDate } from "@/lib/dates";
import type { FieldConfig } from "@/lib/fieldTypes";

export interface GenerationSummary {
  batchId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: { row: number; reason: string }[];
  downloadUrl: string;
}

/**
 * Concurrency ceiling for parallel certificate rendering and storage uploads.
 * Keeps memory bounded (canvas + PDF buffers) while avoiding Vercel serverless timeouts.
 */
export const DEFAULT_GENERATION_CONCURRENCY = 3;

interface WorkerResult {
  record: {
    certificateId: string;
    participantName: string;
    participantNameNormalized: string;
    participantEmail: string | null;
    eventId: string;
    templateId: string;
    fileUrl: string;
    issueDate: Date;
    batchId: string;
  };
  storedFilename: string;
  zipEntry: ZipEntry;
  sourceRow: number;
}

export async function runGenerationBatch(
  params: {
    uploadId: string;
    eventId: string;
    templateId: string;
    issueDate: string;
    mapping: ColumnMapping;
  },
  concurrency = DEFAULT_GENERATION_CONCURRENCY
): Promise<GenerationSummary> {
  const totalStart = performance.now();

  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) throw new Error("Event not found.");

  const template = await prisma.template.findUnique({ where: { id: params.templateId } });
  if (!template) throw new Error("Template not found.");

  const issueDateObj = new Date(params.issueDate);
  if (Number.isNaN(issueDateObj.getTime())) throw new Error("Invalid issue date.");

  let buffer: Buffer;
  try {
    buffer = await getObject(TMP_DIR, params.uploadId);
  } catch {
    throw new Error("The uploaded file has expired or was not found. Please upload it again.");
  }

  const { headers, rows } = parseWorkbookBuffer(buffer);
  const { valid, errors } = buildParticipants(headers, rows, params.mapping);

  if (valid.length === 0) {
    throw new Error("No valid participant rows were found after validation.");
  }

  const activeEvent = event;
  const activeTemplate = template;

  const batch = await prisma.generationBatch.create({
    data: {
      eventId: activeEvent.id,
      templateId: activeTemplate.id,
      totalCount: valid.length,
      status: "PROCESSING"
    }
  });

  // --------------------------------------------------------------------------
  // Phase 2: Template pre-download & decode (Downloaded & decoded ONCE per batch)
  // --------------------------------------------------------------------------
  const templateStart = performance.now();
  let loadedBackground: Image;
  try {
    const backgroundBytes = await getObject(TEMPLATE_DIR, activeTemplate.fileUrl);
    loadedBackground = await loadImage(backgroundBytes);
  } catch (err) {
    await prisma.generationBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        failedCount: valid.length,
        errors: [{ row: 0, reason: `Template loading failed: ${err instanceof Error ? err.message : "Not found"}` }]
      }
    });
    throw new Error(`Could not load template background: ${err instanceof Error ? err.message : "Not found"}`);
  }
  const templateDuration = performance.now() - templateStart;

  // --------------------------------------------------------------------------
  // Phase 3: Batch Certificate ID Pre-allocation (1 single DB check instead of N)
  // --------------------------------------------------------------------------
  const idStart = performance.now();
  const certificateIds = await generateBatchCertificateIds(
    issueDateObj.getFullYear(),
    valid.length
  );
  const idDuration = performance.now() - idStart;

  const fields = activeTemplate.fields as unknown as FieldConfig[];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // --------------------------------------------------------------------------
  // Phase 4: Bounded Concurrent Rendering & Upload
  // --------------------------------------------------------------------------
  const renderStart = performance.now();
  const successfulResults: WorkerResult[] = [];
  const generationErrors: { row: number; reason: string }[] = [...errors];

  let nextIndex = 0;
  const workerCount = Math.min(concurrency, valid.length);

  async function worker() {
    while (nextIndex < valid.length) {
      const idx = nextIndex++;
      const participant = valid[idx];
      const certificateId = certificateIds[idx];

      try {
        const verifyUrl = `${appUrl}/certificate/verify/${certificateId}`;

        const pdfBuffer = await renderCertificate({
          templateFilename: activeTemplate.fileUrl,
          background: loadedBackground, // Reuses the already-decoded template in-memory
          widthPx: activeTemplate.widthPx,
          heightPx: activeTemplate.heightPx,
          fields,
          qr: {
            enabled: activeTemplate.qrEnabled,
            x: activeTemplate.qrX ?? activeTemplate.widthPx - 160,
            y: activeTemplate.qrY ?? activeTemplate.heightPx - 160,
            size: activeTemplate.qrSize ?? 120
          },
          verifyUrl,
          values: {
            participantName: participant.participantName,
            certificateId,
            eventName: activeEvent.name,
            eventDate: formatCertificateDate(activeEvent.date),
            issueDate: formatCertificateDate(issueDateObj)
          }
        });

        const storedFilename = safeFilename("pdf");
        await putObject(CERTIFICATE_DIR, storedFilename, pdfBuffer, "application/pdf");

        successfulResults.push({
          record: {
            certificateId,
            participantName: participant.participantName,
            participantNameNormalized: participant.participantName.trim().toLowerCase(),
            participantEmail: participant.participantEmail,
            eventId: activeEvent.id,
            templateId: activeTemplate.id,
            fileUrl: storedFilename,
            issueDate: issueDateObj,
            batchId: batch.id
          },
          storedFilename,
          zipEntry: {
            data: pdfBuffer,
            arcName: safeArcFilename(participant.participantName, certificateId, "pdf")
          },
          sourceRow: participant.sourceRow
        });
      } catch (err) {
        generationErrors.push({
          row: participant.sourceRow,
          reason: err instanceof Error ? err.message : "Certificate generation failed."
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const renderDuration = performance.now() - renderStart;

  // --------------------------------------------------------------------------
  // Phase 5 & 6: Bulk Database Insertion & Failure Cleanup
  // --------------------------------------------------------------------------
  const dbStart = performance.now();
  if (successfulResults.length > 0) {
    try {
      await prisma.certificate.createMany({
        data: successfulResults.map((r) => r.record)
      });
    } catch (dbErr) {
      console.error("[generation] DB bulk insert failed, cleaning up uploaded files:", dbErr);
      // Clean up orphaned PDF files uploaded during this batch attempt
      await Promise.allSettled(
        successfulResults.map((r) => deleteStoredFile(CERTIFICATE_DIR, r.storedFilename))
      );

      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          failedCount: valid.length,
          errors: [
            ...generationErrors,
            {
              row: 0,
              reason: `Database persistence failed: ${dbErr instanceof Error ? dbErr.message : "Unknown error"}`
            }
          ]
        }
      });

      throw new Error(
        `Failed to save certificates to database: ${dbErr instanceof Error ? dbErr.message : "Unknown error"}`
      );
    }
  }
  const dbDuration = performance.now() - dbStart;

  // --------------------------------------------------------------------------
  // Phase 8: ZIP Generation & Final Batch Update
  // --------------------------------------------------------------------------
  const zipStart = performance.now();
  let zipUrl: string | null = null;
  if (successfulResults.length > 0) {
    const zipFilename = safeFilename("zip");
    const zipEntries = successfulResults.map((r) => r.zipEntry);
    const zipBuffer = await createZipBuffer(zipEntries);
    await putObject(ZIP_DIR, zipFilename, zipBuffer, "application/zip");
    zipUrl = zipFilename;
  }
  const zipDuration = performance.now() - zipStart;

  const successCount = successfulResults.length;
  await prisma.generationBatch.update({
    where: { id: batch.id },
    data: {
      successCount,
      failedCount: generationErrors.length,
      errors: generationErrors,
      zipUrl,
      status: successCount > 0 ? "COMPLETED" : "FAILED"
    }
  });

  await deleteStoredFile(TMP_DIR, params.uploadId).catch(() => {});

  const totalDuration = performance.now() - totalStart;
  console.log(
    `[generation] Batch ${batch.id}: ${successCount}/${valid.length} certs generated in ${totalDuration.toFixed(0)}ms (template: ${templateDuration.toFixed(0)}ms, ids: ${idDuration.toFixed(0)}ms, render+upload: ${renderDuration.toFixed(0)}ms, db: ${dbDuration.toFixed(0)}ms, zip: ${zipDuration.toFixed(0)}ms)`
  );

  return {
    batchId: batch.id,
    totalRows: rows.length,
    successCount,
    failedCount: generationErrors.length,
    errors: generationErrors,
    downloadUrl: zipUrl ? `/api/admin/certificates/download-zip/${batch.id}` : ""
  };
}
