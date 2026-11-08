import { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";

import { assertDevilCanFinish } from "./devilDeal.js";

export const RATING_POOLS: Record<string, number> = {
  "Flop Classic": 10000,
  "Flop Bounty": 10000,
  "Flop Deep Stack": 15000,
  "Flop Phoenix": 10000,
  "Flop Prime Event": 15000,
  "Flop Black Edition": 20000,
  "Flop Old Fashion": 10000,
  "Flop One Shot": 12000,
  "Flop Butterfly": 12000,
  "Flop Freeze Out": 12000,
  "Flop Mystery Knockout": 15000,
  "Flop Chip Leader": 12000,
  "Flop Rampage": 12000,
  "Flop Last Call": 12000,
  "Flop Grand Final": 25000,
  "Flop Secret Final": 30000,
  "FLOP 3 MINUS 1": 15000,
  "FLOP BOOSTER RE-ENTRY": 15000,
  "FLOP BOMB POT": 15000,
  "FLOP DEVIL DEAL": 15000
};

export const RATING_TOURNAMENTS = Object.keys(RATING_POOLS);

const RATING_WINNERS_SHARE = 0.3;
const MAX_RATING_PLACES = 10;

export const RATING_DISTRIBUTIONS: Record<number, number[]> = {
  1: [100],
  2: [60, 40],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 17, 11, 7],
  6: [36, 24, 16, 10, 8, 6],
  7: [33, 22, 15, 10, 8, 7, 5],
  8: [30, 20, 14, 10, 8, 7, 6, 5],
  9: [28, 19, 13, 10, 8, 7, 6, 5, 4],
  10: [26, 18, 13, 10, 8, 7, 6, 5, 4, 3]
};

export type RatingResultInput = {
  registrationId?: string;
  userId?: string;
  place: number;
  knockouts?: number;
};

export type ChipLeaderAwardInput = {
  registrationId: string;
  points: number;
};

function isChipLeaderTournament(title: string) {
  return title.trim().toLowerCase() === "flop chip leader";
}

// Flop Bounty pays 100 rating points per bounty, also to players outside the rated places, so the
// bounty goes through game events (as in DEVIL DEAL) instead of the 1-point `knockouts` column.
const BOUNTY_POINTS_PER_KNOCKOUT = 100;
const BOUNTY_EVENT_PREFIX = "bounty-fix:";

function paysBountyPoints(tournament: { title: string; profile: string; mechanics: unknown }) {
  return tournament.profile === "KNOCKOUT" && !tournament.mechanics && tournament.title.trim().toLowerCase() === "flop bounty";
}

async function syncBountyPointEvents(tx: Prisma.TransactionClient, tournamentId: string) {
  const previous = await tx.tournamentGameEvent.findMany({
    where: { tournamentId, eventKey: { startsWith: BOUNTY_EVENT_PREFIX } },
    select: { userId: true, ratingPoints: true }
  });
  const previousByUser = new Map<string, { count: number; points: number }>();
  for (const event of previous) {
    if (!event.userId) continue;
    const entry = previousByUser.get(event.userId) ?? { count: 0, points: 0 };
    entry.count += 1;
    entry.points += event.ratingPoints;
    previousByUser.set(event.userId, entry);
  }
  for (const [userId, entry] of previousByUser) {
    await tx.user.update({ where: { id: userId }, data: { ratingPoints: { decrement: entry.points }, knockouts: { decrement: entry.count } } });
  }
  await tx.tournamentGameEvent.deleteMany({ where: { tournamentId, eventKey: { startsWith: BOUNTY_EVENT_PREFIX } } });

  const registrations = await tx.registration.findMany({
    where: { tournamentId, status: "ACTIVE" },
    select: { id: true, userId: true, bounty: true }
  });
  for (const registration of registrations) {
    const { bounty } = registration;
    if (!bounty) continue;
    await tx.tournamentGameEvent.createMany({
      data: Array.from({ length: bounty }, (_, index) => ({
        tournamentId,
        userId: registration.userId,
        registrationId: registration.id,
        eventKey: `${BOUNTY_EVENT_PREFIX}${registration.id}:${index + 1}`,
        type: "BOUNTY_ELIMINATION",
        ratingPoints: BOUNTY_POINTS_PER_KNOCKOUT,
        reason: "Bounty: 100 очков"
      }))
    });
    await tx.user.update({
      where: { id: registration.userId },
      data: { ratingPoints: { increment: bounty * BOUNTY_POINTS_PER_KNOCKOUT }, knockouts: { increment: bounty } }
    });
  }
}

export function getRatingPoolForTitle(title: string) {
  return RATING_POOLS[title] ?? 10000;
}

export function getRatingPlaces(entriesCount: number) {
  const places = Math.ceil(Math.max(1, entriesCount) * RATING_WINNERS_SHARE);
  return Math.min(MAX_RATING_PLACES, Math.max(1, places));
}

export function getRatingAwards(ratingPool: number, entriesCount: number) {
  const places = getRatingPlaces(entriesCount);
  return RATING_DISTRIBUTIONS[places].map((percent, index) => ({
    place: index + 1,
    percent,
    points: Math.round((ratingPool * percent) / 100)
  }));
}

