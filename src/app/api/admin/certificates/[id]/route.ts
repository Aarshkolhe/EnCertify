import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { deleteCertificate } from "@/lib/adminDelete";

/**
 * Permanently deletes one certificate and its rendered PDF.
 *
 * `id` is the row id, not the public `certificateId` — the public identifier
 * is never accepted as a delete target.
 *
 * Revoking (PATCH status = REVOKED) is the non-destructive alternative: it
 * keeps the record so verification reports "revoked" rather than the weaker
 * "not found", which is usually what you want for a mistakenly issued
 * certificate that is already in someone's hands.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const existing = await prisma.certificate.findUnique({
    where: { id: params.id },
    select: { id: true, certificateId: true }
  });
  if (!existing) return errorResponse("Certificate not found.", 404);

  const summary = await deleteCertificate(params.id);
  revalidatePath(`/certificate/verify/${existing.certificateId}`);
  revalidatePath(`/api/certificate/file/${existing.certificateId}`);
  return NextResponse.json({ ok: true, deleted: summary });
}

/** Revokes or restores a certificate without destroying the record. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.");
  }

  const status = (body as { status?: unknown })?.status;
  if (status !== "VALID" && status !== "REVOKED") {
    return errorResponse("Status must be VALID or REVOKED.");
  }

  const existing = await prisma.certificate.findUnique({
    where: { id: params.id },
    select: { id: true, certificateId: true }
  });
  if (!existing) return errorResponse("Certificate not found.", 404);

  const certificate = await prisma.certificate.update({
    where: { id: params.id },
    data: { status },
    select: { id: true, certificateId: true, status: true }
  });

  revalidatePath(`/certificate/verify/${certificate.certificateId}`);
  revalidatePath(`/api/certificate/file/${certificate.certificateId}`);
  return NextResponse.json({ certificate });
}
