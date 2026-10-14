import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../lib/server/seed";

process.env.DATABASE_URL ??= "file:./dev.db";

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedDemo(prisma);
    console.log("Seeded CounselLint demo data.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
