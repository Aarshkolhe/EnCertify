/**
 * Keys whose value is filled in per certificate at generation time, from the
 * event, the participant row, and the issue date.
 */
export type BuiltInFieldKey =
  | "participantName"
  | "certificateId"
  | "eventName"
  | "eventDate"
  | "issueDate";

/**
 * A custom field carries its own fixed text instead of being filled in from
 * the data — a citation line, a college name, a signatory. The random suffix
 * keeps several of them distinct on one template, since `key` is the identity
 * used for selection, React keys, and value lookup.
 */
export type CustomFieldKey = `custom:${string}`;

export type FieldKey = BuiltInFieldKey | CustomFieldKey;

export const FIELD_DEFS: { key: BuiltInFieldKey; label: string }[] = [
  { key: "participantName", label: "Participant Name" },
  { key: "certificateId", label: "Certificate ID" },
  { key: "eventName", label: "Event Name" },
  { key: "eventDate", label: "Event Date" },
  { key: "issueDate", label: "Certificate Issue Date" }
];

const BUILT_IN_KEYS = new Set<string>(FIELD_DEFS.map((d) => d.key));

export function isCustomKey(key: string): key is CustomFieldKey {
  return key.startsWith("custom:");
}

export function isBuiltInKey(key: string): key is BuiltInFieldKey {
  return BUILT_IN_KEYS.has(key);
}

/** Matches the `key` shape the API validator accepts for custom fields. */
export function newCustomKey(): CustomFieldKey {
  const rand = Math.random().toString(36).slice(2, 10);
  return `custom:${Date.now().toString(36)}${rand}`;
}

export type TextAlign = "left" | "center" | "right";

// A type alias rather than an interface on purpose: only aliases get an
// implicit index signature, which is what lets `FieldConfig[]` be assigned
// straight to a Prisma `Json` column without an `as unknown as` cast.
export type FieldConfig = {
  key: FieldKey;
  label: string;
  x: number; // px, relative to template's native width, anchored at text center-x per align
  y: number; // px, relative to template's native height, vertical center of the text
  fontSize: number;
  fontFamily: "serif" | "sans-serif" | "monospace";
  align: TextAlign;
  bold: boolean;
  italic: boolean;
  color: string; // hex
  // Only meaningful for custom fields: the literal text printed on every
  // certificate. Built-in fields ignore it and take their value from the data.
  text?: string;
}

/**
 * The one place a field's printed text is decided, so the editor preview and
 * the renderer can never disagree about what a field shows. Returns an empty
 * string when there is nothing to draw; callers skip those.
 */
export function resolveFieldValue(
  field: FieldConfig,
  values: Partial<Record<string, string>>
): string {
  if (isCustomKey(field.key)) return (field.text ?? "").trim();
  return values[field.key] ?? "";
}

export function defaultFieldConfig(
  key: FieldKey,
  label: string,
  widthPx: number,
  heightPx: number
): FieldConfig {
  return {
    key,
    label,
    x: Math.round(widthPx / 2),
    y: Math.round(heightPx / 2),
    // Scale with the template so a field is legible on a 600px design and not
    // a speck on a 4000px print export. 3.5% of height lands near 28px on a
    // typical 800px-tall certificate, which is what this used to hardcode.
    fontSize: clampFontSize(Math.round(heightPx * 0.035)),
    fontFamily: "serif",
    align: "center",
    bold: false,
    italic: false,
    color: "#1b2430",
    ...(isCustomKey(key) ? { text: label } : {})
  };
}

/** Keeps a computed size inside the range the editor slider and API allow. */
export function clampFontSize(size: number) {
  return Math.min(200, Math.max(10, size));
}
