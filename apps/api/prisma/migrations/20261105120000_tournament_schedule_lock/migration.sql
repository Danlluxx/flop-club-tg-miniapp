-- Tournaments saved by an admin are no longer overwritten by the schedule sync.
ALTER TABLE "Tournament" ADD COLUMN "scheduleLocked" BOOLEAN NOT NULL DEFAULT false;
