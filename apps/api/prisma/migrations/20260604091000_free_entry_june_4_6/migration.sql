UPDATE "Tournament"
SET
  "buyIn" = 0,
  "prizePool" = 0,
  "updatedAt" = now()
WHERE "startsAt" >= '2026-06-03 17:00:00+00'
  AND "startsAt" < '2026-06-04 17:00:00+00';

UPDATE "Tournament"
SET
  "buyIn" = 0,
  "prizePool" = 0,
  "updatedAt" = now()
WHERE "startsAt" >= '2026-06-05 17:00:00+00'
  AND "startsAt" < '2026-06-06 17:00:00+00';
