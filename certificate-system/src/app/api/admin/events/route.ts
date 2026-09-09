import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { eventSchema } from "@/lib/validators";

export async function GET() {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { certificates: true } } }
  });
  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.");
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Invalid event data.");
  }

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return errorResponse("Invalid event date.");

  const event = await prisma.event.create({
    data: {
      name: parsed.data.name,
      date,
      description: parsed.data.description || null,
      createdById: admin.id
    }
  });

  return NextResponse.json({ event }, { status: 201 });
}
