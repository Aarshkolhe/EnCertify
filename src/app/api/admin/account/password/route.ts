import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import {
  verifyPassword,
  hashPassword,
  signAdminSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { currentPassword, newPassword, confirmPassword } = body || {};

  if (!currentPassword || typeof currentPassword !== "string") {
    return errorResponse("Current password is required.", 400);
  }

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return errorResponse("New password must be at least 8 characters long.", 400);
  }

  if (newPassword !== confirmPassword) {
    return errorResponse("Passwords do not match.", 400);
  }

  try {
    // 1. Verify current password
    const passwordOk = await verifyPassword(currentPassword, auth.admin.passwordHash);
    if (!passwordOk) {
      return errorResponse("Incorrect current password.", 400);
    }

    // 2. Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // 3. Update password and bump sessionVersion in transaction
    const updatedAdmin = await prisma.$transaction(async (tx) => {
      const admin = await tx.admin.update({
        where: { id: auth.admin.id },
        data: {
          passwordHash: newPasswordHash,
          sessionVersion: { increment: 1 }
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: auth.admin.id,
          action: "ACCOUNT_PASSWORD_CHANGED",
          metadata: {
            sessionVersion: admin.sessionVersion
          }
        }
      });

      return admin;
    });

    // 4. Re-issue fresh session cookie so current user remains signed in
    const token = await signAdminSession({
      sub: updatedAdmin.id,
      email: updatedAdmin.email,
      version: updatedAdmin.sessionVersion
    });

    const response = NextResponse.json({
      success: true,
      message: "Password changed successfully. All other active sessions have been invalidated."
    });

    response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (err) {
    console.error("[account/password] password change failed:", err);
    return errorResponse("Could not change password.", 500);
  }
}
