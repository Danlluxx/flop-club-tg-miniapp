BEGIN;

SELECT pg_advisory_xact_lock(hashtext('fix-20260810-yesterday-places-rating'));

CREATE TEMP TABLE _target_tournament AS
SELECT id, title, "startsAt", "ratingPool"
FROM "Tournament"
WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-10'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC;

DO $$
DECLARE
  tournaments_count int;
BEGIN
  SELECT COUNT(*) INTO tournaments_count FROM _target_tournament;

  IF tournaments_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one non-cancelled tournament on 2026-08-10 Barnaul date, found %',
      tournaments_count;
  END IF;
END $$;

CREATE TEMP TABLE _target_places (
  desired_place int PRIMARY KEY,
  username text NOT NULL,
  label text NOT NULL
);

INSERT INTO _target_places (desired_place, username, label) VALUES
  (7, 'rrrrrr55555588', 'Уборщик клуба FLOP'),
  (8, 'yakubahlli', 'Yakub Aliev'),
  (9, 'kuwse', 'Кувси');

CREATE TEMP TABLE _target_user_matches AS
SELECT
  target.desired_place,
  target.username AS expected_username,
  target.label,
  user_record.id AS user_id,
  ROW_NUMBER() OVER (
    PARTITION BY target.desired_place
    ORDER BY
      CASE
        WHEN LOWER(TRIM(LEADING '@' FROM COALESCE(user_record.username, ''))) = LOWER(target.username) THEN 0
        ELSE 1
      END,
      user_record."createdAt" DESC,
      user_record.id
  ) AS rn,
  COUNT(*) OVER (PARTITION BY target.desired_place) AS matches_count
FROM _target_places target
JOIN "User" user_record
  ON LOWER(TRIM(LEADING '@' FROM COALESCE(user_record.username, ''))) = LOWER(target.username)
  OR LOWER(COALESCE(user_record."displayName", '')) = LOWER(target.label);

DO $$
DECLARE
  missing_players text;
  ambiguous_players text;
BEGIN
  SELECT STRING_AGG(label || ' (@' || username || ')', ', ' ORDER BY desired_place)
  INTO missing_players
  FROM _target_places target
  WHERE NOT EXISTS (
    SELECT 1
    FROM _target_user_matches match
    WHERE match.desired_place = target.desired_place
  );

  SELECT STRING_AGG(label || ' (@' || expected_username || '): ' || matches_count::text, ', ' ORDER BY desired_place)
  INTO ambiguous_players
  FROM _target_user_matches
  WHERE matches_count > 1
    AND rn = 1;

  IF missing_players IS NOT NULL OR ambiguous_players IS NOT NULL THEN
    RAISE EXCEPTION 'Target user resolution failed. Missing: %, ambiguous: %',
      COALESCE(missing_players, 'none'),
      COALESCE(ambiguous_players, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _target_users AS
SELECT
  desired_place,
  expected_username AS username,
  label,
  user_id
FROM _target_user_matches
WHERE rn = 1;

CREATE TEMP TABLE _target_registrations_to_reactivate AS
SELECT DISTINCT ON (registration."userId")
  registration.id AS registration_id
FROM "Registration" registration
JOIN _target_users target
  ON target.user_id = registration."userId"
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status <> 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM "Registration" active_registration
    WHERE active_registration."tournamentId" = registration."tournamentId"
      AND active_registration."userId" = registration."userId"
      AND active_registration.status = 'ACTIVE'
  )
ORDER BY registration."userId", registration."createdAt" DESC, registration.id;

UPDATE "Registration" registration
SET
  status = 'ACTIVE',
  "liveStatus" = 'ELIMINATED',
  "finishPlace" = NULL,
  "entryNumber" = GREATEST(COALESCE(registration."entryNumber", 1), 1),
  "checkInToken" = COALESCE(registration."checkInToken", MD5('checkin:' || registration.id)),
  "checkedInAt" = COALESCE(registration."checkedInAt", CURRENT_TIMESTAMP),
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE registration.id IN (
  SELECT registration_id
  FROM _target_registrations_to_reactivate
);

INSERT INTO "Registration" (
  id,
  "userId",
  "tournamentId",
  status,
  "createdAt",
  "updatedAt",
  "liveStatus",
  "checkedInAt",
  "entryNumber",
  "addOnCount",
  "checkInToken",
  "eliminatedAt"
)
SELECT
  'manual_reg_' || MD5(target.user_id || ':' || tournament.id),
  target.user_id,
  tournament.id,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'ELIMINATED',
  CURRENT_TIMESTAMP,
  1,
  0,
  MD5('checkin:' || target.user_id || ':' || tournament.id),
  CURRENT_TIMESTAMP
