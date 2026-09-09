import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/apiAuth";

export async function GET() {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const batches = await prisma.generationBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      event: { select: { name: true } },
      template: { select: { name: true } }
    }
  });

  return NextResponse.json({ batches });
}
