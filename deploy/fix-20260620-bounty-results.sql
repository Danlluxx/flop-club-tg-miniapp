BEGIN;

SELECT pg_advisory_xact_lock(hashtext('2026-06-20-flop-bounty-rating-fix'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Tournament"
    WHERE id = '2026-06-20-flop-bounty'
  ) THEN
    RAISE EXCEPTION 'Tournament 2026-06-20-flop-bounty not found';
  END IF;
END $$;

CREATE TEMP TABLE _manual_results (
  registration_id TEXT PRIMARY KEY,
  finish_place INTEGER NOT NULL UNIQUE,
  points INTEGER NOT NULL,
  knockouts INTEGER NOT NULL
);

INSERT INTO _manual_results (registration_id, finish_place, points, knockouts) VALUES
  ('cmql0ozqt01hgy9gz0me6epmy', 1, 4800, 8),
  ('cmqm5tm2v02i6y9gz2f6tcudv', 2, 2600, 1),
  ('cmqm574zj02gty9gzqxwe2lhg', 3, 2100, 5),
  ('cmqm8eiz002l5y9gz7ri6jz5y', 4, 1100, 0),
  ('cmqm5bc6702h3y9gzln93ep3u', 5, 900, 1),
  ('cmqlw91cc028jy9gzr1ds20tw', 6, 200, 2),
  ('cmqm9cjhs02omy9gzoe10cpyw', 7, 0, 0),
  ('cmqmd7c6302v7y9gzaykh7i5n', 8, 0, 0),
  ('cmqlabhx701qjy9gz82ev1aln', 9, 100, 1),
  ('cmqm0hks402cfy9gzxn9jbdyd', 10, 0, 0),
  ('cmql5smd001mry9gzohk6ptfx', 11, 0, 0),
  ('cmqluiisr026qy9gzk7hd017i', 12, 0, 0),
  ('cmqm5pn1q02hpy9gzhijhvqnt', 13, 0, 0),
  ('cmqm91kup02ncy9gziajxvgos', 14, 0, 0),
  ('cmqm92d5802nny9gzu1ygizu5', 15, 0, 0);

DO $$
DECLARE
  matched_registrations INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO matched_registrations
  FROM _manual_results manual
  JOIN "Registration" registration
    ON registration.id = manual.registration_id
  WHERE registration."tournamentId" = '2026-06-20-flop-bounty'
    AND registration.status = 'ACTIVE';

  IF matched_registrations <> 15 THEN
    RAISE EXCEPTION 'Expected 15 active registrations, found %', matched_registrations;
  END IF;
END $$;

WITH old_results AS (
  SELECT
    "userId",
    SUM(points)::INTEGER AS points,
    SUM(knockouts)::INTEGER AS knockouts
  FROM "TournamentRatingResult"
  WHERE "tournamentId" = '2026-06-20-flop-bounty'
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
WHERE "tournamentId" = '2026-06-20-flop-bounty';

UPDATE "Registration" registration
SET
  "finishPlace" = manual.finish_place,
  "liveStatus" = 'ELIMINATED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM _manual_results manual
WHERE registration.id = manual.registration_id
  AND registration."tournamentId" = '2026-06-20-flop-bounty';

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
  'manual_rating_20260620_' || LPAD(manual.finish_place::TEXT, 2, '0'),
  registration."tournamentId",
  registration."userId",
  manual.finish_place,
  0,
  manual.points,
  manual.knockouts,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _manual_results manual
JOIN "Registration" registration
  ON registration.id = manual.registration_id
WHERE registration."tournamentId" = '2026-06-20-flop-bounty';

UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + manual.points,
  knockouts = user_record.knockouts + manual.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _manual_results manual
JOIN "Registration" registration
  ON registration.id = manual.registration_id
WHERE registration."tournamentId" = '2026-06-20-flop-bounty'
  AND user_record.id = registration."userId";

UPDATE "Tournament"
SET
  "entriesCount" = 15,
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = '2026-06-20-flop-bounty';

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
WHERE result."tournamentId" = '2026-06-20-flop-bounty'
ORDER BY result.place;
