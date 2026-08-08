BEGIN;

SELECT pg_advisory_xact_lock(hashtext('fix-20260803-old-fashion-swap-place-1-2'));

CREATE TEMP TABLE _target_tournament AS
SELECT id, title, "startsAt", "ratingPool"
FROM "Tournament"
WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-03'
  AND title ILIKE '%Old%Fashion%'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC
LIMIT 1;

DO $$
DECLARE
  tournaments_count int;
  place_1_count int;
  place_2_count int;
BEGIN
  SELECT COUNT(*) INTO tournaments_count
  FROM "Tournament"
  WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-03'
    AND title ILIKE '%Old%Fashion%'
    AND status <> 'CANCELLED';

  IF tournaments_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Old Fashion tournament on 2026-08-03 Barnaul date, found %', tournaments_count;
  END IF;

  SELECT COUNT(*) INTO place_1_count
  FROM "Registration"
  WHERE "tournamentId" = (SELECT id FROM _target_tournament)
    AND status = 'ACTIVE'
    AND "finishPlace" = 1;

  SELECT COUNT(*) INTO place_2_count
  FROM "Registration"
  WHERE "tournamentId" = (SELECT id FROM _target_tournament)
    AND status = 'ACTIVE'
    AND "finishPlace" = 2;

  IF place_1_count <> 1 OR place_2_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one registration at place 1 and one at place 2. Found place 1: %, place 2: %',
      place_1_count,
      place_2_count;
  END IF;
END $$;

UPDATE "Registration" registration
SET
  "finishPlace" = CASE
    WHEN registration."finishPlace" = 1 THEN 2
    WHEN registration."finishPlace" = 2 THEN 1
    ELSE registration."finishPlace"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE'
  AND registration."finishPlace" IN (1, 2);

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

CREATE TEMP TABLE _active_participants AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  registration."finishPlace" AS finish_place,
  registration."createdAt" AS created_at
FROM "Registration" registration
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE';

DO $$
DECLARE
  participants_count int;
  placed_count int;
  unique_places_count int;
  duplicate_places text;
BEGIN
  SELECT COUNT(*) INTO participants_count FROM _active_participants;
  SELECT COUNT(*) INTO placed_count FROM _active_participants WHERE finish_place IS NOT NULL;
  SELECT COUNT(DISTINCT finish_place) INTO unique_places_count FROM _active_participants WHERE finish_place IS NOT NULL;

  IF participants_count = 0 THEN
    RAISE EXCEPTION 'Tournament has no active participants';
  END IF;

  IF placed_count <> participants_count THEN
    RAISE EXCEPTION 'All active participants must have finishPlace before rating recalculation. Participants: %, placed: %',
      participants_count,
      placed_count;
  END IF;

  IF unique_places_count <> placed_count THEN
    SELECT STRING_AGG(finish_place::text, ', ' ORDER BY finish_place)
    INTO duplicate_places
    FROM (
      SELECT finish_place
      FROM _active_participants
      GROUP BY finish_place
      HAVING COUNT(*) > 1
    ) duplicated;

    RAISE EXCEPTION 'Duplicate finishPlace values found: %', duplicate_places;
  END IF;
END $$;

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

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" - existing.points - existing.knockouts,
  knockouts = user_record.knockouts - existing.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "TournamentRatingResult" existing
WHERE existing."tournamentId" = (SELECT tournament_id FROM _rating_context)
  AND existing."userId" = user_record.id;

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT tournament_id FROM _rating_context);

CREATE TEMP TABLE _new_rating_results AS
SELECT
  participant.user_id,
  participant.finish_place AS place,
  distribution.percent,
  ROUND(context.rating_pool * distribution.percent / 100.0)::int AS points,
  0 AS knockouts
FROM _active_participants participant
CROSS JOIN _rating_context context
JOIN _rating_distribution distribution
  ON distribution.paid_count = context.paid_count
 AND distribution.place = participant.finish_place
WHERE participant.finish_place <= context.paid_count;

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
  WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-03'
    AND title ILIKE '%Old%Fashion%'
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
    user_record."telegramId"
  ) AS "displayName",
  user_record.username,
  COALESCE(rating_result.points, 0) AS points,
  user_record."ratingPoints" AS global_rating
FROM "Registration" registration
JOIN "User" user_record
  ON user_record.id = registration."userId"
JOIN target
  ON target.id = registration."tournamentId"
LEFT JOIN "TournamentRatingResult" rating_result
  ON rating_result."tournamentId" = registration."tournamentId"
 AND rating_result."userId" = registration."userId"
WHERE registration.status = 'ACTIVE'
ORDER BY registration."finishPlace" ASC, registration."createdAt" ASC;
