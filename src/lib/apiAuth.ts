import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth";
import type { Admin } from "@prisma/client";

/**
 * Every admin API route must call this first and bail out on `null`.
 * Hiding admin links in the UI is not access control — this is the
 * server-side check that actually protects the route.
 */
export async function requireAdmin(): Promise<
  { admin: Admin; error: null } | { admin: null; error: NextResponse }
> {
  const admin = await getSessionAdmin();
  if (!admin || admin.status !== "ACTIVE") {
    return {
      admin: null,
      error: NextResponse.json(
        { error: "Not authenticated. Please log in as an admin." },
        { status: 401 }
      )
    };
  }
  return { admin, error: null };
}

/**
 * Super Admin API routes must call this. Enforces server-side that the
 * authenticated admin possesses the SUPER_ADMIN role.
 */
export async function requireSuperAdmin(): Promise<
  { admin: Admin; error: null } | { admin: null; error: NextResponse }
> {
  const auth = await requireAdmin();
  if (auth.error) return auth;
  if (auth.admin.role !== "SUPER_ADMIN") {
    return {
      admin: null,
      error: NextResponse.json(
        { error: "Forbidden. Super Admin privileges required." },
        { status: 403 }
      )
    };
  }
  return { admin: auth.admin, error: null };
}

/** Consistent, safe error envelope — never leak stack traces or internals. */
export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
