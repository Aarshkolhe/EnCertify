import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set (see .env.example) before seeding."
    );
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "SUPER_ADMIN" || existing.status !== "ACTIVE") {
      await prisma.admin.update({
        where: { id: existing.id },
        data: { role: "SUPER_ADMIN", status: "ACTIVE" }
      });
      console.log(`Updated root admin ${email} to SUPER_ADMIN + ACTIVE.`);
    } else {
      console.log(`Root admin ${email} already exists as SUPER_ADMIN + ACTIVE.`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.create({
    data: {
      email,
      passwordHash,
      name,
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  console.log(`Created root super admin account for ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
