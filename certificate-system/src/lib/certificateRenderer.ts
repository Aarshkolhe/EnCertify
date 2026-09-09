import path from "node:path";
import fs from "node:fs/promises";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { TEMPLATE_DIR } from "@/lib/storage";
import type { FieldConfig } from "@/lib/fieldTypes";

let fontsRegistered = false;
function ensureFonts() {
  // @napi-rs/canvas falls back to system fonts if none are registered;
  // this is a no-op hook kept in case custom font files are added later
  // under /public/fonts and should be registered for canvas rendering.
  fontsRegistered = true;
}

export interface QrConfig {
  enabled: boolean;
  x: number;
  y: number;
  size: number;
}

export interface RenderCertificateInput {
  templateFilename: string; // filename within TEMPLATE_DIR
  widthPx: number;
  heightPx: number;
  fields: FieldConfig[];
  qr: QrConfig;
  verifyUrl: string;
  values: Record<string, string>; // FieldKey -> display value
}

function canvasFont(field: FieldConfig): string {
  const weight = field.bold ? "bold " : "";
  const style = field.italic ? "italic " : "";
  const family =
    field.fontFamily === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : field.fontFamily === "monospace"
        ? "'Courier New', monospace"
        : "Arial, Helvetica, sans-serif";
  return `${style}${weight}${field.fontSize}px ${family}`;
}

/**
 * Composites the stored template background with every configured
 * field's value, plus an optional verification QR code, and returns a
 * single-page PDF buffer. This is the one place certificate generation
 * happens — the frontend never assembles the final file.
 */
export async function renderCertificate(input: RenderCertificateInput): Promise<Buffer> {
  if (!fontsRegistered) ensureFonts();

  const backgroundPath = path.join(TEMPLATE_DIR, input.templateFilename);
  const backgroundBytes = await fs.readFile(backgroundPath);
  const background = await loadImage(backgroundBytes);

  const canvas = createCanvas(input.widthPx, input.heightPx);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(background, 0, 0, input.widthPx, input.heightPx);

  for (const field of input.fields) {
    const value = input.values[field.key];
    if (!value) continue;
    ctx.font = canvasFont(field);
    ctx.fillStyle = field.color;
    ctx.textAlign = field.align;
    ctx.textBaseline = "middle";
    ctx.fillText(value, field.x, field.y);
  }

  if (input.qr.enabled) {
    const qrPngBuffer = await QRCode.toBuffer(input.verifyUrl, {
      type: "png",
      width: input.qr.size,
      margin: 1
    });
    const qrImage = await loadImage(qrPngBuffer);
    ctx.drawImage(qrImage, input.qr.x, input.qr.y, input.qr.size, input.qr.size);
  }

  const pngBuffer = canvas.toBuffer("image/png");

  const pdfDoc = await PDFDocument.create();
  const embeddedPng = await pdfDoc.embedPng(pngBuffer);
  const page = pdfDoc.addPage([input.widthPx, input.heightPx]);
  page.drawImage(embeddedPng, { x: 0, y: 0, width: input.widthPx, height: input.heightPx });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
