import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { certificateId: string } }) {
  // A certificate is only ever considered valid because a matching row
  // exists in the database — a well-formatted ID alone proves nothing.
  const certificate = await prisma.certificate.findUnique({
    where: { certificateId: params.certificateId },
    select: {
      certificateId: true,
      participantName: true,
      issueDate: true,
      status: true,
      event: { select: { name: true, date: true } }
    }
  });

  if (!certificate) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({
    found: true,
    certificateId: certificate.certificateId,
    participantName: certificate.participantName,
    eventName: certificate.event.name,
    eventDate: certificate.event.date,
    issueDate: certificate.issueDate,
    status: certificate.status
  });
}
