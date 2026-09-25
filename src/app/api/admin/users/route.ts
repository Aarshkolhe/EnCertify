import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const statusParam = req.nextUrl.searchParams.get("status");

  let whereClause: any = { status: { not: "REMOVED" } };
  if (statusParam === "REMOVED") {
    whereClause = { status: "REMOVED" };
  } else if (statusParam === "ALL") {
    whereClause = {};
  } else if (statusParam && ["ACTIVE", "SUSPENDED", "INVITED"].includes(statusParam)) {
    whereClause = { status: statusParam };
  }

  try {
    const admins = await prisma.admin.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            events: true,
            templates: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json({
      admins,
      currentAdminId: auth.admin.id
    });
  } catch (err) {
    console.error("[admin/users] fetch failed:", err);
    return errorResponse("Failed to fetch admin list.", 500);
  }
}
