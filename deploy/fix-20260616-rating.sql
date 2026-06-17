BEGIN;

CREATE TEMP TABLE _target_tournament AS
SELECT id
FROM "Tournament"
WHERE "startsAt" >= timestamp with time zone '2026-06-15 17:00:00+00'
  AND "startsAt" <  timestamp with time zone '2026-06-16 17:00:00+00'
ORDER BY "startsAt"
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _target_tournament) THEN
    RAISE EXCEPTION 'Tournament for 2026-06-16 not found';
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
  "createdAt",
  "updatedAt"
)
SELECT
  'manual_mugen_20260616',
  'cmqf5r29j002ccu9jh5k5plht',
  t.id,
  'ACTIVE',
  'ELIMINATED',
  now(),
  1,
  1,
  0,
  now(),
  now()
FROM _target_tournament t
WHERE NOT EXISTS (
  SELECT 1
  FROM "Registration" r
  WHERE r."tournamentId" = t.id
    AND r."userId" = 'cmqf5r29j002ccu9jh5k5plht'
    AND r.status = 'ACTIVE'
);

WITH old_results AS (
  SELECT "userId", SUM(points) AS points, SUM(knockouts) AS knockouts
  FROM "TournamentRatingResult"
  WHERE "tournamentId" = (SELECT id FROM _target_tournament)
  GROUP BY "userId"
)
UPDATE "User" u
SET
  "ratingPoints" = GREATEST(0, u."ratingPoints" - old_results.points),
  knockouts = GREATEST(0, u.knockouts - old_results.knockouts),
  "updatedAt" = now()
FROM old_results
WHERE u.id = old_results."userId";

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

CREATE TEMP TABLE _manual_input (
  registration_id text PRIMARY KEY,
  finish_place int NOT NULL,
  points int NOT NULL,
  percent int NOT NULL
);

INSERT INTO _manual_input (registration_id, finish_place, points, percent) VALUES
  ('manual_mugen_20260616', 1, 4750, 20),
  ('cmqgpat6h01br1284xxi9cjgl', 2, 2200, 15),
  ('cmqg5ybg100hv1284o8yt6y1w', 3, 3350, 11),
  ('cmqgjwq7g00yc1284qoz2mrpp', 4, 3200, 8),
  ('cmqghu6bn00vp1284qf5yy6v6', 5, 900, 6),
  ('cmqgk36k900yr1284d4r3f977', 6, 650, 4),
  ('cmqgn22w1017q1284ryr030xm', 7, 450, 3),
  ('cmqgm3pd8015k1284cvqhruzx', 8, 250, 0),
  ('cmqf1zw2c0015eck95b3wohvw', 9, 0, 0),
  ('cmqgjp9ng00xz1284gb8gntu4', 10, 1750, 0),
  ('cmqgqbush01dc128446cx3e6f', 11, 0, 0),
  ('cmqgblllf00ng1284yhgp3i2w', 12, 250, 0),
  ('cmqgkq7yl010b1284w6j4f5rr', 13, 0, 0),
  ('cmqgdkye600q41284oycs4446', 14, 250, 0),
  ('cmqgl97dj012x1284thpg6frz', 15, 250, 0),
  ('cmqgp3x6401b51284xboho3m4', 16, 0, 0),
  ('cmqgk1wrx00yl1284rswjergz', 17, 0, 0),
  ('cmqgh8igh00uu12847011qge9', 18, 0, 0),
  ('cmqghf1rx00v41284v0k1z2pd', 19, 0, 0),
  ('cmqgk4daj00yx1284ij5yfmgf', 20, 0, 0);

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM _manual_input mi
    JOIN "Registration" r ON r.id = mi.registration_id
    WHERE r."tournamentId" = (SELECT id FROM _target_tournament)
  ) <> 20 THEN
    RAISE EXCEPTION 'Not all 20 registrations were found for target tournament';
  END IF;
END $$;

UPDATE "Registration" r
SET
  "finishPlace" = mi.finish_place,
  "liveStatus" = 'ELIMINATED',
  status = 'ACTIVE',
  "updatedAt" = now()
FROM _manual_input mi
WHERE r.id = mi.registration_id
  AND r."tournamentId" = (SELECT id FROM _target_tournament);

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
  'manual_rating_20260616_' || lpad(mi.finish_place::text, 2, '0'),
  r."tournamentId",
  r."userId",
  mi.finish_place,
  mi.percent,
  mi.points,
  0,
  now(),
  now()
FROM _manual_input mi
JOIN "Registration" r ON r.id = mi.registration_id
WHERE r."tournamentId" = (SELECT id FROM _target_tournament);

UPDATE "User" u
SET
  "ratingPoints" = u."ratingPoints" + mi.points,
  "updatedAt" = now()
FROM _manual_input mi
JOIN "Registration" r ON r.id = mi.registration_id
WHERE u.id = r."userId"
  AND r."tournamentId" = (SELECT id FROM _target_tournament);

UPDATE "Tournament"
SET
  "entriesCount" = 20,
  status = 'FINISHED',
  "updatedAt" = now()
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

SELECT
  rr.place,
  u."displayName",
  u.username,
  rr.points,
  rr.knockouts
FROM "TournamentRatingResult" rr
JOIN "User" u ON u.id = rr."userId"
JOIN "Tournament" t ON t.id = rr."tournamentId"
WHERE t."startsAt" >= timestamp with time zone '2026-06-15 17:00:00+00'
  AND t."startsAt" <  timestamp with time zone '2026-06-16 17:00:00+00'
ORDER BY rr.place;
