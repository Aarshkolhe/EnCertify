import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { prisma } from "@/lib/db";
import {
  CERTIFICATE_DIR,
  TEMPLATE_DIR,
  ZIP_DIR,
  TMP_DIR,
  safeFilename,
  getObject,
  putObject,
  putObjectFromFile,
  deleteStoredFile
} from "@/lib/storage";
import { parseWorkbookBuffer, buildParticipants, type ColumnMapping } from "@/lib/excelParser";
import { generateBatchCertificateIds } from "@/lib/certId";
import { renderCertificate } from "@/lib/certificateRenderer";
import { loadImage, type Image } from "@napi-rs/canvas";
import { createZipArchive, safeArcFilename, type ZipFileEntry } from "@/lib/zip";
import { formatCertificateDate } from "@/lib/dates";
import type { FieldConfig } from "@/lib/fieldTypes";

export interface GenerationSummary {
  batchId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: { row: number; reason: string }[];
  downloadUrl: string;
  timings?: {
    totalDuration: number;
    templateDuration: number;
    idDuration: number;
    renderDuration: number;
    dbDuration: number;
    zipCreationDuration: number;
    zipUploadDuration: number;
  };
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
  tempPdfPath: string;
  arcName: string;
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

  let tempBatchDir: string | null = null;
  const successfulResults: WorkerResult[] = [];
  const generationErrors: { row: number; reason: string }[] = [...errors];
  let dbInserted = false;
  let zipFilename: string | null = null;

