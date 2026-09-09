import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { ZIP_DIR, resolveWithinDir } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: { batchId: string } }) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  const batch = await prisma.generationBatch.findUnique({ where: { id: params.batchId } });
  if (!batch || !batch.zipUrl) {
    return errorResponse("No ZIP is available for this batch.", 404);
  }

  let fileBuffer: Buffer;
  try {
    const zipPath = resolveWithinDir(ZIP_DIR, batch.zipUrl);
    fileBuffer = await fs.readFile(zipPath);
  } catch {
    return errorResponse("The generated ZIP could not be found.", 404);
  }

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="certificates-${batch.id}.zip"`
    }
  });
}
