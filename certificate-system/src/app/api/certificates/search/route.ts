import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { studentSearchSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") || "";
  const parsed = studentSearchSchema.safeParse({ name });
  if (!parsed.success) {
    return errorResponse("Please enter your name (at least 2 characters).");
  }

  const normalized = parsed.data.name.trim().toLowerCase();

  // Exact match on the normalized name only — matching is case/whitespace
  // insensitive, but we deliberately avoid partial/fuzzy matches so this
  // public endpoint can't be used to browse unrelated participants.
  const certificates = await prisma.certificate.findMany({
    where: { participantNameNormalized: normalized, status: "VALID" },
    select: {
      eventId: true,
      event: { select: { id: true, name: true, date: true } }
    }
  });

  const eventMap = new Map<string, { id: string; name: string; date: Date; count: number }>();
  for (const cert of certificates) {
    const key = cert.event.id;
    const existing = eventMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      eventMap.set(key, { id: cert.event.id, name: cert.event.name, date: cert.event.date, count: 1 });
    }
  }

  return NextResponse.json({ events: Array.from(eventMap.values()) });
}
