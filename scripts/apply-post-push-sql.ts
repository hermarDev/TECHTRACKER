import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Raw SQL that Prisma schema cannot express. Run after `prisma db push`.
 * Safe to re-run: the index is created only if it does not exist.
 */
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceLog_one_open_per_student_day"
    ON "AttendanceLog" ("studentId", ("shiftDate"::date))
    WHERE "timeOut" IS NULL;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RateLimitHit" (
      "id" TEXT NOT NULL,
      "bucketKey" TEXT NOT NULL,
      "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RateLimitHit_bucketKey_attemptedAt_idx"
    ON "RateLimitHit" ("bucketKey", "attemptedAt");
  `);
  console.log("Post-push SQL applied.");
}

main()
  .catch((error: unknown) => {
    console.error("Post-push SQL failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
