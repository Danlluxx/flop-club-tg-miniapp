BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-26-buyin-500'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= timestamp with time zone '2026-06-25 17:00:00+00'
  AND "startsAt" <  timestamp with time zone '2026-06-26 17:00:00+00'
  AND status <> 'CANCELLED'
ORDER BY "startsAt";

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tournament on 2026-06-26 Barnaul date, found %', tournament_count;
  END IF;
END $$;

UPDATE "Tournament"
SET
  "buyIn" = 500,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

SELECT
  id,
  title,
  "startsAt",
  "buyIn",
  "reEntry",
  status
FROM "Tournament"
WHERE "startsAt" >= timestamp with time zone '2026-06-25 17:00:00+00'
  AND "startsAt" <  timestamp with time zone '2026-06-26 17:00:00+00'
ORDER BY "startsAt";
