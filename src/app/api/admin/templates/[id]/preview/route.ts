import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { TEMPLATE_DIR, getObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const template = await prisma.template.findUnique({ where: { id: params.id } });
  if (!template) return errorResponse("Template not found.", 404);

  let buffer: Buffer;
  try {
    buffer = await getObject(TEMPLATE_DIR, template.fileUrl);
  } catch {
    return errorResponse("Template image not found.", 404);
  }

  return new NextResponse(buffer, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" }
  });
}
