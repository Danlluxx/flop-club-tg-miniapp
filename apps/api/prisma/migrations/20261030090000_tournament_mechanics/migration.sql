-- DropIndex
DROP INDEX "Knockout_eliminatedRegistrationId_key";

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "blindLevelIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mechanics" JSONB;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "issuedChips" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifeNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Knockout" ADD COLUMN     "lifeNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TournamentGameEvent" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT,
    "registrationId" TEXT,
    "actorId" TEXT,
    "eventKey" TEXT NOT NULL,
    "attemptKey" TEXT,
    "type" TEXT NOT NULL,
    "outcome" TEXT,
    "eliminationId" TEXT,
    "handId" TEXT,
    "bigBlind" INTEGER NOT NULL DEFAULT 0,
    "chips" INTEGER NOT NULL DEFAULT 0,
    "ratingPoints" INTEGER NOT NULL DEFAULT 0,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "reversesId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentGameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGameEvent_reversesId_key" ON "TournamentGameEvent"("reversesId");

-- CreateIndex
CREATE INDEX "TournamentGameEvent_tournamentId_userId_createdAt_idx" ON "TournamentGameEvent"("tournamentId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentGameEvent_registrationId_idx" ON "TournamentGameEvent"("registrationId");

-- CreateIndex
CREATE INDEX "TournamentGameEvent_actorId_idx" ON "TournamentGameEvent"("actorId");

-- CreateIndex
CREATE INDEX "TournamentGameEvent_userId_idx" ON "TournamentGameEvent"("userId");

-- CreateIndex
CREATE INDEX "TournamentGameEvent_eliminationId_idx" ON "TournamentGameEvent"("eliminationId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGameEvent_tournamentId_eventKey_key" ON "TournamentGameEvent"("tournamentId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGameEvent_tournamentId_attemptKey_key" ON "TournamentGameEvent"("tournamentId", "attemptKey");

-- CreateIndex
CREATE UNIQUE INDEX "Knockout_eliminatedRegistrationId_lifeNumber_key" ON "Knockout"("eliminatedRegistrationId", "lifeNumber");

-- AddForeignKey
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "TournamentGameEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defend the audit trail against accidental mutation by application code.
CREATE FUNCTION "protect_tournament_game_event"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TournamentGameEvent is append-only; write a compensating event';
END;
$$;
CREATE TRIGGER "TournamentGameEvent_append_only"
BEFORE UPDATE OR DELETE ON "TournamentGameEvent"
FOR EACH ROW EXECUTE FUNCTION "protect_tournament_game_event"();
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_lifeNumber_positive" CHECK ("lifeNumber" > 0);
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_bb_nonnegative" CHECK ("bigBlind" >= 0);
ALTER TABLE "TournamentGameEvent" ADD CONSTRAINT "TournamentGameEvent_eliminationId_fkey" FOREIGN KEY ("eliminationId") REFERENCES "TournamentGameEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
