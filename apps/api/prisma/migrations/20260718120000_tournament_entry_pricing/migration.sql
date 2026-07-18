ALTER TABLE "Tournament"
ALTER COLUMN "reEntry" SET DEFAULT 500;

UPDATE "Tournament"
SET
  "buyIn" = CASE
    WHEN LOWER(TRIM(title)) IN ('flop freeze out', 'flop one shot') THEN 1000
    ELSE 500
  END,
  "reEntry" = CASE
    WHEN LOWER(TRIM(title)) IN ('flop freeze out', 'flop one shot') THEN 0
    WHEN LOWER(TRIM(title)) = 'flop phoenix' THEN 1000
    ELSE 500
  END,
  "profile" = CASE
    WHEN LOWER(TRIM(title)) IN ('flop freeze out', 'flop one shot') THEN 'FREEZE'::"TournamentProfile"
    ELSE "profile"
  END,
  "prizePool" = CASE
    WHEN LOWER(TRIM(title)) IN ('flop freeze out', 'flop one shot') THEN 1000 * "maxParticipants"
    ELSE 500 * "maxParticipants"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status IN ('OPEN', 'CLOSED');
