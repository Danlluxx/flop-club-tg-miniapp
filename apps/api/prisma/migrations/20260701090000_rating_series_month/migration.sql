ALTER TABLE "Tournament" ADD COLUMN "ratingSeriesMonth" TEXT;

CREATE INDEX "Tournament_ratingSeriesMonth_idx" ON "Tournament"("ratingSeriesMonth");

UPDATE "Tournament"
SET
  "ratingSeriesMonth" = '2026-07',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "startsAt" >= TIMESTAMPTZ '2026-06-29 17:00:00+00'
  AND "startsAt" < TIMESTAMPTZ '2026-06-30 17:00:00+00'
  AND status <> 'CANCELLED';
