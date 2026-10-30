ALTER TABLE "Registration"
ADD COLUMN "noShowPenaltyAppliedAt" TIMESTAMP(3),
ADD COLUMN "noShowPenaltyPoints" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Registration_no_show_pending_idx"
ON "Registration" ("tournamentId", "createdAt")
WHERE "status" = 'ACTIVE'
  AND "liveStatus" = 'IN_GAME'
  AND "checkedInAt" IS NULL
  AND "noShowPenaltyAppliedAt" IS NULL;

-- Do not apply the new penalty retroactively to no-shows from already elapsed late-registration windows.
UPDATE "Registration" AS r
SET
  "noShowPenaltyAppliedAt" = CURRENT_TIMESTAMP,
  "noShowPenaltyPoints" = 0
FROM "Tournament" AS t
WHERE r."tournamentId" = t.id
  AND r."status" = 'ACTIVE'
  AND r."liveStatus" = 'IN_GAME'
  AND r."checkedInAt" IS NULL
  AND r."noShowPenaltyAppliedAt" IS NULL
  AND COALESCE(t."lateRegistrationEndsAt", t."startsAt" + INTERVAL '3 hours') < CURRENT_TIMESTAMP;
