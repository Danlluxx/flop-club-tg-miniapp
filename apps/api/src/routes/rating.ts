import express from "express";
import { RegistrationStatus, TournamentStatus, type Prisma, type User } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getRatingAwards, RATING_DISTRIBUTIONS, RATING_POOLS } from "../services/rating.js";

export const ratingRouter = express.Router();

type RatingScope = "global" | "season";
type RatedUser = User & { rank: number; ratingPoints: number; knockouts: number };

function parseLimit(value: unknown) {
  const requestedLimit = Number(value ?? 50);
  return Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 50;
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

// Every player can read the leaderboard, so a row exposes only what the client shows.
// Never spread the whole User here: it carries telegramId, email and consent data.
function toLeaderboardEntry(user: RatedUser) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    ratingPoints: user.ratingPoints,
    knockouts: user.knockouts,
    rank: user.rank
  };
}

function rankUsers(users: Array<User & { ratingPoints: number; knockouts: number }>): RatedUser[] {
  return users
    .sort((a, b) => b.ratingPoints - a.ratingPoints || b.knockouts - a.knockouts || a.createdAt.getTime() - b.createdAt.getTime())
    .map((user, index) => ({ ...user, rank: index + 1 }));
}

async function getGlobalLeaderboard(limit: number, search: string) {
  const playedWhere: Prisma.UserWhereInput = {
    OR: [
      { ratingPoints: { gt: 0 } },
      { ratingResults: { some: {} } },
      { chipLeaderAwards: { some: {} } },
      {
        registrations: {
          some: {
            status: RegistrationStatus.ACTIVE,
            OR: [
              { checkedInAt: { not: null } },
              { finishPlace: { not: null } },
              { tournament: { status: TournamentStatus.FINISHED } }
            ]
          }
        }
      }
    ]
  };

  const searchFilter = searchWhere(search);
  const where: Prisma.UserWhereInput = searchFilter ? { AND: [playedWhere, searchFilter] } : playedWhere;

  const allUsers = await prisma.user.findMany({
    where,
    orderBy: [{ ratingPoints: "desc" }, { knockouts: "desc" }, { createdAt: "asc" }]
  });

  return { leaders: allUsers.slice(0, limit).map((user, index) => ({ ...user, rank: index + 1 })), allUsers };
}

async function getSeasonLeaderboard(limit: number, month: unknown, search: string) {
  const range = parseMonthRange(month);
  const tournamentWhere: Prisma.TournamentWhereInput = {
    OR: [
      { ratingSeriesMonth: range.month },
      {
        ratingSeriesMonth: null,
        startsAt: {
          gte: range.start,
          lt: range.end
        }
      }
    ]
  };
  const userFilter = search ? searchWhere(search) : undefined;
  const [results, chipLeaderAwards, gameAwards] = await Promise.all([
    prisma.tournamentRatingResult.findMany({
      where: {
        tournament: tournamentWhere,
        ...(userFilter ? { user: userFilter } : {})
      },
      include: { user: true }
    }),
    prisma.tournamentChipLeaderAward.findMany({
      where: {
        tournament: tournamentWhere,
        ...(userFilter ? { user: userFilter } : {})
      },
      include: { user: true }
    })
    ,prisma.tournamentGameEvent.findMany({
      where: { tournament: tournamentWhere, ratingPoints: { not: 0 }, ...(userFilter ? { user: userFilter } : {}) },
      include: { user: true }
    })
  ]);
  const userMap = new Map<string, User & { ratingPoints: number; knockouts: number }>();

  for (const result of results) {
    const totalRatingPoints = result.points + result.knockouts + result.chipLeaderBonus;
    const existing = userMap.get(result.userId);

    if (existing) {
      existing.ratingPoints += totalRatingPoints;
      existing.knockouts += result.knockouts;
    } else {
      userMap.set(result.userId, { ...result.user, ratingPoints: totalRatingPoints, knockouts: result.knockouts });
    }
  }

  for (const award of chipLeaderAwards) {
    const existing = userMap.get(award.userId);
    if (existing) {
      existing.ratingPoints += award.points;
    } else {
      userMap.set(award.userId, { ...award.user, ratingPoints: award.points, knockouts: 0 });
    }
  }

  for (const award of gameAwards) {
    if (!award.user || !award.userId) continue;
    const knockouts = award.type === "BOUNTY_ELIMINATION" ? 1 : award.type === "ADMIN_CORRECTION" && award.ratingPoints < 0 ? -1 : 0;
    const existing = userMap.get(award.userId);
    if (existing) { existing.ratingPoints += award.ratingPoints; existing.knockouts += knockouts; }
    else userMap.set(award.userId, { ...award.user, ratingPoints: award.ratingPoints, knockouts });
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
      leaders: leaderboard.leaders.map(toLeaderboardEntry),
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
