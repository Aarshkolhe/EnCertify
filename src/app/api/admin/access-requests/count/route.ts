import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/apiAuth";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const pendingCount = await prisma.adminAccessRequest.count({
    where: { status: "PENDING" }
  });

  return NextResponse.json({ pendingCount });
}
