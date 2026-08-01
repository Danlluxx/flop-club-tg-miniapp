BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-07-31-flop-prime-event-restore-results-v1'));

DELETE FROM "DeletedScheduledTournament"
WHERE "dateKey" = '2026-07-31';

INSERT INTO "Tournament" (
  id,
  title,
  description,
  "startsAt",
  location,
  "buyIn",
  "reEntry",
  "prizePool",
  "ratingPool",
  "ratingSeriesMonth",
  "entriesCount",
  profile,
  "lateRegistrationEndsAt",
  "addOnEnabled",
  "addOnPrice",
  "addOnChips",
  "maxParticipants",
  status,
  "allowCancellation",
  "createdAt",
  "updatedAt"
)
SELECT
  '2026-07-31-flop-prime-event',
  'Flop Prime Event',
  'Статусный турнир недели с повышенной значимостью.',
  TIMESTAMPTZ '2026-07-31 12:00:00+00',
  'Flop Club, Барнаул',
  500,
  500,
  25000,
  15000,
  '2026-07',
  12,
  'DEEP_SPECIAL',
  TIMESTAMPTZ '2026-07-31 15:00:00+00',
  TRUE,
  1000,
  100000,
  50,
  'FINISHED',
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tournament"
  WHERE id = '2026-07-31-flop-prime-event'
     OR (("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-07-31'
         AND title ILIKE '%Prime%Event%')
);

