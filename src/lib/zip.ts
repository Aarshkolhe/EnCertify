import fs from "node:fs";
import archiver from "archiver";

export interface ZipEntry {
  data: Buffer;
  arcName: string; // e.g. "Rahul_Sharma_CERT-2026-8F3K92.pdf"
}

export interface ZipFileEntry {
  filePath: string;
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
    // Use compression level 6 instead of 9: PDFs are already internally compressed,
    // so level 6 avoids burning excessive CPU cycles while producing an almost identical archive size.
    const archive = archiver("zip", { zlib: { level: 6 } });
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

/**
 * Streams files from disk directly into a ZIP archive on disk.
 * Avoids holding batch PDFs or archive chunks in memory.
 */
export function createZipArchive(
  entries: ZipFileEntry[],
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    output.on("error", (err) => {
      archive.destroy();
      reject(err);
    });
    archive.on("error", (err) => {
      output.destroy();
      reject(err);
    });

    archive.pipe(output);

    for (const entry of entries) {
      archive.file(entry.filePath, { name: entry.arcName });
    }

    archive.finalize().catch((err) => {
      output.destroy();
      reject(err);
    });
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
