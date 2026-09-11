import { prisma } from "@/lib/db";
import { CERTIFICATE_DIR, ZIP_DIR, deleteStoredFile } from "@/lib/storage";

/**
 * Hard deletes for the admin panel.
 *
 * Every relation in the schema is `Restrict` by default, so a parent row
 * cannot be removed while children reference it. Rather than switching the
 * schema to `Cascade` — which would make an accidental delete silently take
 * certificates with it — the cascade is written out explicitly here, in one
 * transaction, so the blast radius of each call is visible at the call site.
 *
 * Ordering is deliberate: rows are committed first, files removed afterwards.
 * An orphaned file wastes disk but harms nothing; a surviving row pointing at
 * a file that was already unlinked is a broken download for a user.
 */

export interface DeletionSummary {
  certificates: number;
  batches: number;
  filesRemoved: number;
}

async function removeFiles(dir: string, names: Array<string | null>): Promise<number> {
  let removed = 0;
  for (const name of names) {
    try {
      if (await deleteStoredFile(dir, name)) removed++;
    } catch (err) {
      // The rows are already gone and retrying will not bring them back, so a
      // file we cannot unlink is logged and left as an orphan.
      console.error("[delete] could not remove file:", err);
    }
  }
  return removed;
}

/** Deletes an event along with every certificate and batch belonging to it. */
export async function deleteEventCascade(eventId: string): Promise<DeletionSummary> {
  const [certificates, batches] = await Promise.all([
    prisma.certificate.findMany({ where: { eventId }, select: { fileUrl: true } }),
    prisma.generationBatch.findMany({ where: { eventId }, select: { zipUrl: true } })
  ]);

  await prisma.$transaction([
    prisma.certificate.deleteMany({ where: { eventId } }),
    prisma.generationBatch.deleteMany({ where: { eventId } }),
    prisma.event.delete({ where: { id: eventId } })
  ]);

  const filesRemoved =
    (await removeFiles(CERTIFICATE_DIR, certificates.map((c) => c.fileUrl))) +
    (await removeFiles(ZIP_DIR, batches.map((b) => b.zipUrl)));

  return { certificates: certificates.length, batches: batches.length, filesRemoved };
}

/** Deletes one generation batch and every certificate produced by it. */
export async function deleteBatchCascade(batchId: string): Promise<DeletionSummary> {
  const [certificates, batch] = await Promise.all([
    prisma.certificate.findMany({ where: { batchId }, select: { fileUrl: true } }),
    prisma.generationBatch.findUnique({ where: { id: batchId }, select: { zipUrl: true } })
  ]);

  await prisma.$transaction([
    prisma.certificate.deleteMany({ where: { batchId } }),
    prisma.generationBatch.delete({ where: { id: batchId } })
  ]);

  const filesRemoved =
    (await removeFiles(CERTIFICATE_DIR, certificates.map((c) => c.fileUrl))) +
    (await removeFiles(ZIP_DIR, [batch?.zipUrl ?? null]));

  return { certificates: certificates.length, batches: 1, filesRemoved };
}

/** Deletes a single certificate and its rendered PDF. */
export async function deleteCertificate(id: string): Promise<DeletionSummary> {
  const certificate = await prisma.certificate.findUnique({
    where: { id },
    select: { fileUrl: true }
  });
  if (!certificate) return { certificates: 0, batches: 0, filesRemoved: 0 };

  await prisma.certificate.delete({ where: { id } });
  const filesRemoved = await removeFiles(CERTIFICATE_DIR, [certificate.fileUrl]);

  return { certificates: 1, batches: 0, filesRemoved };
}
