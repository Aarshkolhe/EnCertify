import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";

// Excludes visually ambiguous characters (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nano = customAlphabet(ALPHABET, 6);

/**
 * Generates a certificate ID of the form CERT-<year>-<6 chars> and
 * guarantees it does not already exist in the database, retrying on
 * collision. IDs are always generated here, server-side — the frontend
 * never supplies or influences a certificate ID.
 */
export async function generateUniqueCertificateId(issueYear: number): Promise<string> {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `CERT-${issueYear}-${nano()}`;
    const existing = await prisma.certificate.findUnique({
      where: { certificateId: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique certificate ID after several attempts.");
}
