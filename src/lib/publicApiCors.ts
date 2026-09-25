import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://encypherist.online",
  "https://www.encypherist.online",
  "http://localhost:3000"
]);

/**
 * Validates request origin against allowed origins and returns CORS headers.
 * Does NOT use wildcard `*`.
 */
export function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    Vary: "Origin"
  };

  if (!origin) {
    return headers;
  }

  const isDev = process.env.NODE_ENV !== "production";
  const isAllowedDevOrigin =
    isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (ALLOWED_ORIGINS.has(origin) || isAllowedDevOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }

  return headers;
}

/**
 * Handles CORS preflight OPTIONS request.
 */
export function handleOptions(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req)
  });
}

/**
 * Returns a JSON response with CORS headers applied.
 */
export function jsonResponse(
  data: unknown,
  req: NextRequest,
  init?: { status?: number; headers?: Record<string, string> }
): NextResponse {
  const cors = getCorsHeaders(req);
  const combinedHeaders = new Headers({
    ...cors,
    ...(init?.headers || {})
  });

  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: combinedHeaders
  });
}
