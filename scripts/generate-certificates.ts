/**
 * Standalone bulk certificate generator.
 *
 * Reads a certificate template image plus an Excel sheet of participants and
 * writes one certificate per participant with the name composited onto the
 * template. Runs entirely offline — no database, no dev server, no login.
 *
 *   npm run certs:preview     placement check against sample names
 *   npm run certs             generate the real batch
 *
 * Flags (all optional):
 *   --template <path>   default batch/template.png
 *   --excel <path>      default batch/participants.xlsx
 *   --out <dir>         default batch/out
 *   --layout <path>     default batch/layout.json
 *   --column <header>   name column; auto-detected when omitted
 *   --preview           render sample names with placement guides, generate nothing
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { parseWorkbookBuffer, buildParticipants } from "../src/lib/excelParser";
import { createZipBuffer, type ZipEntry } from "../src/lib/zip";

const PROJECT_ROOT = path.resolve(__dirname, "..");

/**
 * Every placement number is a fraction of the template's own width/height, so
 * one layout.json keeps working if the template is re-exported at a different
 * resolution.
 */
interface NameLayout {
  centerX: number; // 0..1 of width — horizontal centre of the name
  centerY: number; // 0..1 of height — vertical centre of the name
  maxWidth: number; // 0..1 of width — name shrinks to fit inside this
  fontSize: number; // 0..1 of height
  minFontSize: number; // 0..1 of height — shrink floor; below this the name wraps
  lineHeight: number; // multiple of the resolved font size
  fontFamily: string;
  fontFile: string | null; // optional .ttf/.otf to match the template exactly
  color: string;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
}

interface OutputLayout {
  pdf: boolean;
  png: boolean;
  zip: boolean;
}

interface Layout {
  name: NameLayout;
  output: OutputLayout;
}

const DEFAULT_LAYOUT: Layout = {
  name: {
    centerX: 0.5,
    centerY: 0.482,
    maxWidth: 0.62,
    fontSize: 0.058,
    minFontSize: 0.032,
    lineHeight: 1.15,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontFile: null,
    color: "#1B2430",
    bold: false,
    italic: false,
    uppercase: false
  },
  output: { pdf: true, png: false, zip: true }
};

const SAMPLE_NAMES = ["Aarsh Kolhe", "Muskan Mistry", "Chandrashekhar Venkataraghavan Iyer"];

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolvePath(p: string) {
  return path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p);
}

async function loadLayout(layoutPath: string): Promise<Layout> {
  if (!fs.existsSync(layoutPath)) return DEFAULT_LAYOUT;
  const raw = JSON.parse(await fsp.readFile(layoutPath, "utf8")) as Partial<Layout>;
  return {
    name: { ...DEFAULT_LAYOUT.name, ...(raw.name ?? {}) },
    output: { ...DEFAULT_LAYOUT.output, ...(raw.output ?? {}) }
  };
}

/** Picks the participant-name column when the caller didn't name one. */
function detectNameColumn(headers: string[], requested?: string): string {
  if (requested) {
    const match = headers.find((h) => h.toLowerCase() === requested.toLowerCase());
    if (!match) {
      throw new Error(
        `Column "${requested}" is not in the sheet. Available columns: ${headers.filter(Boolean).join(", ")}`
      );
    }
    return match;
  }

  const normalized = headers.map((h) => h.toLowerCase().trim());
  const exact = normalized.findIndex((h) => h === "name" || h === "participant name" || h === "full name");
  if (exact !== -1) return headers[exact];

  const partial = normalized.findIndex((h) => h.includes("name") && !h.includes("event") && !h.includes("college"));
  if (partial !== -1) return headers[partial];

  const firstNonEmpty = headers.findIndex((h) => h.trim() !== "");
  if (firstNonEmpty !== -1) return headers[firstNonEmpty];

  throw new Error("Could not find a name column in the sheet.");
}

function cssFont(layout: NameLayout, sizePx: number) {
  const style = layout.italic ? "italic " : "";
  const weight = layout.bold ? "bold " : "";
  return `${style}${weight}${sizePx}px ${layout.fontFamily}`;
}

/** Greedy word wrap for the rare name too long to fit on one line. */
function wrapToWidth(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

/**
 * Shrinks the name until it fits the configured width, then wraps only if it
 * still doesn't fit at the minimum size — so ordinary names stay at full size
 * and unusually long ones degrade gracefully instead of overflowing.
 */
function fitName(ctx: SKRSContext2D, text: string, layout: NameLayout, width: number, height: number) {
  const maxWidth = layout.maxWidth * width;
  const maxSize = layout.fontSize * height;
  const minSize = layout.minFontSize * height;

  let size = maxSize;
  while (size > minSize) {
    ctx.font = cssFont(layout, size);
    if (ctx.measureText(text).width <= maxWidth) {
      return { size, lines: [text] };
    }
    size -= Math.max(1, maxSize * 0.02);
  }

  ctx.font = cssFont(layout, minSize);
  return { size: minSize, lines: wrapToWidth(ctx, text, maxWidth) };
}

function drawName(ctx: SKRSContext2D, rawName: string, layout: NameLayout, width: number, height: number) {
  // Collapse the stray double spaces spreadsheets tend to carry.
  const cleaned = rawName.replace(/\s+/g, " ").trim();
  const text = layout.uppercase ? cleaned.toUpperCase() : cleaned;
  const { size, lines } = fitName(ctx, text, layout, width, height);

  ctx.font = cssFont(layout, size);
  ctx.fillStyle = layout.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = size * layout.lineHeight;
  const centerX = layout.centerX * width;
  const centerY = layout.centerY * height;
  const firstLineY = centerY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, centerX, firstLineY + i * lineHeight);
  });
}

