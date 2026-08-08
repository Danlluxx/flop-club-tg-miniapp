BEGIN;

SELECT pg_advisory_xact_lock(hashtext('fix_20260807_rating_knockouts'));

CREATE TEMP TABLE _target_tournament AS
SELECT id, title, "startsAt", "ratingPool"
FROM "Tournament"
WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-07'
  AND status <> 'CANCELLED'
ORDER BY "startsAt" DESC
LIMIT 1;

DO $$
DECLARE
  tournament_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tournament_count FROM _target_tournament;
  IF tournament_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tournament on 2026-08-07 Barnaul date, found %', tournament_count;
  END IF;
END $$;

CREATE TEMP TABLE _active_registrations AS
SELECT
  registration.id AS registration_id,
  registration."userId" AS user_id,
  registration."finishPlace" AS old_finish_place,
  registration."createdAt" AS registered_at,
  user_record.username,
  user_record."displayName",
  user_record."firstName",
  user_record."lastName"
FROM "Registration" registration
JOIN "User" user_record ON user_record.id = registration."userId"
WHERE registration."tournamentId" = (SELECT id FROM _target_tournament)
  AND registration.status = 'ACTIVE';

CREATE TEMP TABLE _place_corrections (
  label TEXT NOT NULL,
  new_place INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _place_corrections (label, new_place, lookup_values) VALUES
  ('Vv', 26, ARRAY['Vv', 'ciganxV']),
  ('Xll', 25, ARRAY['Xll', 'XII', 'Xlll', 'HamudXIII']),
  ('Мария', 19, ARRAY['Мария', 'Maria', 'Mariya']);

CREATE TEMP TABLE _bonus_points (
  label TEXT NOT NULL,
  points INTEGER NOT NULL,
  lookup_values TEXT[] NOT NULL
);

INSERT INTO _bonus_points (label, points, lookup_values) VALUES
  ('Тимур', 500, ARRAY['Тимур', 'Timur']),
  ('sswwg', 250, ARRAY['sswwg']),
  ('Ilya', 500, ARRAY['Ilya', 'Илья']),
  ('Рита', 1500, ARRAY['Рита', 'Rita']),
  ('Арс', 1250, ARRAY['Арс', 'арс', 'sen_cho']),
  ('Niggroni', 500, ARRAY['Niggroni', 'bbspasha']),
  ('Artur', 500, ARRAY['Artur', 'Артур']),
  ('Baldejnyi', 1000, ARRAY['Baldejnyi', 'baldejnyi']),
  ('Пахан', 2000, ARRAY['Пахан', 'kaif_bank2']),
  ('Николай', 500, ARRAY['Николай', 'pogulyaev22']),
  ('Cloud', 750, ARRAY['Cloud', 'cloud', 'cloud6aby']),
  ('Диана', 1250, ARRAY['Диана', 'Diana']);

CREATE TEMP TABLE _resolved_place_corrections AS
SELECT
  correction.label,
  correction.new_place,
  registration.registration_id,
  registration.user_id,
  registration."displayName",
  registration.username
FROM _place_corrections correction
JOIN _active_registrations registration ON EXISTS (
  SELECT 1
  FROM unnest(correction.lookup_values) AS lookup(value)
  WHERE LOWER(REPLACE(COALESCE(registration.username, ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(COALESCE(registration."displayName", ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(COALESCE(registration."firstName", ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(TRIM(COALESCE(registration."firstName", '') || ' ' || COALESCE(registration."lastName", '')), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
);

DO $$
DECLARE
  missing_labels TEXT;
  ambiguous_labels TEXT;
BEGIN
  SELECT string_agg(correction.label, ', ' ORDER BY correction.label)
  INTO missing_labels
  FROM _place_corrections correction
  LEFT JOIN _resolved_place_corrections resolved ON resolved.label = correction.label
  WHERE resolved.label IS NULL;

  SELECT string_agg(label, ', ' ORDER BY label)
  INTO ambiguous_labels
  FROM (
    SELECT label
    FROM _resolved_place_corrections
    GROUP BY label
    HAVING COUNT(*) <> 1
  ) duplicated;

  IF missing_labels IS NOT NULL OR ambiguous_labels IS NOT NULL THEN
    RAISE EXCEPTION 'Place correction resolution failed. Missing: %, ambiguous: %',
      COALESCE(missing_labels, 'none'),
      COALESCE(ambiguous_labels, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _resolved_bonus_points AS
SELECT
  bonus.label,
  bonus.points,
  registration.registration_id,
  registration.user_id,
  registration."displayName",
  registration.username
FROM _bonus_points bonus
JOIN _active_registrations registration ON EXISTS (
  SELECT 1
  FROM unnest(bonus.lookup_values) AS lookup(value)
  WHERE LOWER(REPLACE(COALESCE(registration.username, ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(COALESCE(registration."displayName", ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(COALESCE(registration."firstName", ''), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
     OR LOWER(REPLACE(TRIM(COALESCE(registration."firstName", '') || ' ' || COALESCE(registration."lastName", '')), 'ё', 'е')) = LOWER(REPLACE(lookup.value, 'ё', 'е'))
);

DO $$
DECLARE
  missing_labels TEXT;
  ambiguous_labels TEXT;
BEGIN
  SELECT string_agg(bonus.label, ', ' ORDER BY bonus.label)
  INTO missing_labels
  FROM _bonus_points bonus
  LEFT JOIN _resolved_bonus_points resolved ON resolved.label = bonus.label
  WHERE resolved.label IS NULL;

  SELECT string_agg(label, ', ' ORDER BY label)
  INTO ambiguous_labels
  FROM (
    SELECT label
    FROM _resolved_bonus_points
    GROUP BY label
    HAVING COUNT(*) <> 1
  ) duplicated;

  IF missing_labels IS NOT NULL OR ambiguous_labels IS NOT NULL THEN
    RAISE EXCEPTION 'Bonus point resolution failed. Missing: %, ambiguous: %',
      COALESCE(missing_labels, 'none'),
      COALESCE(ambiguous_labels, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _reserved_places AS
SELECT new_place AS place FROM _resolved_place_corrections;

CREATE TEMP TABLE _available_places AS
SELECT generated_place AS place
FROM generate_series(1, (SELECT COUNT(*)::INTEGER FROM _active_registrations)) AS generated_place
WHERE generated_place NOT IN (SELECT place FROM _reserved_places);

CREATE TEMP TABLE _auto_placed_registrations AS
SELECT
  registration.registration_id,
  available.place AS new_place
FROM (
  SELECT
    active.registration_id,
    ROW_NUMBER() OVER (
      ORDER BY active.old_finish_place NULLS LAST, active.registered_at ASC, active.registration_id ASC
    ) AS row_number
  FROM _active_registrations active
  WHERE active.registration_id NOT IN (SELECT registration_id FROM _resolved_place_corrections)
) registration
JOIN (
  SELECT
    place,
    ROW_NUMBER() OVER (ORDER BY place) AS row_number
  FROM _available_places
) available ON available.row_number = registration.row_number;

CREATE TEMP TABLE _final_places AS
SELECT registration_id, new_place FROM _auto_placed_registrations
UNION ALL
SELECT registration_id, new_place FROM _resolved_place_corrections;

DO $$
DECLARE
  participants_count INTEGER;
  placed_count INTEGER;
  unique_place_count INTEGER;
  duplicated_places TEXT;
BEGIN
  SELECT COUNT(*) INTO participants_count FROM _active_registrations;
  SELECT COUNT(*) INTO placed_count FROM _final_places;
  SELECT COUNT(DISTINCT new_place) INTO unique_place_count FROM _final_places;
  SELECT string_agg(new_place::TEXT, ', ' ORDER BY new_place)
  INTO duplicated_places
  FROM (
    SELECT new_place
    FROM _final_places
    GROUP BY new_place
    HAVING COUNT(*) > 1
  ) duplicated;

  IF participants_count <> placed_count OR placed_count <> unique_place_count THEN
    RAISE EXCEPTION 'Finish places are invalid. Participants: %, placed: %, unique places: %, duplicated places: %',
      participants_count,
      placed_count,
      unique_place_count,
      COALESCE(duplicated_places, 'none');
  END IF;
END $$;

UPDATE "Registration" registration
SET
  "finishPlace" = places.new_place,
  "liveStatus" = 'ELIMINATED',
  "eliminatedAt" = COALESCE(registration."eliminatedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM _final_places places
WHERE registration.id = places.registration_id;

CREATE TEMP TABLE _old_rating_results AS
SELECT "userId" AS user_id, points, knockouts
FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

WITH old_totals AS (
  SELECT
    user_id,
    SUM(points)::INTEGER AS points,
    SUM(knockouts)::INTEGER AS knockouts
  FROM _old_rating_results
  GROUP BY user_id
)
UPDATE "User" user_record
SET
  "ratingPoints" = GREATEST(0, user_record."ratingPoints" - old_totals.points - old_totals.knockouts),
  knockouts = GREATEST(0, user_record.knockouts - old_totals.knockouts),
  "updatedAt" = CURRENT_TIMESTAMP
FROM old_totals
WHERE user_record.id = old_totals.user_id;

DELETE FROM "TournamentRatingResult"
WHERE "tournamentId" = (SELECT id FROM _target_tournament);

CREATE TEMP TABLE _rating_distribution (
  rating_places INTEGER NOT NULL,
  place INTEGER NOT NULL,
  percent INTEGER NOT NULL,
  PRIMARY KEY (rating_places, place)
);

INSERT INTO _rating_distribution (rating_places, place, percent) VALUES
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

CREATE TEMP TABLE _rating_meta AS
SELECT
  COUNT(*)::INTEGER AS participants_count,
  LEAST(10, GREATEST(1, CEIL(COUNT(*) * 0.3)::INTEGER)) AS rating_places,
  (SELECT "ratingPool" FROM _target_tournament)::INTEGER AS rating_pool
FROM _active_registrations;

CREATE TEMP TABLE _new_rating_results AS
SELECT
  active.registration_id,
  active.user_id,
  places.new_place AS place,
  COALESCE(distribution.percent, 0)::INTEGER AS percent,
  ROUND(COALESCE(meta.rating_pool * distribution.percent / 100.0, 0))::INTEGER AS points,
  COALESCE(bonus.points, 0)::INTEGER AS knockouts
FROM _active_registrations active
JOIN _final_places places ON places.registration_id = active.registration_id
CROSS JOIN _rating_meta meta
LEFT JOIN _rating_distribution distribution
  ON distribution.rating_places = meta.rating_places
 AND distribution.place = places.new_place
LEFT JOIN _resolved_bonus_points bonus ON bonus.registration_id = active.registration_id;

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
  'manual_rating_20260807_' || LPAD(result.place::TEXT, 2, '0'),
  (SELECT id FROM _target_tournament),
  result.user_id,
  result.place,
  result.percent,
  result.points,
  result.knockouts,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _new_rating_results result
ORDER BY result.place;

WITH new_totals AS (
  SELECT
    user_id,
    SUM(points)::INTEGER AS points,
    SUM(knockouts)::INTEGER AS knockouts
  FROM _new_rating_results
  GROUP BY user_id
)
UPDATE "User" user_record
SET
  "ratingPoints" = user_record."ratingPoints" + new_totals.points + new_totals.knockouts,
  knockouts = user_record.knockouts + new_totals.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM new_totals
WHERE user_record.id = new_totals.user_id;

UPDATE "Tournament"
SET
  "entriesCount" = (SELECT participants_count FROM _rating_meta),
  status = 'FINISHED',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = (SELECT id FROM _target_tournament);

COMMIT;

WITH target AS (
  SELECT id
  FROM "Tournament"
  WHERE ("startsAt" AT TIME ZONE 'Asia/Barnaul')::date = DATE '2026-08-07'
    AND status <> 'CANCELLED'
  ORDER BY "startsAt" DESC
  LIMIT 1
)
SELECT
  registration."finishPlace" AS place,
  user_record."displayName",
  user_record.username,
  COALESCE(result.points, 0) AS place_points,
  COALESCE(result.knockouts, 0) AS knockout_points,
  COALESCE(result.points, 0) + COALESCE(result.knockouts, 0) AS total_points,
  user_record."ratingPoints" AS global_rating
FROM "Registration" registration
JOIN "User" user_record ON user_record.id = registration."userId"
LEFT JOIN "TournamentRatingResult" result
  ON result."tournamentId" = registration."tournamentId"
 AND result."userId" = registration."userId"
JOIN target ON target.id = registration."tournamentId"
WHERE registration.status = 'ACTIVE'
ORDER BY registration."finishPlace" NULLS LAST, registration."createdAt" ASC;

SELECT 'Ксюша: сэндвич — не числовые очки, в рейтинг не добавлялось' AS note;
