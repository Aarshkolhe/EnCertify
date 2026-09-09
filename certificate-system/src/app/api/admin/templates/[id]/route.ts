import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { templateUpdateSchema } from "@/lib/validators";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const template = await prisma.template.findUnique({ where: { id: params.id } });
  if (!template) return errorResponse("Template not found.", 404);
  return NextResponse.json({ template });
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

  const parsed = templateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Invalid template data.");
  }

  const existing = await prisma.template.findUnique({ where: { id: params.id } });
  if (!existing) return errorResponse("Template not found.", 404);

  const template = await prisma.template.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      fields: parsed.data.fields,
      qrEnabled: parsed.data.qrEnabled,
      qrX: parsed.data.qrX,
      qrY: parsed.data.qrY,
      qrSize: parsed.data.qrSize
    }
  });

  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const existing = await prisma.template.findUnique({
    where: { id: params.id },
    include: { _count: { select: { certificates: true } } }
  });
  if (!existing) return errorResponse("Template not found.", 404);
  if (existing._count.certificates > 0) {
    return errorResponse(
      "This template has already been used to generate certificates and cannot be deleted.",
      409
    );
  }

  await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
