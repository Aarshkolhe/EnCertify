import * as XLSX from "xlsx";

export interface ParsedWorkbook {
  headers: string[];
  rows: string[][]; // raw rows, values stringified, header row excluded
}

const MAX_ROWS = 5000;

export function parseWorkbookBuffer(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The uploaded file has no sheets.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false
  });

  if (raw.length === 0) {
    throw new Error("The uploaded file is empty.");
  }

  const headerRow = raw[0].map((cell) => String(cell ?? "").trim());
  if (headerRow.every((h) => h === "")) {
    throw new Error("Could not find a header row in the uploaded file.");
  }

  const dataRows = raw.slice(1, 1 + MAX_ROWS).map((row) =>
    headerRow.map((_, colIndex) => String(row[colIndex] ?? "").trim())
  );

  return { headers: headerRow, rows: dataRows };
}

export {
  type ColumnMapping,
  type ParticipantRecord,
  type ParticipantValidationResult,
  buildParticipants,
  splitIntoChunks
} from "./participantValidator";
