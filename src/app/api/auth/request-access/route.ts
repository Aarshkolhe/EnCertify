import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { accessRequestSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message || "Invalid input data.";
    return errorResponse(message, 400);
  }

  const { fullName, email, department, organization, reason, website } = parsed.data;

  // Anti-spam protection: Honeypot check
  if (website && website.trim().length > 0) {
    // Silently return success to waste bot resources without persisting anything
    return NextResponse.json({
      message: "Your access request has been submitted successfully and is awaiting review."
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // 1. Check if an active or invited admin already exists
    const existingAdmin = await prisma.admin.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingAdmin) {
      if (existingAdmin.status === "ACTIVE") {
        return errorResponse("An active admin account already exists for this email. Please sign in.", 400);
      }
      if (existingAdmin.status === "INVITED") {
        return errorResponse("An admin account for this email has already been approved and is awaiting activation.", 400);
      }
      if (existingAdmin.status === "SUSPENDED") {
        return errorResponse("An account associated with this email has been suspended. Please contact a Super Admin.", 403);
      }
    }

    // 2. Check for duplicate pending requests
    const pendingRequest = await prisma.adminAccessRequest.findFirst({
      where: {
        email: normalizedEmail,
        status: "PENDING"
      }
    });

    if (pendingRequest) {
      return errorResponse("An access request for this email is already under review.", 409);
    }

    // 3. Abuse throttle: Check if any request was submitted for this email in the last 60 seconds
    const recentRequest = await prisma.adminAccessRequest.findFirst({
      where: {
        email: normalizedEmail,
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000)
        }
      }
    });

    if (recentRequest) {
      return errorResponse("Please wait a moment before submitting another request.", 429);
    }

    // 4. Create the access request and audit log in a transaction
    const newRequest = await prisma.$transaction(async (tx) => {
      const reqRecord = await tx.adminAccessRequest.create({
        data: {
          fullName,
          email: normalizedEmail,
          department: department ? department.trim() : null,
          organization: organization ? organization.trim() : null,
          reason: reason.trim(),
          status: "PENDING"
        }
      });

      await tx.adminAuditLog.create({
        data: {
          action: "ACCESS_REQUEST_CREATED",
          requestId: reqRecord.id,
          metadata: {
            fullName,
            email: normalizedEmail,
            department: department ? department.trim() : null,
            organization: organization ? organization.trim() : null
          }
        }
      });

      return reqRecord;
    });

    return NextResponse.json({
      success: true,
      message: "Your request has been submitted successfully and is awaiting Super Admin approval.",
      requestId: newRequest.id
    });
  } catch (err) {
    console.error("[auth/request-access] submission failed:", err);
    return errorResponse("Could not submit request. Please try again later.", 500);
  }
}
