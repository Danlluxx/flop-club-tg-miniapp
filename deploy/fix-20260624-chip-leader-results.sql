BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-24-chip-leader-rating-fix'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= timestamp with time zone '2026-06-23 17:00:00+00'
  AND "startsAt" <  timestamp with time zone '2026-06-24 17:00:00+00'
  AND status <> 'CANCELLED'
ORDER BY "startsAt"
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tournament on 2026-06-24 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  lookup_value TEXT PRIMARY KEY,
  finish_place INTEGER NOT NULL UNIQUE,
  points INTEGER NOT NULL,
  percent INTEGER NOT NULL
);

INSERT INTO _manual_results (lookup_value, finish_place, points, percent) VALUES
  ('Niggroni', 1, 6000, 50),
  ('nbobr', 2, 3000, 25),
  ('danlluxx', 3, 2000, 17),
  ('rondoilya', 4, 0, 0),
  ('msvarchevskayaa', 5, 1000, 8),
  ('kiruhaque', 6, 0, 0),
  ('Сладкий Джей', 7, 0, 0),
  ('Maxime', 8, 0, 0),
  ('Дмитрий Столяров', 9, 0, 0),
  ('wsemprivetik', 10, 0, 0);

CREATE TEMP TABLE _resolved_results AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  manual.lookup_value,
  manual.finish_place,
  manual.points,
  manual.percent
FROM _manual_results manual
JOIN "User" user_record
  ON LOWER(COALESCE(user_record.username, '')) = LOWER(manual.lookup_value)
  OR LOWER(COALESCE(user_record."displayName", '')) = LOWER(manual.lookup_value)
  OR LOWER(COALESCE(user_record."firstName", '')) = LOWER(manual.lookup_value)
  OR LOWER(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", '')))) = LOWER(manual.lookup_value)
JOIN "Registration" registration
  ON registration."userId" = user_record.id
 AND registration."tournamentId" = (SELECT id FROM _target_tournament)
 AND registration.status = 'ACTIVE';

DO $$
DECLARE
  resolved_count INTEGER;
  unique_registration_count INTEGER;
  missing_players TEXT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT registration_id)
  INTO resolved_count, unique_registration_count
  FROM _resolved_results;

  SELECT STRING_AGG(manual.lookup_value, ', ' ORDER BY manual.finish_place)
  INTO missing_players
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _resolved_results resolved
    WHERE resolved.lookup_value = manual.lookup_value
  );

  IF resolved_count <> 10 OR unique_registration_count <> 10 THEN
    RAISE EXCEPTION
      'Expected 10 unique active registrations, resolved % rows and % registrations. Missing: %',
      resolved_count,
      unique_registration_count,
      COALESCE(missing_players, 'none');
  END IF;
END $$;

WITH old_results AS (
  SELECT
    "userId",
    SUM(points)::INTEGER AS points,
    SUM(knockouts)::INTEGER AS knockouts
  FROM "TournamentRatingResult"
  WHERE "tournamentId" = (SELECT id FROM _target_tournament)
  GROUP BY "userId"
)
UPDATE "User" user_record
SET
  "ratingPoints" = GREATEST(0, user_record."ratingPoints" - old_results.points),
  knockouts = GREATEST(0, user_record.knockouts - old_results.knockouts),
  "updatedAt" = CURRENT_TIMESTAMP
FROM old_results
WHERE user_record.id = old_results."userId";

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

UPDATE "Registration" registration
SET
  "finishPlace" = resolved.finish_place,
  "liveStatus" = 'ELIMINATED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_results resolved
WHERE registration.id = resolved.registration_id;

INSERT INTO "TournamentRatingResult" (
  id,
  "tournamentId",
  "userId",
  place,
  percent,
  points,
  knockouts,
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_rating_20260624_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  (SELECT id FROM _target_tournament),
  resolved.user_id,
  resolved.finish_place,
  resolved.percent,
  resolved.points,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_results resolved;

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + resolved.points,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_results resolved
WHERE user_record.id = resolved.user_id;

UPDATE "Tournament"
SET
  "entriesCount" = 10,
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

SELECT
  result.place,
  user_record."displayName",
  user_record.username,
  result.points,
  result.knockouts
FROM "TournamentRatingResult" result
JOIN "User" user_record
  ON user_record.id = result."userId"
WHERE result."tournamentId" = (
  SELECT id
  FROM "Tournament"
  WHERE "startsAt" >= timestamp with time zone '2026-06-23 17:00:00+00'
    AND "startsAt" <  timestamp with time zone '2026-06-24 17:00:00+00'
    AND status = 'FINISHED'
  ORDER BY "startsAt"
  LIMIT 1
)
ORDER BY result.place;
