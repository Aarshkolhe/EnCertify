/**
 * Shared production-safe URL resolver for EnCertify.
 *
 * Resolves the application base URL across local development,
 * Vercel preview branch deployments, Vercel production, and custom domains.
 *
 * Priority order:
 * 1. Explicit configured application URL (NEXT_PUBLIC_APP_URL or APP_URL)
 *    - Never uses localhost in production.
 * 2. Vercel canonical production domain (VERCEL_PROJECT_PRODUCTION_URL)
 * 3. Vercel deployment URL fallback (VERCEL_URL)
 * 4. Request origin (e.g. from req.nextUrl.origin)
 * 5. Local development fallback (http://localhost:3000)
 */
export function resolveAppBaseUrl(reqOrigin?: string): string {
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  // 1. Explicit configured application URL
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  // Never use localhost configuration in production
  if (envUrl && (!isProduction || !/localhost|127\.0\.0\.1/i.test(envUrl))) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  // 2. Vercel canonical production domain
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const trimmed = process.env.VERCEL_PROJECT_PRODUCTION_URL.trim().replace(
      /\/+$/,
      ""
    );
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  // 3. Vercel deployment URL fallback
  if (process.env.VERCEL_URL) {
    const trimmed = process.env.VERCEL_URL.trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  // 4. Request origin
  if (reqOrigin) {
    const trimmedOrigin = reqOrigin.trim().replace(/\/+$/, "");
    if (!isProduction || !/localhost|127\.0\.0\.1/i.test(trimmedOrigin)) {
      return /^https?:\/\//i.test(trimmedOrigin) ? trimmedOrigin : `https://${trimmedOrigin}`;
    }
  }

  // 5. Local development only
  return "http://localhost:3000";
}
