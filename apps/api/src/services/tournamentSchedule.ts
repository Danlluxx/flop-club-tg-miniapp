import { TournamentProfile, type Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { tournamentAddOnConfigFor } from "./tournamentRules.js";

const location = "Flop Club, Барнаул";
const maxParticipants = 50;
const reEntry = 1000;
const baseCycleDate = "2026-06-15";
const firstScheduledTournamentDate = "2026-06-05";

export const descriptions: Record<string, string> = {
  "FLOP GRAND OPENING": "Открытие FLOP CLUB: бесплатный вход, фуршет, атмосфера и первый турнир в истории клуба.",
  "FLOP GRAND OPENNING": "Открытие FLOP CLUB: бесплатный вход, фуршет, атмосфера и первый турнир в истории клуба.",
  "Flop Classic": "Классический турнир для комфортной игры и стабильного рейтинга.",
  "Flop Bounty": "Динамичный формат с наградой за выбивание игроков.",
  "Flop Deep Stack": "Больше фишек, больше решений, больше настоящего покера.",
  "Flop Phoenix": "Один шанс на возрождение после вылета.",
  "Flop Prime Event": "Статусный турнир недели с повышенной значимостью.",
  "Flop Black Edition": "Премиальный вечер FLOP CLUB в фирменной атмосфере.",
  "Flop Old Fashion": "Чистая классика без лишних механик.",
  "Flop One Shot": "Одна попытка. Один стек. Максимальная концентрация.",
  "Flop Butterfly": "Плавный старт и яркая динамика ближе к финалу.",
  "Flop Freeze Out": "Один вход без re-entry. Ошибки стоят дороже.",
  "Flop Mystery Knockout": "Выбивай игроков и открывай mystery-награды.",
  "Flop Chip Leader": "Борьба не только за финал, но и за лидерство по стеку.",
  "Flop Rampage": "Быстрый агрессивный формат для любителей экшена.",
  "Flop Last Call": "Последний вызов вечера для тех, кто хочет сыграть бодро.",
  "Flop Grand Final": "Главное событие месяца для сильнейших игроков клуба.",
  "Flop Secret Final": "Закрытый финал для лучших игроков рейтинга."
};

export const ratingPools: Record<string, number> = {
  "FLOP GRAND OPENING": 15000,
  "FLOP GRAND OPENNING": 15000,
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

export const tournamentProfiles: Record<string, TournamentProfile> = {
  "FLOP GRAND OPENING": TournamentProfile.DEEP_SPECIAL,
  "FLOP GRAND OPENNING": TournamentProfile.DEEP_SPECIAL,
  "Flop Classic": TournamentProfile.BASE,
  "Flop Bounty": TournamentProfile.KNOCKOUT,
  "Flop Deep Stack": TournamentProfile.DEEP_SPECIAL,
  "Flop Phoenix": TournamentProfile.PHOENIX,
  "Flop Prime Event": TournamentProfile.DEEP_SPECIAL,
  "Flop Black Edition": TournamentProfile.DEEP_SPECIAL,
  "Flop Old Fashion": TournamentProfile.BASE,
  "Flop One Shot": TournamentProfile.FREEZE,
  "Flop Butterfly": TournamentProfile.BASE,
  "Flop Freeze Out": TournamentProfile.FREEZE,
  "Flop Mystery Knockout": TournamentProfile.KNOCKOUT,
  "Flop Chip Leader": TournamentProfile.BASE,
  "Flop Rampage": TournamentProfile.TURBO_ACTION,
  "Flop Last Call": TournamentProfile.TURBO_ACTION,
  "Flop Grand Final": TournamentProfile.FINAL,
  "Flop Secret Final": TournamentProfile.FINAL
};

const cycle = [
  "Flop Classic",
  "Flop Phoenix",
  "Flop Freeze Out",
  "Flop Butterfly",
  "Flop Prime Event",
  "Flop Bounty",
  "Flop Deep Stack",
  "Flop Old Fashion",
  "Flop One Shot",
  "Flop Chip Leader",
  "Flop Rampage",
  "Flop Mystery Knockout",
  "Flop Black Edition",
  "Flop Grand Final"
] as const;

const timesByWeekday = ["19:00", "19:00", "19:00", "19:00", "19:00", "17:00", "17:00"] as const;
const specialTimes: Record<string, string> = {
  "2026-06-21": "18:00"
};
const specialEvents: Record<string, {
  title: string;
  buyIn: number;
  reEntry: number;
  ratingPool: number;
  ratingSeriesMonth?: string;
}> = {
  "2026-06-05": {
    title: "FLOP GRAND OPENNING",
    buyIn: 0,
    reEntry,
    ratingPool: ratingPools["Flop Prime Event"]
  },
  "2026-06-06": {
    title: "Flop Black Edition",
    buyIn: 0,
    reEntry,
    ratingPool: ratingPools["Flop Black Edition"]
  },
  "2026-06-16": {
    title: "Flop Mystery Knockout",
    buyIn: 500,
    reEntry,
    ratingPool: ratingPools["Flop Mystery Knockout"]
  },
  "2026-06-26": {
    title: "Flop Mystery Knockout",
    buyIn: 500,
    reEntry,
    ratingPool: ratingPools["Flop Mystery Knockout"]
  },
  "2026-06-30": {
    title: "Flop Phoenix",
    buyIn: 0,
    reEntry,
    ratingPool: ratingPools["Flop Phoenix"],
    ratingSeriesMonth: "2026-07"
  }
};

export function slug(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

export function dateKey(date: Date) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function utcDay(dateKeyValue: string) {
  return new Date(`${dateKeyValue}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function barnaulDayRange(dateKeyValue: string) {
  const start = new Date(`${dateKeyValue}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function mergeDuplicateScheduledTournaments(
  tx: Prisma.TransactionClient,
  dateKeyValue: string,
  expectedTournamentId: string,
  range: { start: Date; end: Date }
) {
  const duplicateTournaments = await tx.tournament.findMany({
    where: {
      id: { startsWith: `${dateKeyValue}-`, not: expectedTournamentId },
      startsAt: { gte: range.start, lt: range.end }
    },
    select: { id: true }
  });

  for (const duplicate of duplicateTournaments) {
    await tx.tournamentReminder.deleteMany({ where: { tournamentId: duplicate.id } });
    await tx.tournamentRatingResult.deleteMany({ where: { tournamentId: duplicate.id } });
    await tx.knockout.updateMany({
      where: { tournamentId: duplicate.id },
      data: { tournamentId: expectedTournamentId }
    });
    await tx.registration.updateMany({
      where: { tournamentId: duplicate.id },
      data: { tournamentId: expectedTournamentId }
    });
    await tx.tournament.delete({ where: { id: duplicate.id } });
  }
}

function daysBetween(startDateKey: string, endDateKey: string) {
  return Math.round((utcDay(endDateKey).getTime() - utcDay(startDateKey).getTime()) / 86_400_000);
}

function mondayIndexFromCycleOffset(offset: number) {
  return ((offset % 7) + 7) % 7;
}

export function scheduledTournamentForDate(dateKeyValue: string): Prisma.TournamentCreateManyInput {
  const cycleOffset = ((daysBetween(baseCycleDate, dateKeyValue) % cycle.length) + cycle.length) % cycle.length;
  const weekdayIndex = mondayIndexFromCycleOffset(cycleOffset);
  const eventOverride = specialEvents[dateKeyValue];
  const title = eventOverride?.title ?? cycle[cycleOffset];
  const buyIn = eventOverride?.buyIn ?? (weekdayIndex >= 4 ? 1000 : 500);
  const eventReEntry = eventOverride?.reEntry ?? reEntry;
  const startsAt = new Date(`${dateKeyValue}T${specialTimes[dateKeyValue] ?? timesByWeekday[weekdayIndex]}:00+07:00`);
  const lateRegistrationEndsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  const profile = tournamentProfiles[title] ?? TournamentProfile.BASE;
  const addOn = tournamentAddOnConfigFor(title);

  return {
    id: `${dateKeyValue}-${slug(title)}`,
    title,
    description: descriptions[title],
    startsAt,
    location,
    buyIn,
    reEntry: eventReEntry,
    prizePool: buyIn * maxParticipants,
    ratingPool: eventOverride?.ratingPool ?? ratingPools[title] ?? 10000,
    ratingSeriesMonth: eventOverride?.ratingSeriesMonth,
    profile,
    lateRegistrationEndsAt,
    addOnEnabled: addOn.enabled,
    addOnPrice: addOn.price,
    addOnChips: addOn.chips,
    maxParticipants,
    status: "OPEN"
  };
}

export function generateScheduledTournaments(from: Date, to: Date) {
  const fromKey = dateKey(from);
  const start = utcDay(fromKey < firstScheduledTournamentDate ? firstScheduledTournamentDate : fromKey);
  const end = utcDay(dateKey(to));
  const tournaments: Prisma.TournamentCreateManyInput[] = [];

  for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
    tournaments.push(scheduledTournamentForDate(dateKey(cursor)));
  }

  return tournaments;
}

export async function ensureScheduledTournaments(from: Date, to: Date) {
  const tournaments = generateScheduledTournaments(from, to);
  if (!tournaments.length) return;
  const deletedDates = await prisma.deletedScheduledTournament.findMany({
    where: {
      dateKey: {
        in: tournaments.map((tournament) => dateKey(tournament.startsAt as Date))
      }
    },
    select: { dateKey: true }
  });
  const deletedDateKeys = new Set(deletedDates.map((item) => item.dateKey));
  const activeTournaments = tournaments.filter((tournament) => !deletedDateKeys.has(dateKey(tournament.startsAt as Date)));
  if (!activeTournaments.length) return;

  await prisma.$transaction(async (tx) => {
    for (const tournament of activeTournaments) {
      const key = dateKey(tournament.startsAt as Date);
      const { start, end } = barnaulDayRange(key);
      const { id, ...data } = tournament;

      const existingExpected = await tx.tournament.findUnique({ where: { id: String(id) } });
      if (existingExpected) {
        await tx.tournament.update({ where: { id: String(id) }, data });
        await mergeDuplicateScheduledTournaments(tx, key, String(id), { start, end });
        continue;
      }

      const existingForDate = await tx.tournament.findFirst({
        where: {
          id: { startsWith: `${key}-` },
          startsAt: { gte: start, lt: end }
        },
        orderBy: { createdAt: "asc" }
      });

      if (existingForDate) {
        await tx.tournament.update({
          where: { id: existingForDate.id },
          data: { id: String(id), ...data }
        });
        await mergeDuplicateScheduledTournaments(tx, key, String(id), { start, end });
      } else {
        await tx.tournament.create({ data: tournament });
      }
    }
  });
}
