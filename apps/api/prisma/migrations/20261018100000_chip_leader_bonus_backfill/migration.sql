-- Preserve the manually awarded +2,000 chip-leader bonus from 17 October
-- as a separate component before tournament results are edited again.
UPDATE "TournamentRatingResult"
SET
  "points" = 1320,
  "chipLeaderBonus" = 2000
WHERE "tournamentId" = '2026-10-17-flop-chip-leader'
  AND "place" = 4
  AND "points" = 3320
  AND "knockouts" = 0
  AND "chipLeaderBonus" = 0;
