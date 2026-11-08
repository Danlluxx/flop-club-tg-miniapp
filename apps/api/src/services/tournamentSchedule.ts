import { TournamentProfile, type Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { tournamentAddOnConfigFor } from "./tournamentRules.js";

import { issueEntry } from "./devilDeal.js";
import { devilDealDefaults } from "./tournamentMechanics.js";

const location = "Flop Club, Барнаул";
const maxParticipants = 50;
const defaultBuyIn = 500;
const defaultReEntry = 500;
const legacyReEntry = 1000;
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
  "Flop Secret Final": "Закрытый финал для лучших игроков рейтинга.",
  "FLOP 3 MINUS 1": "Техасский холдем с третьей картой на префлопе и выбором лучших двух.",
  "FLOP BOOSTER RE-ENTRY": "Re-entry формат, где каждый следующий вход дает больше фишек.",
  "FLOP DEVIL DEAL": "HALLOWEEN SPECIAL · Сделка с дьяволом, бонусы за шестёрки и Bounty +50 рейтинговых очков.",
  "FLOP BOMB POT": "Техасский холдем с обязательным bomb pot один раз на каждом уровне."
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
  "Flop Secret Final": 30000,
  "FLOP 3 MINUS 1": 15000,
  "FLOP BOOSTER RE-ENTRY": 15000,
  "FLOP BOMB POT": 15000
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
  "Flop Secret Final": TournamentProfile.FINAL,
  "FLOP 3 MINUS 1": TournamentProfile.BASE,
  "FLOP BOOSTER RE-ENTRY": TournamentProfile.BASE,
  "FLOP BOMB POT": TournamentProfile.BASE
};

