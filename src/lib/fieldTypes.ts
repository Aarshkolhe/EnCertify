export type FieldKey =
  | "participantName"
  | "certificateId"
  | "eventName"
  | "eventDate"
  | "issueDate";

export const FIELD_DEFS: { key: FieldKey; label: string }[] = [
  { key: "participantName", label: "Participant Name" },
  { key: "certificateId", label: "Certificate ID" },
  { key: "eventName", label: "Event Name" },
  { key: "eventDate", label: "Event Date" },
  { key: "issueDate", label: "Certificate Issue Date" }
];

export type TextAlign = "left" | "center" | "right";

export interface FieldConfig {
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
}

export function defaultFieldConfig(key: FieldKey, label: string, widthPx: number, heightPx: number): FieldConfig {
  return {
    key,
    label,
    x: Math.round(widthPx / 2),
    y: Math.round(heightPx / 2),
    fontSize: 28,
    fontFamily: "serif",
    align: "center",
    bold: false,
    italic: false,
    color: "#1B2430"
  };
}
