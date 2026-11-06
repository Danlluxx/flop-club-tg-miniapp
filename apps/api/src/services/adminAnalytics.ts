import { TournamentStatus } from "@prisma/client";
import { entriesByUser } from "./tournamentEntries.js";
import { dateKey } from "./tournamentSchedule.js";

export type AnalyticsPeriod = "day" | "week" | "month";

type AnalyticsUser = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramId: string;
  isStaff: boolean;
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
  if (period === "day") return { from: anchor, to: anchor };
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
// Club staff play their first entry for free; their re-entries and add-ons are paid as usual.
export function tournamentFigures(tournament: AnalyticsTournament) {
  const checkedIn = tournament.registrations.filter((registration) => registration.checkedInAt);
  const entries = entriesByUser(checkedIn);
  const addOnsByUser = new Map<string, number>();
  const staff = new Set<string>();
  for (const registration of checkedIn) {
    addOnsByUser.set(registration.userId, (addOnsByUser.get(registration.userId) ?? 0) + registration.addOnCount);
    if (registration.user.isStaff) staff.add(registration.userId);
  }

  const players = entries.size;
  const totalEntries = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const reEntries = totalEntries - players;
  const addOns = [...addOnsByUser.values()].reduce((sum, count) => sum + count, 0);
  const buyInRevenue = (players - staff.size) * tournament.buyIn;
  const reEntryRevenue = reEntries * tournament.reEntry;
  const addOnRevenue = addOns * tournament.addOnPrice;

  return {
    players,
    staffPlayers: staff.size,
    entries: totalEntries,
    reEntries,
    addOns,
    registered: new Set(tournament.registrations.map((registration) => registration.userId)).size,
    buyInRevenue,
    reEntryRevenue,
    addOnRevenue,
    revenue: buyInRevenue + reEntryRevenue + addOnRevenue,
    entriesByUser: entries,
    addOnsByUser,
    staff,
    spentByUser: new Map([...entries].map(([userId, count]) => [
      userId,
      (staff.has(userId) ? 0 : tournament.buyIn) + (count - 1) * tournament.reEntry + (addOnsByUser.get(userId) ?? 0) * tournament.addOnPrice
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
    staffVisits: total((figures) => figures.staffPlayers),
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

function rosterOf(item: HeldTournament, firstVisit: Map<string, string>) {
  return [...item.figures.spentByUser]
    .map(([userId, spent]) => ({
      name: displayName(item.registrations.find((registration) => registration.userId === userId)!.user),
      entries: item.figures.entriesByUser.get(userId) ?? 1,
      addOns: item.figures.addOnsByUser.get(userId) ?? 0,
      spent,
      isNew: firstVisit.get(userId) === item.key,
      isStaff: item.figures.staff.has(userId)
    }))
    .sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name, "ru-RU"));
}

export function buildAdminAnalytics(tournaments: AnalyticsTournament[], period: AnalyticsPeriod, requestedAnchor: string | undefined, today: string) {
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

  // Without a date the day view opens on the latest day that had a tournament: today is usually still empty.
  const latestDay = held.filter((item) => item.key <= today).at(-1)?.key;
  const anchor = requestedAnchor ?? (period === "day" ? latestDay : undefined) ?? today;
  const range = periodRange(period, anchor);
  const previous = previousRange(period, range);
  // A format comes back on its weekday, so a day is compared with the same weekday a week earlier.
  const comparison = period === "day" ? periodRange("day", addDays(range.from, -7)) : previous;
  // Day arrows step over days without tournaments.
  const dayBefore = period === "day" ? held.filter((item) => item.key < range.from).at(-1)?.key : undefined;
  const dayAfter = period === "day" ? held.find((item) => item.key > range.to && item.key <= today)?.key : undefined;

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
    hasNext: period === "day" ? Boolean(dayAfter) : addDays(range.to, 1) <= today,
    previousFrom: dayBefore ?? previous.from,
    nextAnchor: dayAfter ?? addDays(range.to, 1),
    summary: summarize(held, firstVisit, range),
    previous: summarize(held, firstVisit, comparison),
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
      staffPlayers: item.figures.staffPlayers,
      reEntries: item.figures.reEntries,
      addOns: item.figures.addOns,
      registered: item.figures.registered,
      capacity: item.maxParticipants,
      buyInRevenue: item.figures.buyInRevenue,
      reEntryRevenue: item.figures.reEntryRevenue,
      addOnRevenue: item.figures.addOnRevenue,
      revenue: item.figures.revenue,
      roster: period === "day" ? rosterOf(item, firstVisit) : []
    }))
  };
}
