BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-26-flop-mystery-knockout-results-v1'));

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= TIMESTAMPTZ '2026-06-25 17:00:00+00'
  AND "startsAt" < TIMESTAMPTZ '2026-06-26 17:00:00+00'
  AND title ILIKE '%Mystery%Knockout%';

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;

  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Mystery Knockout tournament for 2026-06-26 Barnaul, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  username TEXT PRIMARY KEY,
  finish_place INTEGER NOT NULL UNIQUE,
  placement_points INTEGER NOT NULL,
  bounty_points INTEGER NOT NULL
);

INSERT INTO _manual_results (username, finish_place, placement_points, bounty_points) VALUES
  ('danlluxx',        1, 4000, 1750),
  ('rondoilya',      2, 2500, 1500),
  ('lll3Elll',       3, 1600,  250),
  ('msvarchevskayaa',4, 1100,    0),
  ('davidmane',      5,  800,    0),
  ('kiruhaque',      6,    0,    0),
  ('og_gloomy',      7,    0, 1750),
  ('baldejnyi',      8,    0,  500),
  ('zhaaaaannna',    9,    0,  500),
  ('gorettts',      10,    0,    0),
  ('wsemprivetik',  11,    0,  500),
  ('BOMMBOCLAAAT',  12,    0,    0),
  ('edkonoh',       13,    0,    0),
  ('scalpbetsceo',  14,    0,  750),
  ('helsenday',     15,    0,    0),
  ('flutt_my',      16,    0,    0),
  ('StepasSk',      17,    0,    0);

CREATE TEMP TABLE _resolved_users AS
SELECT
  manual.finish_place,
  manual.placement_points,
  manual.bounty_points,
  user_record.id AS user_id,
  user_record.username,
  user_record."displayName"
FROM _manual_results manual
JOIN "User" user_record
  ON LOWER(user_record.username) = LOWER(manual.username);

DO $$
DECLARE
  resolved_count INTEGER;
  unique_user_count INTEGER;
  missing_users TEXT;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT user_id)
  INTO resolved_count, unique_user_count
  FROM _resolved_users;

  SELECT STRING_AGG(manual.username, ', ' ORDER BY manual.finish_place)
  INTO missing_users
  FROM _manual_results manual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _resolved_users resolved
    WHERE resolved.finish_place = manual.finish_place
  );

  IF resolved_count <> 17 OR unique_user_count <> 17 THEN
    RAISE EXCEPTION
      'Expected 17 unique users, resolved % rows and % users. Missing: %',
      resolved_count,
      unique_user_count,
      COALESCE(missing_users, 'none');
  END IF;
END $$;

INSERT INTO "Registration" (
  id,
  "userId",
  "tournamentId",
  status,
  "liveStatus",
  "checkedInAt",
  "finishPlace",
  "entryNumber",
  "addOnCount",
  "eliminatedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_reg_20260626_mko_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  resolved.user_id,
  target.id,
  'ACTIVE',
  'ELIMINATED',
  CURRENT_TIMESTAMP,
  resolved.finish_place,
  1,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_users resolved
CROSS JOIN _target_tournament target
WHERE NOT EXISTS (
  SELECT 1
  FROM "Registration" registration
  WHERE registration."tournamentId" = target.id
    AND registration."userId" = resolved.user_id
);

CREATE TEMP TABLE _resolved_results AS
SELECT
  resolved.finish_place,
  resolved.placement_points,
  resolved.bounty_points,
  resolved.user_id,
  resolved.username,
  resolved."displayName",
  registration.id AS registration_id
FROM _resolved_users resolved
CROSS JOIN _target_tournament target
JOIN LATERAL (
  SELECT candidate.id
  FROM "Registration" candidate
  WHERE candidate."tournamentId" = target.id
    AND candidate."userId" = resolved.user_id
  ORDER BY
    CASE WHEN candidate.status = 'ACTIVE' THEN 0 ELSE 1 END,
    candidate."createdAt" ASC,
    candidate.id ASC
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
      'Expected 17 unique registrations, resolved % rows and % registrations',
      resolved_count,
      unique_registration_count;
  END IF;
END $$;

WITH old_results AS (
  SELECT
    result."userId",
    SUM(result.points)::INTEGER AS points
  FROM "TournamentRatingResult" result
  WHERE result."tournamentId" = (SELECT id FROM _target_tournament)
  GROUP BY result."userId"
)
UPDATE "User" user_record
SET
  "ratingPoints" = GREATEST(0, user_record."ratingPoints" - old_results.points),
  "updatedAt" = CURRENT_TIMESTAMP
FROM old_results
WHERE user_record.id = old_results."userId";

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

UPDATE "Registration" registration
SET
  status = 'ACTIVE',
  "liveStatus" = 'ELIMINATED',
  "checkedInAt" = COALESCE(registration."checkedInAt", CURRENT_TIMESTAMP),
  "finishPlace" = resolved.finish_place,
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
  'manual_rating_20260626_mko_' || LPAD(resolved.finish_place::TEXT, 2, '0'),
  target.id,
  resolved.user_id,
  resolved.finish_place,
  0,
  resolved.placement_points + resolved.bounty_points,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _resolved_results resolved
CROSS JOIN _target_tournament target;

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + resolved.placement_points + resolved.bounty_points,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _resolved_results resolved
WHERE user_record.id = resolved.user_id;

UPDATE "Tournament"
SET
  "entriesCount" = GREATEST(COALESCE("entriesCount", 0), 17),
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

SELECT
  result.place,
  user_record."displayName",
  user_record.username,
  manual.placement_points,
  manual.bounty_points,
  result.points AS total_points
FROM "TournamentRatingResult" result
JOIN "User" user_record
  ON user_record.id = result."userId"
JOIN _manual_results manual
  ON LOWER(manual.username) = LOWER(user_record.username)
WHERE result."tournamentId" = (
  SELECT id
  FROM "Tournament"
  WHERE "startsAt" >= TIMESTAMPTZ '2026-06-25 17:00:00+00'
    AND "startsAt" < TIMESTAMPTZ '2026-06-26 17:00:00+00'
    AND title ILIKE '%Mystery%Knockout%'
  LIMIT 1
)
ORDER BY result.place;
