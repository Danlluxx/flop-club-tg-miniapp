CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "TournamentStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'FINISHED');
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "photoUrl" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tournament" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL,
  "buyIn" INTEGER NOT NULL,
  "prizePool" INTEGER NOT NULL,
  "maxParticipants" INTEGER NOT NULL,
  "status" "TournamentStatus" NOT NULL DEFAULT 'OPEN',
  "allowCancellation" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Registration" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "status" "RegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE INDEX "Tournament_startsAt_idx" ON "Tournament"("startsAt");
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Registration_tournamentId_idx" ON "Registration"("tournamentId");
CREATE INDEX "Registration_userId_idx" ON "Registration"("userId");
CREATE UNIQUE INDEX "Registration_active_once_key" ON "Registration"("userId", "tournamentId") WHERE "status" = 'ACTIVE';
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
