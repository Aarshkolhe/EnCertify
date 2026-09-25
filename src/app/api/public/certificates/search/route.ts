import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleOptions, jsonResponse } from "@/lib/publicApiCors";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  sanitizeSearchQuery,
  getPublicBaseUrl,
  formatPublicCertificate
} from "@/lib/publicCertificate";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  // 1. Rate limiting: 30 requests/minute per IP
  const rateLimitResult = checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 1000 });
  if (!rateLimitResult.allowed && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  // 2. Query parameter parsing & validation
  const searchParams = req.nextUrl.searchParams;
  const rawQ = (searchParams.get("q") ?? "").trim();

  // Rule: Reject q shorter than 3 characters with 400
  if (rawQ.length < 3) {
    return jsonResponse(
      {
        error: "invalid_query",
        message: "Query parameter 'q' must be at least 3 characters long."
      },
      req,
      {
        status: 400,
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  // Pagination parameters (limit hard max 50)
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const limitParam = parseInt(searchParams.get("limit") || "20", 10);
  const rawLimit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 20;
  const limit = Math.min(50, rawLimit);
  const skip = (page - 1) * limit;

  const eventId = searchParams.get("event")?.trim();
  const semester = searchParams.get("semester")?.trim();

  // "filtering by it must simply exclude records that lack it rather than error"
  // Since certificates in this database do not have a semester field, any non-empty semester filter
  // matches no records.
  if (semester) {
    return jsonResponse(
      {
        results: [],
        total: 0,
        page,
        limit
      },
      req,
      {
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  // Escape regex / SQL wildcards before building query
  const sanitized = sanitizeSearchQuery(rawQ);

  const where: Prisma.CertificateWhereInput = {
    AND: [
      {
        OR: [
          { participantName: { contains: sanitized, mode: "insensitive" } },
          { certificateId: { contains: sanitized, mode: "insensitive" } }
        ]
      },
      ...(eventId ? [{ eventId }] : [])
    ]
  };

  const [total, certificates] = await Promise.all([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { issueDate: "desc" },
      select: {
        certificateId: true,
        participantName: true,
        issueDate: true,
        status: true,
        event: {
          select: {
            name: true
          }
        }
      }
    })
  ]);

  const baseUrl = getPublicBaseUrl(req);
  const results = certificates.map((cert) => formatPublicCertificate(cert, baseUrl));

  return jsonResponse(
    {
      results,
      total,
      page,
      limit
    },
    req,
    {
      headers: {
        ...rateLimitResult.headers,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
