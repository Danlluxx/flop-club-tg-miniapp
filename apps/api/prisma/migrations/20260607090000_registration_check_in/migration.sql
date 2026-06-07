CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Registration" ADD COLUMN "checkInToken" TEXT;
ALTER TABLE "Registration" ADD COLUMN "checkedInAt" TIMESTAMP(3);

UPDATE "Registration"
SET "checkInToken" = md5("id" || random()::text || clock_timestamp()::text)
WHERE "checkInToken" IS NULL;

ALTER TABLE "Registration" ALTER COLUMN "checkInToken" SET NOT NULL;
ALTER TABLE "Registration" ALTER COLUMN "checkInToken" SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "Registration_checkInToken_key" ON "Registration"("checkInToken");
CREATE INDEX "Registration_tournamentId_checkedInAt_idx" ON "Registration"("tournamentId", "checkedInAt");
