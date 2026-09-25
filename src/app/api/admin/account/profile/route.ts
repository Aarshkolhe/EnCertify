import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  // Reject if body contains an "email" key at all (email is strictly immutable)
  if (body && typeof body === "object" && "email" in body) {
    return errorResponse("Email cannot be changed.", 400);
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2 || name.length > 100) {
    return errorResponse("Name must be between 2 and 100 characters.", 400);
  }

  try {
    const oldName = auth.admin.name;

    const updated = await prisma.$transaction(async (tx) => {
      const admin = await tx.admin.update({
        where: { id: auth.admin.id },
        data: { name },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: auth.admin.id,
          action: "ACCOUNT_NAME_CHANGED",
          metadata: {
            oldName,
            newName: name
          }
        }
      });

      return admin;
    });

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      admin: updated
    });
  } catch (err) {
    console.error("[account/profile] update failed:", err);
    return errorResponse("Could not update profile.", 500);
  }
}
