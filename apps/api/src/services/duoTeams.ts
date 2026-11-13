import { Prisma, RegistrationStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";

// FLOP DUO 2x2: players start alone, pairs are written down as ledger events (no schema change),
// and at the break after level 10 (still inside late registration) the pairs merge into teams.
//
// A merged team plays on the seat of its lead registration. The partner's registration is parked as
// ELIMINATED without a place, so every existing count (players in game, final table, clock average)
// already counts teams. When the team goes out, every registration of both partners gets its place.
export const DUO_TITLE = "FLOP DUO 2x2";
// Standard blind structure of the club: five 15-minute levels, a 10-minute break, five more levels, then the
// late-registration break. Level 10 ends 160 minutes after the start (21:40 for 19:00).
export const DUO_MERGE_AFTER_MINUTES = 5 * 15 + 10 + 5 * 15;

// Earliest moment the teams may merge: the end of level 10 counted from the scheduled start.
export function duoMergeOpensAt(startsAt: Date) {
  return new Date(startsAt.getTime() + DUO_MERGE_AFTER_MINUTES * 60_000);
}

const PAIR = "DUO_PAIR";
const UNPAIR = "DUO_UNPAIR";
const MERGE = "DUO_MERGE";
const CARD = "DUO_CARD";

// Each team has two cards of each kind, played from the app instead of cardboard: "Тайм-аут" gives the team
// one more minute for a decision, "Подсказка партнёра" gives the partner 30 seconds to advise.
export const DUO_CARD_SECONDS = { timeout: 60, hint: 30 } as const;
export type DuoCardType = keyof typeof DUO_CARD_SECONDS;
export const DUO_CARDS_PER_TEAM = 2;
export function isDuoCardType(value: string): value is DuoCardType {
  return value === "timeout" || value === "hint";
}

export function isDuoTournament(title: string) {
  return title === DUO_TITLE;
}

type Db = Prisma.TransactionClient | typeof prisma;

// A pair has two players; a team of one is a player the club left without a partner (odd number of players).
export type DuoPair = { eventId: string; userIds: string[] };

export async function activePairs(db: Db, tournamentId: string): Promise<DuoPair[]> {
  const events = await db.tournamentGameEvent.findMany({
    where: { tournamentId, type: { in: [PAIR, UNPAIR] } },
    orderBy: { createdAt: "asc" }
  });
  const removed = new Set(events.filter((event) => event.type === UNPAIR && event.reversesId).map((event) => event.reversesId as string));
  return events
    .filter((event) => event.type === PAIR && !removed.has(event.id))
    .map((event) => ({ eventId: event.id, userIds: (event.details as { userIds: string[] }).userIds }));
}

export async function isMerged(db: Db, tournamentId: string) {
  return Boolean(await db.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey: `duo-merge:${tournamentId}` } } }));
}

export function partnerOf(pairs: DuoPair[], userId: string) {
  const pair = pairs.find((item) => item.userIds.includes(userId));
  return pair ? pair.userIds.find((id) => id !== userId) ?? null : null;
}

async function loadDuoTournament(tx: Prisma.TransactionClient, tournamentId: string) {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound("Tournament");
  if (!isDuoTournament(tournament.title)) throw new AppError(409, "Команды есть только в FLOP DUO", "NOT_DUO_TOURNAMENT");
  return tournament;
}

async function assertNotMerged(tx: Prisma.TransactionClient, tournamentId: string) {
  if (await isMerged(tx, tournamentId)) throw new AppError(409, "Команды уже объединены", "DUO_ALREADY_MERGED");
}

export async function createPair(tournamentId: string, userIds: string[], actorId?: string) {
  const members = [...new Set(userIds)];
  if (members.length < 1 || members.length > 2 || members.length !== userIds.length) throw new AppError(400, "Нужны один или два разных игрока", "DUO_SAME_PLAYER");
  await prisma.$transaction(async (tx) => {
    await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    const registered = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, userId: { in: members } },
      select: { userId: true }
    });
    if (new Set(registered.map((item) => item.userId)).size !== members.length) {
      throw new AppError(409, "Игроки должны быть записаны на турнир", "DUO_NOT_REGISTERED");
    }
    const pairs = await activePairs(tx, tournamentId);
    if (pairs.some((pair) => pair.userIds.some((id) => members.includes(id)))) {
      throw new AppError(409, "Игрок уже состоит в команде", "DUO_ALREADY_PAIRED");
    }
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        userId: members[0],
        actorId: actorId ?? null,
        eventKey: `duo-pair:${members.join(":")}:${Date.now()}`,
        type: PAIR,
        details: { userIds: members }
      }
    });
  });
}

