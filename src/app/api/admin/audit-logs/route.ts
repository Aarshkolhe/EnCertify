import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const url = req.nextUrl;
  const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 50 : limitParam));

  try {
    const logs = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actorAdmin: {
          select: { id: true, name: true, email: true }
        },
        targetAdmin: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("[admin/audit-logs] fetch failed:", err);
    return errorResponse("Failed to fetch audit logs.", 500);
  }
}
