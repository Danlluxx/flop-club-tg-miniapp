import { randomInt } from "node:crypto";
import { Prisma, type Tournament, type Registration } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";
import { assignNextAvailableSeat } from "./tournaments.js";
import { assertMechanicsOpen, mechanicsFor, resurrectionOutcome } from "./tournamentMechanics.js";

export async function lockTournament(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${id} FOR UPDATE`;
  const tournament = await tx.tournament.findUnique({ where: { id } });
  if (!tournament) throw notFound("Tournament");
  return tournament;
}
function rulesFor(t: Tournament) {
  const rules = mechanicsFor(t);
  if (!rules) throw new AppError(409, "Специальные механики не настроены", "MECHANICS_DISABLED");
  return rules;
}
function assertRunning(t: Tournament, now: Date) {
  if (!["OPEN", "CLOSED"].includes(t.status) || now < t.startsAt) throw new AppError(409, "Турнир ещё не начался или уже завершён", "TOURNAMENT_NOT_RUNNING");
}
export async function databaseNow(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
export async function issueEntry(tx: Prisma.TransactionClient, t: Tournament, r: Registration, actorId: string) {
  const rules = mechanicsFor(t);
  if (!rules) return;
  await tx.registration.update({ where: { id: r.id }, data: { issuedChips: rules.startingStack } });
  await tx.tournamentGameEvent.create({ data: { tournamentId: t.id, userId: r.userId, registrationId: r.id, actorId, eventKey: `entry:${r.id}`, type: r.entryNumber > 1 ? "RE_ENTRY" : "INITIAL_STACK", chips: rules.startingStack } });
}

export async function resurrect(tournamentId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const t = await lockTournament(tx, tournamentId);
    const rules = rulesFor(t);
    // A committed draw is returned even after the cutoff, a re-entry, or tournament completion.
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_attemptKey: { tournamentId, attemptKey: `resurrection:${userId}` } } });
    if (prior) return prior;
    const now = await databaseNow(tx);
    assertRunning(t, now);
    assertMechanicsOpen(rules, now);
    if (!rules.resurrection.enabled) throw new AppError(409, "Воскрешение выключено", "RESURRECTION_DISABLED");
    const r = await tx.registration.findFirst({ where: { tournamentId, userId, status: "ACTIVE" }, orderBy: [{ entryNumber: "desc" }, { createdAt: "desc" }] });
    if (!r || r.liveStatus !== "ELIMINATED" || !r.checkedInAt) throw new AppError(409, "Нужно подтверждённое выбивание", "ELIMINATION_REQUIRED");
    const elimination = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey: `elimination:${r.id}:${r.lifeNumber}` } } });
    if (!elimination) throw new AppError(409, "Выбивание не подтверждено", "ELIMINATION_REQUIRED");
    // Reserve eligibility for every outcome before drawing; capacity must not bias the lottery.
    const count = await tx.registration.count({ where: { tournamentId, status: "ACTIVE", liveStatus: "IN_GAME" } });
    if (count >= t.maxParticipants) throw new AppError(409, "Нет свободного места для возвращения", "TOURNAMENT_FULL");
    const outcome = resurrectionOutcome(randomInt(1000000), rules);
    const bigBlind = rules.blindLevels[t.blindLevelIndex];
    const chips = (outcome === "RESURRECT_5" ? 5 : outcome === "RESURRECT_10" ? 10 : 0) * bigBlind;
    if (chips) {
      const seat = await assignNextAvailableSeat(tx, tournamentId, t.maxParticipants, r.id);
      await tx.registration.updateMany({ where: { tournamentId, status: "ACTIVE", liveStatus: "IN_GAME" }, data: { finishPlace: null } });
      await tx.registration.updateMany({ where: { tournamentId, status: "ACTIVE", liveStatus: "ELIMINATED", finishPlace: { not: null } }, data: { finishPlace: { increment: 1 } } });
      await tx.registration.update({ where: { id: r.id }, data: { liveStatus: "IN_GAME", lifeNumber: { increment: 1 }, issuedChips: { increment: chips }, eliminatedAt: null, finishPlace: null, ...seat } });
    }
    return tx.tournamentGameEvent.create({ data: { tournamentId, userId, registrationId: r.id, actorId: userId, eventKey: `resurrection:${userId}`, attemptKey: `resurrection:${userId}`, type: outcome === "DEATH" ? "RESURRECTION_DEATH" : outcome === "RESURRECT_5" ? "RESURRECTION_5BB" : "RESURRECTION_10BB", outcome, eliminationId: elimination.id, bigBlind, chips, createdAt: now } });
  });
}

export async function eliminateDevil(tournamentId: string, registrationId: string, killerId: string | null | undefined, lifeNumber: number, actorId: string) {
  return prisma.$transaction(async tx => {
    const t = await lockTournament(tx, tournamentId);
    const rules = rulesFor(t);
    const eventKey = `elimination:${registrationId}:${lifeNumber}`;
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey } } });
    if (prior) return prior;
    const now = await databaseNow(tx);
    assertRunning(t, now);
    const r = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!r || r.tournamentId !== tournamentId) throw notFound("Registration");
    if (r.lifeNumber !== lifeNumber || r.liveStatus !== "IN_GAME" || r.status !== "ACTIVE" || !r.checkedInAt) throw new AppError(409, "Игрок уже выбыл или состояние изменилось", "PARTICIPANT_NOT_IN_GAME");
    const killer = killerId ? await tx.registration.findUnique({ where: { id: killerId } }) : null;
    if (rules.bounty.enabled && !killer) throw new AppError(400, "Укажите игрока, совершившего выбивание", "KILLER_REQUIRED");
    if (killer && (killer.userId === r.userId || killer.tournamentId !== tournamentId || killer.status !== "ACTIVE" || killer.liveStatus !== "IN_GAME" || !killer.checkedInAt)) throw new AppError(400, "Некорректный соперник", "INVALID_KILLER");
    const count = await tx.registration.count({ where: { tournamentId, status: "ACTIVE", liveStatus: "IN_GAME", checkedInAt: { not: null } } });
    await tx.registration.update({ where: { id: r.id }, data: { liveStatus: "ELIMINATED", finishPlace: count, eliminatedAt: now, tableNumber: null, seatNumber: null } });
    const event = await tx.tournamentGameEvent.create({ data: { tournamentId, userId: r.userId, registrationId: r.id, actorId, eventKey, type: "ELIMINATION", createdAt: now, details: { killerRegistrationId: killer?.id ?? null, lifeNumber } } });
    if (killer) {
      await tx.knockout.create({ data: { tournamentId, eliminatedRegistrationId: r.id, killerRegistrationId: killer.id, lifeNumber } });
      if (rules.bounty.enabled) {
        await tx.tournamentGameEvent.create({ data: { tournamentId, userId: killer.userId, registrationId: killer.id, actorId, eventKey: `bounty:${event.id}`, type: "BOUNTY_ELIMINATION", ratingPoints: rules.bounty.ratingPointsPerElimination, eliminationId: event.id, createdAt: now } });
        await tx.user.update({ where: { id: killer.userId }, data: { ratingPoints: { increment: rules.bounty.ratingPointsPerElimination }, knockouts: { increment: 1 } } });
      }
    }
    // Winner can still be provisional until resurrection/late registration ends.
    if (count === 2) await tx.registration.updateMany({ where: { tournamentId, status: "ACTIVE", liveStatus: "IN_GAME", checkedInAt: { not: null } }, data: { finishPlace: 1 } });
    return event;
  });
}

export type SixesInput = { registrationId: string; handId: string; kind: "POCKET_SIXES" | "DEVILS_666"; levelIndex: number; showdownConfirmed: true; wonHand: true; pocketSixesConfirmed: true };
export async function awardSixes(tournamentId: string, input: SixesInput, actorId: string) {
  return prisma.$transaction(async tx => {
    const t = await lockTournament(tx, tournamentId);
    const rules = rulesFor(t);
    const participant = await tx.registration.findUnique({ where: { id: input.registrationId } });
    if (!participant || participant.tournamentId !== tournamentId) throw notFound("Registration");
    const eventKey = `sixes:${input.handId}:${participant.userId}`;
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey } } });
    if (prior) return prior;
    const now = await databaseNow(tx);
    assertRunning(t, now); assertMechanicsOpen(rules, now);
    if (!rules.devilsSixes.enabled) throw new AppError(409, "Бонус выключен", "SIXES_DISABLED");
    if (!input.showdownConfirmed || !input.wonHand || !input.pocketSixesConfirmed) throw new AppError(400, "Подтвердите выигрыш и вскрытие карманных 66", "SHOWDOWN_REQUIRED");
    if (input.levelIndex !== t.blindLevelIndex) throw new AppError(409, "Уровень блайндов изменился. Обновите данные", "BLIND_CHANGED");
    const r = await tx.registration.findUnique({ where: { id: input.registrationId } });
    if (!r || r.tournamentId !== tournamentId || r.status !== "ACTIVE" || r.liveStatus !== "IN_GAME" || !r.checkedInAt) throw new AppError(409, "Игрок должен быть в игре", "PARTICIPANT_NOT_IN_GAME");
    const bigBlind = rules.blindLevels[t.blindLevelIndex];
    const chips = bigBlind * (input.kind === "DEVILS_666" ? rules.devilsSixes.setOfSixesBonusBB : rules.devilsSixes.pocketSixesBonusBB);
    const event = await tx.tournamentGameEvent.create({ data: { tournamentId, userId: r.userId, registrationId: r.id, actorId, eventKey, type: input.kind === "DEVILS_666" ? "DEVILS_SIXES_13BB" : "DEVILS_SIXES_6BB", handId: input.handId, bigBlind, chips, createdAt: now, details: { kind: input.kind, levelIndex: input.levelIndex, showdownConfirmed: true, wonHand: true, pocketSixesConfirmed: true } } });
    await tx.registration.update({ where: { id: r.id }, data: { issuedChips: { increment: chips } } });
    return event;
  });
}

export async function setBlindLevel(tournamentId: string, levelIndex: number, eventKey: string, actorId: string) {
  return prisma.$transaction(async tx => {
    const t = await lockTournament(tx, tournamentId);
    const rules = rulesFor(t);
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey: `blind:${eventKey}` } } });
    if (prior) return prior;
    assertRunning(t, await databaseNow(tx));
    if (!rules.blindLevels[levelIndex]) throw new AppError(400, "Нет такого уровня", "INVALID_BLIND_LEVEL");
    await tx.tournament.update({ where: { id: tournamentId }, data: { blindLevelIndex: levelIndex } });
    return tx.tournamentGameEvent.create({ data: { tournamentId, actorId, eventKey: `blind:${eventKey}`, type: "BLIND_LEVEL", bigBlind: rules.blindLevels[levelIndex], details: { levelIndex } } });
  });
}
export async function reverseAward(tournamentId: string, eventId: string, reason: string, actorId: string, correctedKind?: "POCKET_SIXES" | "DEVILS_666") {
  return prisma.$transaction(async tx => {
    const tournament = await lockTournament(tx, tournamentId);
    const rules = rulesFor(tournament);
    const prior = await tx.tournamentGameEvent.findUnique({ where: { reversesId: eventId } });
    if (prior) { if (prior.tournamentId !== tournamentId) throw notFound("Event"); return prior; }
    const event = await tx.tournamentGameEvent.findUnique({ where: { id: eventId } });
    if (!event || event.tournamentId !== tournamentId) throw notFound("Event");
    if (!["BOUNTY_ELIMINATION", "DEVILS_SIXES_6BB", "DEVILS_SIXES_13BB"].includes(event.type)) throw new AppError(400, "Можно отменить Bounty или бонус за шестёрки", "REVERSAL_NOT_ALLOWED");
    if (correctedKind && !event.type.startsWith("DEVILS_SIXES")) throw new AppError(400, "Заменить комбинацию можно только для шестёрок", "INVALID_CORRECTION");
    const correctedChips = correctedKind ? event.bigBlind * (correctedKind === "DEVILS_666" ? rules.devilsSixes.setOfSixesBonusBB : rules.devilsSixes.pocketSixesBonusBB) : 0;
    const chipsDelta = correctedChips - event.chips;
    if (event.ratingPoints && event.userId) await tx.user.update({ where: { id: event.userId }, data: { ratingPoints: { decrement: event.ratingPoints }, knockouts: { decrement: 1 } } });
    if (chipsDelta && event.registrationId) await tx.registration.update({ where: { id: event.registrationId }, data: { issuedChips: { increment: chipsDelta } } });
    return tx.tournamentGameEvent.create({ data: { tournamentId, userId: event.userId, registrationId: event.registrationId, actorId, eventKey: `reversal:${eventId}`, type: "ADMIN_CORRECTION", reversesId: eventId, reason, chips: chipsDelta, bigBlind: event.bigBlind, ratingPoints: -event.ratingPoints, details: { correctedKind: correctedKind ?? null, correctedChips } } });
  });
}

export async function getDevilState(tournamentId: string, userId?: string) {
  return prisma.$transaction(async tx => {
    const t = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw notFound("Tournament");
    const rules = rulesFor(t);
    const now = await databaseNow(tx);
    const events = await tx.tournamentGameEvent.findMany({ where: { tournamentId, ...(userId ? { userId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const registrations = await tx.registration.findMany({ where: { tournamentId, ...(userId ? { userId } : {}), status: "ACTIVE" }, orderBy: [{ entryNumber: "desc" }, { createdAt: "desc" }], include: { user: { select: { id: true, displayName: true, firstName: true, username: true } } } });
    const open = now.getTime() < new Date(rules.registrationClosesAt).getTime();
    const running = ["OPEN", "CLOSED"].includes(t.status) && now >= t.startsAt;
    const attempt = events.find(e => e.attemptKey === `resurrection:${userId}`) ?? null;
    const latest = registrations[0];
    const dealAvailable = !!(running && open && rules.resurrection.enabled && latest?.liveStatus === "ELIMINATED" && latest.checkedInAt && !attempt && events.some(e => e.eventKey === `elimination:${latest.id}:${latest.lifeNumber}`));
    const status = !latest ? null : dealAvailable ? "ТВОЯ СДЕЛКА ДОСТУПНА" : latest.liveStatus === "ELIMINATED" ? (attempt ? "ТЫ УЖЕ ИСПОЛЬЗОВАЛ СДЕЛКУ" : "ТЫ ВЫБЫЛ") : attempt?.chips && attempt.registrationId === latest.id ? "ТЫ ВОСКРЕС" : "ТЫ В ИГРЕ";
    const stats = {
      registered: new Set(registrations.map(r => r.userId)).size,
      active: registrations.filter(r => r.liveStatus === "IN_GAME" && r.checkedInAt).length,
      eliminations: events.filter(e => e.type === "ELIMINATION").length,
      attempts: events.filter(e => e.attemptKey).length,
      successful: events.filter(e => e.attemptKey && e.chips > 0).length,
      failed: events.filter(e => e.outcome === "DEATH").length,
      sixes: events.filter(e => e.type.startsWith("DEVILS_SIXES")).length,
      ratingPoints: events.reduce((sum, e) => sum + e.ratingPoints, 0)
    };
    return { tournamentId, rules, serverNow: now, running, registrationOpen: open && t.status === "OPEN", mechanicsOpen: open && running, blindLevelIndex: t.blindLevelIndex, bigBlind: rules.blindLevels[t.blindLevelIndex], dealAvailable, status, attempt, events, stats, ...(userId ? {} : { registrations }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function confirmReturn(tournamentId: string, registrationId: string, lifeNumber: number, actorId: string) {
  return prisma.$transaction(async tx => {
    const t = await lockTournament(tx, tournamentId); rulesFor(t);
    const eventKey = `return:${registrationId}:${lifeNumber}`;
    const prior = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_eventKey: { tournamentId, eventKey } } });
    if (prior) return prior;
    assertRunning(t, await databaseNow(tx));
    const r = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!r || r.tournamentId !== tournamentId || r.lifeNumber !== lifeNumber || r.liveStatus !== "IN_GAME") throw new AppError(409, "Состояние игрока изменилось", "PARTICIPANT_NOT_IN_GAME");
    const attempt = await tx.tournamentGameEvent.findUnique({ where: { tournamentId_attemptKey: { tournamentId, attemptKey: `resurrection:${r.userId}` } } });
    if (!attempt?.chips || attempt.registrationId !== r.id) throw new AppError(409, "Нет успешного воскрешения", "RESURRECTION_REQUIRED");
    return tx.tournamentGameEvent.create({ data: { tournamentId, userId: r.userId, registrationId, actorId, eventKey, type: "RETURN_CONFIRMED" } });
  });
}

export async function assertDevilCanFinish(tx: Prisma.TransactionClient, tournament: Tournament) {
  const rules = mechanicsFor(tournament);
  if (!rules) return;
  const now = await databaseNow(tx);
  const active = await tx.registration.count({ where: { tournamentId: tournament.id, status: "ACTIVE", liveStatus: "IN_GAME", checkedInAt: { not: null } } });
  if (now.getTime() < new Date(rules.registrationClosesAt).getTime() || active !== 1) throw new AppError(409, "Для завершения дождитесь закрытия специальных механик и определения одного победителя", "WINNER_NOT_DETERMINED");
}
