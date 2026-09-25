import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CERTIFICATE_DIR,
  getObject,
  createCertificateSignedUrl
} from "@/lib/storage";
import { getCorsHeaders, handleOptions, jsonResponse } from "@/lib/publicApiCors";
import { checkRateLimit } from "@/lib/rateLimit";

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

  // 2. Lookup certificate
  const certificate = await prisma.certificate.findUnique({
    where: { certificateId: params.certificateId },
    select: {
      certificateId: true,
      fileUrl: true,
      status: true
    }
  });

  if (!certificate) {
    return jsonResponse({ error: "not_found" }, req, {
      status: 404,
      headers: {
        ...rateLimitResult.headers,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  // 3. A revoked certificate must not download. Return 410 Gone before touching storage.
  if (certificate.status === "REVOKED") {
    return jsonResponse(
      {
        error: "revoked",
        message: "This certificate has been revoked and cannot be downloaded."
      },
      req,
      {
        status: 410,
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  const corsHeaders = getCorsHeaders(req);

  // 4. In Supabase mode (private bucket), mint a short-lived signed URL (60s) and 302 redirect
  try {
    const signedUrl = await createCertificateSignedUrl(certificate.fileUrl, 60);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
          ...corsHeaders,
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }
  } catch (err) {
    console.error(`[download] Failed to create signed URL for ${certificate.certificateId}:`, err);
    return jsonResponse(
      {
        error: "storage_error",
        message: "Could not generate download link."
      },
      req,
      {
        status: 500,
        headers: {
          ...rateLimitResult.headers,
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }

  // 5. Local development fallback (when SUPABASE_URL is not configured and local storage is used)
  let fileBuffer: Buffer;
  try {
    fileBuffer = await getObject(CERTIFICATE_DIR, certificate.fileUrl);
  } catch {
    return jsonResponse(
      {
        error: "not_found",
        message: "Certificate file could not be retrieved from storage."
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

  const filename = `${certificate.certificateId}.pdf`;

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      ...corsHeaders,
      ...rateLimitResult.headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}
