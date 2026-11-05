import express from "express";
import { RegistrationStatus, TournamentStatus } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { AppError } from "../utils/errors.js";

export const clockRouter = express.Router();

function requireClockToken(req: express.Request, _res: express.Response, next: express.NextFunction) {
  if (!config.CLOCK_API_TOKEN) {
    if (config.NODE_ENV === "production") {
      next(new AppError(503, "Clock API token is not configured", "CLOCK_TOKEN_NOT_CONFIGURED"));
      return;
    }

    next();
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== config.CLOCK_API_TOKEN) {
    next(new AppError(401, "Clock API token required", "CLOCK_TOKEN_REQUIRED"));
    return;
  }

  next();
}

// The club "day" runs from 08:00 to 08:00 Barnaul time, so tonight's tournament stays on the
// clock after midnight and the next day's one takes over at 08:00. Barnaul is UTC+7 without DST.
const BARNAUL_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const CLUB_DAY_START_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function currentTournamentWindow(now = Date.now()) {
  const shiftedLocal = now + BARNAUL_UTC_OFFSET_MS - CLUB_DAY_START_MS;
  const from = Math.floor(shiftedLocal / DAY_MS) * DAY_MS + CLUB_DAY_START_MS - BARNAUL_UTC_OFFSET_MS;
  return { from: new Date(from), to: new Date(from + DAY_MS) };
}

// A marked re-entry bumps entryNumber on the same row, a self-service one adds a row that carries
// the next number, so a player's entries are their highest entryNumber rather than a row count.
export function clockChipTotals(
  registrations: { userId: string; entryNumber: number; addOnCount: number }[],
  addOnChips: number
) {
  const entriesByUser = new Map<string, number>();
  let addOns = 0;
  for (const registration of registrations) {
    entriesByUser.set(registration.userId, Math.max(entriesByUser.get(registration.userId) ?? 0, registration.entryNumber));
    addOns += registration.addOnCount;
  }
  let entries = 0;
  for (const count of entriesByUser.values()) entries += count;
  return { entries, addOnTotal: addOns * addOnChips };
}

clockRouter.get("/participants", requireClockToken, async (_req, res, next) => {
  try {
    const window = currentTournamentWindow();
    const tournaments = await prisma.tournament.findMany({
      where: {
        // registration may already be closed while the tournament is being played
        status: { in: [TournamentStatus.OPEN, TournamentStatus.CLOSED] },
        startsAt: { gte: window.from, lt: window.to }
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        maxParticipants: true,
        addOnChips: true
      }
    });

    const now = Date.now();
    const tournament = tournaments
      .sort((left, right) => {
        const leftStarted = left.startsAt.getTime() <= now ? 0 : 1;
        const rightStarted = right.startsAt.getTime() <= now ? 0 : 1;
        if (leftStarted !== rightStarted) return leftStarted - rightStarted;
        if (leftStarted === 0) return right.startsAt.getTime() - left.startsAt.getTime();
        return left.startsAt.getTime() - right.startsAt.getTime();
      })[0];

    if (!tournament) {
      res.json({
        count: 0,
        entries: 0,
        bonusChips: 0,
        capacity: 50,
        tournamentId: null,
        tournamentTitle: null
      });
      return;
    }

    const count = await prisma.registration.count({
      where: {
        tournamentId: tournament.id,
        status: RegistrationStatus.ACTIVE,
        liveStatus: "IN_GAME",
        // players still waiting (not checked in by the admin) are not shown on the clock
        checkedInAt: { not: null }
      }
    });

    // Chips stay in play after a bust-out, so the clock divides all entries by the players left.
    const [registrations, bonus] = await Promise.all([
      prisma.registration.findMany({
        where: { tournamentId: tournament.id, status: RegistrationStatus.ACTIVE, checkedInAt: { not: null } },
        select: { userId: true, entryNumber: true, addOnCount: true }
      }),
      prisma.tournamentGameEvent.aggregate({
        where: { tournamentId: tournament.id, type: "STACK_BONUS", registration: { status: RegistrationStatus.ACTIVE, checkedInAt: { not: null } } },
        _sum: { chips: true }
      })
    ]);

    const { entries, addOnTotal } = clockChipTotals(registrations, tournament.addOnChips);

    res.json({
      count,
      entries,
      bonusChips: (bonus._sum.chips ?? 0) + addOnTotal,
      capacity: tournament.maxParticipants,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title
    });
  } catch (error) {
    next(error);
  }
});
