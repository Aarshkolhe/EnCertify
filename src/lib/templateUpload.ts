import path from "node:path";
import fs from "node:fs/promises";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { rasterizePdfFirstPage } from "@/lib/pdfPreview";
import { TEMPLATE_DIR, safeFilename } from "@/lib/storage";

export interface ProcessedTemplate {
  storedFilename: string; // filename within TEMPLATE_DIR
  widthPx: number;
  heightPx: number;
  fileType: "IMAGE" | "PDF";
}

// Hard ceiling on the stored background. A design exported for print is
// entirely normal — A4 at 300dpi is 3508x2480 — so this sits above that and
// anything larger is scaled down to fit rather than rejected. The guard
// exists to bound memory, which downscaling achieves just as well.
const MAX_DIMENSION = 4000;

/**
 * Accepts the raw bytes of an uploaded template (png/jpg/pdf) and
 * produces a single normalized PNG background stored under
 * storage/templates. Both the field editor preview and final
 * certificate generation read from this same file, so what the admin
 * sees while positioning fields is exactly what gets rendered.
 */
export async function processTemplateUpload(
  buffer: Buffer,
  extension: string
): Promise<ProcessedTemplate> {
  const ext = extension.toLowerCase();
  let pngBuffer: Buffer;
  const fileType: "IMAGE" | "PDF" = ext === "pdf" ? "PDF" : "IMAGE";

  if (ext === "pdf") {
    pngBuffer = await rasterizePdfFirstPage(buffer, 150);
  } else if (ext === "png") {
    pngBuffer = buffer;
  } else {
    // jpg/jpeg — re-encode to PNG so storage/rendering only ever deals with one format
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    pngBuffer = canvas.toBuffer("image/png");
  }

  const decoded = await loadImage(pngBuffer);
  let widthPx = decoded.width;
  let heightPx = decoded.height;

  // Scale oversize designs down instead of refusing them. Field positions are
  // stored against the dimensions returned here, and both the field editor and
  // the renderer read this same stored file, so the two stay in agreement.
  if (widthPx > MAX_DIMENSION || heightPx > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(widthPx, heightPx);
    widthPx = Math.max(1, Math.round(widthPx * scale));
    heightPx = Math.max(1, Math.round(heightPx * scale));

    const canvas = createCanvas(widthPx, heightPx);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(decoded, 0, 0, widthPx, heightPx);
    pngBuffer = canvas.toBuffer("image/png");
  }

  const storedFilename = safeFilename("png");
  await fs.writeFile(path.join(TEMPLATE_DIR, storedFilename), pngBuffer);

  return {
    storedFilename,
    widthPx,
    heightPx,
    fileType
  };
}
