import type { BuiltInFieldKey } from "@/lib/fieldTypes";

/** Stand-in values so the field editor shows realistic text while positioning. */
export const SAMPLE_VALUES: Record<BuiltInFieldKey, string> = {
  participantName: "Rahul Sharma",
  certificateId: "CERT-2026-8F3K92",
  eventName: "Tech Fest 2026",
  eventDate: "12 December 2026",
  issueDate: "15 September 2026"
};