  try {
    // Scratch directory for streaming ZIP creation — keeps memory flat across the batch
    tempBatchDir = await fsp.mkdtemp(path.join(os.tmpdir(), `encertify-batch-${batch.id}-`));

    // --------------------------------------------------------------------------
    // Phase 2: Template pre-download & decode (Downloaded & decoded ONCE per batch)
    // --------------------------------------------------------------------------
    const templateStart = performance.now();
    let loadedBackground: Image;
    try {
      const backgroundBytes = await getObject(TEMPLATE_DIR, activeTemplate.fileUrl);
      loadedBackground = await loadImage(backgroundBytes);
    } catch (err) {
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
    // Phase 4: Bounded Concurrent Rendering & Upload (No PDF buffer retention)
    // --------------------------------------------------------------------------
    const renderStart = performance.now();
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

          // Write PDF to disk temp folder so it can be streamed into the ZIP without RAM retention
          const tempPdfPath = path.join(tempBatchDir!, `${certificateId}.pdf`);
          await fsp.writeFile(tempPdfPath, pdfBuffer);

          // Crucial: we do NOT keep pdfBuffer in successfulResults.
          // It is immediately garbage collected once this worker iteration ends.
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
            tempPdfPath,
            arcName: safeArcFilename(participant.participantName, certificateId, "pdf"),
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
    // Phase 5 & 6: Bulk Database Insertion
    // --------------------------------------------------------------------------
    const dbStart = performance.now();
    if (successfulResults.length > 0) {
      await prisma.certificate.createMany({
        data: successfulResults.map((r) => r.record)
      });
      dbInserted = true;
    }
    const dbDuration = performance.now() - dbStart;

    // --------------------------------------------------------------------------
    // Phase 8: Streaming ZIP Generation & Upload
    // --------------------------------------------------------------------------
    let zipCreationDuration = 0;
    let zipUploadDuration = 0;
    if (successfulResults.length > 0) {
      const generatedZipFilename = safeFilename("zip");
      const tempZipPath = path.join(tempBatchDir, "batch.zip");

      const zipEntries: ZipFileEntry[] = successfulResults.map((r) => ({
        filePath: r.tempPdfPath,
        arcName: r.arcName
      }));

      const zipCreateStart = performance.now();
      await createZipArchive(zipEntries, tempZipPath);
      zipCreationDuration = performance.now() - zipCreateStart;

      const zipUploadStart = performance.now();
      await putObjectFromFile(ZIP_DIR, generatedZipFilename, tempZipPath, "application/zip", {
        batchId: batch.id
      });
      zipUploadDuration = performance.now() - zipUploadStart;
      zipFilename = generatedZipFilename;

      // Clean up the temporary batch ZIP immediately after successful upload
      await fsp.unlink(tempZipPath).catch(() => {});
    }
    const zipDuration = zipCreationDuration + zipUploadDuration;

    // --------------------------------------------------------------------------
    // Phase 9: Final Batch Update
    // --------------------------------------------------------------------------
    const successCount = successfulResults.length;
    const finalStatus = successCount > 0 ? "COMPLETED" : "FAILED";
    await prisma.generationBatch.update({
      where: { id: batch.id },
      data: {
        successCount,
        failedCount: generationErrors.length,
        errors: generationErrors,
        zipUrl: zipFilename,
        status: finalStatus
      }
    });

    await deleteStoredFile(TMP_DIR, params.uploadId).catch(() => {});

    const totalDuration = performance.now() - totalStart;
    console.log(
      `[generation] Batch ${batch.id}: ${successCount}/${valid.length} certs generated in ${totalDuration.toFixed(0)}ms (template: ${templateDuration.toFixed(0)}ms, ids: ${idDuration.toFixed(0)}ms, render+upload: ${renderDuration.toFixed(0)}ms, db: ${dbDuration.toFixed(0)}ms, zip creation: ${zipCreationDuration.toFixed(0)}ms, zip upload: ${zipUploadDuration.toFixed(0)}ms)`
    );

    return {
      batchId: batch.id,
      totalRows: rows.length,
      successCount,
      failedCount: generationErrors.length,
      errors: generationErrors,
      downloadUrl: zipFilename ? `/api/admin/certificates/download-zip/${batch.id}` : "",
      timings: {
        totalDuration,
        templateDuration,
        idDuration,
        renderDuration,
        dbDuration,
        zipCreationDuration,
        zipUploadDuration
      }
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error during batch generation";
    console.error(`[generation] Batch ${batch.id} failed:`, errorMsg);

    // Rollback / cleanup database certificates if createMany had succeeded
    if (dbInserted) {
      try {
        await prisma.certificate.deleteMany({
          where: { batchId: batch.id }
        });
      } catch (dbCleanupErr) {
        console.error(
          `[generation] Failed to delete certificates for batch ${batch.id}:`,
          dbCleanupErr instanceof Error ? dbCleanupErr.message : "Unknown error"
        );
      }
    }

    // Rollback / delete uploaded PDFs for this batch attempt
    if (successfulResults.length > 0) {
      await Promise.allSettled(
        successfulResults.map((r) => deleteStoredFile(CERTIFICATE_DIR, r.storedFilename))
      );
    }

    // Rollback / delete uploaded ZIP if any
    if (zipFilename) {
      try {
        await deleteStoredFile(ZIP_DIR, zipFilename);
      } catch (zipCleanupErr) {
        console.error(
          `[generation] Failed to delete zip for batch ${batch.id}:`,
          zipCleanupErr instanceof Error ? zipCleanupErr.message : "Unknown error"
        );
      }
    }

    // Clean up temporary upload where appropriate
    await deleteStoredFile(TMP_DIR, params.uploadId).catch(() => {});

    // Ensure batch is marked as FAILED - never left in PROCESSING
    try {
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: {
          status: "FAILED",
          failedCount: valid.length,
          errors: [
            ...generationErrors,
            { row: 0, reason: errorMsg }
          ]
        }
      });
    } catch (batchUpdateErr) {
      console.error(
        `[generation] Critical: could not update batch ${batch.id} to FAILED:`,
        batchUpdateErr instanceof Error ? batchUpdateErr.message : "Unknown error"
      );
    }

    throw error;
  } finally {
    // Always clean up temporary directory on disk
    if (tempBatchDir) {
      await fsp.rm(tempBatchDir, { recursive: true, force: true }).catch((rmErr) => {
        console.error("[generation] Could not remove temp dir:", rmErr);
      });
    }
  }
}