const legacyCycle = [
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

const regularScheduleStartDate = "2026-09-21";
const regularTwoWeekSchedule = [
  null,
  "Flop Phoenix",
  "Flop Rampage",
  "FLOP BOMB POT",
  "Flop Bounty",
  "FLOP BOOSTER RE-ENTRY",
  "Flop Deep Stack",
  "Flop Black Edition",
  "Flop Freeze Out",
  "Flop Butterfly",
  "FLOP 3 MINUS 1",
  "Flop Mystery Knockout",
  "Flop Chip Leader",
  "Flop Prime Event"
] as const;

const timesByWeekday = ["19:00", "19:00", "19:00", "19:00", "19:00", "19:00", "19:00"] as const;
const specialTimes: Record<string, string> = {
  "2026-06-21": "18:00",
  "2026-09-05": "17:00",
  "2026-10-31": "18:00"
};
// One-off add-on stack for a regular tournament on a given date; everything else keeps its defaults.
const addOnChipsByDate: Record<string, number> = {
  "2026-11-08": 200000
};

const specialEvents: Record<string, {
  title: string;
  buyIn: number;
  reEntry: number;
  ratingPool: number;
  ratingSeriesMonth?: string;
  addOnEnabled?: boolean;
  addOnPrice?: number;
  addOnChips?: number;
}> = {
  "2026-10-31": {
    title: "FLOP DEVIL DEAL",
    buyIn: 500,
    reEntry: 500,
    ratingPool: 15000,
    addOnEnabled: true,
    addOnPrice: 1000,
    addOnChips: 100000
  },
  "2026-06-05": {
    title: "FLOP GRAND OPENNING",
    buyIn: 0,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Prime Event"]
  },
  "2026-06-06": {
    title: "Flop Black Edition",
    buyIn: 0,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Black Edition"]
  },
  "2026-06-16": {
    title: "Flop Mystery Knockout",
    buyIn: 500,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Mystery Knockout"]
  },
  "2026-06-26": {
    title: "Flop Mystery Knockout",
    buyIn: 500,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Mystery Knockout"]
  },
  "2026-06-30": {
    title: "Flop Phoenix",
    buyIn: 0,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Phoenix"],
    ratingSeriesMonth: "2026-07"
  },
  "2026-07-03": {
    title: "Flop Prime Event",
    buyIn: 500,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Prime Event"]
  },
  "2026-07-04": {
    title: "Flop Bounty",
    buyIn: 500,
    reEntry: legacyReEntry,
    ratingPool: ratingPools["Flop Bounty"]
  },
  "2026-08-09": {
    title: "Flop Deep Stack",
    buyIn: 500,
    reEntry: defaultReEntry,
    ratingPool: ratingPools["Flop Deep Stack"]
  },
  "2026-09-06": {
    title: "Flop Deep Stack",
    buyIn: 500,
    reEntry: defaultReEntry,
    ratingPool: ratingPools["Flop Deep Stack"]
  },
  "2026-10-21": {
    title: "Flop Rampage",
    buyIn: 0,
    reEntry: defaultReEntry,
    ratingPool: ratingPools["Flop Rampage"],
    addOnEnabled: true,
    addOnPrice: 500,
    addOnChips: 100000
  },
  "2026-10-27": {
    title: "FLOP BOOSTER RE-ENTRY",
    buyIn: 0,
    reEntry: 500,
    ratingPool: ratingPools["FLOP BOOSTER RE-ENTRY"]
  },
  "2026-11-03": {
    title: "FLOP BOMB POT",
    buyIn: 0,
    reEntry: 500,
    ratingPool: ratingPools["FLOP BOMB POT"]
  },
  "2026-11-05": {
    title: "Flop Phoenix",
    buyIn: 500,
    reEntry: 1000,
    ratingPool: ratingPools["Flop Phoenix"]
  }
};

export function tournamentPricingFor(title: string) {
  if (title === "Flop Freeze Out" || title === "Flop One Shot") {
    return { buyIn: 1000, reEntry: 0 };
  }

  if (title === "Flop Phoenix") {
    return { buyIn: defaultBuyIn, reEntry: 1000 };
  }

  return { buyIn: defaultBuyIn, reEntry: defaultReEntry };
}

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
      startsAt: { gte: range.start, lt: range.end },
      scheduleLocked: false
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

async function deleteEmptyScheduledTournamentsForDate(
  tx: Prisma.TransactionClient,
  dateKeyValue: string,
  range: { start: Date; end: Date }
) {
  const tournaments = await tx.tournament.findMany({
    where: {
      id: { startsWith: `${dateKeyValue}-` },
      startsAt: { gte: range.start, lt: range.end },
      scheduleLocked: false
    },
    select: {
      id: true,
      _count: {
        select: {
          registrations: true,
          ratingResults: true,
          knockouts: true
        }
      }
    }
  });

  for (const tournament of tournaments) {
    if (
      tournament._count.registrations > 0 ||
      tournament._count.ratingResults > 0 ||
      tournament._count.knockouts > 0
    ) {
      continue;
    }

    await tx.tournament.delete({ where: { id: tournament.id } });
  }
}

function daysBetween(startDateKey: string, endDateKey: string) {
  return Math.round((utcDay(endDateKey).getTime() - utcDay(startDateKey).getTime()) / 86_400_000);
}

function mondayIndexFromCycleOffset(offset: number) {
  return ((offset % 7) + 7) % 7;
}

function regularTournamentTitleForDate(dateKeyValue: string) {
  if (dateKeyValue >= regularScheduleStartDate) {
    const scheduleOffset =
      ((daysBetween(regularScheduleStartDate, dateKeyValue) % regularTwoWeekSchedule.length) +
        regularTwoWeekSchedule.length) %
      regularTwoWeekSchedule.length;
    return regularTwoWeekSchedule[scheduleOffset];
  }

  const cycleOffset = ((daysBetween(baseCycleDate, dateKeyValue) % legacyCycle.length) + legacyCycle.length) % legacyCycle.length;
  return legacyCycle[cycleOffset];
}

function ratingSeriesMonthForDate(dateKeyValue: string) {
  if (dateKeyValue >= "2026-08-01" && dateKeyValue <= "2026-08-31") return "2026-09";
  return undefined;
}

export function scheduledTournamentForDate(dateKeyValue: string): Prisma.TournamentCreateManyInput | null {
  const weekdayIndex = mondayIndexFromCycleOffset(daysBetween(baseCycleDate, dateKeyValue));
  const eventOverride = specialEvents[dateKeyValue];
  const title = eventOverride?.title ?? regularTournamentTitleForDate(dateKeyValue);
  if (!title) return null;

  const pricing = tournamentPricingFor(title);
  const buyIn = eventOverride?.buyIn ?? pricing.buyIn;
  const eventReEntry = eventOverride?.reEntry ?? pricing.reEntry;
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
    prizePool: title === "FLOP DEVIL DEAL" ? 0 : buyIn * maxParticipants,
    ...(title === "FLOP DEVIL DEAL" ? { mechanics: devilDealDefaults as unknown as Prisma.InputJsonValue } : {}),
    ratingPool: eventOverride?.ratingPool ?? ratingPools[title] ?? 10000,
    ratingSeriesMonth: eventOverride?.ratingSeriesMonth ?? ratingSeriesMonthForDate(dateKeyValue),
    profile,
    lateRegistrationEndsAt: title === "FLOP DEVIL DEAL" ? new Date(devilDealDefaults.registrationClosesAt) : lateRegistrationEndsAt,
    addOnEnabled: eventOverride?.addOnEnabled ?? addOn.enabled,
    addOnPrice: eventOverride?.addOnPrice ?? addOn.price,
    addOnChips: eventOverride?.addOnChips ?? addOnChipsByDate[dateKeyValue] ?? addOn.chips,
    maxParticipants,
    status: "OPEN"
  };
}

