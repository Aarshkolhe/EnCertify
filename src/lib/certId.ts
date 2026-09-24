import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/db";

// Excludes visually ambiguous characters (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nano = customAlphabet(ALPHABET, 6);

/**
 * Generates a candidate certificate ID without database check.
 * Format: CERT-<year>-<6 chars> using 30-char unambiguous alphabet (30^6 = 729M combinations).
 */
export function generateCandidateCertificateId(issueYear: number): string {
  return `CERT-${issueYear}-${nano()}`;
}

/**
 * Generates a certificate ID of the form CERT-<year>-<6 chars> and
 * guarantees it does not already exist in the database, retrying on
 * collision. IDs are always generated here, server-side — the frontend
 * never supplies or influences a certificate ID.
 */
export async function generateUniqueCertificateId(issueYear: number): Promise<string> {
  const MAX_ATTEMPTS = 10;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateCandidateCertificateId(issueYear);
    const existing = await prisma.certificate.findUnique({
      where: { certificateId: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique certificate ID after several attempts.");
}

/**
 * Generates a batch of unique certificate IDs for `count` participants.
 *
 * Rather than making N sequential database round-trips (which costs 200-250ms
 * per participant across regions), this:
 * 1. Generates candidate IDs in-memory.
 * 2. Deduplicates candidates within the batch using a Set.
 * 3. Verifies against the database in a SINGLE findMany query.
 * 4. Regenerates only the rare collision if any occurs.
 */
export async function generateBatchCertificateIds(
  issueYear: number,
  count: number
): Promise<string[]> {
  if (count <= 0) return [];

  const MAX_BATCH_ATTEMPTS = 5;
  const uniqueIds = new Set<string>();

  for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS; attempt++) {
    // Fill the set up to `count` unique candidates in memory
    while (uniqueIds.size < count) {
      uniqueIds.add(generateCandidateCertificateId(issueYear));
    }

    const candidateList = Array.from(uniqueIds);
    const existing = await prisma.certificate.findMany({
      where: { certificateId: { in: candidateList } },
      select: { certificateId: true }
    });

    if (existing.length === 0) {
      return candidateList;
    }

    // Remove the colliding IDs from the set so the next loop iteration regenerates them
    for (const row of existing) {
      uniqueIds.delete(row.certificateId);
    }
  }

  throw new Error("Could not generate a batch of unique certificate IDs after several attempts.");
}

