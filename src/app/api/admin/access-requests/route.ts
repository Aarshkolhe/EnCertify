import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";
import type { AdminAccessRequestStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const url = req.nextUrl;
  const statusParam = url.searchParams.get("status");
  const pageParam = parseInt(url.searchParams.get("page") || "1", 10);
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);

  const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);
  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 20 : limitParam));
  const skip = (page - 1) * limit;

  const whereClause: { status?: AdminAccessRequestStatus } = {};
  if (
    statusParam &&
    statusParam !== "ALL" &&
    ["PENDING", "APPROVED", "REJECTED"].includes(statusParam)
  ) {
    whereClause.status = statusParam as AdminAccessRequestStatus;
  }

  try {
    const [requests, total] = await Promise.all([
      prisma.adminAccessRequest.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          reviewedBy: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      prisma.adminAccessRequest.count({ where: whereClause })
    ]);

    return NextResponse.json({
      requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("[admin/access-requests] query failed:", err);
    return errorResponse("Failed to fetch access requests.", 500);
  }
}
