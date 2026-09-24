import path from "node:path";
import { createCanvas, loadImage, GlobalFonts, type Image } from "@napi-rs/canvas";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { TEMPLATE_DIR, getObject } from "@/lib/storage";
import { resolveFieldValue, type FieldConfig } from "@/lib/fieldTypes";

/**
 * Fonts have to be shipped with the app, not borrowed from the host.
 *
 * @napi-rs/canvas bundles no fonts at all — it draws with whatever the OS has
 * installed. A developer machine has hundreds, so `80px Georgia` renders
 * locally and everything looks correct. A serverless Linux runtime has
 * essentially none, and `fillText` with no matching family silently draws
 * nothing: the background image still composites, so certificates come out
 * looking finished but with every name and ID missing.
 *
 * Registering real font files removes the dependency on the host entirely, so
 * a certificate renders identically everywhere.
 */
const FONT_FILES: { pkg: string; file: string; family: string }[] = [
  { pkg: "noto-serif", file: "noto-serif-latin-400-normal.woff2", family: "Noto Serif" },
  { pkg: "noto-serif", file: "noto-serif-latin-400-italic.woff2", family: "Noto Serif" },
  { pkg: "noto-serif", file: "noto-serif-latin-700-normal.woff2", family: "Noto Serif" },
  { pkg: "noto-serif", file: "noto-serif-latin-700-italic.woff2", family: "Noto Serif" },
  { pkg: "noto-sans", file: "noto-sans-latin-400-normal.woff2", family: "Noto Sans" },
  { pkg: "noto-sans", file: "noto-sans-latin-400-italic.woff2", family: "Noto Sans" },
  { pkg: "noto-sans", file: "noto-sans-latin-700-normal.woff2", family: "Noto Sans" },
  { pkg: "noto-sans", file: "noto-sans-latin-700-italic.woff2", family: "Noto Sans" },
  { pkg: "noto-sans-mono", file: "noto-sans-mono-latin-400-normal.woff2", family: "Noto Sans Mono" },
  { pkg: "noto-sans-mono", file: "noto-sans-mono-latin-700-normal.woff2", family: "Noto Sans Mono" }
];

let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;

  let registered = 0;
  for (const font of FONT_FILES) {
    // Same approach as pdfPreview.ts's standardFontDataUrl: no `require.resolve`
    // or `import.meta.url`, neither of which survives both of Next's output
    // formats. The app always runs from the project root.
    const file = path.join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      font.pkg,
      "files",
      font.file
    );
    try {
      if (GlobalFonts.registerFromPath(file, font.family)) registered += 1;
    } catch (err) {
      console.error(`[fonts] could not register ${font.file}:`, err);
    }
  }

  if (registered === 0) {
    // Worth shouting about: rendering still "succeeds" and produces a
    // certificate with no text on it, which is far harder to diagnose later
    // than a line in the deploy log at the moment it happened.
    console.error(
      "[fonts] no bundled fonts registered — certificate text will fall back to " +
        "host fonts and may render blank on a serverless host."
    );
  }

  fontsRegistered = true;
}

export interface QrConfig {
  enabled: boolean;
  x: number;
  y: number;
  size: number;
}

export interface RenderCertificateInput {
  templateFilename: string; // object name under the TEMPLATE_DIR prefix
  background?: Image | null; // optional preloaded/decoded background to avoid re-downloading per participant
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
  // The bundled Noto face leads in every stack; the host fonts behind it are
  // only there for a local machine that happens to have them.
  const family =
    field.fontFamily === "serif"
      ? "'Noto Serif', Georgia, 'Times New Roman', serif"
      : field.fontFamily === "monospace"
        ? "'Noto Sans Mono', 'Courier New', monospace"
        : "'Noto Sans', Arial, Helvetica, sans-serif";
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

  const background =
    input.background ?? (await loadImage(await getObject(TEMPLATE_DIR, input.templateFilename)));

  const canvas = createCanvas(input.widthPx, input.heightPx);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(background, 0, 0, input.widthPx, input.heightPx);

  for (const field of input.fields) {
    // Built-in fields read from `values`; custom fields carry their own text.
    // Both go through the same helper the editor preview uses, so what the
    // admin positioned is what gets drawn.
    const value = resolveFieldValue(field, input.values);
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
