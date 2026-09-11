import { prisma } from "@/lib/db";
import {
  CERTIFICATE_DIR,
  ZIP_DIR,
  TMP_DIR,
  safeFilename,
  ensureStorageDirs,
  getObject,
  putObject,
  deleteStoredFile
} from "@/lib/storage";
import { parseWorkbookBuffer, buildParticipants, type ColumnMapping } from "@/lib/excelParser";
import { generateUniqueCertificateId } from "@/lib/certId";
import { renderCertificate } from "@/lib/certificateRenderer";
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

export async function runGenerationBatch(params: {
  uploadId: string;
  eventId: string;
  templateId: string;
  issueDate: string;
  mapping: ColumnMapping;
}): Promise<GenerationSummary> {
  await ensureStorageDirs();

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

  const batch = await prisma.generationBatch.create({
    data: {
      eventId: event.id,
      templateId: template.id,
      totalCount: valid.length,
      status: "PROCESSING"
    }
  });

  const fields = template.fields as unknown as FieldConfig[];
  // Each rendered PDF is kept alongside its upload so the ZIP can be assembled
  // from the buffers already in hand, rather than downloading every certificate
  // back out of object storage a second time.
  const zipEntries: ZipEntry[] = [];
  const generationErrors: { row: number; reason: string }[] = [...errors];
  let successCount = 0;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const participant of valid) {
    try {
      const certificateId = await generateUniqueCertificateId(issueDateObj.getFullYear());
      const verifyUrl = `${appUrl}/certificate/verify/${certificateId}`;

      const pdfBuffer = await renderCertificate({
        templateFilename: template.fileUrl,
        widthPx: template.widthPx,
        heightPx: template.heightPx,
        fields,
        qr: {
          enabled: template.qrEnabled,
          x: template.qrX ?? template.widthPx - 160,
          y: template.qrY ?? template.heightPx - 160,
          size: template.qrSize ?? 120
        },
        verifyUrl,
        values: {
          participantName: participant.participantName,
          certificateId,
          eventName: event.name,
          eventDate: formatCertificateDate(event.date),
          issueDate: formatCertificateDate(issueDateObj)
        }
      });

      const storedFilename = safeFilename("pdf");
      await putObject(CERTIFICATE_DIR, storedFilename, pdfBuffer, "application/pdf");

      await prisma.certificate.create({
        data: {
          certificateId,
          participantName: participant.participantName,
          participantNameNormalized: participant.participantName.trim().toLowerCase(),
          participantEmail: participant.participantEmail,
          eventId: event.id,
          templateId: template.id,
          fileUrl: storedFilename,
          issueDate: issueDateObj,
          batchId: batch.id
        }
      });

      zipEntries.push({
        data: pdfBuffer,
        arcName: safeArcFilename(participant.participantName, certificateId, "pdf")
      });
      successCount += 1;
    } catch (err) {
      generationErrors.push({
        row: participant.sourceRow,
        reason: err instanceof Error ? err.message : "Certificate generation failed."
      });
    }
  }

  let zipUrl: string | null = null;
  if (zipEntries.length > 0) {
    const zipFilename = safeFilename("zip");
    const zipBuffer = await createZipBuffer(zipEntries);
    await putObject(ZIP_DIR, zipFilename, zipBuffer, "application/zip");
    zipUrl = zipFilename;
  }

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

  return {
    batchId: batch.id,
    totalRows: rows.length,
    successCount,
    failedCount: generationErrors.length,
    errors: generationErrors,
    downloadUrl: zipUrl ? `/api/admin/certificates/download-zip/${batch.id}` : ""
  };
}
