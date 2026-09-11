import path from "node:path";
import fsSync from "node:fs";
import {
  createCanvas,
  DOMMatrix,
  Path2D,
  ImageData,
  type Canvas,
  type SKRSContext2D
} from "@napi-rs/canvas";

/**
 * pdf.js expects a handful of browser globals that Node does not define.
 * @napi-rs/canvas ships compatible implementations, so we install them once
 * before the library is loaded rather than shipping a DOM shim.
 */
function installBrowserGlobals() {
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= DOMMatrix;
  g.Path2D ??= Path2D;
  g.ImageData ??= ImageData;
}

/**
 * Canvas factory handed to pdf.js so it allocates through @napi-rs/canvas
 * instead of looking for `document.createElement("canvas")`.
 */
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    holder: { canvas: Canvas; context: SKRSContext2D },
    width: number,
    height: number
  ) {
    holder.canvas.width = Math.ceil(width);
    holder.canvas.height = Math.ceil(height);
  }

  destroy(holder: { canvas: Canvas | null; context: SKRSContext2D | null }) {
    // Nothing to release explicitly — drop the references and let GC take it.
    holder.canvas = null;
    holder.context = null;
  }
}

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Loads the pdf.js legacy (non-worker) build lazily. It is several megabytes
 * and only PDF template uploads need it, so keeping it out of the module graph
 * until first use keeps ordinary image uploads cheap.
 */
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    installBrowserGlobals();
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
}

/**
 * pdf.js needs the standard 14 font data to draw text that the PDF did not
 * embed. Resolving it off the installed package keeps it correct regardless of
 * where node_modules lives.
 */
function standardFontDataUrl(): string | undefined {
  // Deliberately no `import.meta.url` / `createRequire` here: this module is
  // bundled by Next, which may emit it as CommonJS, and neither of those is
  // available in both output formats. The app always runs from the project root.
  const dir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  // Only PDFs that use the standard 14 fonts without embedding them need this.
  // If the directory is absent, everything else still renders, so don't hand
  // pdf.js a path that does not resolve.
  return fsSync.existsSync(dir) ? dir + path.sep : undefined;
}

/**
 * Renders page 1 of a PDF to a PNG buffer at the given DPI using pdf.js and
 * @napi-rs/canvas. This keeps certificate template handling on one unified
 * raster pipeline (see certificateRenderer.ts) instead of maintaining a
 * separate vector-overlay path for PDFs.
 *
 * Pure JavaScript on purpose: the previous implementation shelled out to
 * poppler's `pdftoppm`, which meant PDF uploads failed on any machine or host
 * where that binary was not installed. There is nothing to install now.
 */
export async function rasterizePdfFirstPage(pdfBuffer: Buffer, dpi = 150): Promise<Buffer> {
  const pdfjs = await loadPdfjs();

  // pdf.js takes ownership of the array it is given, so hand it a copy —
  // the caller's Buffer is still used for error reporting and validation.
  const data = new Uint8Array(pdfBuffer);

  // This MUST be passed to getDocument, not to page.render(): pdf.js resolves
  // the factory once per document and render() ignores the option entirely.
  // It is not only used for the page canvas — it also allocates the scratch
  // canvases behind images, transparency groups and soft masks, so with the
  // default factory any PDF containing a raster image (which is almost every
  // real certificate design) dies on `canvas.createCanvas`.
  const canvasFactory = new NodeCanvasFactory();

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data,
      canvasFactory,
      standardFontDataUrl: standardFontDataUrl(),
      // Both must stay off. `useSystemFonts` makes pdf.js hand non-embedded
      // fonts to the host's font matcher, which does not exist here — the text
      // is then dropped silently and the page rasterizes with its graphics but
      // no words. With this false, pdf.js uses its own bundled standard_fonts,
      // which also makes output identical on every machine.
      useSystemFonts: false,
      // No DOM FontFace API in Node; glyphs are drawn as paths instead.
      disableFontFace: true,
      isEvalSupported: false
    }).promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new Error(
        "This PDF is password-protected, so it cannot be read. Remove the password, or export the design as a PNG or JPG and upload that instead."
      );
    }
    throw new Error(
      "Could not read this PDF. It may be corrupt or not a valid PDF. " +
        "Exporting the design as a PNG or JPG and uploading that is the quickest way around it."
    );
  }

  try {
    if (doc.numPages < 1) {
      throw new Error("This PDF has no pages.");
    }

    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: dpi / 72 });

    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

    // PDF pages are transparent by default; certificates are printed on white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      // The @napi-rs/canvas context is API-compatible with the 2D context
      // pdf.js expects, but not structurally identical to the DOM type.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise;

    const png = canvas.toBuffer("image/png");
    page.cleanup();
    return png;
  } finally {
    await doc.destroy().catch(() => {});
  }
}
