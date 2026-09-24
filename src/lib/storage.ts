import path from "node:path";
import fsp from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

export function isLocalStorageMode(): boolean {
  return !process.env.SUPABASE_URL && process.env.NODE_ENV !== "production";
}

/**
 * All runtime file storage lives in a private Supabase Storage bucket.
 *
 * This used to write under `process.cwd()/storage`. That works on a long-lived
 * server but not on a serverless host: Vercel mounts the deployment bundle
 * read-only (writes fail with EROFS) and the one writable path, /tmp, is
 * per-instance and wiped between invocations — so a template uploaded by one
 * lambda is simply gone when the next one tries to render from it. Every file
 * here outlives the request that created it, so all of them need a real
 * object store.
 *
 * Nothing is served from the bucket directly. The bucket is private and reads
 * go through API routes that check the DB record first, which is the same
 * access model the on-disk layout had.
 */

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "encertify";

// Key prefixes within the bucket. These deliberately keep the directory names
// the on-disk layout used: `fileUrl` / `zipUrl` on existing rows store a bare
// filename, so those rows keep resolving without a data migration.
export const TEMPLATE_DIR = "templates";
export const CERTIFICATE_DIR = "certificates";
export const ZIP_DIR = "zips";
export const TMP_DIR = "tmp";

let client: SupabaseClient | null = null;

/**
 * Reads SUPABASE_URL and fails with a message that says what to fix.
 *
 * `createClient` rejects a bad value with "Invalid supabaseUrl", which names
 * neither the variable nor the shape it wanted. The three ways this is
 * actually got wrong — the placeholder copied over unedited, the Postgres
 * connection string pasted in by mistake, and a bare project ref with no
 * scheme — are each worth calling out by name.
 */
function readStorageUrl(): string {
  // Dashboard paste picks up stray whitespace and sometimes the surrounding
  // quotes along with the value; neither is worth a failed deploy.
  const raw = (process.env.SUPABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");

  if (!raw) {
    throw new Error(
      "File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  if (raw.includes("[") || raw.includes("]")) {
    throw new Error(
      "SUPABASE_URL still contains the placeholder from .env.example. Replace it " +
        "with your project URL from Supabase -> Project Settings -> API " +
        "(https://<project-ref>.supabase.co)."
    );
  }
  if (/^postgres(ql)?:\/\//i.test(raw)) {
    throw new Error(
      "SUPABASE_URL is set to a Postgres connection string. It needs the project " +
        "URL instead — Supabase -> Project Settings -> API -> Project URL " +
        "(https://<project-ref>.supabase.co). The connection string belongs in DATABASE_URL."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `SUPABASE_URL is not a valid URL (got "${raw}"). It must include the scheme, ` +
        "e.g. https://<project-ref>.supabase.co."
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `SUPABASE_URL must be an http(s) URL (got "${parsed.protocol}//"). ` +
        "Use https://<project-ref>.supabase.co."
    );
  }

  // Trailing slashes are harmless to a human and confusing to the client.
  return raw.replace(/\/+$/, "");
}

/**
 * The service role key is required — the buckets are private and these calls
 * all run server-side in API routes that have already checked admin auth. The
 * anon key cannot read or write them, by design.
 */
function storageClient(): SupabaseClient {
  if (client) return client;

  const url = readStorageUrl();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Copy the service_role key from " +
        "Supabase -> Project Settings -> API. The bucket is private, so the anon key will not work."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return client;
}

let bucketReady: Promise<void> | null = null;

/**
 * Creates the bucket if it does not exist yet. Memoized, so the round trip
 * happens once per warm instance rather than on every upload. A failure
 * clears the memo so the next request retries instead of caching the error.
 */
export async function ensureStorageDirs(): Promise<void> {
  if (isLocalStorageMode()) {
    await Promise.all(
      [TEMPLATE_DIR, CERTIFICATE_DIR, ZIP_DIR, TMP_DIR].map((d) =>
        fsp.mkdir(path.join(STORAGE_ROOT, d), { recursive: true })
      )
    );
    return;
  }

  if (!bucketReady) {
    bucketReady = (async () => {
      const { error } = await storageClient().storage.createBucket(STORAGE_BUCKET, {
        public: false
      });
      // Already existing is the normal steady state, not a failure.
      if (error && !/exist/i.test(error.message)) {
        throw new Error(`Could not prepare storage bucket: ${error.message}`);
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  return bucketReady;
}

/** Generates a random, non-guessable filename — never derived from user input. */
export function safeFilename(extension: string) {
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${uuidv4()}.${ext}`;
}

/**
 * Builds the object key for a stored filename under `prefix`, rejecting
 * anything that would escape it. The guard is kept from the filesystem version:
 * these values come off DB rows, and a malformed or hostile one must not be
 * able to address an object outside its own prefix.
 */
export function objectKey(prefix: string, filename: string): string {
  const base = path.posix.basename(filename);
  if (base !== filename || filename.includes("..") || filename.includes("/")) {
    throw new Error("Invalid filename.");
  }
  return `${prefix}/${base}`;
}

/** Uploads bytes under `prefix`, overwriting any object already at that key. */
export async function putObject(
  prefix: string,
  filename: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const key = objectKey(prefix, filename);

  if (isLocalStorageMode()) {
    const filePath = path.join(STORAGE_ROOT, key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, body);
    return;
  }

  const { error } = await storageClient()
    .storage.from(STORAGE_BUCKET)
    .upload(key, body, { contentType, upsert: true });

  if (error) throw new Error(`Could not store ${key}: ${error.message}`);
}

/** Downloads a stored object. Throws if it is missing — callers map that to a 404. */
export async function getObject(prefix: string, filename: string): Promise<Buffer> {
  const key = objectKey(prefix, filename);

  if (isLocalStorageMode()) {
    const filePath = path.join(STORAGE_ROOT, key);
    try {
      return await fsp.readFile(filePath);
    } catch {
      throw new Error(`Could not read ${key}: not found`);
    }
  }

  const { data, error } = await storageClient()
    .storage.from(STORAGE_BUCKET)
    .download(key);

  if (error || !data) {
    throw new Error(`Could not read ${key}: ${error?.message ?? "not found"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Deletes a stored file given the filename held on its DB row.
 *
 * A missing object is not an error — a record whose file has already been
 * removed must still be deletable. The filename is resolved through
 * `objectKey`, so a malformed or hostile DB value can never address anything
 * outside `prefix`. Returns true only if an object was actually removed.
 */
export async function deleteStoredFile(
  prefix: string,
  filename: string | null | undefined
): Promise<boolean> {
  if (!filename) return false;

  let key: string;
  try {
    key = objectKey(prefix, filename);
  } catch {
    return false;
  }

  if (isLocalStorageMode()) {
    const filePath = path.join(STORAGE_ROOT, key);
    try {
      await fsp.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  const { data, error } = await storageClient()
    .storage.from(STORAGE_BUCKET)
    .remove([key]);

  if (error) throw new Error(`Could not delete ${key}: ${error.message}`);
  // `remove` succeeds on a key that was not there; the returned array is what
  // distinguishes an actual deletion from a no-op.
  return (data?.length ?? 0) > 0;
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
