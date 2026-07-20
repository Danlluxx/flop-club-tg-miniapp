BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-18-flop-bounty-rating-fix'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-07-17 17:00:00+00'
  AND "startsAt" <  TIMESTAMPTZ '2026-07-18 17:00:00+00'
  AND title ILIKE '%Bounty%'
  AND title NOT ILIKE '%Mystery%'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Flop Bounty tournament on 2026-07-18 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  finish_place INTEGER PRIMARY KEY,
  placement_points INTEGER NOT NULL,
  bounty_points INTEGER NOT NULL,
  knockouts INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _manual_results (
  finish_place,
  placement_points,
  bounty_points,
  knockouts,
  percent,
  lookup_values
) VALUES
  (1, 3600, 600, 6, 36, ARRAY['Trae_Young_11', 'Колесо', 'Koleso']),
  (2, 2400, 300, 3, 24, ARRAY['Кувси', 'Кувcи', 'Kuvsi']),
  (3, 1600, 200, 2, 16, ARRAY['Kiruhaque13', 'Kiruhaque', 'kiruhaque']),
  (4, 1000, 500, 5, 10, ARRAY['MIKHL', 'Mikhl']),
  (5,  800, 300, 3,  8, ARRAY['rondo', 'rondoilya']),
  (6,  600,   0, 0,  6, ARRAY['Мария', 'Maria']),
  (7,    0, 100, 1,  0, ARRAY['Baldejnyi', 'Baldejniy', 'baldejnyi']),
  (8,    0,   0, 0,  0, ARRAY['Алевтина', 'Alevtina']),
  (9,    0, 100, 1,  0, ARRAY['Mamix']),
  (10,   0,   0, 0,  0, ARRAY['bbr🃏', 'bbr', 'nbobr']),
  (11,   0,   0, 0,  0, ARRAY['Yakub Aliev', 'Yakub', 'yakubahlli']),
  (12,   0, 200, 2,  0, ARRAY['Кимпинтяо', 'Kimpintyao']),
  (13,   0,   0, 0,  0, ARRAY['Маргарита', 'Margarita', 'msvarchevskayaa']),
  (14,   0,   0, 0,  0, ARRAY['Уборщик клуба FLOP', 'Уборщик клуба Flop', 'Уборщик', 'rrrrrr55555588']),
  (15,   0,   0, 0,  0, ARRAY['Тимур', 'Timur']),
  (16,   0, 100, 1,  0, ARRAY['Лина', 'Lina']),
  (17,   0,   0, 0,  0, ARRAY['Ангелина', 'Angelina']);

DO $$
DECLARE
  placement_total INTEGER;
  bounty_total INTEGER;
  knockout_total INTEGER;
BEGIN
  SELECT
    SUM(placement_points),
    SUM(bounty_points),
    SUM(knockouts)
  INTO placement_total, bounty_total, knockout_total
  FROM _manual_results;

  IF placement_total <> 10000 OR bounty_total <> 2400 OR knockout_total <> 24 THEN
    RAISE EXCEPTION
      'Unexpected totals. Placement: %, bounty: %, knockouts: %',
      placement_total,
      bounty_total,
      knockout_total;
  END IF;
END $$;

INSERT INTO "User" (
  id,
  "telegramId",
  username,
  "displayName",
  "firstName",
  role,
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_user_20260718_bounty_alevtina',
  'manual_20260718_bounty_alevtina',
  NULL,
  'Алевтина',
  'Алевтина',
  'USER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "User" user_record
  WHERE LOWER(REPLACE(COALESCE(user_record."displayName", ''), 'ё', 'е')) = LOWER(REPLACE('Алевтина', 'ё', 'е'))
     OR LOWER(REPLACE(COALESCE(user_record."firstName", ''), 'ё', 'е')) = LOWER(REPLACE('Алевтина', 'ё', 'е'))
     OR user_record."telegramId" = 'manual_20260718_bounty_alevtina'
);

CREATE TEMP TABLE _candidate_user_matches AS
SELECT DISTINCT
  manual.finish_place,
  user_record.id AS user_id,
  user_record.username,
  user_record."displayName",
  CASE WHEN active_registration.id IS NOT NULL THEN 0 ELSE 1 END AS registration_priority,
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
LEFT JOIN LATERAL (
  SELECT registration.id
  FROM "Registration" registration
  WHERE registration."userId" = user_record.id
    AND registration."tournamentId" = (SELECT id FROM _target_tournament)
    AND registration.status = 'ACTIVE'
  ORDER BY registration."createdAt" ASC, registration.id ASC
  LIMIT 1
) active_registration ON TRUE;

CREATE TEMP TABLE _best_match_scores AS
SELECT
  finish_place,
  MIN(registration_priority * 10 + match_priority) AS best_score
