import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleOptions, jsonResponse } from "@/lib/publicApiCors";
import { checkRateLimit } from "@/lib/rateLimit";
import { formatVerifyCertificate } from "@/lib/publicCertificate";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { certificateId: string } }
) {
  // 1. Rate limiting: 30 requests/minute per IP
  const rateLimitResult = checkRateLimit(req, { maxRequests: 30, windowMs: 60 * 1000 });
  if (!rateLimitResult.allowed && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  // 2. Fetch certificate from database
  const certificate = await prisma.certificate.findUnique({
    where: { certificateId: params.certificateId },
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
  });

  // Not found: return 404 and NO certificate object
  if (!certificate) {
    return jsonResponse(
      {
        status: "not_found",
        error: "not_found"
      },
      req,
      {
        status: 404,
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  // Revoked: exists but was revoked (revokedAt and reason are not stored in database schema)
  if (certificate.status === "REVOKED") {
    return jsonResponse(
      {
        status: "revoked",
        certificate: formatVerifyCertificate(certificate)
      },
      req,
      {
        status: 200,
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  // Verified: exists and is valid
  return jsonResponse(
    {
      status: "verified",
      certificate: formatVerifyCertificate(certificate)
    },
    req,
    {
      status: 200,
      headers: {
        ...rateLimitResult.headers,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
