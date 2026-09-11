import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { templateUpdateSchema } from "@/lib/validators";
import { TEMPLATE_DIR, deleteStoredFile } from "@/lib/storage";

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
    include: { _count: { select: { certificates: true, batches: true } } }
  });
  if (!existing) return errorResponse("Template not found.", 404);

  // Certificates keep a foreign key to the template they were rendered from,
  // so a template still in use cannot go without taking real certificates
  // with it. Deleting those is a separate, deliberate action.
  if (existing._count.certificates > 0) {
    return errorResponse(
      `This template was used for ${existing._count.certificates} certificate(s). ` +
        "Delete those batches first, then delete the template.",
      409
    );
  }
  if (existing._count.batches > 0) {
    return errorResponse(
      "This template is referenced by a generation batch. Delete that batch first.",
      409
    );
  }

  await prisma.template.delete({ where: { id: params.id } });

  // Row first, then the background image — an orphan file is harmless, a row
  // pointing at a missing file is not.
  try {
    await deleteStoredFile(TEMPLATE_DIR, existing.fileUrl);
  } catch (err) {
    console.error("[delete] could not remove template file:", err);
  }

  return NextResponse.json({ ok: true });
}
