BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-17-flop-freeze-out-rating-fix'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Tournament"
    WHERE id = '2026-06-17-flop-freeze-out'
  ) THEN
    RAISE EXCEPTION 'Tournament 2026-06-17-flop-freeze-out not found';
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  username TEXT PRIMARY KEY,
  finish_place INTEGER NOT NULL UNIQUE,
  points INTEGER NOT NULL
);

INSERT INTO _manual_results (username, finish_place, points) VALUES
  ('ursutv', 1, 4000),
  ('rasomza', 2, 3000),
  ('Shuii11', 3, 2200),
  ('savamlb', 4, 1600),
  ('Chavororomano', 5, 1200),
  ('yakubahlli', 6, 0),
  ('noev_kovcheg9', 7, 0),
  ('danlluxx', 8, 0),
  ('baldejnyi', 9, 0),
  ('kotovasia13', 10, 0),
  ('lexaprasllk', 11, 0),
  ('nbobr', 12, 0),
  ('brabus7_7_7', 13, 0),
  ('TERRRIFIER', 14, 0);

CREATE TEMP TABLE _resolved_results AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  manual.finish_place,
  manual.points
FROM _manual_results manual
JOIN "User" user_record
  ON LOWER(user_record.username) = LOWER(manual.username)
JOIN "Registration" registration
  ON registration."userId" = user_record.id
 AND registration."tournamentId" = '2026-06-17-flop-freeze-out'
 AND registration.status = 'ACTIVE';

DO $$
DECLARE
  resolved_count INTEGER;
  unique_user_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT user_id)
  INTO resolved_count, unique_user_count
  FROM _resolved_results;

  IF resolved_count <> 14 OR unique_user_count <> 14 THEN
    RAISE EXCEPTION
      'Expected 14 unique active registrations, resolved % rows and % users',
      resolved_count,
      unique_user_count;
  END IF;
END $$;

WITH old_results AS (
  SELECT
    "userId",
    SUM(points)::INTEGER AS points,
    SUM(knockouts)::INTEGER AS knockouts
  FROM "TournamentRatingResult"
  WHERE "tournamentId" = '2026-06-17-flop-freeze-out'
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
WHERE "tournamentId" = '2026-06-17-flop-freeze-out';

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
  'manual_rating_20260617_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  '2026-06-17-flop-freeze-out',
  resolved.user_id,
  resolved.finish_place,
  0,
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
  "entriesCount" = 14,
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = '2026-06-17-flop-freeze-out';

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
WHERE result."tournamentId" = '2026-06-17-flop-freeze-out'
ORDER BY result.place;