export async function removePair(tournamentId: string, pairEventId: string, actorId?: string) {
  await prisma.$transaction(async (tx) => {
    await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    const pairs = await activePairs(tx, tournamentId);
    if (!pairs.some((pair) => pair.eventId === pairEventId)) throw notFound("Pair");
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        actorId: actorId ?? null,
        eventKey: `duo-unpair:${pairEventId}`,
        type: UNPAIR,
        reversesId: pairEventId
      }
    });
  });
}

export function shufflePairs(userIds: string[], random: () => number = Math.random) {
  const pool = [...userIds];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const pairs: [string, string][] = [];
  for (let index = 0; index + 1 < pool.length; index += 2) pairs.push([pool[index], pool[index + 1]]);
  return { pairs, left: pool.length % 2 ? pool[pool.length - 1] : null };
}

// Players who came alone are paired by lot. With an odd number the last one stays without a partner.
export async function drawPairs(tournamentId: string, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    const registrations = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE },
      select: { userId: true }
    });
    const taken = new Set((await activePairs(tx, tournamentId)).flatMap((pair) => pair.userIds));
    const solo = [...new Set(registrations.map((item) => item.userId))].filter((id) => !taken.has(id));
    const { pairs, left } = shufflePairs(solo);
    for (const [first, second] of pairs) {
      await tx.tournamentGameEvent.create({
        data: {
          tournamentId,
          userId: first,
          actorId: actorId ?? null,
          eventKey: `duo-pair:${first}:${second}:${Date.now()}`,
          type: PAIR,
          details: { userIds: [first, second], draw: true }
        }
      });
    }
    return { paired: pairs.length, left };
  });
}

type MergeRegistration = {
  id: string;
  userId: string;
  liveStatus: string;
  checkedInAt: Date | null;
  issuedChips: number;
};

// Pure plan for the merge: who is the lead and who is parked. A pair with one partner out needs no change:
// the survivor simply plays for the team alone, with no extra chips.
export function planMerge(pairs: DuoPair[], registrations: MergeRegistration[]) {
  const alive = (userId: string) =>
    registrations
      .filter((item) => item.userId === userId && item.liveStatus === "IN_GAME" && item.checkedInAt)
      .sort((left, right) => (left.checkedInAt as Date).getTime() - (right.checkedInAt as Date).getTime());
  const merges: { leadId: string; parkedId: string }[] = [];

  for (const pair of pairs) {
    if (pair.userIds.length < 2) continue;
    const [first, second] = pair.userIds.map((userId) => alive(userId));
    if (first.length && second.length) {
      const [lead, parked] = first[0].checkedInAt! <= second[0].checkedInAt! ? [first[0], second[0]] : [second[0], first[0]];
      merges.push({ leadId: lead.id, parkedId: parked.id });
    }
  }
  return { merges };
}

export async function mergeTeams(tournamentId: string, actorId?: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const tournament = await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    if (now < duoMergeOpensAt(tournament.startsAt)) {
      throw new AppError(409, "Объединять команды можно после 10 уровня, на перерыве", "DUO_TOO_EARLY");
    }
    const pairs = await activePairs(tx, tournamentId);
    const registrations = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE },
      select: { id: true, userId: true, liveStatus: true, checkedInAt: true, issuedChips: true }
    });
    const plan = planMerge(pairs, registrations);

    for (const { parkedId } of plan.merges) {
      await tx.registration.update({
        where: { id: parkedId },
        data: { liveStatus: "ELIMINATED", eliminatedAt: now, tableNumber: null, seatNumber: null, finishPlace: null }
      });
    }
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        actorId: actorId ?? null,
        eventKey: `duo-merge:${tournamentId}`,
        type: MERGE,
        details: { teams: plan.merges.length }
      }
    });
    return { teams: plan.merges.length };
  });
}

// After the merge a team is one unit: eliminating its lead gives every registration of both partners
// the same place. Returns the user ids that must share the place, or null for a plain elimination.
export async function teamUserIdsForElimination(tx: Prisma.TransactionClient, tournamentId: string, userId: string) {
  if (!(await isMerged(tx, tournamentId))) return null;
  const pairs = await activePairs(tx, tournamentId);
  const partner = partnerOf(pairs, userId);
  return partner ? [userId, partner] : null;
}

export async function duoState(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound("Tournament");
  const [pairs, merged, events, registrations] = await Promise.all([
    activePairs(prisma, tournamentId),
    isMerged(prisma, tournamentId),
    cardEvents(prisma, tournamentId),
    prisma.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE },
      include: { user: true },
      orderBy: { createdAt: "asc" }
    })
  ]);
  const players = new Map<string, { userId: string; name: string; inGame: boolean }>();
  for (const registration of registrations) {
    const known = players.get(registration.userId);
    const inGame = registration.liveStatus === "IN_GAME" && Boolean(registration.checkedInAt);
    const user = registration.user;
    const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.id;
    players.set(registration.userId, { userId: registration.userId, name, inGame: inGame || Boolean(known?.inGame) });
  }
  const paired = new Set(pairs.flatMap((pair) => pair.userIds));
  return {
    merged,
    mergeOpensAt: duoMergeOpensAt(tournament.startsAt),
    teams: pairs.map((pair) => ({ id: pair.eventId, players: pair.userIds.map((id) => players.get(id)).filter(Boolean), cards: teamCards(events, pair.eventId) })),
    solo: [...players.values()].filter((player) => !paired.has(player.userId))
  };
}

