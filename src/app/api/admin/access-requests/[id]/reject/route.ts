import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";
import { rejectRequestSchema } from "@/lib/validators";

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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is acceptable since rejectionReason is optional
    body = {};
  }

  const parsed = rejectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Invalid rejection details.", 400);
  }

  const { rejectionReason } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.adminAccessRequest.findUnique({
        where: { id: requestId }
      });

      if (!requestRecord) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (requestRecord.status !== "PENDING") {
        throw new Error("NOT_PENDING");
      }

      await tx.adminAccessRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          rejectionReason: rejectionReason ? rejectionReason.trim() : null,
          reviewedById: auth.admin.id,
          reviewedAt: new Date()
        }
      });

      await tx.adminAuditLog.create({
        data: {
          actorAdminId: auth.admin.id,
          requestId: requestRecord.id,
          action: "ACCESS_REQUEST_REJECTED",
          metadata: {
            email: requestRecord.email,
            rejectionReason: rejectionReason || null
          }
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Access request rejected."
    });
  } catch (err: unknown) {
    const errorKey = err instanceof Error ? err.message : "";
    if (errorKey === "REQUEST_NOT_FOUND") {
      return errorResponse("Access request not found.", 404);
    }
    if (errorKey === "NOT_PENDING") {
      return errorResponse("This request has already been reviewed.", 409);
    }

    console.error("[admin/access-requests/reject] failed:", err);
    return errorResponse("Could not reject access request. Please try again.", 500);
  }
}
