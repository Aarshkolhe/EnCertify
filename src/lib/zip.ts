import fs from "node:fs";
import archiver from "archiver";

export interface ZipEntry {
  absolutePath: string;
  arcName: string; // e.g. "Rahul_Sharma_CERT-2026-8F3K92.pdf"
}

export function createZip(entries: ZipEntry[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.absolutePath, { name: entry.arcName });
    }
    archive.finalize();
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
