import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CERTIFICATE_DIR, getObject } from "@/lib/storage";
import { safeArcFilename } from "@/lib/zip";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { certificateId: string } }) {
  const certificate = await prisma.certificate.findUnique({
    where: { certificateId: params.certificateId }
  });

  if (!certificate || certificate.status !== "VALID") {
    return NextResponse.json(
      { error: "Certificate not found." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store"
        }
      }
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await getObject(CERTIFICATE_DIR, certificate.fileUrl);
  } catch {
    return NextResponse.json(
      { error: "Certificate file not found." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store"
        }
      }
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = safeArcFilename(certificate.participantName, certificate.certificateId, "pdf");

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // Browser must always revalidate against CDN/origin (never serve stale without checking)
      "Cache-Control": "public, max-age=0, must-revalidate",
      // CDN caches for max 30s to absorb burst traffic; stale-while-revalidate=0 prevents serving stale copies
      "CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=0",
      "Vercel-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=0"
    }
  });
}
