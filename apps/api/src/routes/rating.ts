import express from "express";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getRatingAwards, RATING_DISTRIBUTIONS, RATING_POOLS } from "../services/rating.js";

export const ratingRouter = express.Router();

type RatingScope = "global" | "season";
type RatedUser = User & { rank: number; ratingPoints: number; knockouts: number };

function parseLimit(value: unknown) {
  const requestedLimit = Number(value ?? 50);
  return Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
}

function parseRatingScope(value: unknown): RatingScope {
  return value === "season" ? "season" : "global";
}

function parseMonthRange(value: unknown) {
  const month = typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { month, start, end };
}

function searchWhere(search: string): Prisma.UserWhereInput | undefined {
  if (!search) return undefined;

  return {
    OR: [
      { displayName: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { telegramId: { contains: search } }
    ]
  };
}

function rankUsers(users: Array<User & { ratingPoints: number; knockouts: number }>): RatedUser[] {
  return users
    .sort((a, b) => b.ratingPoints - a.ratingPoints || b.knockouts - a.knockouts || a.createdAt.getTime() - b.createdAt.getTime())
    .map((user, index) => ({ ...user, rank: index + 1 }));
}

async function getGlobalLeaderboard(limit: number, search: string) {
  const where: Prisma.UserWhereInput = {
    ratingPoints: { gt: 0 },
    ...searchWhere(search)
  };
  const allUsers = await prisma.user.findMany({
    where,
    orderBy: [{ ratingPoints: "desc" }, { knockouts: "desc" }, { createdAt: "asc" }]
  });

  return { leaders: allUsers.slice(0, limit).map((user, index) => ({ ...user, rank: index + 1 })), allUsers };
}

async function getSeasonLeaderboard(limit: number, month: unknown, search: string) {
  const range = parseMonthRange(month);
  const results = await prisma.tournamentRatingResult.findMany({
    where: {
      tournament: {
        startsAt: {
          gte: range.start,
          lt: range.end
        }
      },
      ...(search ? { user: searchWhere(search) } : {})
    },
    include: { user: true }
  });
  const userMap = new Map<string, User & { ratingPoints: number; knockouts: number }>();

  for (const result of results) {
    const existing = userMap.get(result.userId);

    if (existing) {
      existing.ratingPoints += result.points;
      existing.knockouts += result.knockouts;
    } else {
      userMap.set(result.userId, { ...result.user, ratingPoints: result.points, knockouts: result.knockouts });
    }
  }

  const allUsers = rankUsers([...userMap.values()]);
  return { leaders: allUsers.slice(0, limit), allUsers, month: range.month };
}

ratingRouter.get("/leaderboard", requireAuth, async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const scope = parseRatingScope(req.query.scope);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const leaderboard =
      scope === "season"
        ? await getSeasonLeaderboard(limit, req.query.month, search)
        : await getGlobalLeaderboard(limit, search);
    const currentRank = leaderboard.allUsers.findIndex((user) => user.id === req.user!.id) + 1;

    res.json({
      leaders: leaderboard.leaders,
      currentUserRank: currentRank > 0 ? currentRank : null,
      scope,
      month: "month" in leaderboard ? leaderboard.month : null
    });
  } catch (error) {
    next(error);
  }
});

ratingRouter.get("/rules", requireAuth, (_req, res) => {
  res.json({
    pools: RATING_POOLS,
    distributions: RATING_DISTRIBUTIONS,
    exampleTop8: getRatingAwards(10000, 51)
  });
});