export async function applyTournamentRatingResults(
  tournamentId: string,
  entriesCount: number | undefined,
  inputs: RatingResultInput[],
  chipLeaderAward?: ChipLeaderAwardInput
) {
  if (!inputs.length) {
    throw new AppError(400, "At least one rating result is required", "RATING_RESULTS_EMPTY");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        ratingResults: true,
        chipLeaderAward: true,
        registrations: {
          where: { status: "ACTIVE" },
          select: { id: true, userId: true }
        }
      }
    });
    if (!tournament) throw notFound("Tournament");

    await assertDevilCanFinish(tx, tournament);
    if (tournament.mechanics && inputs.some(input => (input.knockouts ?? 0) !== 0)) throw new AppError(400, "Bounty начисляются автоматически через DEVIL CONTROL", "BOUNTY_ALREADY_ACCOUNTED");

    const bountyPoints = paysBountyPoints(tournament);
    const supportsChipLeaderAward = isChipLeaderTournament(tournament.title);
    if (!supportsChipLeaderAward && chipLeaderAward) {
      throw new AppError(400, "Chip-leader bonus is available only for Flop Chip Leader", "CHIP_LEADER_NOT_ALLOWED");
    }
    if (supportsChipLeaderAward && !chipLeaderAward) {
      throw new AppError(400, "Select the chip leader", "CHIP_LEADER_REQUIRED");
    }

    const effectiveEntriesCount = entriesCount ?? Math.max(tournament.registrations.length, inputs.length);
    const awards = getRatingAwards(tournament.ratingPool, effectiveEntriesCount);
    const maxPlace = awards.length;
    const places = new Set<number>();
    const userIds = new Set<string>();
    const registrationToUser = new Map(tournament.registrations.map((item) => [item.id, item.userId]));
    const activeUserIds = new Set(tournament.registrations.map((item) => item.userId));

    const nextResults = inputs.map((input) => {
      if (input.place < 1 || input.place > maxPlace) {
        throw new AppError(400, `Place ${input.place} is outside top-${maxPlace}`, "RATING_PLACE_OUT_OF_RANGE");
      }
      if (places.has(input.place)) {
        throw new AppError(400, `Place ${input.place} is duplicated`, "RATING_PLACE_DUPLICATED");
      }
      places.add(input.place);

      const userId = input.registrationId ? registrationToUser.get(input.registrationId) : input.userId;
      if (!userId) {
        throw new AppError(404, "Participant registration not found", "PARTICIPANT_NOT_FOUND");
      }
      if (!activeUserIds.has(userId)) {
        throw new AppError(400, "Rating can be assigned only to active tournament participants", "RATING_USER_NOT_ACTIVE");
      }
      if (userIds.has(userId)) {
        throw new AppError(400, "Participant is duplicated in rating results", "RATING_USER_DUPLICATED");
      }
      userIds.add(userId);

      const award = awards[input.place - 1];
      return {
        tournamentId,
        userId,
        place: input.place,
        percent: award.percent,
        points: award.points,
        knockouts: bountyPoints ? 0 : input.knockouts ?? 0,
        chipLeaderBonus: 0
      };
    });

    if (tournament.mechanics) {
      const winner = await tx.registration.findFirst({ where: { tournamentId, status: "ACTIVE", liveStatus: "IN_GAME", checkedInAt: { not: null } } });
      if (!nextResults.some(r => r.place === 1 && r.userId === winner?.userId)) throw new AppError(400, "Первое место должно принадлежать оставшемуся игроку", "WINNER_MISMATCH");
    }
    const chipLeaderUserId = chipLeaderAward
      ? registrationToUser.get(chipLeaderAward.registrationId)
      : undefined;
    if (chipLeaderAward && !chipLeaderUserId) {
      throw new AppError(404, "Chip leader registration not found", "CHIP_LEADER_NOT_FOUND");
    }
    if (chipLeaderAward && chipLeaderAward.points <= 0) {
      throw new AppError(400, "Chip-leader bonus must be greater than zero", "CHIP_LEADER_BONUS_INVALID");
    }

    await rollbackExistingResults(tx, tournament.ratingResults);
    if (tournament.chipLeaderAward) {
      await tx.user.update({
        where: { id: tournament.chipLeaderAward.userId },
        data: { ratingPoints: { decrement: tournament.chipLeaderAward.points } }
      });
    }
    await tx.tournamentRatingResult.deleteMany({ where: { tournamentId } });
    await tx.tournamentChipLeaderAward.deleteMany({ where: { tournamentId } });

    for (const result of nextResults) {
      const totalRatingPoints = result.points + result.knockouts + result.chipLeaderBonus;

      await tx.tournamentRatingResult.create({ data: result });
      await tx.user.update({
        where: { id: result.userId },
        data: {
          ratingPoints: { increment: totalRatingPoints },
          knockouts: { increment: result.knockouts }
        }
      });
    }

    if (bountyPoints) await syncBountyPointEvents(tx, tournamentId);

    if (chipLeaderAward && chipLeaderUserId) {
      await tx.tournamentChipLeaderAward.create({
        data: {
          tournamentId,
          userId: chipLeaderUserId,
          points: chipLeaderAward.points
        }
      });
      await tx.user.update({
        where: { id: chipLeaderUserId },
        data: { ratingPoints: { increment: chipLeaderAward.points } }
      });
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        entriesCount: effectiveEntriesCount,
        status: TournamentStatus.FINISHED
      }
    });

    return tx.tournamentRatingResult.findMany({
      where: { tournamentId },
      include: { user: true },
      orderBy: { place: "asc" }
    });
  });
}

async function rollbackExistingResults(
  tx: Prisma.TransactionClient,
  results: Array<{ userId: string; points: number; knockouts: number; chipLeaderBonus: number }>
) {
  for (const result of results) {
    const totalRatingPoints = result.points + result.knockouts + result.chipLeaderBonus;

    await tx.user.update({
      where: { id: result.userId },
      data: {
        ratingPoints: { decrement: totalRatingPoints },
        knockouts: { decrement: result.knockouts }
      }
    });
  }
}
