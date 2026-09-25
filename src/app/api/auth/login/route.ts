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
      if (!admin) {
        return errorResponse("Invalid email or password.", 401);
      }
    } else {
      const normalizedEmail = email.toLowerCase();
      const found = await prisma.admin.findUnique({
        where: { email: normalizedEmail }
      });

      if (found) {
        if (found.status === "INVITED") {
          return errorResponse(
            "Your account has been approved. Please complete account activation using your activation link.",
            403
          );
        }

        const passwordOk = await verifyPassword(password, found.passwordHash);
        if (!passwordOk) {
          return errorResponse("Invalid email or password.", 401);
        }

        if (found.status === "SUSPENDED") {
          return errorResponse(
            "Your account has been suspended. Please contact a Super Admin.",
            403
          );
        }

        if (found.status !== "ACTIVE") {
          return errorResponse("Invalid email or password.", 401);
        }

        admin = found;
      } else {
        // No Admin row found. Check for an access request for this email.
        const accessReq = await prisma.adminAccessRequest.findFirst({
          where: { email: normalizedEmail },
          orderBy: { createdAt: "desc" }
        });

        if (accessReq?.status === "PENDING") {
          return errorResponse("Your admin access request is still pending approval.", 403);
        }

        if (accessReq?.status === "REJECTED") {
          return errorResponse(
            accessReq.rejectionReason
              ? `Your admin access request was rejected: ${accessReq.rejectionReason}`
              : "Your admin access request was rejected by an administrator.",
            403
          );
        }

        // Always run dummy compare to mitigate timing-based enumeration
        await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidin");
        return errorResponse("Invalid email or password.", 401);
      }
    }

    const token = await signAdminSession({ sub: admin.id, email: admin.email });

    const response = NextResponse.json({
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        status: admin.status
      }
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
