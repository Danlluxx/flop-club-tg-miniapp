CREATE TYPE "TournamentProfile" AS ENUM (
  'BASE',
  'FREEZE',
  'PHOENIX',
  'TURBO_ACTION',
  'DEEP_SPECIAL',
  'KNOCKOUT',
  'FINAL'
);

ALTER TABLE "Tournament"
ADD COLUMN "profile" "TournamentProfile" NOT NULL DEFAULT 'BASE',
ADD COLUMN "lateRegistrationEndsAt" TIMESTAMP(3),
ADD COLUMN "addOnEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "addOnPrice" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Registration"
ADD COLUMN "finishPlace" INTEGER,
ADD COLUMN "entryNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "addOnCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Registration_tournamentId_finishPlace_idx"
ON "Registration"("tournamentId", "finishPlace");

UPDATE "Tournament"
SET "profile" = CASE
  WHEN "title" IN ('Flop Freeze Out', 'Flop One Shot') THEN 'FREEZE'::"TournamentProfile"
  WHEN "title" = 'Flop Phoenix' THEN 'PHOENIX'::"TournamentProfile"
  WHEN "title" IN ('Flop Last Call', 'Flop Rampage') THEN 'TURBO_ACTION'::"TournamentProfile"
  WHEN "title" IN ('Flop Deep Stack', 'Flop Prime Event', 'Flop Black Edition') THEN 'DEEP_SPECIAL'::"TournamentProfile"
  WHEN "title" IN ('Flop Bounty', 'Flop Mystery Knockout') THEN 'KNOCKOUT'::"TournamentProfile"
  WHEN "title" IN ('Flop Grand Final', 'Flop Secret Final') THEN 'FINAL'::"TournamentProfile"
  ELSE 'BASE'::"TournamentProfile"
END,
"addOnEnabled" = CASE
  WHEN "title" IN ('Flop Deep Stack', 'Flop Prime Event', 'Flop Black Edition') THEN true
  ELSE false
END,
"addOnPrice" = CASE
  WHEN "title" IN ('Flop Deep Stack', 'Flop Prime Event', 'Flop Black Edition') THEN 1000
  ELSE 0
END;
