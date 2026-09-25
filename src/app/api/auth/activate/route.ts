import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashActivationToken, hashPassword } from "@/lib/auth";
import { activationSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return errorResponse("Missing activation token.", 400);
  }

  const tokenHash = hashActivationToken(token);
  const tokenRecord = await prisma.adminActivationToken.findUnique({
    where: { tokenHash },
    include: { admin: true }
  });

  if (!tokenRecord) {
    return errorResponse("Invalid or unknown activation link.", 404);
  }

  if (tokenRecord.usedAt) {
    return errorResponse("This activation link has already been used.", 410);
  }

  if (tokenRecord.expiresAt < new Date()) {
    return errorResponse("This activation link has expired. Please ask a Super Admin to re-invite you.", 410);
  }

  if (tokenRecord.admin.status !== "INVITED") {
    return errorResponse("This admin account is not awaiting activation.", 400);
  }

  return NextResponse.json({
    valid: true,
    email: tokenRecord.admin.email,
    name: tokenRecord.admin.name
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const parsed = activationSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message || "Invalid input data.";
    return errorResponse(message, 400);
  }

  const { token, password } = parsed.data;
  const tokenHash = hashActivationToken(token);

  try {
    await prisma.$transaction(async (tx) => {
      const tokenRecord = await tx.adminActivationToken.findUnique({
        where: { tokenHash },
        include: { admin: true }
      });

      if (!tokenRecord) {
        throw new Error("INVALID_TOKEN");
      }

      if (tokenRecord.usedAt) {
        throw new Error("TOKEN_USED");
      }

      if (tokenRecord.expiresAt < new Date()) {
        throw new Error("TOKEN_EXPIRED");
      }

      if (tokenRecord.admin.status !== "INVITED") {
        throw new Error("NOT_INVITED");
      }

      const passwordHash = await hashPassword(password);

      // 1. Update the admin account to ACTIVE with their chosen password
      await tx.admin.update({
        where: { id: tokenRecord.adminId },
        data: {
          passwordHash,
          status: "ACTIVE"
        }
      });

      // 2. Mark this token as used
      await tx.adminActivationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() }
      });

      // 3. Invalidate any other active tokens for this admin
      await tx.adminActivationToken.updateMany({
        where: {
          adminId: tokenRecord.adminId,
          id: { not: tokenRecord.id },
          usedAt: null
        },
        data: { usedAt: new Date() }
      });

      // 4. Log the activation in audit log
      await tx.adminAuditLog.create({
        data: {
          actorAdminId: tokenRecord.adminId,
          targetAdminId: tokenRecord.adminId,
          action: "ADMIN_ACTIVATED",
          metadata: {
            email: tokenRecord.admin.email,
            activatedAt: new Date().toISOString()
          }
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Account activated successfully. You can now sign in."
    });
  } catch (err: unknown) {
    const errorKey = err instanceof Error ? err.message : "";
    if (errorKey === "INVALID_TOKEN") {
      return errorResponse("Invalid or unknown activation link.", 404);
    }
    if (errorKey === "TOKEN_USED") {
      return errorResponse("This activation link has already been used.", 410);
    }
    if (errorKey === "TOKEN_EXPIRED") {
      return errorResponse("This activation link has expired. Please contact a Super Admin.", 410);
    }
    if (errorKey === "NOT_INVITED") {
      return errorResponse("This account is not in invited status.", 400);
    }

    console.error("[auth/activate] Activation failed:", err);
    return errorResponse("Account activation failed. Please try again.", 500);
  }
}
