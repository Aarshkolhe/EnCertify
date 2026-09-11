import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const eventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  date: z.string().min(1), // ISO date string
  description: z.string().trim().max(2000).optional().nullable(),
  // Archiving is the non-destructive alternative to deleting an event: the
  // certificates and their verification links stay intact.
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
});

// Built-in keys are filled in from the data at generation time; a
// `custom:<id>` key carries its own fixed `text` instead, which is what lets
// an admin put their own line on a template rather than only the five
// predefined ones.
const fieldKeySchema = z.union([
  z.enum(["participantName", "certificateId", "eventName", "eventDate", "issueDate"]),
  z.string().regex(/^custom:[A-Za-z0-9_-]{4,32}$/, "Invalid custom field key.")
]);

const fieldConfigSchema = z.object({
  key: fieldKeySchema,
  label: z.string().min(1).max(60),
  text: z.string().max(200).optional(),
  x: z.number().min(0),
  y: z.number().min(0),
  fontSize: z.number().min(6).max(200),
  fontFamily: z.enum(["serif", "sans-serif", "monospace"]),
  align: z.enum(["left", "center", "right"]),
  bold: z.boolean(),
  italic: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  fields: z.array(fieldConfigSchema).max(20).optional(),
  qrEnabled: z.boolean().optional(),
  qrX: z.number().min(0).optional(),
  qrY: z.number().min(0).optional(),
  qrSize: z.number().min(20).max(600).optional()
});

export const columnMappingSchema = z.object({
  participantName: z.string().min(1),
  participantEmail: z.string().optional()
});

export const generateRequestSchema = z.object({
  uploadId: z.string().min(1),
  eventId: z.string().min(1),
  templateId: z.string().min(1),
  issueDate: z.string().min(1),
  mapping: columnMappingSchema
});

export const studentSearchSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export const byEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventId: z.string().min(1)
});
