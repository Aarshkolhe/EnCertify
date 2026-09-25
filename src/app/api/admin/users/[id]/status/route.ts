import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";
import { adminStatusUpdateSchema } from "@/lib/validators";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const parsed = adminStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid status value. Must be ACTIVE or SUSPENDED.", 400);
  }

  const { status: newStatus } = parsed.data;

  // Safeguard 1: Cannot suspend yourself
  if (auth.admin.id === targetId && newStatus === "SUSPENDED") {
    return errorResponse("You cannot suspend your own account.", 400);
  }

  try {
    const targetAdmin = await prisma.admin.findUnique({
      where: { id: targetId }
    });

    if (!targetAdmin) {
      return errorResponse("Admin user not found.", 404);
    }

    // Safeguard 2: Cannot suspend the last active SUPER_ADMIN
    if (targetAdmin.role === "SUPER_ADMIN" && newStatus === "SUSPENDED") {
      const activeSuperAdminCount = await prisma.admin.count({
        where: {
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          id: { not: targetId }
        }
      });

      if (activeSuperAdminCount === 0) {
        return errorResponse("Cannot suspend the only remaining active Super Admin.", 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const admin = await tx.admin.update({
        where: { id: targetId },
        data: { status: newStatus },
        select: { id: true, email: true, name: true, role: true, status: true }
      });

      const action = newStatus === "SUSPENDED" ? "ADMIN_SUSPENDED" : "ADMIN_REACTIVATED";

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: targetId,
          action,
          metadata: {
            previousStatus: targetAdmin.status,
            newStatus,
            targetEmail: targetAdmin.email
          }
        }
      });

      return admin;
    });

    return NextResponse.json({
      success: true,
      message: `Admin status successfully updated to ${newStatus}.`,
      admin: updated
    });
  } catch (err) {
    console.error("[admin/users/status] update failed:", err);
    return errorResponse("Could not update admin status.", 500);
  }
}
