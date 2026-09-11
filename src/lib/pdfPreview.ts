import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

/**
 * Renders page 1 of a PDF to a PNG buffer at the given DPI using the
 * `pdftoppm` binary from poppler-utils. This keeps certificate template
 * handling on one unified raster pipeline (see certificateRenderer.ts)
 * instead of maintaining a separate vector-overlay path for PDFs.
 *
 * Requires poppler-utils to be installed on the host
 * (`apt-get install poppler-utils` on Debian/Ubuntu). See README.
 */
export async function rasterizePdfFirstPage(pdfBuffer: Buffer, dpi = 150): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "certgen-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    await fs.writeFile(inputPath, pdfBuffer);

    try {
      await execFileAsync("pdftoppm", ["-png", "-r", String(dpi), "-f", "1", "-l", "1", inputPath, outputPrefix]);
    } catch (err) {
      throw new Error(
        "Could not convert the PDF template to an image. This server needs " +
          "poppler-utils installed (`apt-get install poppler-utils`)."
      );
    }

    const files = await fs.readdir(tmpDir);
    const pngFile = files.find((f) => f.startsWith("page") && f.endsWith(".png"));
    if (!pngFile) {
      throw new Error("PDF template conversion did not produce an image.");
    }

    return await fs.readFile(path.join(tmpDir, pngFile));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
