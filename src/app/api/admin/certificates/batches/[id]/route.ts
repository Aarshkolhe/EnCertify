import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { deleteBatchCascade } from "@/lib/adminDelete";

/**
 * Permanently deletes a generation batch, every certificate it produced, the
 * rendered PDFs, and the batch ZIP. The verification link for each of those
 * certificates stops resolving, so this is irreversible.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const existing = await prisma.generationBatch.findUnique({
    where: { id: params.id },
    select: { id: true }
  });
  if (!existing) return errorResponse("Batch not found.", 404);

  const summary = await deleteBatchCascade(params.id);
  return NextResponse.json({ ok: true, deleted: summary });
}
