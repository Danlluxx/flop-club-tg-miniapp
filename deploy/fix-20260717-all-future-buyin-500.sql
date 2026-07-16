BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-17-all-future-buyin-500'));

UPDATE "Tournament"
SET
  "buyIn" = 500,
  "prizePool" = 500 * "maxParticipants",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-16 17:00:00+00'
  AND status <> 'CANCELLED';

COMMIT;

SELECT
  id,
  title,
  "startsAt",
  "buyIn",
  "reEntry",
  "prizePool",
  status
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-16 17:00:00+00'
  AND status <> 'CANCELLED'
ORDER BY "startsAt";
