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

const MAX_DIMENSION = 3000; // guard against absurdly large uploads

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
  if (decoded.width > MAX_DIMENSION || decoded.height > MAX_DIMENSION) {
    throw new Error(`Template image is too large. Maximum dimension is ${MAX_DIMENSION}px.`);
  }

  const storedFilename = safeFilename("png");
  await fs.writeFile(path.join(TEMPLATE_DIR, storedFilename), pngBuffer);

  return {
    storedFilename,
    widthPx: decoded.width,
    heightPx: decoded.height,
    fileType
  };
}
