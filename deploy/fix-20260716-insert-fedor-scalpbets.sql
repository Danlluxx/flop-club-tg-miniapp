BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-16-insert-fedor-scalpbets-v1'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-15 17:00:00+00'
  AND "startsAt" <  TIMESTAMPTZ '2026-07-16 17:00:00+00'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tournament on 2026-07-16 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _player_requests (
  key TEXT PRIMARY KEY,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _player_requests (key, lookup_values) VALUES
  ('fedor', ARRAY[
    'Фёдор Иванович Депутат',
    'Федор Иванович Депутат',
    'Фёдор Депутат',
    'Федор Депутат',
    'Фёдор',
    'Федор'
  ]),
  ('scalpbets', ARRAY[
    'scalpbetsceo',
    'ScalpBets',
    'Scalp Bets'
  ]);

CREATE TEMP TABLE _candidate_users AS
SELECT
  request.key,
  user_record.id AS user_id,
  user_record.username,
  user_record."displayName",
  registration.id AS registration_id,
  CASE
    WHEN LOWER(COALESCE(user_record.username, '')) = ANY(
      SELECT LOWER(value) FROM UNNEST(request.lookup_values) AS lookup(value)
    ) THEN 1
    WHEN LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
    ) THEN 2
    WHEN LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
    ) THEN 3
    WHEN LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
    ) THEN 4
    ELSE 9
  END AS match_priority
FROM _player_requests request
JOIN "User" user_record
  ON LOWER(COALESCE(user_record.username, '')) = ANY(
    SELECT LOWER(value) FROM UNNEST(request.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(value, 'ё', 'е')) FROM UNNEST(request.lookup_values) AS lookup(value)
  )
LEFT JOIN "Registration" registration
  ON registration."userId" = user_record.id
 AND registration."tournamentId" = (SELECT id FROM _target_tournament)
 AND registration.status = 'ACTIVE';

CREATE TEMP TABLE _resolved_users AS
SELECT key, user_id, username, "displayName"
FROM (
  SELECT
    candidate.*,
    ROW_NUMBER() OVER (
      PARTITION BY candidate.key
      ORDER BY
        CASE WHEN candidate.registration_id IS NOT NULL THEN 0 ELSE 1 END,
        candidate.match_priority,
        candidate.username NULLS LAST,
        candidate.user_id
    ) AS match_rank
  FROM _candidate_users candidate
) ranked
WHERE match_rank = 1;

DO $$
DECLARE
  missing_players TEXT;
BEGIN
  SELECT STRING_AGG(request.key || ' (' || ARRAY_TO_STRING(request.lookup_values, ' / ') || ')', ', ' ORDER BY request.key)
  INTO missing_players
  FROM _player_requests request
  WHERE NOT EXISTS (
    SELECT 1
    FROM _resolved_users resolved
    WHERE resolved.key = request.key
  );

  IF missing_players IS NOT NULL THEN
    RAISE EXCEPTION 'User resolution failed. Missing: %', missing_players;
  END IF;
END $$;

CREATE TEMP TABLE _baldejnyi AS
SELECT registration.id AS registration_id, registration."finishPlace" AS finish_place
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE'
  AND (
    LOWER(COALESCE(user_record.username, '')) = 'baldejnyi'
    OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = 'baldejnyi'
  )
ORDER BY registration."finishPlace" NULLS LAST, registration."createdAt" ASC
LIMIT 1;

DO $$
DECLARE
  baldejnyi_count INTEGER;
  baldejnyi_place INTEGER;
BEGIN
  SELECT COUNT(*), MAX(finish_place)
  INTO baldejnyi_count, baldejnyi_place
  FROM _baldejnyi;

  IF baldejnyi_count <> 1 OR baldejnyi_place IS NULL THEN
    RAISE EXCEPTION 'Baldejnyi active registration with finish place was not found';
  END IF;
END $$;

UPDATE "Registration" registration
SET
  status = 'ACTIVE',
  "liveStatus" = 'ELIMINATED',
  "checkedInAt" = COALESCE(registration."checkedInAt", CURRENT_TIMESTAMP),
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_users resolved
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration."userId" = resolved.user_id;

INSERT INTO "Registration" (
  id,
  "userId",
  "tournamentId",
  status,
  "liveStatus",
  "checkedInAt",
  "entryNumber",
  "addOnCount",
  "eliminatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_reg_20260716_' || resolved.key,
  resolved.user_id,
  (SELECT id FROM _target_tournament),
  'ACTIVE',
  'ELIMINATED',
  CURRENT_TIMESTAMP,
  1,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_users resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM "Registration" registration
  WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
    AND registration."userId" = resolved.user_id
);

CREATE TEMP TABLE _controlled_registrations AS
SELECT
  resolved.key,
  registration.id AS registration_id,
  registration."userId" AS user_id
FROM _resolved_users resolved
JOIN LATERAL (
  SELECT candidate.id, candidate."userId"
  FROM "Registration" candidate
  WHERE candidate."tournamentId" = (SELECT id FROM _target_tournament)
    AND candidate."userId" = resolved.user_id
    AND candidate.status = 'ACTIVE'
  ORDER BY candidate."createdAt" ASC, candidate.id ASC
  LIMIT 1
) registration ON TRUE;