FROM _target_users target
CROSS JOIN _target_tournament tournament
WHERE NOT EXISTS (
  SELECT 1
  FROM "Registration" registration
  WHERE registration."tournamentId" = tournament.id
    AND registration."userId" = target.user_id
    AND registration.status = 'ACTIVE'
);

CREATE TEMP TABLE _active_participants AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  registration."finishPlace" AS finish_place,
  registration."createdAt" AS created_at,
  user_record.username,
  COALESCE(
    NULLIF(user_record."displayName", ''),
    NULLIF(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), ''),
    NULLIF(user_record.username, ''),
    user_record."telegramId"::text
  ) AS display_name
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE';

DO $$
DECLARE
  participants_count int;
BEGIN
  SELECT COUNT(*) INTO participants_count FROM _active_participants;

  IF participants_count = 0 THEN
    RAISE EXCEPTION 'Tournament has no active participants';
  END IF;
END $$;

CREATE TEMP TABLE _target_registrations AS
SELECT
  target.desired_place,
  target.label,
  participant.registration_id,
  participant.user_id,
  participant.display_name,
  participant.username
FROM _target_users target
JOIN _active_participants participant
  ON participant.user_id = target.user_id;

DO $$
DECLARE
  resolved_count int;
  missing_players text;
  unplaced_players text;
BEGIN
  SELECT COUNT(*) INTO resolved_count FROM _target_registrations;

  IF resolved_count <> 3 THEN
    SELECT STRING_AGG(label || ' (@' || username || ')', ', ' ORDER BY desired_place)
    INTO missing_players
    FROM _target_places target
    WHERE NOT EXISTS (
      SELECT 1
      FROM _target_registrations resolved
      WHERE resolved.desired_place = target.desired_place
    );

    RAISE EXCEPTION 'Could not resolve all target players. Resolved: %, missing: %',
      resolved_count,
      COALESCE(missing_players, 'none');
  END IF;

  SELECT STRING_AGG(participant.display_name || ' (@' || COALESCE(participant.username, '') || ')', ', ' ORDER BY participant.created_at)
  INTO unplaced_players
  FROM _active_participants participant
  WHERE participant.finish_place IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM _target_registrations target
      WHERE target.registration_id = participant.registration_id
    );

  IF unplaced_players IS NOT NULL THEN
    RAISE EXCEPTION 'Non-target active participants must have finishPlace before recalculation: %',
      unplaced_players;
  END IF;
END $$;

CREATE TEMP TABLE _other_registrations AS
SELECT
  participant.registration_id,
  ROW_NUMBER() OVER (ORDER BY participant.finish_place NULLS LAST, participant.created_at, participant.registration_id) AS rn
FROM _active_participants participant
WHERE NOT EXISTS (
  SELECT 1
  FROM _target_registrations target
  WHERE target.registration_id = participant.registration_id
);

CREATE TEMP TABLE _available_places AS
SELECT
  place_value AS finish_place,
  ROW_NUMBER() OVER (ORDER BY place_value) AS rn
FROM GENERATE_SERIES(1, (SELECT COUNT(*)::int FROM _active_participants)) AS place_value
WHERE place_value NOT IN (SELECT desired_place FROM _target_places);

CREATE TEMP TABLE _new_places AS
SELECT other_regs.registration_id, available.finish_place
FROM _other_registrations other_regs
JOIN _available_places available
  ON available.rn = other_regs.rn
UNION ALL
SELECT registration_id, desired_place AS finish_place
FROM _target_registrations;

DO $$
DECLARE
  participants_count int;
  new_places_count int;
  unique_places_count int;
BEGIN
  SELECT COUNT(*) INTO participants_count FROM _active_participants;
  SELECT COUNT(*) INTO new_places_count FROM _new_places;
  SELECT COUNT(DISTINCT finish_place) INTO unique_places_count FROM _new_places;

  IF new_places_count <> participants_count OR unique_places_count <> participants_count THEN
    RAISE EXCEPTION 'New finish places are invalid. Participants: %, new rows: %, unique places: %',
      participants_count,
      new_places_count,
      unique_places_count;
  END IF;
END $$;

UPDATE "Registration" registration
SET
  "finishPlace" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.id IN (SELECT registration_id FROM _new_places);

UPDATE "Registration" registration
SET
  "finishPlace" = new_place.finish_place,
  "liveStatus" = 'ELIMINATED',
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM _new_places new_place
WHERE registration.id = new_place.registration_id;

CREATE TEMP TABLE _rating_distribution (
  paid_count int NOT NULL,
  place int NOT NULL,
  percent int NOT NULL
);

