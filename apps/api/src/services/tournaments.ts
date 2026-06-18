import { Prisma, RegistrationStatus, TournamentProfile, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { AppError, notFound } from "../utils/errors.js";

export const TABLES_COUNT = 5;
export const SEATS_PER_TABLE = 10;
export const TOURNAMENT_MAX_PARTICIPANTS = TABLES_COUNT * SEATS_PER_TABLE;

export const tournamentInclude = {
  _count: { select: { registrations: { where: { status: RegistrationStatus.ACTIVE } } } }
} satisfies Prisma.TournamentInclude;

export async function getTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: tournamentInclude });
  if (!tournament) throw notFound("Tournament");
  const activeSeatsCount = await prisma.registration.count({
    where: { tournamentId: id, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME" }
  });
  return { ...tournament, activeSeatsCount };
}

export async function registerForTournament(userId: string, tournamentId: string) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: tournamentInclude
    });
    if (!tournament) throw notFound("Tournament");
    if (tournament.status !== TournamentStatus.OPEN) {
      throw new AppError(409, "Registration is closed", "REGISTRATION_CLOSED");
    }
    if (!isLateRegistrationOpen(tournament)) {
      throw new AppError(409, "Late registration is closed", "LATE_REGISTRATION_CLOSED");
    }

    const activeCount = await tx.registration.count({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME" }
    });
    const seatLimit = Math.min(tournament.maxParticipants, TOURNAMENT_MAX_PARTICIPANTS);
    if (activeCount >= seatLimit) {
      throw new AppError(409, "Tournament is full", "TOURNAMENT_FULL");
    }

    const existing = await tx.registration.findFirst({
      where: { userId, tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME" }
    });
    if (existing) throw new AppError(409, "Already registered", "ALREADY_REGISTERED");

    const previousActiveEntries = await tx.registration.count({
      where: { userId, tournamentId, status: RegistrationStatus.ACTIVE }
    });
    if (previousActiveEntries > 0) {
      assertReEntryAllowed(tournament.profile, previousActiveEntries);
    }

    const registration = await tx.registration.create({
      data: {
        userId,
        tournamentId,
        entryNumber: previousActiveEntries + 1
      }
    });
    console.log(
      `[registration:create] user=${userId} tournament=${tournamentId} seat=pending entry=${registration.entryNumber}`
    );
    return registration;
  });
}

export async function assignNextAvailableSeat(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  maxParticipants: number,
  registrationId?: string
) {
  const seatLimit = Math.min(maxParticipants, TOURNAMENT_MAX_PARTICIPANTS);
  const occupiedSeats = await tx.registration.findMany({
    where: {
      tournamentId,
      ...(registrationId ? { id: { not: registrationId } } : {}),
      status: RegistrationStatus.ACTIVE,
      liveStatus: "IN_GAME",
      tableNumber: { not: null },
      seatNumber: { not: null }
    },
    select: { tableNumber: true, seatNumber: true }
  });
  const occupied = new Set(occupiedSeats.map((seat) => `${seat.tableNumber}:${seat.seatNumber}`));

  for (let place = 0; place < seatLimit; place += 1) {
    const tableNumber = Math.floor(place / SEATS_PER_TABLE) + 1;
    const seatNumber = (place % SEATS_PER_TABLE) + 1;
    if (!occupied.has(`${tableNumber}:${seatNumber}`)) return { tableNumber, seatNumber };
  }

  throw new AppError(409, "Tournament is full", "TOURNAMENT_FULL");
}

export async function cancelRegistration(userId: string, tournamentId: string, isAdmin = false) {
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw notFound("Tournament");
    if (!isAdmin && tournament.status !== TournamentStatus.OPEN && !tournament.allowCancellation && !config.ALLOW_CANCEL_AFTER_CLOSE) {
      throw new AppError(409, "Cancellation is disabled after registration closes", "CANCELLATION_DISABLED");
    }

    const registration = await tx.registration.findFirst({
      where: { userId, tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME" }
    });
    if (!registration) throw notFound("Registration");

    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: RegistrationStatus.CANCELLED, tableNumber: null, seatNumber: null }
    });
    console.log(`[registration:cancel] user=${userId} tournament=${tournamentId}`);
    return updated;
  });
}

function isLateRegistrationOpen(tournament: { startsAt: Date; lateRegistrationEndsAt: Date | null }) {
  const now = new Date();
  const lateRegistrationEndsAt = tournament.lateRegistrationEndsAt ?? new Date(tournament.startsAt.getTime() + 3 * 60 * 60 * 1000);
  return now <= lateRegistrationEndsAt;
}

function assertReEntryAllowed(profile: TournamentProfile, previousActiveEntries: number) {
  if (profile === TournamentProfile.FREEZE) {
    throw new AppError(409, "Re-entry is disabled for this tournament", "RE_ENTRY_DISABLED");
  }
  if (profile === TournamentProfile.PHOENIX && previousActiveEntries >= 2) {
    throw new AppError(409, "Phoenix allows only one re-entry", "RE_ENTRY_LIMIT_REACHED");
  }
}
