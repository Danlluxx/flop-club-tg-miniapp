CREATE TYPE "ParticipantLiveStatus" AS ENUM ('IN_GAME', 'ELIMINATED');

ALTER TABLE "Registration"
ADD COLUMN "liveStatus" "ParticipantLiveStatus" NOT NULL DEFAULT 'IN_GAME',
ADD COLUMN "eliminatedAt" TIMESTAMP(3);

CREATE TABLE "Knockout" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "eliminatedRegistrationId" TEXT NOT NULL,
  "killerRegistrationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Knockout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Knockout_eliminatedRegistrationId_key"
ON "Knockout"("eliminatedRegistrationId");

CREATE INDEX "Knockout_tournamentId_idx"
ON "Knockout"("tournamentId");

CREATE INDEX "Knockout_killerRegistrationId_idx"
ON "Knockout"("killerRegistrationId");

CREATE INDEX "Registration_tournamentId_liveStatus_idx"
ON "Registration"("tournamentId", "liveStatus");

ALTER TABLE "Knockout"
ADD CONSTRAINT "Knockout_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Knockout"
ADD CONSTRAINT "Knockout_eliminatedRegistrationId_fkey"
FOREIGN KEY ("eliminatedRegistrationId") REFERENCES "Registration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Knockout"
ADD CONSTRAINT "Knockout_killerRegistrationId_fkey"
FOREIGN KEY ("killerRegistrationId") REFERENCES "Registration"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
