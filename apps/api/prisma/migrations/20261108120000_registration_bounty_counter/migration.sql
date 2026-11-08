-- Bounty becomes a plain per-registration counter: "who knocked out whom" is no longer recorded.
-- Existing tallies (recorded knockouts + manual corrections) are carried over; the old Knockout rows
-- and "bountyAdjustment" stay in place as history but are no longer read.
ALTER TABLE "Registration" ADD COLUMN "bounty" INTEGER NOT NULL DEFAULT 0;

UPDATE "Registration" r
SET "bounty" = GREATEST(0, r."bountyAdjustment" + (SELECT COUNT(*) FROM "Knockout" k WHERE k."killerRegistrationId" = r."id"))
WHERE r."bountyAdjustment" <> 0 OR EXISTS (SELECT 1 FROM "Knockout" k WHERE k."killerRegistrationId" = r."id");
