import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { eventSchema } from "@/lib/validators";
import { deleteEventCascade } from "@/lib/adminDelete";

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
      description: parsed.data.description,
      status: parsed.data.status
    }
  });

  return NextResponse.json({ event });
}

/**
 * Permanently deletes an event, every certificate issued for it, and every
 * generation batch belonging to it — rows and files alike.
 *
 * This is irreversible and breaks the public verification link of every
 * certificate involved, so it is gated on `?confirm=<exact event name>`.
 * Hiding the button in the UI is not a safeguard; this is. Archiving
 * (PUT with status ARCHIVED) remains the non-destructive option.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const existing = await prisma.event.findUnique({
    where: { id: params.id },
    include: { _count: { select: { certificates: true, batches: true } } }
  });
  if (!existing) return errorResponse("Event not found.", 404);

  const confirm = req.nextUrl.searchParams.get("confirm");
  if (confirm !== existing.name) {
    return errorResponse(
      "Type the event name exactly to confirm deletion.",
      400
    );
  }

  const summary = await deleteEventCascade(params.id);
  return NextResponse.json({ ok: true, deleted: summary });
}
