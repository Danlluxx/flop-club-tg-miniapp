import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";

// FLOP CHIP LEADER: staff mark the biggest stack after break 1 and break 2. One mark per break;
// choosing another player replaces it. Every mark is worth 1000 rating points: a game event (so month rating,
// the day report and the channel results count it) plus the same amount on User.ratingPoints (all-time rating).
export const CHIP_LEADER_TITLE = "flop chip leader";
export const CHIP_LEADER_BREAKS = [1, 2] as const;
export const CHIP_LEADER_MARK_POINTS = 1000;
const eventKeyFor = (breakNumber: number) => `chip-leader-mark:${breakNumber}`;

// Takes back the points of the mark event for this break, if there is one.
async function revokeMarkPoints(tx: Prisma.TransactionClient, tournamentId: string, breakNumber: number) {
  const previous = await tx.tournamentGameEvent.findUnique({
    where: { tournamentId_eventKey: { tournamentId, eventKey: eventKeyFor(breakNumber) } },
    select: { id: true, userId: true, ratingPoints: true }
  });
  if (!previous) return;
  if (previous.userId) {
    await tx.user.update({ where: { id: previous.userId }, data: { ratingPoints: { decrement: previous.ratingPoints } } });
  }
  await tx.tournamentGameEvent.delete({ where: { id: previous.id } });
}

export function isChipLeaderTitle(title: string) {
  return title.trim().toLowerCase() === CHIP_LEADER_TITLE;
}

export function parseBreakNumber(value: unknown) {
  const number = Number(value);
  if (!CHIP_LEADER_BREAKS.includes(number as 1 | 2)) throw new AppError(400, "Перерыв может быть только 1 или 2", "INVALID_BREAK");
  return number;
}

async function loadTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, title: true } });
  if (!tournament) throw notFound("Tournament not found");
  if (!isChipLeaderTitle(tournament.title)) {
    throw new AppError(400, "Отметка чип-лидера есть только в FLOP CHIP LEADER", "CHIP_LEADER_NOT_ALLOWED");
  }
  return tournament;
}

export async function chipLeaderMarks(tournamentId: string) {
  const marks = await prisma.tournamentChipLeaderMark.findMany({
    where: { tournamentId },
    include: { registration: { include: { user: true } } },
    orderBy: { breakNumber: "asc" }
  });
  return marks.map((mark) => {
    const user = mark.registration.user;
    return {
      breakNumber: mark.breakNumber,
      registrationId: mark.registrationId,
      userId: mark.registration.userId,
      name: user.displayName || user.firstName || user.username || "Игрок",
      markedAt: mark.updatedAt
    };
  });
}

export async function setChipLeaderMark(tournamentId: string, breakNumber: number, registrationId: string) {
  await loadTournament(tournamentId);
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, tournamentId, status: "ACTIVE" },
    select: { id: true, liveStatus: true }
  });
  if (!registration) throw notFound("Registration not found");
  if (registration.liveStatus !== "IN_GAME") throw new AppError(409, "Игрок уже выбыл из турнира", "NOT_IN_GAME");
  const registrationUser = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId }, select: { userId: true } });
  await prisma.$transaction(async (tx) => {
    await revokeMarkPoints(tx, tournamentId, breakNumber);
    await tx.tournamentChipLeaderMark.upsert({
      where: { tournamentId_breakNumber: { tournamentId, breakNumber } },
      create: { tournamentId, breakNumber, registrationId },
      update: { registrationId }
    });
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        userId: registrationUser.userId,
        eventKey: eventKeyFor(breakNumber),
        type: "CHIP_LEADER_MARK",
        ratingPoints: CHIP_LEADER_MARK_POINTS,
        reason: `Чип-лидер после ${breakNumber}-го перерыва: ${CHIP_LEADER_MARK_POINTS} очков`
      }
    });
    await tx.user.update({ where: { id: registrationUser.userId }, data: { ratingPoints: { increment: CHIP_LEADER_MARK_POINTS } } });
  });
  return chipLeaderMarks(tournamentId);
}

export async function clearChipLeaderMark(tournamentId: string, breakNumber: number) {
  await loadTournament(tournamentId);
  await prisma.$transaction(async (tx) => {
    await revokeMarkPoints(tx, tournamentId, breakNumber);
    await tx.tournamentChipLeaderMark.deleteMany({ where: { tournamentId, breakNumber } });
  });
  return chipLeaderMarks(tournamentId);
}
