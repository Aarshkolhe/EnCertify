import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

/**
 * Runs a query, falling back instead of throwing when the database is
 * unreachable. Only for read-only display data (counts, recent lists) where
 * an empty value is an honest "unknown" — never for writes or for anything
 * an access-control decision depends on.
 */
export async function safeQuery<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error("[db] query failed, using fallback:", err);
    return fallback;
  }
}

/** True when the app is configured to run without a database. */
export function isDbConfigured(): boolean {
  return process.env.AUTH_DISABLE_DB !== "true";
}
