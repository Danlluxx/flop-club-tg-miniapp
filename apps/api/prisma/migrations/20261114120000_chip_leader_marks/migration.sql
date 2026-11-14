CREATE TABLE "TournamentChipLeaderMark" (
  "tournamentId" TEXT NOT NULL,
  "breakNumber" INTEGER NOT NULL,
  "registrationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TournamentChipLeaderMark_pkey" PRIMARY KEY ("tournamentId", "breakNumber")
);

CREATE INDEX "TournamentChipLeaderMark_registrationId_idx"
ON "TournamentChipLeaderMark"("registrationId");

ALTER TABLE "TournamentChipLeaderMark"
ADD CONSTRAINT "TournamentChipLeaderMark_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentChipLeaderMark"
ADD CONSTRAINT "TournamentChipLeaderMark_registrationId_fkey"
FOREIGN KEY ("registrationId") REFERENCES "Registration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
