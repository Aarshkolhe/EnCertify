-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'SUPER_ADMIN';

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "AdminAccessRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "organization" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AdminAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActivationToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "action" TEXT NOT NULL,
    "targetAdminId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAccessRequest_status_idx" ON "AdminAccessRequest"("status");
CREATE INDEX "AdminAccessRequest_email_idx" ON "AdminAccessRequest"("email");
CREATE INDEX "AdminAccessRequest_createdAt_idx" ON "AdminAccessRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminActivationToken_tokenHash_key" ON "AdminActivationToken"("tokenHash");
CREATE INDEX "AdminActivationToken_adminId_idx" ON "AdminActivationToken"("adminId");
CREATE INDEX "AdminActivationToken_expiresAt_idx" ON "AdminActivationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorAdminId_idx" ON "AdminAuditLog"("actorAdminId");
CREATE INDEX "AdminAuditLog_targetAdminId_idx" ON "AdminAuditLog"("targetAdminId");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminAccessRequest" ADD CONSTRAINT "AdminAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActivationToken" ADD CONSTRAINT "AdminActivationToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_targetAdminId_fkey" FOREIGN KEY ("targetAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
