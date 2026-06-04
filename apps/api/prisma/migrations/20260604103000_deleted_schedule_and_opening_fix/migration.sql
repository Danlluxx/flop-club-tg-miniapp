CREATE TABLE IF NOT EXISTS "DeletedScheduledTournament" (
  "dateKey" TEXT NOT NULL,
  "tournamentId" TEXT,
  "title" TEXT,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedByUserId" TEXT,

  CONSTRAINT "DeletedScheduledTournament_pkey" PRIMARY KEY ("dateKey")
);

INSERT INTO "DeletedScheduledTournament" ("dateKey", "tournamentId", "title")
VALUES ('2026-06-04', '2026-06-04-flop-phoenix', 'Flop Phoenix')
ON CONFLICT ("dateKey") DO UPDATE SET
  "tournamentId" = EXCLUDED."tournamentId",
  "title" = EXCLUDED."title",
  "deletedAt" = CURRENT_TIMESTAMP;

DELETE FROM "Tournament"
WHERE "startsAt" >= '2026-06-03 17:00:00+00'
  AND "startsAt" < '2026-06-04 17:00:00+00';
