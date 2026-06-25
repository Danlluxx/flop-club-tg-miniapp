import { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";

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
  "Flop Secret Final": 30000
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
  inputs: RatingResultInput[]
) {
  if (!inputs.length) {
    throw new AppError(400, "At least one rating result is required", "RATING_RESULTS_EMPTY");
  }

  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        ratingResults: true,
        registrations: {
          where: { status: "ACTIVE" },
          select: { id: true, userId: true }
        }
      }
    });
    if (!tournament) throw notFound("Tournament");

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
        knockouts: input.knockouts ?? 0
      };
    });

    await rollbackExistingResults(tx, tournament.ratingResults);
    await tx.tournamentRatingResult.deleteMany({ where: { tournamentId } });

    for (const result of nextResults) {
      await tx.tournamentRatingResult.create({ data: result });
      await tx.user.update({
        where: { id: result.userId },
        data: {
          ratingPoints: { increment: result.points },
          knockouts: { increment: result.knockouts }
        }
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

async function rollbackExistingResults(tx: Prisma.TransactionClient, results: Array<{ userId: string; points: number; knockouts: number }>) {
  for (const result of results) {
    await tx.user.update({
      where: { id: result.userId },
      data: {
        ratingPoints: { decrement: result.points },
        knockouts: { decrement: result.knockouts }
      }
    });
  }
}
