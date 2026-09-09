import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/apiAuth";

export async function GET() {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const templates = await prisma.template.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      fileUrl: true,
      fileType: true,
      widthPx: true,
      heightPx: true,
      createdAt: true,
      _count: { select: { certificates: true } }
    }
  });
  return NextResponse.json({ templates });
}
