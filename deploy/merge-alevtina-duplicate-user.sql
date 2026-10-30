BEGIN;

SELECT pg_advisory_xact_lock(hashtext('merge-alevtina-duplicate-user-v2'));

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
  email,
  "createdAt"
FROM "User"
WHERE LOWER(REPLACE(COALESCE("displayName", ''), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(REPLACE(COALESCE("firstName", ''), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(REPLACE(TRIM(CONCAT(COALESCE("firstName", ''), ' ', COALESCE("lastName", ''))), 'ё', 'е')) IN ('алевтина', 'aлевтина', 'alevtina')
   OR LOWER(COALESCE(username, '')) IN ('alevtina', 'алевтина', 'alshpr');

CREATE TEMP TABLE _primary_user AS
SELECT *
FROM _alevtina_candidates
ORDER BY
  CASE WHEN "photoUrl" IS NULL THEN 1 ELSE 0 END,
  "ratingPoints" DESC,
  "createdAt" ASC
LIMIT 1;

CREATE TEMP TABLE _duplicate_users AS
SELECT *
FROM _alevtina_candidates
WHERE id <> (SELECT id FROM _primary_user);

DO $$
DECLARE
  v_primary_count INTEGER;
  v_duplicate_count INTEGER;
  v_candidates TEXT;
BEGIN
  SELECT COUNT(*) INTO v_primary_count FROM _primary_user;
  SELECT COUNT(*) INTO v_duplicate_count FROM _duplicate_users;

  SELECT STRING_AGG(
    COALESCE("displayName", "firstName", username, "telegramId")
      || ' / id=' || id
      || ' / @' || COALESCE(username, '')
      || ' / tg=' || "telegramId"
      || ' / photo=' || CASE WHEN "photoUrl" IS NULL THEN 'no' ELSE 'yes' END
      || ' / rating=' || "ratingPoints"::TEXT,
    E'\n'
    ORDER BY CASE WHEN "photoUrl" IS NULL THEN 1 ELSE 0 END, "ratingPoints" DESC, "createdAt" ASC
  )
  INTO v_candidates
  FROM _alevtina_candidates;

  IF v_primary_count <> 1 OR v_duplicate_count < 1 THEN
    RAISE EXCEPTION 'Could not resolve Alevtina merge safely. Primary count: %, duplicate count: %. Candidates:%',
      v_primary_count,
      v_duplicate_count,
      E'\n' || COALESCE(v_candidates, 'none');
  END IF;
END $$;

CREATE TEMP TABLE _duplicate_totals AS
SELECT
  COALESCE(SUM("ratingPoints"), 0)::INTEGER AS rating_points,
  COALESCE(SUM(knockouts), 0)::INTEGER AS knockouts
FROM _duplicate_users;

CREATE TEMP TABLE _merge_users AS
SELECT id FROM _primary_user
UNION
SELECT id FROM _duplicate_users;

CREATE TEMP TABLE _rating_result_totals AS
SELECT
  rating_result."tournamentId",
  COALESCE(SUM(rating_result.points), 0)::INTEGER AS points,
  COALESCE(SUM(rating_result.knockouts), 0)::INTEGER AS knockouts
FROM "TournamentRatingResult" rating_result
JOIN _merge_users merge_user ON merge_user.id = rating_result."userId"
GROUP BY rating_result."tournamentId";

CREATE TEMP TABLE _rating_result_keepers AS
SELECT DISTINCT ON (rating_result."tournamentId")
  rating_result.id,
  rating_result."tournamentId"
FROM "TournamentRatingResult" rating_result
JOIN _merge_users merge_user ON merge_user.id = rating_result."userId"
ORDER BY
  rating_result."tournamentId",
  CASE WHEN rating_result."userId" = (SELECT id FROM _primary_user) THEN 0 ELSE 1 END,
  rating_result.place ASC,
  rating_result."createdAt" ASC;

UPDATE "TournamentRatingResult" rating_result
SET
  "userId" = (SELECT id FROM _primary_user),
  points = totals.points,
  knockouts = totals.knockouts,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _rating_result_keepers keeper
JOIN _rating_result_totals totals ON totals."tournamentId" = keeper."tournamentId"
WHERE rating_result.id = keeper.id;

DELETE FROM "TournamentRatingResult" rating_result
USING _merge_users merge_user
WHERE rating_result."userId" = merge_user.id
  AND rating_result.id NOT IN (SELECT id FROM _rating_result_keepers);

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
JOIN _duplicate_users duplicate_user ON duplicate_user.id = duplicate_registration."userId"
JOIN "Registration" primary_registration
  ON primary_registration."tournamentId" = duplicate_registration."tournamentId"
 AND primary_registration."userId" = (SELECT id FROM _primary_user);

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

CREATE TEMP TABLE _duplicate_registration_keepers AS
SELECT DISTINCT ON (registration."tournamentId")
  registration.id,
  registration."tournamentId"
FROM "Registration" registration
JOIN _duplicate_users duplicate_user ON duplicate_user.id = registration."userId"
ORDER BY
  registration."tournamentId",
  CASE WHEN registration.status::TEXT = 'ACTIVE' THEN 0 ELSE 1 END,
  CASE WHEN registration."checkedInAt" IS NULL THEN 1 ELSE 0 END,
  registration."createdAt" ASC;

CREATE TEMP TABLE _extra_duplicate_registrations AS
SELECT registration.id AS extra_registration_id, keeper.id AS keeper_registration_id
FROM "Registration" registration
JOIN _duplicate_users duplicate_user ON duplicate_user.id = registration."userId"
JOIN _duplicate_registration_keepers keeper ON keeper."tournamentId" = registration."tournamentId"
WHERE registration.id <> keeper.id;

UPDATE "Registration" keeper_registration
SET
  "checkedInAt" = COALESCE(keeper_registration."checkedInAt", extra_registration."checkedInAt"),
  "tableNumber" = COALESCE(keeper_registration."tableNumber", extra_registration."tableNumber"),
  "seatNumber" = COALESCE(keeper_registration."seatNumber", extra_registration."seatNumber"),
  "finishPlace" = COALESCE(keeper_registration."finishPlace", extra_registration."finishPlace"),
  "entryNumber" = GREATEST(keeper_registration."entryNumber", extra_registration."entryNumber"),
  "addOnCount" = GREATEST(keeper_registration."addOnCount", extra_registration."addOnCount"),
  "eliminatedAt" = COALESCE(keeper_registration."eliminatedAt", extra_registration."eliminatedAt"),
  "liveStatus" = CASE
    WHEN keeper_registration."liveStatus"::TEXT = 'ELIMINATED' OR extra_registration."liveStatus"::TEXT = 'ELIMINATED'
      THEN 'ELIMINATED'::"ParticipantLiveStatus"
    ELSE keeper_registration."liveStatus"
  END,
  status = CASE
    WHEN keeper_registration.status::TEXT = 'ACTIVE' OR extra_registration.status::TEXT = 'ACTIVE'
      THEN 'ACTIVE'::"RegistrationStatus"
    ELSE keeper_registration.status
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _extra_duplicate_registrations extra
JOIN "Registration" extra_registration ON extra_registration.id = extra.extra_registration_id
WHERE keeper_registration.id = extra.keeper_registration_id;

UPDATE "Knockout" knockout_record
SET
  "killerRegistrationId" = extra.keeper_registration_id,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _extra_duplicate_registrations extra
WHERE knockout_record."killerRegistrationId" = extra.extra_registration_id;

DELETE FROM "Knockout" duplicate_knockout
USING _extra_duplicate_registrations extra
WHERE duplicate_knockout."eliminatedRegistrationId" = extra.extra_registration_id
  AND EXISTS (
    SELECT 1
    FROM "Knockout" keeper_knockout
    WHERE keeper_knockout."eliminatedRegistrationId" = extra.keeper_registration_id
  );

UPDATE "Knockout" knockout_record
SET
  "eliminatedRegistrationId" = extra.keeper_registration_id,
  "updatedAt" = CURRENT_TIMESTAMP
FROM _extra_duplicate_registrations extra
WHERE knockout_record."eliminatedRegistrationId" = extra.extra_registration_id;

DELETE FROM "Registration" registration
USING _extra_duplicate_registrations extra
WHERE registration.id = extra.extra_registration_id;

UPDATE "Registration" registration
SET
  "userId" = (SELECT id FROM _primary_user),
  "updatedAt" = CURRENT_TIMESTAMP
FROM _duplicate_users duplicate_user
WHERE registration."userId" = duplicate_user.id;

UPDATE "User" primary_user
SET
  "ratingPoints" = primary_user."ratingPoints" + (SELECT rating_points FROM _duplicate_totals),
  knockouts = primary_user.knockouts + (SELECT knockouts FROM _duplicate_totals),
  email = COALESCE(primary_user.email, (SELECT email FROM _duplicate_users WHERE email IS NOT NULL LIMIT 1)),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE primary_user.id = (SELECT id FROM _primary_user);

DELETE FROM "User" user_record
USING _duplicate_users duplicate_user
WHERE user_record.id = duplicate_user.id;

DO $$
DECLARE
  v_remaining_users INTEGER;
  v_remaining_registrations INTEGER;
  v_remaining_rating_results INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining_users
  FROM "User" user_record
  JOIN _duplicate_users duplicate_user ON duplicate_user.id = user_record.id;

  SELECT COUNT(*) INTO v_remaining_registrations
  FROM "Registration" registration
  JOIN _duplicate_users duplicate_user ON duplicate_user.id = registration."userId";

  SELECT COUNT(*) INTO v_remaining_rating_results
  FROM "TournamentRatingResult" rating_result
  JOIN _duplicate_users duplicate_user ON duplicate_user.id = rating_result."userId";

  IF v_remaining_users <> 0 OR v_remaining_registrations <> 0 OR v_remaining_rating_results <> 0 THEN
    RAISE EXCEPTION 'Duplicate Alevtina rows still exist. users=%, registrations=%, ratingResults=%',
      v_remaining_users,
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
