import { TournamentProfile, type Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

const location = "Flop Club, Барнаул";
const maxParticipants = 50;
const reEntry = 1000;
const baseCycleDate = "2026-06-01";
const firstScheduledTournamentDate = "2026-06-04";

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
  "FLOP GRAND OPENING": 0,
  "FLOP GRAND OPENNING": 0,
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
  "FLOP GRAND OPENING": TournamentProfile.BASE,
  "FLOP GRAND OPENNING": TournamentProfile.BASE,
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
  "Flop Bounty",
  "Flop Deep Stack",
  "Flop Phoenix",
  "Flop Prime Event",
  "Flop Black Edition",
  "Flop Old Fashion",
  "Flop One Shot",
  "Flop Bounty",
  "Flop Deep Stack",
  "Flop Butterfly",
  "Flop Prime Event",
  "Flop Black Edition",
  "Flop Freeze Out",
  "Flop Classic",
  "Flop Mystery Knockout",
  "Flop Chip Leader",
  "Flop Phoenix",
  "Flop Rampage",
  "Flop Black Edition",
  "Flop Old Fashion",
  "Flop One Shot",
  "Flop Bounty",
  "Flop Deep Stack",
  "Flop Phoenix",
  "Flop Last Call",
  "Flop Grand Final",
  "Flop Secret Final"
] as const;

const timesByWeekday = ["19:00", "19:00", "19:00", "19:00", "19:00", "17:00", "17:00"] as const;
const specialEvents: Record<string, { title: string; buyIn: number; reEntry: number; ratingPool: number }> = {
  "2026-06-04": {
    title: "Flop Phoenix",
    buyIn: 0,
    reEntry,
    ratingPool: ratingPools["Flop Phoenix"]
  },
  "2026-06-05": {
    title: "FLOP GRAND OPENING",
    buyIn: 0,
    reEntry: 500,
    ratingPool: 0
  },
  "2026-06-06": {
    title: "Flop Black Edition",
    buyIn: 0,
    reEntry,
    ratingPool: ratingPools["Flop Black Edition"]
  }
};

export function slug(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function dateKey(date: Date) {
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
  const startsAt = new Date(`${dateKeyValue}T${timesByWeekday[weekdayIndex]}:00+07:00`);
  const lateRegistrationEndsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  const profile = tournamentProfiles[title] ?? TournamentProfile.BASE;
  const addOnEnabled = profile === TournamentProfile.DEEP_SPECIAL;

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
    profile,
    lateRegistrationEndsAt,
    addOnEnabled,
    addOnPrice: addOnEnabled ? 1000 : 0,
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

  await prisma.tournament.createMany({
    data: tournaments,
    skipDuplicates: true
  });
}
