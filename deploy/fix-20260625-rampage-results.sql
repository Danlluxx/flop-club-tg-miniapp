BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-25-rampage-rating-fix-v3'));

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
  (9, 0, ARRAY['Maxime']),
  (10, 0, ARRAY['nbobr']),
  (11, 0, ARRAY['Жанна']),
  (12, 0, ARRAY['Baldejnyi', 'baldejnyi']),
  (13, 0, ARRAY['OG ♠️', 'OG', 'ogcheerokeeh']);

CREATE TEMP TABLE _candidate_user_matches AS
SELECT
  manual.finish_place,
  manual.points,
  user_record.id AS user_id,
  user_record.username,
  user_record."displayName",
  active_registration.id AS active_registration_id,
  CASE
    WHEN LOWER(COALESCE(user_record.username, '')) = ANY(
      SELECT LOWER(lookup.value) FROM UNNEST(manual.lookup_values) AS lookup(value)
    ) THEN 1
    WHEN LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
    ) THEN 2
    WHEN LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
    ) THEN 3
    ELSE 4
  END AS match_priority
FROM _manual_results manual
JOIN "User" user_record
  ON LOWER(COALESCE(user_record.username, '')) = ANY(
    SELECT LOWER(lookup.value) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
LEFT JOIN "Registration" active_registration
  ON active_registration."userId" = user_record.id
 AND active_registration."tournamentId" = (SELECT id FROM _target_tournament)
 AND active_registration.status = 'ACTIVE';

CREATE TEMP TABLE _user_matches AS
SELECT finish_place, points, user_id, username, "displayName"
FROM (
  SELECT
    candidate.*,
    ROW_NUMBER() OVER (
      PARTITION BY candidate.finish_place
      ORDER BY
        CASE WHEN candidate.active_registration_id IS NOT NULL THEN 0 ELSE 1 END,
        candidate.match_priority,
        candidate.username NULLS LAST,
        candidate.user_id
    ) AS match_rank
  FROM _candidate_user_matches candidate
) ranked
WHERE match_rank = 1;

DO $$
DECLARE
  missing_players TEXT;
  ambiguous_players TEXT;
BEGIN
  SELECT STRING_AGG(manual.finish_place::TEXT || ' (' || ARRAY_TO_STRING(manual.lookup_values, ' / ') || ')', ', ' ORDER BY manual.finish_place)
  INTO missing_players
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _user_matches matched
    WHERE matched.finish_place = manual.finish_place
  );

  IF missing_players IS NOT NULL THEN
    RAISE EXCEPTION
      'User resolution failed. Missing: %',
      COALESCE(missing_players, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _resolved_users AS
SELECT
  manual.finish_place,
  manual.points,
  matched.user_id,
  matched.username,
  matched."displayName"
FROM _manual_results manual
JOIN _user_matches matched
  ON matched.finish_place = manual.finish_place;

INSERT INTO "Registration" (
  id,
  "userId",
  "tournamentId",
  status,
  "liveStatus",
  "checkedInAt",
  "entryNumber",
  "addOnCount",
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_reg_20260625_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  resolved.user_id,
  (SELECT id FROM _target_tournament),
  'ACTIVE',
  'ELIMINATED',
  CURRENT_TIMESTAMP,
  1,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_users resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM "Registration" registration
  WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
    AND registration."userId" = resolved.user_id
    AND registration.status = 'ACTIVE'
);

CREATE TEMP TABLE _resolved_results AS
SELECT
  resolved.finish_place,
  resolved.points,
  registration.id AS registration_id,
  resolved.user_id,
  resolved.username,
  resolved."displayName"
FROM _resolved_users resolved
JOIN "Registration" registration
  ON registration."userId" = resolved.user_id
 AND registration."tournamentId" = (SELECT id FROM _target_tournament)
 AND registration.status = 'ACTIVE';

DO $$
DECLARE
  resolved_count INTEGER;
  unique_registration_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT registration_id)
  INTO resolved_count, unique_registration_count
  FROM _resolved_results;

  IF resolved_count <> 13 OR unique_registration_count <> 13 THEN
    RAISE EXCEPTION
      'Expected 13 unique active registrations after backfill. Resolved: %, unique: %',
      resolved_count,
      unique_registration_count;
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
