BEGIN;

WITH weekend_tournaments AS (
  SELECT
    id,
    title,
    "startsAt",
    ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date AS local_date
  FROM "Tournament"
  WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date >= DATE '2026-07-26'
    AND EXTRACT(DOW FROM ("startsAt" AT TIME ZONE 'Asia/Barnaul')) IN (0, 6)
    AND TO_CHAR("startsAt" AT TIME ZONE 'Asia/Barnaul', 'HH24:MI') <> '19:00'
)
UPDATE "Tournament" tournament
SET
  "startsAt" = (weekend_tournaments.local_date + TIME '19:00') AT TIME ZONE 'Asia/Barnaul',
  "lateRegistrationEndsAt" = (weekend_tournaments.local_date + TIME '22:00') AT TIME ZONE 'Asia/Barnaul',
  "updatedAt" = CURRENT_TIMESTAMP
FROM weekend_tournaments
WHERE tournament.id = weekend_tournaments.id
RETURNING
  tournament.id,
  tournament.title,
  weekend_tournaments."startsAt" AT TIME ZONE 'Asia/Barnaul' AS old_starts_at_barnaul,
  tournament."startsAt" AT TIME ZONE 'Asia/Barnaul' AS new_starts_at_barnaul,
  tournament."lateRegistrationEndsAt" AT TIME ZONE 'Asia/Barnaul' AS new_late_registration_barnaul;

COMMIT;
