BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-03-04-buyin-500'));

CREATE TEMP TABLE _target_tournaments AS
SELECT
  id,
  ("startsAt" AT TIME ZONE 'Asia/Barnaul')::DATE AS local_date
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-02 17:00:00+00'
  AND "startsAt" < TIMESTAMPTZ '2026-07-04 17:00:00+00'
  AND status <> 'CANCELLED';

DO $$
DECLARE
  july_3_count INTEGER;
  july_4_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO july_3_count
  FROM _target_tournaments
  WHERE local_date = DATE '2026-07-03';

  SELECT COUNT(*) INTO july_4_count
  FROM _target_tournaments
  WHERE local_date = DATE '2026-07-04';

  IF july_3_count <> 1 OR july_4_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one tournament on each date. July 3: %, July 4: %',
      july_3_count,
      july_4_count;
  END IF;
END $$;

UPDATE "Tournament" tournament
SET
  "buyIn" = 500,
  "prizePool" = 500 * tournament."maxParticipants",
  "updatedAt" = CURRENT_TIMESTAMP
FROM _target_tournaments target
WHERE tournament.id = target.id;

COMMIT;

SELECT
  id,
  title,
  "startsAt" AT TIME ZONE 'Asia/Barnaul' AS "startsAtBarnaul",
  "buyIn",
  "reEntry",
  status
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-02 17:00:00+00'
  AND "startsAt" < TIMESTAMPTZ '2026-07-04 17:00:00+00'
  AND status <> 'CANCELLED'
ORDER BY "startsAt";
