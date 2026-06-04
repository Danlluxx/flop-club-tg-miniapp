ALTER TABLE "Registration"
ADD COLUMN "tableNumber" INTEGER,
ADD COLUMN "seatNumber" INTEGER;

UPDATE "Tournament"
SET "maxParticipants" = 50
WHERE "maxParticipants" > 50;

CREATE UNIQUE INDEX "Registration_active_seat_once_key"
ON "Registration"("tournamentId", "tableNumber", "seatNumber")
WHERE "status" = 'ACTIVE' AND "tableNumber" IS NOT NULL AND "seatNumber" IS NOT NULL;

CREATE INDEX "Registration_tournamentId_tableNumber_seatNumber_idx"
ON "Registration"("tournamentId", "tableNumber", "seatNumber");
