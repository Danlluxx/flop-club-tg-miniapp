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

function currentTournamentWindow() {
  const now = Date.now();
  return {
    from: new Date(now - 8 * 60 * 60 * 1000),
    to: new Date(now + 18 * 60 * 60 * 1000)
  };
}

clockRouter.get("/participants", requireClockToken, async (_req, res, next) => {
  try {
    const window = currentTournamentWindow();
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: TournamentStatus.OPEN,
        startsAt: { gte: window.from, lte: window.to }
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        maxParticipants: true
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
        liveStatus: "IN_GAME"
      }
    });

    res.json({
      count,
      capacity: tournament.maxParticipants,
      tournamentId: tournament.id,
      tournamentTitle: tournament.title
    });
  } catch (error) {
    next(error);
  }
});