CREATE TEMP TABLE _previous_rating_results AS
SELECT
  result."userId" AS user_id,
  result.percent,
  result.points,
  result.knockouts
FROM "TournamentRatingResult" result
WHERE result."tournamentId" = (SELECT id FROM _target_tournament);

WITH controlled_old_results AS (
  SELECT previous.user_id, SUM(previous.points)::INTEGER AS points, SUM(previous.knockouts)::INTEGER AS knockouts
  FROM _previous_rating_results previous
  JOIN _controlled_registrations controlled
    ON controlled.user_id = previous.user_id
  GROUP BY previous.user_id
)
UPDATE "User" user_record
SET
  "ratingPoints" = GREATEST(0, user_record."ratingPoints" - controlled_old_results.points),
  knockouts = GREATEST(0, user_record.knockouts - controlled_old_results.knockouts),
  "updatedAt" = CURRENT_TIMESTAMP
FROM controlled_old_results
WHERE user_record.id = controlled_old_results.user_id;

CREATE TEMP TABLE _preserved_registrations AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  registration."finishPlace" AS old_place,
  registration."createdAt" AS created_at
FROM "Registration" registration
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE'
  AND registration.id NOT IN (SELECT registration_id FROM _controlled_registrations)
  AND registration."finishPlace" IS NOT NULL;

CREATE TEMP TABLE _new_order_source AS
SELECT
  registration_id,
  user_id,
  1 AS group_order,
  old_place AS sort_place,
  created_at
FROM _preserved_registrations
WHERE old_place <= (SELECT finish_place FROM _baldejnyi)

UNION ALL

SELECT
  registration_id,
  user_id,
  2 AS group_order,
  0 AS sort_place,
  CURRENT_TIMESTAMP AS created_at
FROM _controlled_registrations
WHERE key = 'fedor'

UNION ALL

SELECT
  registration_id,
  user_id,
  3 AS group_order,
  old_place AS sort_place,
  created_at
FROM _preserved_registrations
WHERE old_place > (SELECT finish_place FROM _baldejnyi)

UNION ALL

SELECT
  registration_id,
  user_id,
  4 AS group_order,
  0 AS sort_place,
  CURRENT_TIMESTAMP AS created_at
FROM _controlled_registrations
WHERE key = 'scalpbets';

CREATE TEMP TABLE _new_order AS
SELECT
  registration_id,
  user_id,
  ROW_NUMBER() OVER (ORDER BY group_order, sort_place, created_at, registration_id)::INTEGER AS finish_place
FROM _new_order_source;

UPDATE "Registration" registration
SET
  "finishPlace" = ordered.finish_place,
  "liveStatus" = 'ELIMINATED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM _new_order ordered
WHERE registration.id = ordered.registration_id;

UPDATE "TournamentRatingResult"
SET
  place = place + 1000,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

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
  'manual_rating_20260716_' || LPAD(ordered.finish_place::TEXT, 2, '0'),
  (SELECT id FROM _target_tournament),
  ordered.user_id,
  ordered.finish_place,
  CASE WHEN controlled.user_id IS NOT NULL THEN 0 ELSE COALESCE(previous.percent, 0) END,
  CASE WHEN controlled.user_id IS NOT NULL THEN 0 ELSE COALESCE(previous.points, 0) END,
  CASE WHEN controlled.user_id IS NOT NULL THEN 0 ELSE COALESCE(previous.knockouts, 0) END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _new_order ordered
LEFT JOIN _previous_rating_results previous
  ON previous.user_id = ordered.user_id
LEFT JOIN _controlled_registrations controlled
  ON controlled.user_id = ordered.user_id
ON CONFLICT ("tournamentId", "userId") DO UPDATE
SET
  place = EXCLUDED.place,
  percent = EXCLUDED.percent,
  points = EXCLUDED.points,
  knockouts = EXCLUDED.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "TournamentRatingResult" result
WHERE result."tournamentId" = (SELECT id FROM _target_tournament)
  AND NOT EXISTS (
    SELECT 1
    FROM _new_order ordered
    WHERE ordered.user_id = result."userId"
  );

UPDATE "Tournament"
SET
  "entriesCount" = GREATEST(COALESCE("entriesCount", 0), (SELECT COUNT(*) FROM _new_order)),
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE "startsAt" >= TIMESTAMPTZ '2026-07-15 17:00:00+00'
    AND "startsAt" <  TIMESTAMPTZ '2026-07-16 17:00:00+00'
    AND status <> 'CANCELLED'
  ORDER BY "startsAt" DESC
  LIMIT 1
)
SELECT
  registration."finishPlace" AS place,
  user_record."displayName",
  user_record.username,
  COALESCE(result.points, 0) AS points
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
LEFT JOIN "TournamentRatingResult" result
  ON result."tournamentId" = registration."tournamentId"
 AND result."userId" = registration."userId"
JOIN target
  ON target.id = registration."tournamentId"
WHERE registration.status = 'ACTIVE'
ORDER BY registration."finishPlace" NULLS LAST, registration."createdAt" ASC;