type CardEvent = { details: unknown };
type CardDetails = { pairId?: string; card?: string; endsAt?: string };

// Pure: what is left of a team's cards and which card is still running.
export function teamCards(events: CardEvent[], pairId: string, now = new Date()) {
  const mine = events.map((event) => event.details as CardDetails | null).filter((details): details is CardDetails => details?.pairId === pairId);
  const left = (card: DuoCardType) => Math.max(0, DUO_CARDS_PER_TEAM - mine.filter((details) => details.card === card).length);
  const running = mine
    .filter((details) => isDuoCardType(String(details.card)) && details.endsAt && new Date(details.endsAt) > now)
    .sort((a, b) => new Date(b.endsAt as string).getTime() - new Date(a.endsAt as string).getTime())[0];
  return {
    timeoutLeft: left("timeout"),
    hintLeft: left("hint"),
    active: running ? { card: running.card as DuoCardType, endsAt: running.endsAt as string } : null
  };
}

async function cardEvents(db: Db, tournamentId: string) {
  return db.tournamentGameEvent.findMany({ where: { tournamentId, type: CARD }, select: { details: true } });
}

// What a player sees on the tournament card: the partner and the team's cards.
export async function duoPlayerState(tournamentId: string, userId: string, now = new Date()) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound("Tournament");
  if (!isDuoTournament(tournament.title)) throw new AppError(409, "Команды есть только в FLOP DUO", "NOT_DUO_TOURNAMENT");
  const [pairs, merged, events] = await Promise.all([activePairs(prisma, tournamentId), isMerged(prisma, tournamentId), cardEvents(prisma, tournamentId)]);
  const pair = pairs.find((item) => item.userIds.includes(userId));
  if (!pair) return { merged, mergeOpensAt: duoMergeOpensAt(tournament.startsAt), team: null };
  const partnerId = pair.userIds.find((id) => id !== userId);
  const [partner, registrations] = await Promise.all([
    partnerId ? prisma.user.findUnique({ where: { id: partnerId } }) : null,
    prisma.registration.findMany({ where: { tournamentId, status: RegistrationStatus.ACTIVE, userId: { in: pair.userIds } }, select: { liveStatus: true, checkedInAt: true } })
  ]);
  const name = partner ? partner.displayName || [partner.firstName, partner.lastName].filter(Boolean).join(" ") || partner.username || "Партнёр" : null;
  return {
    merged,
    mergeOpensAt: duoMergeOpensAt(tournament.startsAt),
    team: {
      partnerName: name,
      inGame: registrations.some((item) => item.liveStatus === "IN_GAME" && item.checkedInAt),
      ...teamCards(events, pair.eventId, now),
      seconds: DUO_CARD_SECONDS
    }
  };
}

export async function playDuoCard(tournamentId: string, userId: string, card: DuoCardType, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await loadDuoTournament(tx, tournamentId);
    if (!(await isMerged(tx, tournamentId))) throw new AppError(409, "Карточки доступны после объединения команд", "DUO_NOT_MERGED");
    const pair = (await activePairs(tx, tournamentId)).find((item) => item.userIds.includes(userId));
    if (!pair) throw new AppError(409, "Вы играете без команды", "DUO_NO_TEAM");
    const alive = await tx.registration.count({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, userId: { in: pair.userIds }, liveStatus: "IN_GAME", checkedInAt: { not: null } }
    });
    if (!alive) throw new AppError(409, "Команда уже выбыла", "DUO_TEAM_OUT");
    const state = teamCards(await cardEvents(tx, tournamentId), pair.eventId, now);
    if (state.active) throw new AppError(409, "Карточка уже действует", "DUO_CARD_RUNNING");
    const left = card === "timeout" ? state.timeoutLeft : state.hintLeft;
    if (!left) throw new AppError(409, "Эти карточки закончились", "DUO_CARD_SPENT");
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        userId,
        eventKey: `duo-card:${pair.eventId}:${card}:${DUO_CARDS_PER_TEAM - left + 1}`,
        type: CARD,
        details: { pairId: pair.eventId, card, endsAt: new Date(now.getTime() + DUO_CARD_SECONDS[card] * 1000).toISOString() }
      }
    });
  });
  return duoPlayerState(tournamentId, userId, now);
}
