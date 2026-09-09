import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import { ensureStorageDirs, assertAllowedExtension, assertWithinSizeLimit } from "@/lib/storage";
import { processTemplateUpload } from "@/lib/templateUpload";
import { FIELD_DEFS, defaultFieldConfig } from "@/lib/fieldTypes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { admin, error } = await requireAdmin();
  if (!admin) return error;

  await ensureStorageDirs();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Expected multipart form data.");
  }

  const file = formData.get("file");
  const name = formData.get("name");

  if (!(file instanceof File)) return errorResponse("A template file is required.");
  if (typeof name !== "string" || name.trim().length < 2) {
    return errorResponse("A template name (2+ characters) is required.");
  }

  let ext: string;
  try {
    ext = assertAllowedExtension(file.name);
    if (!["png", "jpg", "jpeg", "pdf"].includes(ext)) {
      return errorResponse("Templates must be PNG, JPG, or PDF.");
    }
    assertWithinSizeLimit(file.size, "template");
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processTemplateUpload(buffer, ext);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not process the template file.", 422);
  }

  const defaultFields = FIELD_DEFS.slice(0, 4).map((def, i) => {
    const cfg = defaultFieldConfig(def.key, def.label, processed.widthPx, processed.heightPx);
    // Stagger initial positions vertically so fields don't all stack on top of each other.
    cfg.y = Math.round(processed.heightPx * (0.35 + i * 0.15));
    return cfg;
  });

  const template = await prisma.template.create({
    data: {
      name: name.trim(),
      fileUrl: processed.storedFilename,
      fileType: processed.fileType,
      widthPx: processed.widthPx,
      heightPx: processed.heightPx,
      fields: defaultFields,
      qrEnabled: true,
      qrX: processed.widthPx - 170,
      qrY: processed.heightPx - 170,
      qrSize: 120,
      createdById: admin.id
    }
  });

  return NextResponse.json({ template }, { status: 201 });
}
