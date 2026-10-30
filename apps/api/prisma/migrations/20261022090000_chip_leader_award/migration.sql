CREATE TABLE "TournamentChipLeaderAward" (
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TournamentChipLeaderAward_pkey" PRIMARY KEY ("tournamentId")
);

CREATE INDEX "TournamentChipLeaderAward_userId_idx"
ON "TournamentChipLeaderAward"("userId");

ALTER TABLE "TournamentChipLeaderAward"
ADD CONSTRAINT "TournamentChipLeaderAward_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentChipLeaderAward"
ADD CONSTRAINT "TournamentChipLeaderAward_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TournamentChipLeaderAward" (
  "tournamentId",
  "userId",
  "points",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON (result."tournamentId")
  result."tournamentId",
  result."userId",
  result."chipLeaderBonus",
  result."createdAt",
  result."updatedAt"
FROM "TournamentRatingResult" AS result
JOIN "Tournament" AS tournament ON tournament.id = result."tournamentId"
WHERE result."chipLeaderBonus" > 0
  AND lower(trim(tournament.title)) = 'flop chip leader'
ORDER BY result."tournamentId", result."chipLeaderBonus" DESC, result."updatedAt" DESC;

UPDATE "TournamentRatingResult" AS result
SET "chipLeaderBonus" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Tournament" AS tournament
WHERE tournament.id = result."tournamentId"
  AND result."chipLeaderBonus" > 0
  AND lower(trim(tournament.title)) = 'flop chip leader';
