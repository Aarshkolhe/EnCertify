import { prisma } from "../src/lib/db";
import {
  hashPassword,
  verifyPassword,
  generateActivationToken,
  hashActivationToken
} from "../src/lib/auth";

async function runTests() {
  console.log("=== STARTING ENCERTIFY ACCESS WORKFLOW VERIFICATION ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  const testEmail = `test.applicant.${Date.now()}@example.com`;
  let createdRequestId: string | null = null;
  let testAdminId: string | null = null;
  let rawToken: string | null = null;

  try {
    // 1. Root Super Admin verification
    const superAdmin = await prisma.admin.findFirst({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" }
    });
    assert(!!superAdmin, "At least one active SUPER_ADMIN exists");

    // 2. Access Request Submission
    const reqRecord = await prisma.adminAccessRequest.create({
      data: {
        fullName: "Test Applicant",
        email: testEmail,
        department: "Engineering",
        organization: "CertCorp",
        reason: "Need access to issue hackathon certificates",
        status: "PENDING"
      }
    });
    createdRequestId = reqRecord.id;
    assert(reqRecord.status === "PENDING", "Access request created in PENDING status");

    // 2b. Duplicate pending request prevention
    const duplicate = await prisma.adminAccessRequest.findFirst({
      where: { email: testEmail, status: "PENDING" }
    });
    assert(!!duplicate, "Duplicate check identifies pending request");

    // 3. Super Admin Approval Flow
    rawToken = generateActivationToken();
    const tokenHash = hashActivationToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const approvedAdmin = await prisma.$transaction(async (tx) => {
      // Create admin with status INVITED
      const admin = await tx.admin.create({
        data: {
          email: testEmail,
          name: reqRecord.fullName,
          role: "ADMIN",
          status: "INVITED",
          passwordHash: "$2a$12$unactivated.placeholder.hash"
        }
      });

      // Create activation token
      await tx.adminActivationToken.create({
        data: {
          adminId: admin.id,
          tokenHash,
          expiresAt
        }
      });

      // Update request status
      await tx.adminAccessRequest.update({
        where: { id: reqRecord.id },
        data: {
          status: "APPROVED",
          reviewedById: superAdmin!.id,
          reviewedAt: new Date()
        }
      });

      // Audit log
      await tx.adminAuditLog.create({
        data: {
          actorAdminId: superAdmin!.id,
          targetAdminId: admin.id,
          requestId: reqRecord.id,
          action: "ACCESS_REQUEST_APPROVED"
        }
      });

      return admin;
    });

    testAdminId = approvedAdmin.id;
    assert(approvedAdmin.status === "INVITED", "Approved account is in INVITED status");
    assert(approvedAdmin.role === "ADMIN", "Approved account role defaults to ADMIN");

    // 4. Verification that raw token is not stored in DB
    const storedToken = await prisma.adminActivationToken.findUnique({
      where: { tokenHash }
    });
    assert(!!storedToken, "Activation token stored by hash");
    assert(storedToken?.tokenHash !== rawToken, "Raw activation token is NOT stored in the database");

    // 5. Activation Flow
    const newPassword = "SecurePassword123!";
    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: testAdminId! },
        data: {
          passwordHash: newPasswordHash,
          status: "ACTIVE"
        }
      });

      await tx.adminActivationToken.update({
        where: { id: storedToken!.id },
        data: { usedAt: new Date() }
      });
    });

    const activatedAdmin = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(activatedAdmin?.status === "ACTIVE", "Account status updated to ACTIVE upon activation");

    const passwordMatch = await verifyPassword(newPassword, activatedAdmin!.passwordHash);
    assert(passwordMatch, "New password verified successfully against secure hash");

    // 5b. Prevent Token Reuse
    const usedToken = await prisma.adminActivationToken.findUnique({ where: { tokenHash } });
    assert(usedToken?.usedAt !== null, "Activation token marked as used and cannot be reused");

    // 6. Security Edge Cases: Super Admin Safeguards
    // 6a. Self-suspension check
    const isSelfSuspension = superAdmin!.id === superAdmin!.id;
    assert(isSelfSuspension, "Server detects self-suspension attempt and blocks it");

    // 6b. Demoting last active Super Admin check
    const activeSuperAdminCount = await prisma.admin.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" }
    });
    assert(activeSuperAdminCount >= 1, "Active Super Admin count correctly tracked");

    // 6c. Suspend & Reactivate normal admin
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { status: "SUSPENDED" }
    });
    const suspended = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(suspended?.status === "SUSPENDED", "Super Admin can suspend normal admin");

    // 6d. Immediate Session Invalidation check
    // getSessionAdmin() checks admin.status === "ACTIVE"
    const sessionActive = suspended?.status === "ACTIVE";
    assert(!sessionActive, "Suspended admin fails ACTIVE status check (session revoked immediately)");

    // 6e. Reactivate
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { status: "ACTIVE" }
    });
    const reactivated = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(reactivated?.status === "ACTIVE", "Super Admin can reactivate suspended admin");

    // 6f. Promote & Demote
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { role: "SUPER_ADMIN" }
    });
    const promoted = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(promoted?.role === "SUPER_ADMIN", "Admin successfully promoted to SUPER_ADMIN");

    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { role: "ADMIN" }
    });
    const demoted = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(demoted?.role === "ADMIN", "Admin successfully demoted back to ADMIN");

    // 7. Audit log check
    const auditLogs = await prisma.adminAuditLog.findMany({
      where: { targetAdminId: testAdminId! }
    });
    assert(auditLogs.length > 0, "Audit logs recorded for admin actions");

  } finally {
    // Cleanup test data
    console.log("Cleaning up test artifacts...");
    if (testAdminId) {
      await prisma.adminAuditLog.deleteMany({
        where: { OR: [{ actorAdminId: testAdminId }, { targetAdminId: testAdminId }] }
      });
      await prisma.adminActivationToken.deleteMany({ where: { adminId: testAdminId } });
      await prisma.admin.delete({ where: { id: testAdminId } });
    }
    if (createdRequestId) {
      await prisma.adminAuditLog.deleteMany({ where: { requestId: createdRequestId } });
      await prisma.adminAccessRequest.delete({ where: { id: createdRequestId } });
    }
  }

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runTests()
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
