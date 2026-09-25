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

  const requestId = params.id;
  if (!requestId) {
    return errorResponse("Missing request ID.", 400);
  }

  try {
    const rawToken = generateActivationToken();
    const tokenHash = hashActivationToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch request and ensure it is still PENDING
      const requestRecord = await tx.adminAccessRequest.findUnique({
        where: { id: requestId }
      });

      if (!requestRecord) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (requestRecord.status !== "PENDING") {
        throw new Error("NOT_PENDING");
      }

      const email = requestRecord.email.toLowerCase().trim();

      // 2. Check if an admin account already exists
      let adminRecord = await tx.admin.findUnique({
        where: { email }
      });

      if (adminRecord && adminRecord.status === "ACTIVE") {
        throw new Error("ALREADY_ACTIVE");
      }

      if (!adminRecord) {
        // Create new Admin record with INVITED status and placeholder password hash
        adminRecord = await tx.admin.create({
          data: {
            email,
            name: requestRecord.fullName.trim(),
            role: "ADMIN",
            status: "INVITED",
            passwordHash: "$2a$12$unactivated.placeholder.hash.until.set"
          }
        });
      } else {
        // If already invited, reset to invited status if needed
        adminRecord = await tx.admin.update({
          where: { id: adminRecord.id },
          data: {
            status: "INVITED",
            name: requestRecord.fullName.trim()
          }
        });
      }

      // 3. Invalidate any existing unused tokens for this admin
      await tx.adminActivationToken.updateMany({
        where: {
          adminId: adminRecord.id,
          usedAt: null
        },
        data: { usedAt: new Date() }
      });

      // 4. Create new single-use activation token
      await tx.adminActivationToken.create({
        data: {
          adminId: adminRecord.id,
          tokenHash,
          expiresAt
        }
      });

      // 5. Update request to APPROVED
      await tx.adminAccessRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedById: auth.admin.id,
          reviewedAt: new Date()
        }
      });

      // 6. Record in Audit Log
      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          targetAdminId: adminRecord.id,
          requestId: requestRecord.id,
          action: "ACCESS_REQUEST_APPROVED",
          metadata: {
            email,
            adminId: adminRecord.id,
            expiresAt: expiresAt.toISOString()
          }
        }
      });

      return {
        adminId: adminRecord.id,
        email,
        name: adminRecord.name
      };
    });

    // Derive app URL for activation link
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.nextUrl.origin ||
      "http://localhost:3000";
    const activationUrl = `${origin.replace(/\/$/, "")}/admin/activate?token=${rawToken}`;

    return NextResponse.json({
      success: true,
      message: "Access request approved successfully.",
      admin: result,
      activationUrl,
      expiresAt: expiresAt.toISOString()
    });
  } catch (err: unknown) {
    const errorKey = err instanceof Error ? err.message : "";
    if (errorKey === "REQUEST_NOT_FOUND") {
      return errorResponse("Access request not found.", 404);
    }
    if (errorKey === "NOT_PENDING") {
      return errorResponse("This request has already been reviewed.", 409);
    }
    if (errorKey === "ALREADY_ACTIVE") {
      return errorResponse("An active administrator account already exists for this email.", 409);
    }

    console.error("[admin/access-requests/approve] failed:", err);
    return errorResponse("Could not approve access request. Please try again.", 500);
  }
}