INSERT INTO _rating_distribution (paid_count, place, percent) VALUES
  (1, 1, 100),
  (2, 1, 60), (2, 2, 40),
  (3, 1, 50), (3, 2, 30), (3, 3, 20),
  (4, 1, 45), (4, 2, 27), (4, 3, 18), (4, 4, 10),
  (5, 1, 40), (5, 2, 25), (5, 3, 17), (5, 4, 11), (5, 5, 7),
  (6, 1, 36), (6, 2, 24), (6, 3, 16), (6, 4, 10), (6, 5, 8), (6, 6, 6),
  (7, 1, 33), (7, 2, 22), (7, 3, 15), (7, 4, 10), (7, 5, 8), (7, 6, 7), (7, 7, 5),
  (8, 1, 30), (8, 2, 20), (8, 3, 14), (8, 4, 10), (8, 5, 8), (8, 6, 7), (8, 7, 6), (8, 8, 5),
  (9, 1, 28), (9, 2, 19), (9, 3, 13), (9, 4, 10), (9, 5, 8), (9, 6, 7), (9, 7, 6), (9, 8, 5), (9, 9, 4),
  (10, 1, 26), (10, 2, 18), (10, 3, 13), (10, 4, 10), (10, 5, 8), (10, 6, 7), (10, 7, 6), (10, 8, 5), (10, 9, 4), (10, 10, 3);

CREATE TEMP TABLE _rating_context AS
SELECT
  target.id AS tournament_id,
  target.title AS tournament_title,
  target."startsAt" AS starts_at,
  target."ratingPool" AS rating_pool,
  COUNT(participant.registration_id)::int AS entries_count,
  LEAST(10, GREATEST(1, CEIL(COUNT(participant.registration_id) * 0.3)::int)) AS paid_count
FROM _target_tournament target
CROSS JOIN _active_participants participant
GROUP BY target.id, target.title, target."startsAt", target."ratingPool";

CREATE TEMP TABLE _old_rating_by_user AS
SELECT
  result."userId" AS user_id,
  SUM(result.points)::int AS points,
  SUM(result.knockouts)::int AS knockouts
FROM "TournamentRatingResult" result
WHERE result."tournamentId" = (SELECT tournament_id FROM _rating_context)
GROUP BY result."userId";

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" - old_result.points - old_result.knockouts,
  knockouts = user_record.knockouts - old_result.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _old_rating_by_user old_result
WHERE old_result.user_id = user_record.id;

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT tournament_id FROM _rating_context);

CREATE TEMP TABLE _new_rating_results AS
SELECT
  participant.user_id,
  new_place.finish_place AS place,
  COALESCE(distribution.percent, 0) AS percent,
  CASE
    WHEN distribution.percent IS NULL THEN 0
    ELSE ROUND(context.rating_pool * distribution.percent / 100.0)::int
  END AS points,
  COALESCE(old_result.knockouts, 0) AS knockouts
FROM _new_places new_place
JOIN _active_participants participant
  ON participant.registration_id = new_place.registration_id
CROSS JOIN _rating_context context
LEFT JOIN _rating_distribution distribution
  ON distribution.paid_count = context.paid_count
 AND distribution.place = new_place.finish_place
LEFT JOIN _old_rating_by_user old_result
  ON old_result.user_id = participant.user_id
WHERE new_place.finish_place <= context.paid_count
   OR COALESCE(old_result.knockouts, 0) <> 0;

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
  'manual_rating_' || MD5(context.tournament_id || ':' || result.user_id || ':' || result.place),
  context.tournament_id,
  result.user_id,
  result.place,
  result.percent,
  result.points,
  result.knockouts,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _new_rating_results result
CROSS JOIN _rating_context context
ORDER BY result.place;

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + result.points + result.knockouts,
  knockouts = user_record.knockouts + result.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _new_rating_results result
WHERE result.user_id = user_record.id;

UPDATE "Tournament"
SET
  "entriesCount" = (SELECT entries_count FROM _rating_context),
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT tournament_id FROM _rating_context);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-10'
    AND status <> 'CANCELLED'
  ORDER BY "startsAt" DESC
  LIMIT 1
)
SELECT
  registration."finishPlace" AS place,
  COALESCE(
    NULLIF(user_record."displayName", ''),
    NULLIF(TRIM(CONCAT(COALESCE(user_record."firstName", ''), ' ', COALESCE(user_record."lastName", ''))), ''),
    NULLIF(user_record.username, ''),
    user_record."telegramId"::text
  ) AS "displayName",
  user_record.username,
  COALESCE(rating.points, 0) AS points,
  COALESCE(rating.knockouts, 0) AS knockouts,
  COALESCE(rating.points, 0) + COALESCE(rating.knockouts, 0) AS total,
  user_record."ratingPoints" AS global_rating
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
JOIN target
  ON target.id = registration."tournamentId"
LEFT JOIN "TournamentRatingResult" rating
  ON rating."tournamentId" = registration."tournamentId"
 AND rating."userId" = registration."userId"
WHERE registration.status = 'ACTIVE'
ORDER BY registration."finishPlace" NULLS LAST, registration."createdAt";
