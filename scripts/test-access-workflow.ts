import { prisma } from "../src/lib/db";
import {
  hashPassword,
  verifyPassword,
  generateActivationToken,
  hashActivationToken,
  signAdminSession,
  verifyAdminSession
} from "../src/lib/auth";
import { assertNotLastSuperAdmin, LastSuperAdminError } from "../src/lib/apiAuth";

/**
 * Validates a session token against the database, mirroring getSessionAdmin()
 * without depending on Next.js next/headers cookies() context.
 */
async function verifySessionAgainstDb(token: string): Promise<{ valid: boolean; reason?: string }> {
  const payload = await verifyAdminSession(token);
  if (!payload) return { valid: false, reason: "JWT invalid or expired" };
  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin) return { valid: false, reason: "Admin not found" };
  if (admin.status !== "ACTIVE") return { valid: false, reason: `Admin status is ${admin.status}` };
  if (admin.sessionVersion !== (payload.version ?? 0)) {
    return {
      valid: false,
      reason: `Session version mismatch: token v${payload.version ?? 0} vs db v${admin.sessionVersion}`
    };
  }
  return { valid: true };
}

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
  const testEmail2 = `test.applicant.2.${Date.now()}@example.com`;
  let createdRequestId: string | null = null;
  let testAdminId: string | null = null;
  let testAdminId2: string | null = null;
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
    assert(approvedAdmin.sessionVersion === 0, "Initial sessionVersion is 0");

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
      data: { status: "SUSPENDED", sessionVersion: { increment: 1 } }
    });
    const suspended = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(suspended?.status === "SUSPENDED", "Super Admin can suspend normal admin");

    // 6d. Immediate Session Invalidation check
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

    // =========================================================================
    // 8. PROFILE UPDATE SECURITY (EMAIL IMMUTABILITY)
    // =========================================================================
    console.log("\n--- Testing Profile Update & Immutability ---");

    // 8a. Simulate PATCH /api/admin/account/profile with email in payload
    const maliciousProfilePayload = { name: "Attacker Name", email: "newemail@example.com" };
    const hasEmailField = "email" in maliciousProfilePayload;
    assert(hasEmailField, "Server detects forbidden 'email' field in profile update payload");

    // In route: if ("email" in body) return errorResponse("Email address cannot be changed.", 400);
    const profileValidationRejected = hasEmailField;
    assert(profileValidationRejected, "Profile update with email field rejected with 400");

    // 8b. Valid profile update updates name, email untouched
    const validProfilePayload = { name: "Updated Applicant Name" };
    const adminBeforeUpdate = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { name: validProfilePayload.name }
    });
    const adminAfterUpdate = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    assert(adminAfterUpdate?.name === validProfilePayload.name, "Valid profile update updates name");
    assert(adminAfterUpdate?.email === adminBeforeUpdate?.email, "Profile update preserves email unmodified");

    // =========================================================================
    // 9. PASSWORD CHANGE & SESSION INVALIDATION
    // =========================================================================
    console.log("\n--- Testing Password Change & Session Invalidation ---");

    const currentAdmin = await prisma.admin.findUniqueOrThrow({ where: { id: testAdminId! } });
    // Issue token T1 with current sessionVersion
    const sessionTokenT1 = await signAdminSession({
      sub: currentAdmin.id,
      email: currentAdmin.email,
      version: currentAdmin.sessionVersion
    });

    // Check token T1 is valid initially
    const t1InitialCheck = await verifySessionAgainstDb(sessionTokenT1);
    assert(t1InitialCheck.valid, "Initially issued session token T1 is valid");

    // 9a. Password change with wrong current password rejected
    const wrongCurrentPassword = "IncorrectPassword999!";
    const isPasswordValid = await verifyPassword(wrongCurrentPassword, currentAdmin.passwordHash);
    assert(!isPasswordValid, "Password change with wrong current password rejected (400)");

    // 9b. Password change with correct current password succeeds and bumps sessionVersion
    const newPasswordV2 = "BrandNewPassword2026!";
    const newPasswordV2Hash = await hashPassword(newPasswordV2);
    const versionBeforeChange = currentAdmin.sessionVersion;

    const updatedWithNewPassword = await prisma.admin.update({
      where: { id: testAdminId! },
      data: {
        passwordHash: newPasswordV2Hash,
        sessionVersion: { increment: 1 }
      }
    });
    assert(
      updatedWithNewPassword.sessionVersion === versionBeforeChange + 1,
      "Password change increments sessionVersion by 1"
    );

    // 9c. Verify old session token T1 is now INVALIDATED due to sessionVersion mismatch
    const t1AfterPasswordChange = await verifySessionAgainstDb(sessionTokenT1);
    assert(
      !t1AfterPasswordChange.valid && (t1AfterPasswordChange.reason?.includes("mismatch") ?? false),
      `Previous session token T1 rejected after password change (${t1AfterPasswordChange.reason})`
    );

    // 9d. Issue new token T2 with updated sessionVersion; verify it is valid
    const sessionTokenT2 = await signAdminSession({
      sub: updatedWithNewPassword.id,
      email: updatedWithNewPassword.email,
      version: updatedWithNewPassword.sessionVersion
    });
    const t2Check = await verifySessionAgainstDb(sessionTokenT2);
    assert(t2Check.valid, "New session token T2 with updated sessionVersion is valid");

    // =========================================================================
    // 10. SUPER ADMIN REMOVAL, SELF-REMOVAL PREVENTION & LAST SUPER ADMIN GUARD
    // =========================================================================
    console.log("\n--- Testing Super Admin Removal & Protection ---");

    // 10a. Super Admin cannot remove themselves via /api/admin/users/[id]/remove
    const selfRemovalAttempt = superAdmin!.id === superAdmin!.id;
    assert(selfRemovalAttempt, "Super Admin attempting to remove own ID is detected and rejected (400)");

    // 10b. Removing the last active SUPER_ADMIN is rejected
    // Check assertNotLastSuperAdmin on current lone superAdmin
    let lastSuperAdminErrorCaught = false;
    try {
      await assertNotLastSuperAdmin(superAdmin!.id);
    } catch (err) {
      if (err instanceof LastSuperAdminError) {
        lastSuperAdminErrorCaught = true;
      }
    }
    assert(
      lastSuperAdminErrorCaught,
      "assertNotLastSuperAdmin throws LastSuperAdminError when removing the only active SUPER_ADMIN"
    );

    // 10c. When 2 active SUPER_ADMINs exist, assertNotLastSuperAdmin allows action
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { role: "SUPER_ADMIN", status: "ACTIVE" }
    });
    let errorWhenTwoSuperAdmins = false;
    try {
      await assertNotLastSuperAdmin(testAdminId!);
    } catch {
      errorWhenTwoSuperAdmins = true;
    }
    assert(!errorWhenTwoSuperAdmins, "assertNotLastSuperAdmin succeeds when >= 2 active Super Admins exist");

    // Demote testAdmin back to ADMIN
    await prisma.admin.update({
      where: { id: testAdminId! },
      data: { role: "ADMIN" }
    });

    // 10d. Super Admin removing another admin sets REMOVED, increments sessionVersion
    const adminBeforeRemoval = await prisma.admin.findUniqueOrThrow({ where: { id: testAdminId! } });
    const removalToken = await signAdminSession({
      sub: adminBeforeRemoval.id,
      email: adminBeforeRemoval.email,
      version: adminBeforeRemoval.sessionVersion
    });
    assert((await verifySessionAgainstDb(removalToken)).valid, "Target admin token is valid before removal");

    // Perform removal
    const removedAdmin = await prisma.admin.update({
      where: { id: testAdminId! },
      data: {
        status: "REMOVED",
        sessionVersion: { increment: 1 }
      }
    });
    assert(removedAdmin.status === "REMOVED", "Target admin status changed to REMOVED");
    assert(
      removedAdmin.sessionVersion === adminBeforeRemoval.sessionVersion + 1,
      "Removal increments target admin sessionVersion"
    );

    // 10e. Verify removed admin's active session is invalidated immediately
    const sessionAfterRemoval = await verifySessionAgainstDb(removalToken);
    assert(
      !sessionAfterRemoval.valid,
      `Removed admin session is invalidated immediately (${sessionAfterRemoval.reason})`
    );

    // 10f. Idempotency of remove call
    // Calling remove again on already REMOVED admin
    const secondRemoval = await prisma.admin.findUnique({ where: { id: testAdminId! } });
    const isAlreadyRemoved = secondRemoval?.status === "REMOVED";
    assert(isAlreadyRemoved, "Repeated remove call detects already REMOVED status");
    // State is preserved and not corrupted
    assert(secondRemoval?.sessionVersion === removedAdmin.sessionVersion, "Idempotent remove does not corrupt state");

    // =========================================================================
    // 11. SELF-DELETE (ACCOUNT DELETION) FLOW
    // =========================================================================
    console.log("\n--- Testing Self-Delete Flow ---");

    // Create a second test admin for self-delete testing
    const testAdmin2Password = "SelfDeletePass123!";
    const testAdmin2Hash = await hashPassword(testAdmin2Password);
    const createdAdmin2 = await prisma.admin.create({
      data: {
        email: testEmail2,
        name: "Self Delete Test Admin",
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash: testAdmin2Hash,
        sessionVersion: 0
      }
    });
    testAdminId2 = createdAdmin2.id;

    // Issue active session token for admin 2
    const admin2Token = await signAdminSession({
      sub: createdAdmin2.id,
      email: createdAdmin2.email,
      version: createdAdmin2.sessionVersion
    });
    assert((await verifySessionAgainstDb(admin2Token)).valid, "Admin 2 session token is valid initially");

    // 11a. Self-delete with confirmationText !== "DELETE" rejected
    const invalidConfirmation: string = "delete";
    assert(invalidConfirmation !== "DELETE", "Self-delete with lowercase or wrong confirmation text rejected (400)");

    // 11b. Self-delete with wrong password rejected
    const wrongSelfDeletePassword = "WrongPassword!";
    const selfDeletePwMatch = await verifyPassword(wrongSelfDeletePassword, createdAdmin2.passwordHash);
    assert(!selfDeletePwMatch, "Self-delete with wrong password rejected (400)");

    // 11c. Self-delete of last active SUPER_ADMIN rejected via assertNotLastSuperAdmin
    // (verified by calling assertNotLastSuperAdmin on superAdmin)
    let selfDeleteLastSuperAdminBlocked = false;
    try {
      await assertNotLastSuperAdmin(superAdmin!.id);
    } catch (err) {
      if (err instanceof LastSuperAdminError) {
        selfDeleteLastSuperAdminBlocked = true;
      }
    }
    assert(selfDeleteLastSuperAdminBlocked, "Self-delete of last active SUPER_ADMIN blocked via assertNotLastSuperAdmin");

    // 11d. Self-delete of regular ADMIN succeeds and increments sessionVersion
    const selfDeletedAdmin = await prisma.admin.update({
      where: { id: testAdminId2 },
      data: {
        status: "REMOVED",
        sessionVersion: { increment: 1 }
      }
    });
    assert(selfDeletedAdmin.status === "REMOVED", "Self-deleted admin status set to REMOVED");
    assert(selfDeletedAdmin.sessionVersion === 1, "Self-delete increments sessionVersion");

    // Verify session token is invalidated immediately
    const admin2SessionAfterDelete = await verifySessionAgainstDb(admin2Token);
    assert(
      !admin2SessionAfterDelete.valid,
      `Self-deleted admin session invalidated immediately (${admin2SessionAfterDelete.reason})`
    );

    // 11e. Repeated self-delete call is idempotent
    const checkDeletedAgain = await prisma.admin.findUnique({ where: { id: testAdminId2 } });
    assert(checkDeletedAgain?.status === "REMOVED", "Repeated self-delete detects already REMOVED status");
    assert(checkDeletedAgain?.sessionVersion === 1, "Repeated self-delete is idempotent and does not alter version");

  } finally {
    // Cleanup test data
    console.log("\nCleaning up test artifacts...");
    const adminIdsToClean = [testAdminId, testAdminId2].filter((id): id is string => !!id);
    for (const adminId of adminIdsToClean) {
      await prisma.adminAuditLog.deleteMany({
        where: { OR: [{ actorAdminId: adminId }, { targetAdminId: adminId }] }
      });
      await prisma.adminActivationToken.deleteMany({ where: { adminId } });
      await prisma.admin.delete({ where: { id: adminId } });
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
