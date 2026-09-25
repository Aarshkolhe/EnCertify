import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";
import { generateActivationToken, hashActivationToken } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const adminId = params.id;
  if (!adminId) {
    return errorResponse("Missing admin ID.", 400);
  }

  try {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId }
    });

    if (!admin) {
      return errorResponse("Admin user not found.", 404);
    }

    if (admin.status !== "INVITED") {
      return errorResponse("Can only regenerate activation links for accounts in INVITED status.", 400);
    }

    const rawToken = generateActivationToken();
    const tokenHash = hashActivationToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.$transaction(async (tx) => {
      // Invalidate existing unused tokens
      await tx.adminActivationToken.updateMany({
        where: { adminId, usedAt: null },
        data: { usedAt: new Date() }
      });

      // Create new token
      await tx.adminActivationToken.create({
        data: {
          adminId,
          tokenHash,
          expiresAt
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: adminId,
          action: "ACTIVATION_LINK_REGENERATED",
          metadata: {
            adminEmail: admin.email,
            expiresAt: expiresAt.toISOString()
          }
        }
      });
    });

    const origin =
      req.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const activationUrl = `${origin.replace(/\/$/, "")}/admin/activate?token=${rawToken}`;

    return NextResponse.json({
      success: true,
      message: "New activation link generated.",
      activationUrl,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err) {
    console.error("[admin/users/reinvite] failed:", err);
    return errorResponse("Could not regenerate activation link.", 500);
  }
}