function scheduledDateKeysInRange(from: Date, to: Date) {
  const fromKey = dateKey(from);
  const start = utcDay(fromKey < firstScheduledTournamentDate ? firstScheduledTournamentDate : fromKey);
  const end = utcDay(dateKey(to));
  const keys: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
    keys.push(dateKey(cursor));
  }

  return keys;
}

export function generateScheduledTournaments(from: Date, to: Date) {
  const tournaments: Prisma.TournamentCreateManyInput[] = [];

  for (const key of scheduledDateKeysInRange(from, to)) {
    const tournament = scheduledTournamentForDate(key);
    if (tournament) {
      tournaments.push(tournament);
    }
  }

  return tournaments;
}

export async function ensureScheduledTournaments(from: Date, to: Date) {
  const rangeDateKeys = scheduledDateKeysInRange(from, to);
  const noTournamentDateKeys = rangeDateKeys.filter((key) => !scheduledTournamentForDate(key));
  const tournaments = generateScheduledTournaments(from, to);
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
  if (!activeTournaments.length && !noTournamentDateKeys.length) return;

  await prisma.$transaction(async (tx) => {
    for (const key of noTournamentDateKeys) {
      await deleteEmptyScheduledTournamentsForDate(tx, key, barnaulDayRange(key));
    }

    for (const tournament of activeTournaments) {
      const key = dateKey(tournament.startsAt as Date);
      const { start, end } = barnaulDayRange(key);
      const { id, ...data } = tournament;
      // Расписание задаёт только начальный статус: завершённый или отменённый турнир не должен снова открываться.
      const { status: _initialStatus, ...syncData } = data;

      const existingExpected = await tx.tournament.findUnique({ where: { id: String(id) } });
      if (existingExpected) {
        // Турнир, сохранённый админом, расписание больше не перезаписывает.
        if (existingExpected.scheduleLocked) continue;
        if (existingExpected.mechanics) {
          await tx.tournament.update({ where: { id: String(id) }, data: {
            buyIn: data.buyIn,
            reEntry: data.reEntry,
            startsAt: data.startsAt,
            lateRegistrationEndsAt: data.lateRegistrationEndsAt,
            addOnEnabled: data.addOnEnabled,
            addOnPrice: data.addOnPrice,
            addOnChips: data.addOnChips,
            mechanics: data.mechanics
          } });
          continue;
        }
        await tx.tournament.update({ where: { id: String(id) }, data: syncData });
        await mergeDuplicateScheduledTournaments(tx, key, String(id), { start, end });
        await initializeScheduledMechanics(tx, String(id));
        continue;
      }

      const existingForDate = await tx.tournament.findFirst({
        where: {
          id: { startsWith: `${key}-` },
          startsAt: { gte: start, lt: end }
        },
        orderBy: { createdAt: "asc" }
      });

      if (existingForDate?.scheduleLocked) continue;

      if (existingForDate) {
        await tx.tournament.update({
          where: { id: existingForDate.id },
          data: { id: String(id), ...syncData }
        });
        await mergeDuplicateScheduledTournaments(tx, key, String(id), { start, end });
        await initializeScheduledMechanics(tx, String(id));
      } else {
        await tx.tournament.create({ data: tournament });
      }
    }
  });
}

async function initializeScheduledMechanics(tx: Prisma.TransactionClient, tournamentId: string) {
  const tournament = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (!tournament.mechanics) return;
  const registrations = await tx.registration.findMany({ where: { tournamentId, status: "ACTIVE" } });
  for (const registration of registrations) {
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey: `entry:${registration.id}` } } });
    if (!prior) await issueEntry(tx, tournament, registration, registration.userId);
  }
}