/** Red guide box + centre lines, drawn in preview mode only. */
function drawGuides(ctx: SKRSContext2D, layout: NameLayout, width: number, height: number) {
  const boxWidth = layout.maxWidth * width;
  const boxHeight = layout.fontSize * height * 1.6;
  const x = layout.centerX * width - boxWidth / 2;
  const y = layout.centerY * height - boxHeight / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(220, 38, 38, 0.75)";
  ctx.lineWidth = Math.max(1, width * 0.0015);
  ctx.setLineDash([width * 0.008, width * 0.006]);
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(37, 99, 235, 0.6)";
  ctx.beginPath();
  ctx.moveTo(x, layout.centerY * height);
  ctx.lineTo(x + boxWidth, layout.centerY * height);
  ctx.moveTo(layout.centerX * width, y);
  ctx.lineTo(layout.centerX * width, y + boxHeight);
  ctx.stroke();
  ctx.restore();
}

function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "Participant"
  );
}

async function pngToPdf(pngBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const embedded = await pdfDoc.embedPng(pngBuffer);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });
  return Buffer.from(await pdfDoc.save());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const templatePath = resolvePath(String(args.template ?? "batch/template.png"));
  const excelPath = resolvePath(String(args.excel ?? "batch/participants.xlsx"));
  const outDir = resolvePath(String(args.out ?? "batch/out"));
  const layoutPath = resolvePath(String(args.layout ?? "batch/layout.json"));
  const preview = Boolean(args.preview);

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template not found at ${path.relative(PROJECT_ROOT, templatePath)}.\n` +
        `Save the certificate image there (PNG or JPG), or pass --template <path>.`
    );
  }

  const layout = await loadLayout(layoutPath);

  if (layout.name.fontFile) {
    const fontPath = resolvePath(layout.name.fontFile);
    if (!fs.existsSync(fontPath)) {
      throw new Error(
        `Font file not found at ${path.relative(PROJECT_ROOT, fontPath)} (layout.json -> name.fontFile).`
      );
    }
    GlobalFonts.registerFromPath(fontPath);
  }

  const background = await loadImage(await fsp.readFile(templatePath));
  const width = background.width;
  const height = background.height;
  await fsp.mkdir(outDir, { recursive: true });

  console.log(`Template : ${path.relative(PROJECT_ROOT, templatePath)} (${width}x${height})`);

  if (preview) {
    for (const [i, sampleName] of SAMPLE_NAMES.entries()) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(background, 0, 0, width, height);
      drawGuides(ctx, layout.name, width, height);
      drawName(ctx, sampleName, layout.name, width, height);
      const file = path.join(outDir, `_preview-${i + 1}.png`);
      await fsp.writeFile(file, canvas.toBuffer("image/png"));
      console.log(`Preview  : ${path.relative(PROJECT_ROOT, file)}  ("${sampleName}")`);
    }
    console.log(
      `\nOpen the previews and adjust ${path.relative(PROJECT_ROOT, layoutPath)} if the name sits off.\n` +
        `centerY moves it up/down, centerX left/right, fontSize scales it, maxWidth sets the shrink boundary.`
    );
    return;
  }

  if (!fs.existsSync(excelPath)) {
    throw new Error(
      `Excel sheet not found at ${path.relative(PROJECT_ROOT, excelPath)}.\n` +
        `Save the participant sheet there (.xlsx/.xls/.csv), or pass --excel <path>.`
    );
  }

  const { headers, rows } = parseWorkbookBuffer(await fsp.readFile(excelPath));
  const nameColumn = detectNameColumn(headers, args.column ? String(args.column) : undefined);
  const { valid, errors, duplicateCount } = buildParticipants(headers, rows, {
    participantName: nameColumn
  });

  console.log(`Sheet    : ${path.relative(PROJECT_ROOT, excelPath)}`);
  console.log(`Name col : "${nameColumn}"`);
  console.log(`Rows     : ${valid.length} to generate, ${errors.length} skipped (${duplicateCount} duplicate)\n`);

  if (valid.length === 0) {
    throw new Error("No valid participant rows found — nothing to generate.");
  }

  const usedFilenames = new Map<string, number>();
  const zipEntries: ZipEntry[] = [];

  for (const participant of valid) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(background, 0, 0, width, height);
    drawName(ctx, participant.participantName, layout.name, width, height);
    const pngBuffer = canvas.toBuffer("image/png");

    const base = safeFilename(participant.participantName);
    const seen = usedFilenames.get(base) ?? 0;
    usedFilenames.set(base, seen + 1);
    const stem = seen === 0 ? base : `${base}_${seen + 1}`;

    if (layout.output.png) {
      await fsp.writeFile(path.join(outDir, `${stem}.png`), pngBuffer);
      zipEntries.push({ data: pngBuffer, arcName: `${stem}.png` });
    }

    if (layout.output.pdf) {
      const pdfBuffer = await pngToPdf(pngBuffer, width, height);
      await fsp.writeFile(path.join(outDir, `${stem}.pdf`), pdfBuffer);
      zipEntries.push({ data: pdfBuffer, arcName: `${stem}.pdf` });
    }

    console.log(`  + ${participant.participantName}`);
  }

  if (errors.length) {
    console.log(`\nSkipped rows (sheet row numbers exclude the header):`);
    for (const error of errors) {
      console.log(`  ! row ${error.row}: ${error.reason}`);
    }
  }

  if (layout.output.zip && zipEntries.length) {
    const zipPath = path.join(outDir, "certificates.zip");
    await fsp.writeFile(zipPath, await createZipBuffer(zipEntries));
    console.log(`\nZIP      : ${path.relative(PROJECT_ROOT, zipPath)}`);
  }

  console.log(`\nDone — ${valid.length} certificate(s) in ${path.relative(PROJECT_ROOT, outDir)}`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