CREATE TEMP TABLE _target_tournament AS
SELECT id, title, "startsAt"
FROM "Tournament"
WHERE id = '2026-07-31-flop-prime-event'
   OR (("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-07-31'
       AND title ILIKE '%Prime%Event%')
ORDER BY
  CASE WHEN id = '2026-07-31-flop-prime-event' THEN 0 ELSE 1 END,
  "createdAt" ASC
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
  tournament_list TEXT;
BEGIN
  SELECT COUNT(*) INTO tournament_count
  FROM "Tournament"
  WHERE id = '2026-07-31-flop-prime-event'
     OR (("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-07-31'
         AND title ILIKE '%Prime%Event%');

  SELECT STRING_AGG(title || ' (' || id || ', ' || "startsAt"::TEXT || ')', ', ' ORDER BY "startsAt")
  INTO tournament_list
  FROM "Tournament"
  WHERE id = '2026-07-31-flop-prime-event'
     OR (("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-07-31'
         AND title ILIKE '%Prime%Event%');

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Flop Prime Event tournament on 2026-07-31 Barnaul date, found %: %',
      tournament_count,
      COALESCE(tournament_list, 'none');
  END IF;
END $$;

UPDATE "Tournament"
SET
  title = 'Flop Prime Event',
  description = 'Статусный турнир недели с повышенной значимостью.',
  "startsAt" = TIMESTAMPTZ '2026-07-31 12:00:00+00',
  location = 'Flop Club, Барнаул',
  "buyIn" = 500,
  "reEntry" = 500,
  "prizePool" = 25000,
  "ratingPool" = 15000,
  "ratingSeriesMonth" = '2026-07',
  "entriesCount" = 12,
  profile = 'DEEP_SPECIAL',
  "lateRegistrationEndsAt" = TIMESTAMPTZ '2026-07-31 15:00:00+00',
  "addOnEnabled" = TRUE,
  "addOnPrice" = 1000,
  "addOnChips" = 100000,
  "maxParticipants" = 50,
  status = 'FINISHED',
  "allowCancellation" = FALSE,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

CREATE TEMP TABLE _manual_results (
  finish_place INTEGER PRIMARY KEY,
  points INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _manual_results (finish_place, points, percent, lookup_values) VALUES
  (1, 6750, 45, ARRAY['Cloud', 'cloud', 'cloud6aby']),
  (2, 4050, 27, ARRAY['Алефтина', 'Aлевтина', 'Алевтина', 'alshpr']),
  (3, 2700, 18, ARRAY['Николай', 'pogulyaev22']),
  (4, 1500, 10, ARRAY['Степан', 'Stepan', 'StepasSK']),
  (5, 0, 0, ARRAY['Yakub Aliev', 'Yakub', 'yakubahlli']),
  (6, 0, 0, ARRAY['Niggroni', 'bbspasha']),
  (7, 0, 0, ARRAY['Вася Шуваев', 'kotovasia13']),
  (8, 0, 0, ARRAY['Bq']),
  (9, 0, 0, ARRAY['Xrodan', 'xrodan']),
  (10, 0, 0, ARRAY['Mamix', 't_ador']),
  (11, 0, 0, ARRAY['Кимпинтяо', 'belosnusov']),
  (12, 0, 0, ARRAY['DK', 'danlluxx']);

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
SELECT
  'manual_user_20260731_prime_event_' || LPAD(manual.finish_place::TEXT, 2, '0'),
  '-20260731' || LPAD(manual.finish_place::TEXT, 2, '0'),
  NULL,
  manual.lookup_values[1],
  NULL,
  manual.lookup_values[1],
  'USER',
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _manual_results manual
WHERE NOT EXISTS (
  SELECT 1
  FROM "User" user_record
  WHERE LOWER(TRIM(LEADING '@' FROM COALESCE(user_record.username, ''))) = ANY(
      SELECT LOWER(TRIM(LEADING '@' FROM lookup.value)) FROM UNNEST(manual.lookup_values) AS lookup(value)
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
)
ON CONFLICT DO NOTHING;

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
    WHEN LOWER(TRIM(LEADING '@' FROM COALESCE(user_record.username, ''))) = ANY(
      SELECT LOWER(TRIM(LEADING '@' FROM lookup.value)) FROM UNNEST(manual.lookup_values) AS lookup(value)
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
  ON LOWER(TRIM(LEADING '@' FROM COALESCE(user_record.username, ''))) = ANY(
    SELECT LOWER(TRIM(LEADING '@' FROM lookup.value)) FROM UNNEST(manual.lookup_values) AS lookup(value)
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

CREATE TEMP TABLE _best_candidate_user_matches AS
SELECT finish_place, points, percent, user_id, username, "displayName"
FROM (
  SELECT
    candidate.*,
    DENSE_RANK() OVER (
      PARTITION BY candidate.finish_place
      ORDER BY
        CASE WHEN candidate.active_registration_id IS NOT NULL THEN 0 ELSE 1 END,
        candidate.match_priority,
        candidate.user_id
    ) AS best_rank
  FROM _candidate_user_matches candidate
) ranked
WHERE best_rank = 1;

DO $$
DECLARE
  missing_players TEXT;
  ambiguous_players TEXT;
  duplicated_users TEXT;
BEGIN
  SELECT STRING_AGG(manual.finish_place::TEXT || ' (' || ARRAY_TO_STRING(manual.lookup_values, ' / ') || ')', ', ' ORDER BY manual.finish_place)
  INTO missing_players
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _best_candidate_user_matches matched
    WHERE matched.finish_place = manual.finish_place
  );

  SELECT STRING_AGG(finish_place::TEXT || ' -> ' || candidates, ', ' ORDER BY finish_place)
  INTO ambiguous_players
  FROM (
    SELECT
      finish_place,
      STRING_AGG(COALESCE("displayName", username, user_id) || ' [' || COALESCE(username, 'no username') || ']', '; ' ORDER BY username NULLS LAST, user_id) AS candidates
    FROM _best_candidate_user_matches
    GROUP BY finish_place
    HAVING COUNT(DISTINCT user_id) > 1
  ) ambiguous;

  SELECT STRING_AGG(user_id || ' -> places ' || places, ', ' ORDER BY user_id)
  INTO duplicated_users
  FROM (
    SELECT user_id, STRING_AGG(finish_place::TEXT, ', ' ORDER BY finish_place) AS places
    FROM _best_candidate_user_matches
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
  manual.points,
  manual.percent,
  matched.user_id,
  matched.username,
  matched."displayName"
FROM _manual_results manual
JOIN _best_candidate_user_matches matched
  ON matched.finish_place = manual.finish_place;

UPDATE "Registration" registration
SET
  status = 'CANCELLED',
  "finishPlace" = NULL,
  "tableNumber" = NULL,
  "seatNumber" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM _resolved_users resolved
    WHERE resolved.user_id = registration."userId"
  );

UPDATE "Registration" registration
SET
  status = 'ACTIVE',
  "liveStatus" = 'ELIMINATED',
  "checkedInAt" = COALESCE(registration."checkedInAt", CURRENT_TIMESTAMP),
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
  "entryNumber" = GREATEST(COALESCE(registration."entryNumber", 1), 1),
  "addOnCount" = COALESCE(registration."addOnCount", 0),
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_users resolved
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration."userId" = resolved.user_id
  AND registration.status <> 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM "Registration" active_registration
    WHERE active_registration."tournamentId" = registration."tournamentId"
      AND active_registration."userId" = registration."userId"
      AND active_registration.status = 'ACTIVE'
  )
  AND registration.id = (
    SELECT candidate.id
    FROM "Registration" candidate
    WHERE candidate."tournamentId" = registration."tournamentId"
      AND candidate."userId" = registration."userId"
    ORDER BY candidate."createdAt" ASC, candidate.id ASC
    LIMIT 1
  );

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
  'manual_reg_20260731_prime_event_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
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
)
ON CONFLICT DO NOTHING;

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

  IF resolved_count <> 12 OR unique_registration_count <> 12 THEN
    RAISE EXCEPTION
      'Expected 12 unique active registrations after backfill. Resolved: %, unique: %',
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
  "ratingPoints" = GREATEST(0, user_record."ratingPoints" - old_results.points - old_results.knockouts),
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
  "tableNumber" = NULL,
  "seatNumber" = NULL,
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
  'manual_rating_20260731_prime_event_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
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
  "entriesCount" = 12,
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE id = '2026-07-31-flop-prime-event'
     OR (("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-07-31'
         AND title ILIKE '%Prime%Event%')
  ORDER BY
    CASE WHEN id = '2026-07-31-flop-prime-event' THEN 0 ELSE 1 END,
    "createdAt" ASC
  LIMIT 1
)
SELECT
  registration."finishPlace" AS place,
  user_record."displayName",
  user_record.username,
  COALESCE(result.points, 0) AS points,
  COALESCE(result.percent, 0) AS percent,
  user_record."ratingPoints" AS global_rating
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
JOIN target
  ON target.id = registration."tournamentId"
LEFT JOIN "TournamentRatingResult" result
  ON result."tournamentId" = registration."tournamentId"
 AND result."userId" = registration."userId"
WHERE registration.status = 'ACTIVE'
ORDER BY registration."finishPlace" NULLS LAST, registration."createdAt" ASC;
