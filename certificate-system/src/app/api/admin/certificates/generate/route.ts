import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { generateRequestSchema } from "@/lib/validators";
import { runGenerationBatch } from "@/lib/generation";

// Certificate generation for a few hundred participants can take a
// noticeable amount of time; raise the route's max duration so the
// request isn't cut off mid-batch on platforms that enforce one.
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.");
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Invalid request.");
  }

  try {
    const summary = await runGenerationBatch(parsed.data);
    return NextResponse.json({ summary });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Certificate generation failed.",
      422
    );
  }
}
