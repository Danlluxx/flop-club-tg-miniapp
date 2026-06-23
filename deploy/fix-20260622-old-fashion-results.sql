BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-22-flop-old-fashion-rating-fix'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Tournament"
    WHERE id = '2026-06-22-flop-old-fashion'
  ) THEN
    RAISE EXCEPTION 'Tournament 2026-06-22-flop-old-fashion not found';
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  lookup_value TEXT PRIMARY KEY,
  finish_place INTEGER NOT NULL UNIQUE,
  points INTEGER NOT NULL,
  percent INTEGER NOT NULL
);

INSERT INTO _manual_results (lookup_value, finish_place, points, percent) VALUES
  ('lll3Elll', 1, 5000, 50),
  ('wsemprivetik', 2, 3000, 30),
  ('msvarchevskayaa', 3, 2000, 20),
  ('kiruhaque', 4, 0, 0),
  ('rondoilya', 5, 0, 0),
  ('SiSi_Svisli', 6, 0, 0),
  ('BOMMBOCLAAAT', 7, 0, 0),
  ('nbobr', 8, 0, 0),
  ('Тони', 9, 0, 0),
  ('Niggroni', 10, 0, 0);

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
JOIN "Registration" registration
  ON registration."userId" = user_record.id
 AND registration."tournamentId" = '2026-06-22-flop-old-fashion'
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
  WHERE "tournamentId" = '2026-06-22-flop-old-fashion'
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
WHERE "tournamentId" = '2026-06-22-flop-old-fashion';

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
  'manual_rating_20260622_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  '2026-06-22-flop-old-fashion',
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
WHERE id = '2026-06-22-flop-old-fashion';

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
WHERE result."tournamentId" = '2026-06-22-flop-old-fashion'
ORDER BY result.place;
