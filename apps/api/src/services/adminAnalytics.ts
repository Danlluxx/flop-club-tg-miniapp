import { TournamentStatus } from "@prisma/client";
import { entriesByUser } from "./tournamentEntries.js";
import { dateKey } from "./tournamentSchedule.js";

export type AnalyticsPeriod = "week" | "month";

type AnalyticsUser = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramId: string;
};

export type AnalyticsTournament = {
  id: string;
  title: string;
  startsAt: Date;
  status: TournamentStatus;
  buyIn: number;
  reEntry: number;
  addOnPrice: number;
  maxParticipants: number;
  registrations: {
    userId: string;
    entryNumber: number;
    addOnCount: number;
    checkedInAt: Date | null;
    user: AnalyticsUser;
  }[];
};

const TREND_LENGTH = 12;

function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodRange(period: AnalyticsPeriod, anchor: string) {
  if (period === "week") {
    const weekday = (new Date(`${anchor}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const from = addDays(anchor, -weekday);
    return { from, to: addDays(from, 6) };
  }
  const from = `${anchor.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

function previousRange(period: AnalyticsPeriod, range: { from: string }) {
  return periodRange(period, addDays(range.from, -1));
}

// Money is an estimate from what admins marked: only checked-in players count, at this tournament's own prices.
export function tournamentFigures(tournament: AnalyticsTournament) {
  const checkedIn = tournament.registrations.filter((registration) => registration.checkedInAt);
  const entries = entriesByUser(checkedIn);
  const addOnsByUser = new Map<string, number>();
  for (const registration of checkedIn) {
    addOnsByUser.set(registration.userId, (addOnsByUser.get(registration.userId) ?? 0) + registration.addOnCount);
  }

  const players = entries.size;
  const totalEntries = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const reEntries = totalEntries - players;
  const addOns = [...addOnsByUser.values()].reduce((sum, count) => sum + count, 0);
  const buyInRevenue = players * tournament.buyIn;
  const reEntryRevenue = reEntries * tournament.reEntry;
  const addOnRevenue = addOns * tournament.addOnPrice;

  return {
    players,
    entries: totalEntries,
    reEntries,
    addOns,
    registered: new Set(tournament.registrations.map((registration) => registration.userId)).size,
    buyInRevenue,
    reEntryRevenue,
    addOnRevenue,
    revenue: buyInRevenue + reEntryRevenue + addOnRevenue,
    spentByUser: new Map([...entries].map(([userId, count]) => [
      userId,
      tournament.buyIn + (count - 1) * tournament.reEntry + (addOnsByUser.get(userId) ?? 0) * tournament.addOnPrice
    ]))
  };
}

type HeldTournament = AnalyticsTournament & { key: string; figures: ReturnType<typeof tournamentFigures> };

function summarize(held: HeldTournament[], firstVisit: Map<string, string>, range: { from: string; to: string }) {
  const inRange = held.filter((item) => item.key >= range.from && item.key <= range.to);
  const total = (pick: (figures: HeldTournament["figures"]) => number) => inRange.reduce((sum, item) => sum + pick(item.figures), 0);
  const uniquePlayers = new Set(inRange.flatMap((item) => [...item.figures.spentByUser.keys()]));
  const newPlayers = [...uniquePlayers].filter((userId) => (firstVisit.get(userId) ?? "") >= range.from).length;
  const visits = total((figures) => figures.players);
  const capacity = inRange.reduce((sum, item) => sum + item.maxParticipants, 0);
  const registered = total((figures) => figures.registered);
  const revenue = total((figures) => figures.revenue);

  return {
    revenue,
    buyInRevenue: total((figures) => figures.buyInRevenue),
    reEntryRevenue: total((figures) => figures.reEntryRevenue),
    addOnRevenue: total((figures) => figures.addOnRevenue),
    tournaments: inRange.length,
    uniquePlayers: uniquePlayers.size,
    newPlayers,
    returningPlayers: uniquePlayers.size - newPlayers,
    visits,
    entries: total((figures) => figures.entries),
    reEntries: total((figures) => figures.reEntries),
    addOns: total((figures) => figures.addOns),
    registered,
    noShows: registered - visits,
    fillRate: capacity ? visits / capacity : 0,
    averagePlayers: inRange.length ? visits / inRange.length : 0,
    averageRevenue: inRange.length ? revenue / inRange.length : 0
  };
}

function displayName(user: AnalyticsUser) {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.telegramId;
}

export function buildAdminAnalytics(tournaments: AnalyticsTournament[], period: AnalyticsPeriod, anchor: string, today: string) {
  // A tournament counts as held once somebody was checked in, so upcoming ones never add to the money.
  const held: HeldTournament[] = tournaments
    .filter((tournament) => tournament.status !== TournamentStatus.CANCELLED)
    .map((tournament) => ({ ...tournament, key: dateKey(tournament.startsAt), figures: tournamentFigures(tournament) }))
    .filter((tournament) => tournament.figures.players > 0)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

  const firstVisit = new Map<string, string>();
  for (const tournament of held) {
    for (const userId of tournament.figures.spentByUser.keys()) {
      if (!firstVisit.has(userId)) firstVisit.set(userId, tournament.key);
    }
  }

  const range = periodRange(period, anchor);
  const previous = previousRange(period, range);

  const trendRanges = [range];
  while (trendRanges.length < TREND_LENGTH) trendRanges.unshift(previousRange(period, trendRanges[0]));
  const windowFrom = trendRanges[0].from;
  const inWindow = held.filter((item) => item.key >= windowFrom && item.key <= range.to);

  const formats = new Map<string, { title: string; tournaments: number; players: number; revenue: number }>();
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, tournaments: 0, players: 0, revenue: 0 }));
  for (const item of inWindow) {
    const formatKey = item.title.trim().toLocaleLowerCase("ru-RU");
    const format = formats.get(formatKey) ?? { title: item.title.trim(), tournaments: 0, players: 0, revenue: 0 };
    format.tournaments += 1;
    format.players += item.figures.players;
    format.revenue += item.figures.revenue;
    formats.set(formatKey, format);

    const weekday = weekdays[(new Date(`${item.key}T00:00:00.000Z`).getUTCDay() + 6) % 7];
    weekday.tournaments += 1;
    weekday.players += item.figures.players;
    weekday.revenue += item.figures.revenue;
  }

  const inPeriod = held.filter((item) => item.key >= range.from && item.key <= range.to);
  const players = new Map<string, { name: string; visits: number; spent: number }>();
  for (const item of inPeriod) {
    for (const [userId, spent] of item.figures.spentByUser) {
      const user = item.registrations.find((registration) => registration.userId === userId)!.user;
      const current = players.get(userId) ?? { name: displayName(user), visits: 0, spent: 0 };
      current.visits += 1;
      current.spent += spent;
      players.set(userId, current);
    }
  }

  return {
    period,
    from: range.from,
    to: range.to,
    isComplete: range.to < today,
    hasNext: addDays(range.to, 1) <= today,
    previousFrom: previous.from,
    nextAnchor: addDays(range.to, 1),
    summary: summarize(held, firstVisit, range),
    previous: summarize(held, firstVisit, previous),
    trend: trendRanges.map((item) => {
      const summary = summarize(held, firstVisit, item);
      return { from: item.from, to: item.to, revenue: summary.revenue, tournaments: summary.tournaments, visits: summary.visits };
    }),
    formats: [...formats.values()]
      .map((item) => ({ ...item, averagePlayers: item.players / item.tournaments, averageRevenue: item.revenue / item.tournaments }))
      .sort((left, right) => right.revenue - left.revenue),
    weekdays: weekdays
      .filter((item) => item.tournaments > 0)
      .map((item) => ({ weekday: item.weekday, tournaments: item.tournaments, averagePlayers: item.players / item.tournaments, averageRevenue: item.revenue / item.tournaments })),
    topPlayers: [...players.values()].sort((left, right) => right.visits - left.visits || right.spent - left.spent).slice(0, 5),
    tournaments: [...inPeriod].reverse().map((item) => ({
      id: item.id,
      title: item.title,
      startsAt: item.startsAt,
      buyIn: item.buyIn,
      reEntry: item.reEntry,
      addOnPrice: item.addOnPrice,
      players: item.figures.players,
      reEntries: item.figures.reEntries,
      addOns: item.figures.addOns,
      registered: item.figures.registered,
      capacity: item.maxParticipants,
      buyInRevenue: item.figures.buyInRevenue,
      reEntryRevenue: item.figures.reEntryRevenue,
      addOnRevenue: item.figures.addOnRevenue,
      revenue: item.figures.revenue
    }))
  };
}
