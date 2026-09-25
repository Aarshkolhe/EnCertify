import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse, assertNotLastSuperAdmin, LastSuperAdminError } from "@/lib/apiAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const targetId = params.id;
  if (!targetId) {
    return errorResponse("Missing admin ID.", 400);
  }

  // Reject if acting super admin's own id
  if (auth.admin.id === targetId) {
    return errorResponse(
      "Cannot remove your own account through this endpoint. Please use the self-service account deletion page.",
      400
    );
  }

  try {
    const targetAdmin = await prisma.admin.findUnique({
      where: { id: targetId }
    });

    if (!targetAdmin) {
      return errorResponse("Admin user not found.", 404);
    }

    // Idempotent: if already REMOVED, return success
    if (targetAdmin.status === "REMOVED") {
      return NextResponse.json({
        success: true,
        message: "Admin account is already removed."
      });
    }

    // If target is SUPER_ADMIN, assert not the last active one
    if (targetAdmin.role === "SUPER_ADMIN") {
      try {
        await assertNotLastSuperAdmin(targetId);
      } catch (err) {
        if (err instanceof LastSuperAdminError) {
          return errorResponse(err.message, 400);
        }
        throw err;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const admin = await tx.admin.update({
        where: { id: targetId },
        data: {
          status: "REMOVED",
          sessionVersion: { increment: 1 }
        },
        select: { id: true, email: true, name: true, role: true, status: true }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: targetId,
          action: "ADMIN_REMOVED",
          metadata: {
            previousStatus: targetAdmin.status,
            targetEmail: targetAdmin.email
          }
        }
      });

      return admin;
    });

    return NextResponse.json({
      success: true,
      message: "Administrator account successfully removed.",
      admin: updated
    });
  } catch (err) {
    console.error("[admin/users/remove] remove failed:", err);
    return errorResponse("Could not remove admin account.", 500);
  }
}