FROM _candidate_user_matches
GROUP BY finish_place;

CREATE TEMP TABLE _best_candidates AS
SELECT candidate.*
FROM _candidate_user_matches candidate
JOIN _best_match_scores score
  ON score.finish_place = candidate.finish_place
 AND score.best_score = candidate.registration_priority * 10 + candidate.match_priority;

CREATE TEMP TABLE _user_matches AS
SELECT
  finish_place,
  MIN(user_id) AS user_id,
  MIN(username) AS username,
  MIN("displayName") AS "displayName"
FROM _best_candidates
GROUP BY finish_place
HAVING COUNT(*) = 1;

DO $$
DECLARE
  missing_players TEXT;
  ambiguous_players TEXT;
  duplicated_users TEXT;
BEGIN
  SELECT STRING_AGG(
    manual.finish_place::TEXT || ' (' || ARRAY_TO_STRING(manual.lookup_values, ' / ') || ')',
    ', ' ORDER BY manual.finish_place
  )
  INTO missing_players
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1 FROM _best_candidates candidate
    WHERE candidate.finish_place = manual.finish_place
  );

  SELECT STRING_AGG(
    candidate.finish_place::TEXT || ' (' || candidate.matches::TEXT || ' matches)',
    ', ' ORDER BY candidate.finish_place
  )
  INTO ambiguous_players
  FROM (
    SELECT finish_place, COUNT(*) AS matches
    FROM _best_candidates
    GROUP BY finish_place
    HAVING COUNT(*) > 1
  ) candidate;

  SELECT STRING_AGG(user_id || ' -> places ' || places, ', ' ORDER BY user_id)
  INTO duplicated_users
  FROM (
    SELECT user_id, STRING_AGG(finish_place::TEXT, ', ' ORDER BY finish_place) AS places
    FROM _user_matches
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF missing_players IS NOT NULL OR ambiguous_players IS NOT NULL OR duplicated_users IS NOT NULL THEN
    RAISE EXCEPTION
      'User resolution failed. Missing: %, ambiguous: %, duplicated users: %',
      COALESCE(missing_players, 'none'),
      COALESCE(ambiguous_players, 'none'),
      COALESCE(duplicated_users, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _resolved_users AS
SELECT
  manual.finish_place,
  manual.placement_points,
  manual.bounty_points,
  manual.knockouts,
  manual.percent,
  matched.user_id,
  matched.username,
  matched."displayName"
FROM _manual_results manual
JOIN _user_matches matched
  ON matched.finish_place = manual.finish_place;

UPDATE "User" user_record
SET
  "displayName" = CASE resolved.finish_place
    WHEN 1 THEN 'Колесо'
    WHEN 14 THEN 'Уборщик клуба FLOP'
    ELSE user_record."displayName"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_users resolved
WHERE user_record.id = resolved.user_id
  AND resolved.finish_place IN (1, 14);

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
  'manual_reg_20260718_bounty_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
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
  resolved.placement_points,
  resolved.bounty_points,
  resolved.knockouts,
  resolved.percent,
  registration.id AS registration_id,
  resolved.user_id,
  resolved.username,
  resolved."displayName"
FROM _resolved_users resolved
JOIN LATERAL (
  SELECT candidate.id
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

  IF resolved_count <> 17 OR unique_registration_count <> 17 THEN
    RAISE EXCEPTION
      'Expected 17 unique active registrations after backfill. Resolved: %, unique: %',
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
  'manual_rating_20260718_bounty_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  (SELECT id FROM _target_tournament),
  resolved.user_id,
  resolved.finish_place,
  resolved.percent,
  resolved.placement_points + resolved.bounty_points,
  resolved.knockouts,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_results resolved;

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + resolved.placement_points + resolved.bounty_points,
  knockouts = user_record.knockouts + resolved.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_results resolved
WHERE user_record.id = resolved.user_id;

UPDATE "Tournament"
SET
  "entriesCount" = 17,
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE "startsAt" >= TIMESTAMPTZ '2026-07-17 17:00:00+00'
    AND "startsAt" <  TIMESTAMPTZ '2026-07-18 17:00:00+00'
    AND title ILIKE '%Bounty%'
    AND title NOT ILIKE '%Mystery%'
    AND status <> 'CANCELLED'
  ORDER BY "startsAt" DESC
  LIMIT 1
)
SELECT
  result.place,
  user_record."displayName",
  user_record.username,
  manual.placement_points,
  manual.bounty_points,
  result.points AS total_points,
  result.knockouts
FROM "TournamentRatingResult" result
JOIN "User" user_record
  ON user_record.id = result."userId"
JOIN target
  ON target.id = result."tournamentId"
JOIN _manual_results manual
  ON manual.finish_place = result.place
ORDER BY result.place;
