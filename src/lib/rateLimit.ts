import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/publicApiCors";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory token store per IP address.
const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup stale entries every 2 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (value.resetAt <= now) {
        rateLimitMap.delete(key);
      }
    }
  }, 2 * 60 * 1000).unref();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const clientIp = forwarded.split(",")[0]?.trim();
    if (clientIp) return clientIp;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return (req as any).ip || "127.0.0.1";
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

/**
 * Checks per-IP rate limit for public endpoints.
 * Defaults to 30 requests per 60 seconds (1 minute).
 */
export function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions = {}
): {
  allowed: boolean;
  headers: Record<string, string>;
  response?: NextResponse;
} {
  const maxRequests = options.maxRequests ?? 30;
  const windowMs = options.windowMs ?? 60 * 1000;

  const ip = getClientIp(req);
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  let count = 1;
  let resetAt = now + windowMs;

  if (record && record.resetAt > now) {
    record.count += 1;
    count = record.count;
    resetAt = record.resetAt;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt });
  }

  const remaining = Math.max(0, maxRequests - count);
  const resetSeconds = Math.ceil(resetAt / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetSeconds)
  };

  if (count > maxRequests) {
    const cors = getCorsHeaders(req);
    const errorResponse = NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many requests. Please try again later."
      },
      {
        status: 429,
        headers: {
          ...cors,
          ...headers,
          "Retry-After": String(retryAfterSeconds),
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );

    return {
      allowed: false,
      headers,
      response: errorResponse
    };
  }

  return {
    allowed: true,
    headers
  };
}
