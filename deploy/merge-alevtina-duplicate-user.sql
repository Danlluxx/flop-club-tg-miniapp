BEGIN;

SELECT pg_advisory_xact_lock(hashtext('merge-alevtina-duplicate-user-v1'));

CREATE TEMP TABLE _alevtina_candidates AS
SELECT
  id,
  "telegramId",
  username,
  "displayName",
  "firstName",
  "lastName",
  "photoUrl",
  "ratingPoints",
  knockouts,
  "createdAt"
FROM "User"
WHERE LOWER(REPLACE(COALESCE("displayName", ''), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(REPLACE(COALESCE("firstName", ''), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(REPLACE(TRIM(CONCAT(COALESCE("firstName", ''), ' ', COALESCE("lastName", ''))), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(COALESCE(username, '')) IN ('alevtina', 'алевтина');

CREATE TEMP TABLE _primary_user AS
SELECT *
FROM _alevtina_candidates
WHERE "photoUrl" IS NOT NULL
ORDER BY "ratingPoints" DESC, "createdAt" ASC
LIMIT 1;

CREATE TEMP TABLE _duplicate_user AS
SELECT duplicate_candidate.*
FROM _alevtina_candidates duplicate_candidate
WHERE duplicate_candidate."photoUrl" IS NULL
  AND duplicate_candidate."ratingPoints" = 600
  AND duplicate_candidate.id <> (SELECT id FROM _primary_user)
ORDER BY duplicate_candidate."createdAt" ASC
LIMIT 1;

DO $$
DECLARE
  v_primary_count INTEGER;
  v_duplicate_count INTEGER;
  v_candidates TEXT;
BEGIN
  SELECT COUNT(*) INTO v_primary_count FROM _primary_user;
  SELECT COUNT(*) INTO v_duplicate_count FROM _duplicate_user;

  SELECT STRING_AGG(
    COALESCE("displayName", "firstName", username, "telegramId")
      || ' / id=' || id
      || ' / @' || COALESCE(username, '')
      || ' / tg=' || "telegramId"
      || ' / photo=' || CASE WHEN "photoUrl" IS NULL THEN 'no' ELSE 'yes' END
      || ' / rating=' || "ratingPoints"::TEXT,
    E'\n'
    ORDER BY "ratingPoints" DESC, "createdAt" ASC
  )
  INTO v_candidates
  FROM _alevtina_candidates;

  IF v_primary_count <> 1 OR v_duplicate_count <> 1 THEN
    RAISE EXCEPTION 'Could not resolve Alevtina merge safely. Primary count: %, duplicate count: %. Candidates:%',
      v_primary_count,
      v_duplicate_count,
      E'\n' || COALESCE(v_candidates, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _conflicting_rating_results AS
SELECT
  duplicate_result.id AS duplicate_result_id,
  primary_result.id AS primary_result_id,
  duplicate_result.points AS duplicate_points,
  duplicate_result.knockouts AS duplicate_knockouts
FROM "TournamentRatingResult" duplicate_result
JOIN "TournamentRatingResult" primary_result
  ON primary_result."tournamentId" = duplicate_result."tournamentId"
 AND primary_result."userId" = (SELECT id FROM _primary_user)
WHERE duplicate_result."userId" = (SELECT id FROM _duplicate_user);

UPDATE "TournamentRatingResult" primary_result
SET
  points = primary_result.points + conflict.duplicate_points,
  knockouts = primary_result.knockouts + conflict.duplicate_knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _conflicting_rating_results conflict
WHERE primary_result.id = conflict.primary_result_id;

DELETE FROM "TournamentRatingResult" duplicate_result
USING _conflicting_rating_results conflict
WHERE duplicate_result.id = conflict.duplicate_result_id;

UPDATE "TournamentRatingResult"
SET
  "userId" = (SELECT id FROM _primary_user),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = (SELECT id FROM _duplicate_user);

CREATE TEMP TABLE _conflicting_registrations AS
SELECT
  duplicate_registration.id AS duplicate_registration_id,
  primary_registration.id AS primary_registration_id,
  duplicate_registration."checkedInAt" AS duplicate_checked_in_at,
  duplicate_registration."tableNumber" AS duplicate_table_number,
  duplicate_registration."seatNumber" AS duplicate_seat_number,
  duplicate_registration."finishPlace" AS duplicate_finish_place,
  duplicate_registration."entryNumber" AS duplicate_entry_number,
  duplicate_registration."addOnCount" AS duplicate_add_on_count,
  duplicate_registration."eliminatedAt" AS duplicate_eliminated_at,
  duplicate_registration."liveStatus" AS duplicate_live_status,
  duplicate_registration.status AS duplicate_status
FROM "Registration" duplicate_registration
JOIN "Registration" primary_registration
  ON primary_registration."tournamentId" = duplicate_registration."tournamentId"
 AND primary_registration."userId" = (SELECT id FROM _primary_user)
WHERE duplicate_registration."userId" = (SELECT id FROM _duplicate_user);

UPDATE "Registration" primary_registration
SET
  "checkedInAt" = COALESCE(primary_registration."checkedInAt", conflict.duplicate_checked_in_at),
  "tableNumber" = COALESCE(primary_registration."tableNumber", conflict.duplicate_table_number),
  "seatNumber" = COALESCE(primary_registration."seatNumber", conflict.duplicate_seat_number),
  "finishPlace" = COALESCE(primary_registration."finishPlace", conflict.duplicate_finish_place),
  "entryNumber" = GREATEST(primary_registration."entryNumber", conflict.duplicate_entry_number),
  "addOnCount" = GREATEST(primary_registration."addOnCount", conflict.duplicate_add_on_count),
  "eliminatedAt" = COALESCE(primary_registration."eliminatedAt", conflict.duplicate_eliminated_at),
  "liveStatus" = CASE
    WHEN primary_registration."liveStatus"::TEXT = 'ELIMINATED' OR conflict.duplicate_live_status::TEXT = 'ELIMINATED'
      THEN 'ELIMINATED'::"ParticipantLiveStatus"
    ELSE primary_registration."liveStatus"
  END,
  status = CASE
    WHEN primary_registration.status::TEXT = 'ACTIVE' OR conflict.duplicate_status::TEXT = 'ACTIVE'
      THEN 'ACTIVE'::"RegistrationStatus"
    ELSE primary_registration.status
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _conflicting_registrations conflict
WHERE primary_registration.id = conflict.primary_registration_id;

UPDATE "Knockout" knockout_record
SET
  "killerRegistrationId" = conflict.primary_registration_id,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _conflicting_registrations conflict
WHERE knockout_record."killerRegistrationId" = conflict.duplicate_registration_id;

DELETE FROM "Knockout" duplicate_knockout
USING _conflicting_registrations conflict
WHERE duplicate_knockout."eliminatedRegistrationId" = conflict.duplicate_registration_id
  AND EXISTS (
    SELECT 1
    FROM "Knockout" primary_knockout
    WHERE primary_knockout."eliminatedRegistrationId" = conflict.primary_registration_id
  );

UPDATE "Knockout" knockout_record
SET
  "eliminatedRegistrationId" = conflict.primary_registration_id,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _conflicting_registrations conflict
WHERE knockout_record."eliminatedRegistrationId" = conflict.duplicate_registration_id;

DELETE FROM "Registration" duplicate_registration
USING _conflicting_registrations conflict
WHERE duplicate_registration.id = conflict.duplicate_registration_id;

UPDATE "Registration"
SET
  "userId" = (SELECT id FROM _primary_user),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = (SELECT id FROM _duplicate_user);

UPDATE "User" primary_user
SET
  "ratingPoints" = primary_user."ratingPoints" + (SELECT "ratingPoints" FROM _duplicate_user),
  knockouts = primary_user.knockouts + (SELECT knockouts FROM _duplicate_user),
  email = COALESCE(primary_user.email, (SELECT email FROM "User" WHERE id = (SELECT id FROM _duplicate_user))),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE primary_user.id = (SELECT id FROM _primary_user);

DELETE FROM "User"
WHERE id = (SELECT id FROM _duplicate_user);

DO $$
DECLARE
  v_duplicate_user_id TEXT;
  v_remaining_registrations INTEGER;
  v_remaining_rating_results INTEGER;
BEGIN
  SELECT id INTO v_duplicate_user_id FROM _duplicate_user;

  SELECT COUNT(*) INTO v_remaining_registrations
  FROM "Registration"
  WHERE "userId" = v_duplicate_user_id;

  SELECT COUNT(*) INTO v_remaining_rating_results
  FROM "TournamentRatingResult"
  WHERE "userId" = v_duplicate_user_id;

  IF v_remaining_registrations <> 0 OR v_remaining_rating_results <> 0 THEN
    RAISE EXCEPTION 'Duplicate user still has linked rows. registrations=%, ratingResults=%',
      v_remaining_registrations,
      v_remaining_rating_results;
  END IF;
END $$;

COMMIT;

SELECT
  user_record.id,
  user_record."telegramId",
  user_record.username,
  user_record."displayName",
  CASE WHEN user_record."photoUrl" IS NULL THEN 'no' ELSE 'yes' END AS "hasPhoto",
  user_record."ratingPoints",
  user_record.knockouts
FROM "User" user_record
WHERE user_record.id = (SELECT id FROM _primary_user);
