import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/apiAuth";
import {
  ensureStorageDirs,
  assertAllowedExtension,
  assertWithinSizeLimit,
  TMP_DIR,
  safeFilename,
  putObject
} from "@/lib/storage";
import { parseWorkbookBuffer } from "@/lib/excelParser";

export const runtime = "nodejs";

const PREVIEW_ROW_COUNT = 10;

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
  if (!(file instanceof File)) return errorResponse("An Excel file is required.");

  let ext: string;
  try {
    ext = assertAllowedExtension(file.name);
    if (!["xlsx", "xls"].includes(ext)) {
      return errorResponse("Please upload a .xlsx or .xls file.");
    }
    assertWithinSizeLimit(file.size, "excel");
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = parseWorkbookBuffer(buffer);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not read the Excel file.", 422);
  }

  if (parsed.rows.length === 0) {
    return errorResponse("The uploaded file has no participant rows.", 422);
  }

  // The workbook has to survive until the separate /generate request picks it
  // up, so it is parked in object storage rather than on the instance.
  const uploadId = safeFilename(ext);
  await putObject(
    TMP_DIR,
    uploadId,
    buffer,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  return NextResponse.json({
    uploadId,
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    previewRows: parsed.rows.slice(0, PREVIEW_ROW_COUNT)
  });
}
