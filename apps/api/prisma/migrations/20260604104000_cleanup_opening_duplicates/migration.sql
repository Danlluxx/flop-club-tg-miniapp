INSERT INTO "DeletedScheduledTournament" ("dateKey", "tournamentId", "title")
VALUES ('2026-06-04', '2026-06-04-flop-phoenix', 'Flop Phoenix')
ON CONFLICT ("dateKey") DO UPDATE SET
  "tournamentId" = EXCLUDED."tournamentId",
  "title" = EXCLUDED."title",
  "deletedAt" = CURRENT_TIMESTAMP;

DELETE FROM "Tournament"
WHERE "startsAt" >= '2026-06-03 17:00:00+00'
  AND "startsAt" < '2026-06-04 17:00:00+00';

UPDATE "Tournament"
SET "id" = '2026-06-05-flop-grand-openning'
WHERE "id" = '2026-06-05-flop-grand-opening'
  AND NOT EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  );

UPDATE "Tournament"
SET "id" = '2026-06-05-flop-grand-openning'
WHERE "id" = '2026-06-05-flop-prime-event'
  AND NOT EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  );

UPDATE "Tournament"
SET "id" = '2026-06-05-flop-grand-openning'
WHERE "id" = (
    SELECT "id"
    FROM "Tournament"
    WHERE "startsAt" >= '2026-06-04 17:00:00+00'
      AND "startsAt" < '2026-06-05 17:00:00+00'
    ORDER BY "createdAt" ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  );

UPDATE "Registration"
SET "tournamentId" = '2026-06-05-flop-grand-openning'
WHERE EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  )
  AND "tournamentId" IN (
    SELECT "id"
    FROM "Tournament"
    WHERE "startsAt" >= '2026-06-04 17:00:00+00'
      AND "startsAt" < '2026-06-05 17:00:00+00'
      AND "id" <> '2026-06-05-flop-grand-openning'
  );

UPDATE "Knockout"
SET "tournamentId" = '2026-06-05-flop-grand-openning'
WHERE EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  )
  AND "tournamentId" IN (
    SELECT "id"
    FROM "Tournament"
    WHERE "startsAt" >= '2026-06-04 17:00:00+00'
      AND "startsAt" < '2026-06-05 17:00:00+00'
      AND "id" <> '2026-06-05-flop-grand-openning'
  );

UPDATE "TournamentRatingResult"
SET "tournamentId" = '2026-06-05-flop-grand-openning'
WHERE EXISTS (
    SELECT 1 FROM "Tournament" WHERE "id" = '2026-06-05-flop-grand-openning'
  )
  AND "tournamentId" IN (
    SELECT "id"
    FROM "Tournament"
    WHERE "startsAt" >= '2026-06-04 17:00:00+00'
      AND "startsAt" < '2026-06-05 17:00:00+00'
      AND "id" <> '2026-06-05-flop-grand-openning'
  );

DELETE FROM "Tournament"
WHERE "startsAt" >= '2026-06-04 17:00:00+00'
  AND "startsAt" < '2026-06-05 17:00:00+00'
  AND "id" <> '2026-06-05-flop-grand-openning';

UPDATE "Tournament"
SET
  "title" = 'FLOP GRAND OPENNING',
  "description" = 'Открытие FLOP CLUB: бесплатный вход, фуршет, атмосфера и первый турнир в истории клуба.',
  "startsAt" = '2026-06-05 12:00:00+00',
  "lateRegistrationEndsAt" = '2026-06-05 15:00:00+00',
  "buyIn" = 0,
  "reEntry" = 1000,
  "prizePool" = 0,
  "ratingPool" = 15000,
  "profile" = 'DEEP_SPECIAL',
  "addOnEnabled" = true,
  "addOnPrice" = 1000,
  "maxParticipants" = 50,
  "status" = 'OPEN',
  "updatedAt" = now()
WHERE "id" = '2026-06-05-flop-grand-openning';
