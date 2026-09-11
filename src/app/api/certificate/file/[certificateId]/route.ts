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
    return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await getObject(CERTIFICATE_DIR, certificate.fileUrl);
  } catch {
    return NextResponse.json({ error: "Certificate file not found." }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = safeArcFilename(certificate.participantName, certificate.certificateId, "pdf");

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`
    }
  });
}
