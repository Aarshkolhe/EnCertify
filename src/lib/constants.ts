/**
 * Application constants for certificate generation and batch processing limits.
 */

/**
 * Maximum number of certificates that can be generated in a single batch.
 * Enforced on both frontend and backend to stay safely within Supabase Storage limits
 * on the Free tier.
 */
export const MAX_CERTIFICATES_PER_BATCH = 20;

/**
 * Maximum allowable ZIP file size in bytes before uploading to storage.
 * Supabase Free tier enforces a strict 50MB (52,428,800 bytes) storage upload limit.
 * We set a conservative safety threshold of 45MB (47,185,920 bytes) to avoid
 * failed uploads and provide a clean rollback with actionable error messaging.
 */
export const DEFAULT_MAX_ZIP_BYTES = 45 * 1024 * 1024; // 45 MB

/**
 * Returns the effective maximum ZIP size in bytes.
 * Defaults to DEFAULT_MAX_ZIP_BYTES (45 MB), but can be overridden via
 * the MAX_ZIP_BYTES or TEST_MAX_ZIP_BYTES environment variable if needed.
 */
export function getMaxZipSizeBytes(): number {
  const envVal = process.env.MAX_ZIP_BYTES || process.env.TEST_MAX_ZIP_BYTES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_ZIP_BYTES;
}

/**
 * Computes a human-friendly batch split breakdown for display to users.
 * E.g., for 50 participants with max 20: returns "20 + 20 + 10".
 */
export function getBatchSplitBreakdown(
  total: number,
  maxPerBatch: number = MAX_CERTIFICATES_PER_BATCH
): string {
  if (total <= 0) return "0";
  const batches: number[] = [];
  let remaining = total;
  while (remaining > maxPerBatch) {
    batches.push(maxPerBatch);
    remaining -= maxPerBatch;
  }
  if (remaining > 0) {
    batches.push(remaining);
  }
  return batches.join(" + ");
}
