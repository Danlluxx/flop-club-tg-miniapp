BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-17-flop-prime-event-rating-fix'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-16 17:00:00+00'
  AND "startsAt" <  TIMESTAMPTZ '2026-07-17 17:00:00+00'
  AND title ILIKE '%Prime%Event%'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Flop Prime Event tournament on 2026-07-17 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  finish_place INTEGER PRIMARY KEY,
  points INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _manual_results (finish_place, points, percent, lookup_values) VALUES
  (1, 6000, 40, ARRAY['Артём', 'Артем', 'lll3Elll']),
  (2, 3750, 25, ARRAY['Мария', 'Maria']),
  (3, 2550, 17, ARRAY['Расул', 'rasomza']),
  (4, 1650, 11, ARRAY['Yakub Aliev', 'Yakub', 'yakubahlli']),
  (5, 1050, 7, ARRAY['Niggroni', 'niggroni']),
  (6, 0, 0, ARRAY['Кувси', 'Кувcи', 'Kuvsi']),
  (7, 0, 0, ARRAY['rondo', 'rondoilya']),
  (8, 0, 0, ARRAY['Lev Nekiforenko', 'Lev Nikiforenko', 'Lev', 'noev_kovcheg9']),
  (9, 0, 0, ARRAY['bbr🃏', 'bbr', 'nbobr']),
  (10, 0, 0, ARRAY['Baldejnyi', 'Baldejniy', 'baldejnyi']),
  (11, 0, 0, ARRAY['Уборщик клуба FLOP', 'Уборщик клуба Flop', 'Уборщик']),
  (12, 0, 0, ARRAY['nastiiwq']),
  (13, 0, 0, ARRAY['Ангелина', 'Angelina']),
  (14, 0, 0, ARRAY['ScalpBets', 'Scalpbets', 'scalpbetsceo']);

INSERT INTO "User" (
  id,
  "telegramId",
  username,
  "firstName",
  "lastName",
  "displayName",
  role,
  "ratingPoints",
  knockouts,
  "createdAt",
  "updatedAt"
)
VALUES (
  'manual_user_20260717_prime_event_cleaner',
  'manual_20260717_prime_event_cleaner',
  NULL,
  'Уборщик клуба FLOP',
  NULL,
  'Уборщик клуба FLOP',
  'USER',
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("telegramId") DO UPDATE
SET
  "displayName" = EXCLUDED."displayName",
  "firstName" = EXCLUDED."firstName",
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE TEMP TABLE _candidate_user_matches AS
SELECT
  manual.finish_place,
  manual.points,
  manual.percent,
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
    WHEN LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
      SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
    ) THEN 4
    ELSE 9
  END AS match_priority
FROM _manual_results manual
JOIN "User" user_record
  ON LOWER(COALESCE(user_record.username, '')) = ANY(
    SELECT LOWER(lookup.value) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
  OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = ANY(
    SELECT LOWER(REPLACE(lookup.value, 'ё', 'е')) FROM UNNEST(manual.lookup_values) AS lookup(value)
  )
LEFT JOIN "Registration" active_registration
  ON active_registration."userId" = user_record.id
 AND active_registration."tournamentId" = (SELECT id FROM _target_tournament)
 AND active_registration.status = 'ACTIVE';

CREATE TEMP TABLE _user_matches AS
SELECT finish_place, points, percent, user_id, username, "displayName"
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
  duplicated_users TEXT;
BEGIN
  SELECT STRING_AGG(manual.finish_place::TEXT || ' (' || ARRAY_TO_STRING(manual.lookup_values, ' / ') || ')', ', ' ORDER BY manual.finish_place)
  INTO missing_players
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _user_matches matched
    WHERE matched.finish_place = manual.finish_place
  );

  SELECT STRING_AGG(user_id || ' -> places ' || places, ', ' ORDER BY user_id)
  INTO duplicated_users
  FROM (
    SELECT user_id, STRING_AGG(finish_place::TEXT, ', ' ORDER BY finish_place) AS places
    FROM _user_matches
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF missing_players IS NOT NULL OR duplicated_users IS NOT NULL THEN
    RAISE EXCEPTION
      'User resolution failed. Missing: %, duplicated users: %',
      COALESCE(missing_players, 'none'),
      COALESCE(duplicated_users, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _resolved_users AS
SELECT
  manual.finish_place,
  manual.points,
  manual.percent,
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
  "eliminatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_reg_20260717_prime_event_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
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
    AND registration.status = 'ACTIVE'
);

CREATE TEMP TABLE _resolved_results AS
SELECT
  resolved.finish_place,
  resolved.points,
  resolved.percent,
  registration.id AS registration_id,
  resolved.user_id,
  resolved.username,
  resolved."displayName"
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

DO $$
DECLARE
  resolved_count INTEGER;
  unique_registration_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT registration_id)
  INTO resolved_count, unique_registration_count
  FROM _resolved_results;

  IF resolved_count <> 14 OR unique_registration_count <> 14 THEN
    RAISE EXCEPTION
      'Expected 14 unique active registrations after backfill. Resolved: %, unique: %',
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
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
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
  'manual_rating_20260717_prime_event_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
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
  "entriesCount" = GREATEST(COALESCE("entriesCount", 0), 14),
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE "startsAt" >= TIMESTAMPTZ '2026-07-16 17:00:00+00'
    AND "startsAt" <  TIMESTAMPTZ '2026-07-17 17:00:00+00'
    AND title ILIKE '%Prime%Event%'
  ORDER BY "startsAt" DESC
  LIMIT 1
)
SELECT
  result.place,
  user_record."displayName",
  user_record.username,
  result.points,
  result.knockouts
FROM "TournamentRatingResult" result
JOIN "User" user_record
  ON user_record.id = result."userId"
JOIN target
  ON target.id = result."tournamentId"
ORDER BY result.place;
