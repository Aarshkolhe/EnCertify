import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type { Admin } from "@prisma/client";

export const SESSION_COOKIE = "cert_admin_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours

const LOCAL_ADMIN_ID = "local-admin";

/**
 * No-database mode: authenticate a single admin against plain env vars
 * instead of the `Admin` table, so the app runs before Postgres is set up.
 *
 * Deliberately opt-in and refused in production — a plaintext credential in
 * the environment is a development convenience, not an auth strategy. Every
 * other admin feature still needs a real database.
 */
export function isDbAuthDisabled(): boolean {
  return process.env.AUTH_DISABLE_DB === "true" && process.env.NODE_ENV !== "production";
}

function getLocalAdminCredentials(): { email: string; password: string } | null {
  const email = process.env.LOCAL_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const password = process.env.LOCAL_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return null;
  return { email: email.toLowerCase(), password };
}

/** Length-independent constant-time compare. */
function secureEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The synthetic admin record used while the database is switched off. */
export function buildLocalAdmin(email: string): Admin {
  const now = new Date();
  return {
    id: LOCAL_ADMIN_ID,
    email,
    passwordHash: "",
    name: process.env.LOCAL_ADMIN_NAME ?? process.env.SEED_ADMIN_NAME ?? "Admin",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now
  } as Admin;
}

/** Verifies a sign-in attempt against the env credentials. */
export function verifyLocalAdmin(email: string, password: string): Admin | null {
  const creds = getLocalAdminCredentials();
  if (!creds) return null;
  const emailOk = secureEquals(email.toLowerCase(), creds.email);
  const passwordOk = secureEquals(password, creds.password);
  if (!emailOk || !passwordOk) return null;
  return buildLocalAdmin(creds.email);
}

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is not set or too short. Set a long random value in your environment."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AdminSessionPayload {
  sub: string; // admin id
  email: string;
}

export async function signAdminSession(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyAdminSession(
  token: string
): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Reads the session cookie, verifies the JWT, and loads the admin record
 * from the database. Used by every protected server component and API
 * route — never trust the token payload alone, always re-check the DB so
 * revoked/deleted admins lose access immediately.
 */
export async function getSessionAdmin() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyAdminSession(token);
  if (!payload) return null;

  // With the database off there is no record to re-check; the signed token
  // and the env credentials are the whole source of truth.
  if (isDbAuthDisabled()) {
    return payload.sub === LOCAL_ADMIN_ID ? buildLocalAdmin(payload.email) : null;
  }

  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin || admin.status !== "ACTIVE") return null;

  return admin;
}

export function generateActivationToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_SECONDS
};
