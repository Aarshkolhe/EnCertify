import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { eventSchema } from "@/lib/validators";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return errorResponse("Event not found.", 404);
  return NextResponse.json({ event });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.");
  }

  const parsed = eventSchema.partial().safeParse(body);
  if (!parsed.success) return errorResponse("Invalid event data.");

  const existing = await prisma.event.findUnique({ where: { id: params.id } });
  if (!existing) return errorResponse("Event not found.", 404);

  const date = parsed.data.date ? new Date(parsed.data.date) : undefined;
  if (date && Number.isNaN(date.getTime())) return errorResponse("Invalid event date.");

  const event = await prisma.event.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      date,
      description: parsed.data.description
    }
  });

  return NextResponse.json({ event });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const existing = await prisma.event.findUnique({ where: { id: params.id } });
  if (!existing) return errorResponse("Event not found.", 404);

  // Archive rather than hard-delete so existing certificates keep a valid
  // event reference and verification keeps working.
  const event = await prisma.event.update({
    where: { id: params.id },
    data: { status: "ARCHIVED" }
  });

  return NextResponse.json({ event });
}
