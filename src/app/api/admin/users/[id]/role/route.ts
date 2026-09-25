import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse, assertNotLastSuperAdmin, LastSuperAdminError } from "@/lib/apiAuth";
import { adminRoleUpdateSchema } from "@/lib/validators";

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

  const parsed = adminRoleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid role value. Must be SUPER_ADMIN or ADMIN.", 400);
  }

  const { role: newRole } = parsed.data;

  // Safeguard 1: Cannot demote yourself
  if (auth.admin.id === targetId && newRole === "ADMIN") {
    return errorResponse("You cannot demote your own account.", 400);
  }

  try {
    const targetAdmin = await prisma.admin.findUnique({
      where: { id: targetId }
    });

    if (!targetAdmin) {
      return errorResponse("Admin user not found.", 404);
    }

    // Safeguard 2: Cannot demote the last active SUPER_ADMIN
    if (newRole === "ADMIN") {
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
        data: { role: newRole },
        select: { id: true, email: true, name: true, role: true, status: true }
      });

      const action = newRole === "SUPER_ADMIN" ? "ADMIN_PROMOTED" : "ADMIN_DEMOTED";

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: targetId,
          action,
          metadata: {
            previousRole: targetAdmin.role,
            newRole,
            targetEmail: targetAdmin.email
          }
        }
      });

      return admin;
    });

    return NextResponse.json({
      success: true,
      message: `Admin role successfully updated to ${newRole}.`,
      admin: updated
    });
  } catch (err) {
    console.error("[admin/users/role] update failed:", err);
    return errorResponse("Could not update admin role.", 500);
  }
}
