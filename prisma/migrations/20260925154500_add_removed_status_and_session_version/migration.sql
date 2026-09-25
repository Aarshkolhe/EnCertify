-- AlterEnum
ALTER TYPE "AdminStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
