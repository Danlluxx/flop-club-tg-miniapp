import { Prisma, RegistrationStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";

// FLOP DUO 2x2: players start alone, pairs are written down as ledger events (no schema change),
// and after late registration closes the pairs merge into teams.
//
// A merged team plays on the seat of its lead registration. The partner's registration is parked as
// ELIMINATED without a place, so every existing count (players in game, final table, clock average)
// already counts teams. When the team goes out, every registration of both partners gets its place.
export const DUO_TITLE = "FLOP DUO 2x2";
export const DUO_SURVIVOR_BONUS_CHIPS = 25000;

const PAIR = "DUO_PAIR";
const UNPAIR = "DUO_UNPAIR";
const MERGE = "DUO_MERGE";
const SURVIVOR_BONUS = "DUO_SURVIVOR_BONUS";

export function isDuoTournament(title: string) {
  return title === DUO_TITLE;
}

type Db = Prisma.TransactionClient | typeof prisma;

export type DuoPair = { eventId: string; userIds: [string, string] };

export async function activePairs(db: Db, tournamentId: string): Promise<DuoPair[]> {
  const events = await db.tournamentGameEvent.findMany({
    where: { tournamentId, type: { in: [PAIR, UNPAIR] } },
    orderBy: { createdAt: "asc" }
  });
  const removed = new Set(events.filter((event) => event.type === UNPAIR && event.reversesId).map((event) => event.reversesId as string));
  return events
    .filter((event) => event.type === PAIR && !removed.has(event.id))
    .map((event) => ({ eventId: event.id, userIds: (event.details as { userIds: [string, string] }).userIds }));
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

export async function createPair(tournamentId: string, firstUserId: string, secondUserId: string, actorId?: string) {
  if (firstUserId === secondUserId) throw new AppError(400, "Нужны два разных игрока", "DUO_SAME_PLAYER");
  await prisma.$transaction(async (tx) => {
    await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    const registered = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, userId: { in: [firstUserId, secondUserId] } },
      select: { userId: true }
    });
    if (new Set(registered.map((item) => item.userId)).size !== 2) {
      throw new AppError(409, "Оба игрока должны быть записаны на турнир", "DUO_NOT_REGISTERED");
    }
    const pairs = await activePairs(tx, tournamentId);
    if (pairs.some((pair) => pair.userIds.includes(firstUserId) || pair.userIds.includes(secondUserId))) {
      throw new AppError(409, "Игрок уже состоит в команде", "DUO_ALREADY_PAIRED");
    }
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        userId: firstUserId,
        actorId: actorId ?? null,
        eventKey: `duo-pair:${firstUserId}:${secondUserId}:${Date.now()}`,
        type: PAIR,
        details: { userIds: [firstUserId, secondUserId] }
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

// Pure plan for the merge: who is the lead, who is parked, who receives the survivor bonus.
export function planMerge(pairs: DuoPair[], registrations: MergeRegistration[]) {
  const alive = (userId: string) =>
    registrations
      .filter((item) => item.userId === userId && item.liveStatus === "IN_GAME" && item.checkedInAt)
      .sort((left, right) => (left.checkedInAt as Date).getTime() - (right.checkedInAt as Date).getTime());
  const merges: { leadId: string; parkedId: string }[] = [];
  const bonuses: { registrationId: string; userId: string }[] = [];

  for (const pair of pairs) {
    const [first, second] = pair.userIds.map((userId) => alive(userId));
    if (first.length && second.length) {
      const [lead, parked] = first[0].checkedInAt! <= second[0].checkedInAt! ? [first[0], second[0]] : [second[0], first[0]];
      merges.push({ leadId: lead.id, parkedId: parked.id });
    } else if (first.length || second.length) {
      const survivor = (first.length ? first : second)[0];
      bonuses.push({ registrationId: survivor.id, userId: survivor.userId });
    }
  }
  return { merges, bonuses };
}

export async function mergeTeams(tournamentId: string, actorId?: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const tournament = await loadDuoTournament(tx, tournamentId);
    await assertNotMerged(tx, tournamentId);
    if (tournament.lateRegistrationEndsAt && now < tournament.lateRegistrationEndsAt) {
      throw new AppError(409, "Объединять команды можно после окончания поздней регистрации", "DUO_LATE_REGISTRATION_OPEN");
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
    for (const bonus of plan.bonuses) {
      await tx.registration.update({ where: { id: bonus.registrationId }, data: { issuedChips: { increment: DUO_SURVIVOR_BONUS_CHIPS } } });
      await tx.tournamentGameEvent.create({
        data: {
          tournamentId,
          userId: bonus.userId,
          registrationId: bonus.registrationId,
          actorId: actorId ?? null,
          eventKey: `duo-bonus:${bonus.registrationId}`,
          type: SURVIVOR_BONUS,
          chips: DUO_SURVIVOR_BONUS_CHIPS
        }
      });
    }
    await tx.tournamentGameEvent.create({
      data: {
        tournamentId,
        actorId: actorId ?? null,
        eventKey: `duo-merge:${tournamentId}`,
        type: MERGE,
        details: { teams: plan.merges.length, survivorBonuses: plan.bonuses.length }
      }
    });
    return { teams: plan.merges.length, survivorBonuses: plan.bonuses.length };
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
  const [pairs, merged, registrations] = await Promise.all([
    activePairs(prisma, tournamentId),
    isMerged(prisma, tournamentId),
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
    lateRegistrationEndsAt: tournament.lateRegistrationEndsAt,
    survivorBonusChips: DUO_SURVIVOR_BONUS_CHIPS,
    teams: pairs.map((pair) => ({ id: pair.eventId, players: pair.userIds.map((id) => players.get(id)).filter(Boolean) })),
    solo: [...players.values()].filter((player) => !paired.has(player.userId))
  };
}
