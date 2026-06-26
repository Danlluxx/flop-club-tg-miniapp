BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-25-rampage-rating-fix'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= timestamp with time zone '2026-06-24 17:00:00+00'
  AND "startsAt" <  timestamp with time zone '2026-06-25 17:00:00+00'
  AND LOWER(title) = LOWER('Flop Rampage')
  AND status <> 'CANCELLED'
ORDER BY "startsAt"
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Flop Rampage tournament on 2026-06-25 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  finish_place INTEGER PRIMARY KEY,
  points INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _manual_results (finish_place, points, lookup_values) VALUES
  (1, 5000, ARRAY['кубик105', 'kubik105']),
  (2, 3500, ARRAY['Nikita Gorets', 'Никита Горец']),
  (3, 2200, ARRAY['Elizabeth Konoh', 'Elizabet Konoh', 'Elizabeth']),
  (4, 1300, ARRAY['Артем', 'Артём', 'lll3Elll']),
  (5, 0, ARRAY['Yakub Aliev', 'Yakub', 'yakubahlli']),
  (6, 0, ARRAY['DK', 'danlluxx']),
  (7, 0, ARRAY['Степан', 'Stepan', 'stepan']),
  (8, 0, ARRAY['Мистер большой блайнд']),
  (9, 0, ARRAY['Maxime', 'Максим']),
  (10, 0, ARRAY['bbr 🃏', 'bbr🃏', 'nbobr']),
  (11, 0, ARRAY['Жанна']),
  (12, 0, ARRAY['Baldejnyi', 'baldejnyi']),
  (13, 0, ARRAY['OG ♠️', 'OG', 'ogcheerokeeh']);

CREATE TEMP TABLE _resolved_results AS
WITH candidate_users AS (
  SELECT
    manual.finish_place,
    manual.points,
    registration.id AS registration_id,
    registration."userId" AS user_id,
    user_record.username,
    user_record."displayName",
    ROW_NUMBER() OVER (
      PARTITION BY manual.finish_place
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(user_record.username, '')) = ANY(
            SELECT LOWER(value) FROM UNNEST(manual.lookup_values) AS value
          ) THEN 1
          WHEN LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
            SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
          ) THEN 2
          ELSE 3
        END,
        registration."createdAt"
    ) AS match_rank,
    COUNT(*) OVER (PARTITION BY manual.finish_place) AS match_count
  FROM _manual_results manual
  JOIN "User" user_record
    ON LOWER(COALESCE(user_record.username, '')) = ANY(
      SELECT LOWER(value) FROM UNNEST(manual.lookup_values) AS value
    )
    OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
    )
    OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
    )
    OR LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
    )
  JOIN "Registration" registration
    ON registration."userId" = user_record.id
   AND registration."tournamentId" = (SELECT id FROM _target_tournament)
   AND registration.status = 'ACTIVE'
)
SELECT
  finish_place,
  points,
  registration_id,
  user_id,
  username,
  "displayName"
FROM candidate_users
WHERE match_rank = 1;

DO $$
DECLARE
  resolved_count INTEGER;
  unique_registration_count INTEGER;
  ambiguous_places TEXT;
  missing_places TEXT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT registration_id)
  INTO resolved_count, unique_registration_count
  FROM _resolved_results;

  SELECT STRING_AGG(manual.finish_place::TEXT || ' (' || ARRAY_TO_STRING(manual.lookup_values, ' / ') || ')', ', ' ORDER BY manual.finish_place)
  INTO missing_places
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _resolved_results resolved
    WHERE resolved.finish_place = manual.finish_place
  );

  SELECT STRING_AGG(resolved.finish_place::TEXT, ', ' ORDER BY resolved.finish_place)
  INTO ambiguous_places
  FROM _resolved_results resolved
  JOIN (
    SELECT manual.finish_place, COUNT(*) AS matches
    FROM _manual_results manual
    JOIN "User" user_record
      ON LOWER(COALESCE(user_record.username, '')) = ANY(
        SELECT LOWER(value) FROM UNNEST(manual.lookup_values) AS value
      )
      OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
        SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
      )
      OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
        SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
      )
      OR LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
        SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS value
      )
    JOIN "Registration" registration
      ON registration."userId" = user_record.id
     AND registration."tournamentId" = (SELECT id FROM _target_tournament)
     AND registration.status = 'ACTIVE'
    GROUP BY manual.finish_place
    HAVING COUNT(*) > 1
  ) duplicates ON duplicates.finish_place = resolved.finish_place;

  IF resolved_count <> 13 OR unique_registration_count <> 13 OR ambiguous_places IS NOT NULL THEN
    RAISE EXCEPTION
      'Expected 13 unique active registrations. Resolved: %, unique: %, missing: %, ambiguous places: %',
      resolved_count,
      unique_registration_count,
      COALESCE(missing_places, 'none'),
      COALESCE(ambiguous_places, 'none');
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
  'manual_rating_20260625_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  (SELECT id FROM _target_tournament),
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
  "entriesCount" = 13,
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
  WHERE "startsAt" >= timestamp with time zone '2026-06-24 17:00:00+00'
    AND "startsAt" <  timestamp with time zone '2026-06-25 17:00:00+00'
    AND LOWER(title) = LOWER('Flop Rampage')
  ORDER BY "startsAt"
  LIMIT 1
)
ORDER BY result.place;
