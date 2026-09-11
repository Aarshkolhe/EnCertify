import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  signAdminSession,
  isDbAuthDisabled,
  verifyLocalAdmin,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS
} from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("Please provide a valid email and password.");
  }

  const { email, password } = parsed.data;

  try {
    let admin;

    if (isDbAuthDisabled()) {
      admin = verifyLocalAdmin(email, password);
    } else {
      const found = await prisma.admin.findUnique({
        where: { email: email.toLowerCase() }
      });
      // Always run the compare, even on a missing user, to avoid timing-based
      // account enumeration.
      const passwordHash =
        found?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidin";
      const passwordOk = await verifyPassword(password, passwordHash);
      admin = found && passwordOk ? found : null;
    }

    if (!admin) {
      return errorResponse("Invalid email or password.", 401);
    }

    const token = await signAdminSession({ sub: admin.id, email: admin.email });

    const response = NextResponse.json({
      admin: { id: admin.id, email: admin.email, name: admin.name }
    });
    response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return response;
  } catch (err) {
    // An unhandled throw here (database unreachable, JWT_SECRET missing) would
    // become an empty-bodied 500, which the browser reports to the user as an
    // opaque JSON parse error. Log the detail, return a readable envelope.
    console.error("[auth/login] sign-in failed:", err);
    return errorResponse("Sign-in is unavailable right now. Please try again later.", 500);
  }
}
