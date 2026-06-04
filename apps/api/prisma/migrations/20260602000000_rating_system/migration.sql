ALTER TABLE "User" ADD COLUMN "ratingPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "knockouts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Tournament" ADD COLUMN "ratingPool" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "Tournament" ADD COLUMN "entriesCount" INTEGER;

CREATE TABLE "TournamentRatingResult" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "place" INTEGER NOT NULL,
  "percent" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "knockouts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TournamentRatingResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentRatingResult_tournamentId_place_key" ON "TournamentRatingResult"("tournamentId", "place");
CREATE UNIQUE INDEX "TournamentRatingResult_tournamentId_userId_key" ON "TournamentRatingResult"("tournamentId", "userId");
CREATE INDEX "TournamentRatingResult_userId_idx" ON "TournamentRatingResult"("userId");

ALTER TABLE "TournamentRatingResult" ADD CONSTRAINT "TournamentRatingResult_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentRatingResult" ADD CONSTRAINT "TournamentRatingResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
