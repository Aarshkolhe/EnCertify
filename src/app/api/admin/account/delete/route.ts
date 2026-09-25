import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse, assertNotLastSuperAdmin, LastSuperAdminError } from "@/lib/apiAuth";
import { verifyPassword, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const { password, confirmationText } = body || {};

  // Idempotent: if already REMOVED, return success and clear cookie
  if (auth.admin.status === "REMOVED") {
    const res = NextResponse.json({
      success: true,
      message: "Account already deleted."
    });
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0)
    });
    return res;
  }

  if (confirmationText !== "DELETE") {
    return errorResponse("Confirmation text must be 'DELETE'.", 400);
  }

  if (!password || typeof password !== "string") {
    return errorResponse("Password is required to confirm deletion.", 400);
  }

  // Verify password
  const passwordOk = await verifyPassword(password, auth.admin.passwordHash);
  if (!passwordOk) {
    return errorResponse("Incorrect password.", 400);
  }

  // If SUPER_ADMIN, assert not the last active one
  if (auth.admin.role === "SUPER_ADMIN") {
    try {
      await assertNotLastSuperAdmin(auth.admin.id);
    } catch (err) {
      if (err instanceof LastSuperAdminError) {
        return errorResponse(err.message, 400);
      }
      throw err;
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: auth.admin.id },
        data: {
          status: "REMOVED",
          sessionVersion: { increment: 1 }
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: auth.admin.id,
          action: "ACCOUNT_SELF_DELETED",
          metadata: {
            email: auth.admin.email
          }
        }
      });
    });

    const response = NextResponse.json({
      success: true,
      message: "Your account has been deleted successfully."
    });

    // Clear session cookie immediately
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0)
    });

    return response;
  } catch (err) {
    console.error("[account/delete] self-delete failed:", err);
    return errorResponse("Could not delete account.", 500);
  }
}
