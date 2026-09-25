import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await getSessionAdmin();
  if (!admin) return NextResponse.json({ admin: null });
  return NextResponse.json({
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      status: admin.status
    }
  });
}
