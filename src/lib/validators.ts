import { z } from "zod";
import { MAX_CERTIFICATES_PER_BATCH } from "@/lib/constants";

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

export const participantRecordSchema = z.object({
  participantName: z.string().trim().min(1, "Participant name is required."),
  participantEmail: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => (val ? val : null)),
  sourceRow: z.number().int().positive()
});

export const generateRequestSchema = z
  .object({
    uploadId: z.string().min(1).optional(),
    eventId: z.string().min(1),
    templateId: z.string().min(1),
    issueDate: z.string().min(1),
    mapping: columnMappingSchema.optional(),
    participants: z
      .array(participantRecordSchema)
      .min(1, "At least one participant is required.")
      .max(
        MAX_CERTIFICATES_PER_BATCH,
        `Maximum ${MAX_CERTIFICATES_PER_BATCH} certificates can be generated per batch. Please split the Excel file into smaller batches.`
      )
      .optional()
  })
  .refine(
    (data) => (data.uploadId && data.mapping) || (data.participants && data.participants.length > 0),
    {
      message: "Either uploadId with column mapping or a list of participants must be provided."
    }
  );


export const studentSearchSchema = z.object({
  name: z.string().trim().min(2).max(120)
});

export const byEventSchema = z.object({
  name: z.string().trim().min(2).max(120),
  eventId: z.string().min(1)
});

export const accessRequestSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters.").max(100),
  email: z.string().trim().email("Please provide a valid email address.").toLowerCase(),
  department: z.string().trim().max(100).optional().nullable(),
  organization: z.string().trim().max(100).optional().nullable(),
  reason: z.string().trim().min(10, "Please provide a clear reason (at least 10 characters).").max(1000, "Reason cannot exceed 1000 characters."),
  website: z.string().optional() // Honeypot field: must be empty
});

export const activationSchema = z
  .object({
    token: z.string().min(1, "Activation token is required."),
    password: z.string().min(8, "Password must be at least 8 characters long."),
    confirmPassword: z.string().min(8, "Please confirm your password.")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const adminStatusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"])
});

export const adminRoleUpdateSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN"])
});

export const rejectRequestSchema = z.object({
  rejectionReason: z.string().trim().max(500).optional().nullable()
});

