CREATE TABLE "TournamentReminder" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentReminder_tournamentId_kind_key" ON "TournamentReminder"("tournamentId", "kind");
CREATE INDEX "TournamentReminder_sentAt_idx" ON "TournamentReminder"("sentAt");

ALTER TABLE "TournamentReminder" ADD CONSTRAINT "TournamentReminder_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
