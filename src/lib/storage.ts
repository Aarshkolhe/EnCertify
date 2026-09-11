import path from "node:path";
import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";

// All runtime file storage lives outside of `public/`, except template
// preview images which are safe to serve directly since they never
// contain participant data. Certificates and generated ZIPs are only
// ever served through API routes that check the DB record first.
export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const TEMPLATE_DIR = path.join(STORAGE_ROOT, "templates");
export const CERTIFICATE_DIR = path.join(STORAGE_ROOT, "certificates");
export const ZIP_DIR = path.join(STORAGE_ROOT, "zips");
export const TMP_DIR = path.join(STORAGE_ROOT, "tmp");

export async function ensureStorageDirs() {
  await Promise.all(
    [TEMPLATE_DIR, CERTIFICATE_DIR, ZIP_DIR, TMP_DIR].map((dir) =>
      fs.mkdir(dir, { recursive: true })
    )
  );
}

/** Generates a random, non-guessable filename — never derived from user input. */
export function safeFilename(extension: string) {
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${uuidv4()}.${ext}`;
}

/**
 * Resolves a stored filename to an absolute path within `dir`, rejecting
 * anything that would escape the directory (path traversal).
 */
export function resolveWithinDir(dir: string, filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || filename.includes("..")) {
    throw new Error("Invalid filename.");
  }
  return path.join(dir, base);
}

/**
 * Deletes a stored file given the filename held on its DB row.
 *
 * A missing file is not an error — a record whose file has already been
 * removed must still be deletable. The filename is resolved through
 * `resolveWithinDir`, so a malformed or hostile DB value can never unlink
 * anything outside `dir`. Returns true only if a file was actually removed.
 */
export async function deleteStoredFile(
  dir: string,
  filename: string | null | undefined
): Promise<boolean> {
  if (!filename) return false;

  let target: string;
  try {
    target = resolveWithinDir(dir, filename);
  } catch {
    return false;
  }

  try {
    await fs.unlink(target);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

const ALLOWED_UPLOAD_EXTENSIONS = new Set(["png", "jpg", "jpeg", "pdf", "xlsx", "xls"]);
const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_EXCEL_BYTES = 15 * 1024 * 1024; // 15MB

export function assertAllowedExtension(filename: string) {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type ".${ext}". Allowed types: PNG, JPG, PDF, XLSX, XLS.`
    );
  }
  return ext;
}

export function assertWithinSizeLimit(bytes: number, kind: "template" | "excel") {
  const limit = kind === "template" ? MAX_TEMPLATE_BYTES : MAX_EXCEL_BYTES;
  if (bytes > limit) {
    throw new Error(`File is too large. Maximum size is ${Math.round(limit / (1024 * 1024))}MB.`);
  }
}
