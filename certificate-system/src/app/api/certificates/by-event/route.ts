import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { byEventSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") || "";
  const eventId = req.nextUrl.searchParams.get("eventId") || "";
  const parsed = byEventSchema.safeParse({ name, eventId });
  if (!parsed.success) return errorResponse("Missing or invalid name/event.");

  const normalized = parsed.data.name.trim().toLowerCase();

  const certificates = await prisma.certificate.findMany({
    where: {
      participantNameNormalized: normalized,
      eventId: parsed.data.eventId,
      status: "VALID"
    },
    select: {
      certificateId: true,
      participantName: true,
      issueDate: true,
      event: { select: { name: true } }
    },
    orderBy: { issueDate: "desc" }
  });

  // Only the minimum needed to identify and display the certificate is
  // returned — no email, phone, or other participant details.
  return NextResponse.json({ certificates });
}
