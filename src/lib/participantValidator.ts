export interface ColumnMapping {
  participantName: string; // header name mapped to Participant Name (required)
  participantEmail?: string; // header name mapped to Participant Email (optional)
}

export interface ParticipantRecord {
  participantName: string;
  participantEmail: string | null;
  sourceRow: number; // 1-based, excluding header, for error messages
}

export interface ParticipantValidationResult {
  valid: ParticipantRecord[];
  errors: { row: number; reason: string }[];
  duplicateCount: number;
}

/**
 * Applies the admin's column mapping to raw rows, validating required
 * fields and flagging duplicate/invalid rows. Certificates are never
 * generated for rows collected in `errors`.
 */
export function buildParticipants(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): ParticipantValidationResult {
  const nameIdx = headers.indexOf(mapping.participantName);
  const emailIdx = mapping.participantEmail ? headers.indexOf(mapping.participantEmail) : -1;

  if (nameIdx === -1) {
    throw new Error("The column mapped to Participant Name was not found in the file.");
  }

  const valid: ParticipantRecord[] = [];
  const errors: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 1; // 1-based, header excluded
    const name = (row[nameIdx] || "").trim();
    const email = emailIdx >= 0 ? (row[emailIdx] || "").trim() : "";

    if (!name) {
      errors.push({ row: rowNumber, reason: "Missing participant name." });
      return;
    }

    const dedupeKey = `${name.toLowerCase()}|${email.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      duplicateCount += 1;
      errors.push({
        row: rowNumber,
        reason: "Duplicate row (same name and email as an earlier row)."
      });
      return;
    }
    seen.add(dedupeKey);

    valid.push({
      participantName: name,
      participantEmail: email || null,
      sourceRow: rowNumber
    });
  });

  return { valid, errors, duplicateCount };
}

/**
 * Divides an array of items into chunks of at most `chunkSize`.
 */
export function splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
