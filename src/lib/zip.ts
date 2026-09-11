import archiver from "archiver";

export interface ZipEntry {
  data: Buffer;
  arcName: string; // e.g. "Rahul_Sharma_CERT-2026-8F3K92.pdf"
}

/**
 * Builds the batch ZIP entirely in memory and returns its bytes.
 *
 * The previous version streamed to a file on disk, which a serverless host has
 * nowhere to put. Working in memory also avoids re-downloading every rendered
 * PDF back out of object storage just to zip it — generation already holds each
 * buffer, so it appends them directly.
 *
 * The trade-off is that peak memory scales with the batch: the whole archive is
 * resident before it is uploaded. That is fine for the few-hundred-certificate
 * batches this is built for; a batch large enough to strain it needs to be a
 * background job rather than a longer request.
 */
export function createZipBuffer(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const entry of entries) {
      archive.append(entry.data, { name: entry.arcName });
    }
    archive.finalize().catch(reject);
  });
}

/** Turns a participant name + certificate ID into a safe ZIP entry filename. */
export function safeArcFilename(participantName: string, certificateId: string, ext: string) {
  const cleanName = participantName
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Participant";
  return `${cleanName}_${certificateId}.${ext}`;
}
