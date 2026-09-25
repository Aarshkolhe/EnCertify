import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleOptions, jsonResponse } from "@/lib/publicApiCors";
import {
  getPublicBaseUrl,
  formatPublicCertificate
} from "@/lib/publicCertificate";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { certificateId: string } }
) {
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

  if (!certificate) {
    return jsonResponse({ error: "not_found" }, req, {
      status: 404,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  const baseUrl = getPublicBaseUrl(req);
  const result = formatPublicCertificate(certificate, baseUrl);

  return jsonResponse(result, req, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  });
}
