import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { certificateId: string } }
) {
  const destination = new URL(
    `/certificate/verify/${encodeURIComponent(params.certificateId)}`,
    req.url
  );
  return NextResponse.redirect(destination, 307);
}
