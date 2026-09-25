import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const admins = await prisma.admin.findMany({
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
