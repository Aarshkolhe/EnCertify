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
    console.log(`Admin ${email} already exists. Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.create({
    data: { email, passwordHash, name }
  });

  console.log(`Created admin account for ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
