import { Prisma, RegistrationStatus, TournamentProfile } from "@prisma/client";
import { prisma } from "../prisma.js";
import { AppError, notFound } from "../utils/errors.js";
import { SEATS_PER_TABLE, TABLES_COUNT } from "./tournaments.js";

const liveRegistrationInclude = {
  user: true
} satisfies Prisma.RegistrationInclude;

type LiveRegistration = Prisma.RegistrationGetPayload<{ include: typeof liveRegistrationInclude }>;
type ReseatRegistration = {
  id: string;
  tableNumber: number | null;
  seatNumber: number | null;
  createdAt: Date;
};
type SeatMove = {
  registrationId: string;
  tableNumber: number;
  seatNumber: number;
};

export async function getTournamentLiveState(tournamentId: string) {
  return prisma.$transaction((tx) => buildLiveState(tx, tournamentId));
}

export async function moveLiveSeat(tournamentId: string, registrationId: string, tableNumber: number, seatNumber: number) {
  assertSeat(tableNumber, seatNumber);

  await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.tournamentId !== tournamentId) throw notFound("Registration");
    if (registration.status !== RegistrationStatus.ACTIVE || registration.liveStatus !== "IN_GAME" || !registration.checkedInAt) {
      throw new AppError(409, "Only active in-game participants can be moved", "PARTICIPANT_NOT_IN_GAME");
    }

    const occupied = await tx.registration.findFirst({
      where: {
        tournamentId,
        id: { not: registrationId },
        status: RegistrationStatus.ACTIVE,
        liveStatus: "IN_GAME",
        checkedInAt: { not: null },
        tableNumber,
        seatNumber
      }
    });
    if (occupied) throw new AppError(409, "Seat is already occupied", "SEAT_OCCUPIED");

    await tx.registration.update({
      where: { id: registrationId },
      data: { tableNumber, seatNumber }
    });
    console.log(`[live:seat:move] tournament=${tournamentId} registration=${registrationId} table=${tableNumber} seat=${seatNumber}`);
  });

  return getTournamentLiveState(tournamentId);
}

export async function autoReseatTournament(tournamentId: string) {
  await prisma.$transaction(async (tx) => {
    await ensureTournamentExists(tx, tournamentId);
    await balanceSeats(tx, tournamentId);
    console.log(`[live:reseat:auto] tournament=${tournamentId}`);
  });

  return getTournamentLiveState(tournamentId);
}

export async function formFinalTable(tournamentId: string) {
  await prisma.$transaction(async (tx) => {
    await ensureTournamentExists(tx, tournamentId);
    const registrations = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME", checkedInAt: { not: null } },
      orderBy: [{ tableNumber: "asc" }, { seatNumber: "asc" }, { createdAt: "asc" }]
    });

    if (registrations.length > 9) {
      throw new AppError(409, "Final table can be formed only with 9 or fewer players", "FINAL_TABLE_TOO_EARLY");
    }
    if (registrations.length < 2) {
      throw new AppError(409, "Not enough active players for final table", "FINAL_TABLE_NOT_ENOUGH_PLAYERS");
    }

    const shuffled = shuffle(registrations);
    await tx.registration.updateMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME", checkedInAt: { not: null } },
      data: { tableNumber: null, seatNumber: null }
    });

    for (const [index, registration] of shuffled.entries()) {
      await tx.registration.update({
        where: { id: registration.id },
        data: { tableNumber: 1, seatNumber: index + 1 }
      });
    }

    console.log(`[live:final-table] tournament=${tournamentId} players=${registrations.length}`);
  });

  return getTournamentLiveState(tournamentId);
}

export async function recordElimination(
  tournamentId: string,
  eliminatedRegistrationId: string,
  killerRegistrationId: string | null | undefined
) {
  await prisma.$transaction(async (tx) => {
    const tournament = await ensureTournamentExists(tx, tournamentId);

    const eliminated = await tx.registration.findUnique({ where: { id: eliminatedRegistrationId } });
    if (!eliminated || eliminated.tournamentId !== tournamentId) throw notFound("Eliminated registration");
    if (eliminated.status !== RegistrationStatus.ACTIVE || eliminated.liveStatus !== "IN_GAME" || !eliminated.checkedInAt) {
      throw new AppError(409, "Participant is already eliminated or cancelled", "PARTICIPANT_NOT_IN_GAME");
    }

    let killerId: string | null = null;
    if (killerRegistrationId) {
      if (killerRegistrationId === eliminatedRegistrationId) {
        throw new AppError(400, "Participant cannot knock out themselves", "KNOCKOUT_SELF");
      }

      const killer = await tx.registration.findUnique({ where: { id: killerRegistrationId } });
      if (!killer || killer.tournamentId !== tournamentId) throw notFound("Killer registration");
      if (killer.status !== RegistrationStatus.ACTIVE || killer.liveStatus !== "IN_GAME" || !killer.checkedInAt) {
        throw new AppError(409, "Killer must be active in game", "KILLER_NOT_IN_GAME");
      }
      killerId = killer.id;
    }

    const inGameCountBefore = await tx.registration.count({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME", checkedInAt: { not: null } }
    });
    const finishPlace = Math.max(1, inGameCountBefore);

    if (killerId && tournament.profile !== TournamentProfile.KNOCKOUT) {
      throw new AppError(400, "Killer can be set only for bounty/knockout tournaments", "KNOCKOUT_NOT_ALLOWED_FOR_PROFILE");
    }

    if (killerId) {
      await tx.knockout.create({
        data: {
          tournamentId,
          eliminatedRegistrationId,
          killerRegistrationId: killerId
        }
      });
    }

    await tx.registration.update({
      where: { id: eliminatedRegistrationId },
      data: {
        liveStatus: "ELIMINATED",
        eliminatedAt: new Date(),
        finishPlace,
        tableNumber: null,
        seatNumber: null
      }
    });

    const remaining = await tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME", checkedInAt: { not: null } },
      orderBy: { createdAt: "asc" }
    });
    if (remaining.length === 1 && remaining[0].finishPlace === null) {
      await tx.registration.update({
        where: { id: remaining[0].id },
        data: { finishPlace: 1 }
      });
    }

    console.log(
      `[live:elimination:create] tournament=${tournamentId} eliminated=${eliminatedRegistrationId} finishPlace=${finishPlace} killer=${killerId ?? "none"}`
    );
  });

  return getTournamentLiveState(tournamentId);
}

async function ensureTournamentExists(tx: Prisma.TransactionClient, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, profile: true } });
  if (!tournament) throw notFound("Tournament");
  return tournament;
}

async function balanceSeats(tx: Prisma.TransactionClient, tournamentId: string) {
  const registrations = await tx.registration.findMany({
    where: { tournamentId, status: RegistrationStatus.ACTIVE, liveStatus: "IN_GAME", checkedInAt: { not: null } },
    select: { id: true, tableNumber: true, seatNumber: true, createdAt: true },
    orderBy: [{ tableNumber: "asc" }, { seatNumber: "asc" }, { createdAt: "asc" }]
  });

  const moves = buildMinimalBalanceMoves(registrations);

  for (const move of moves) {
    await tx.registration.update({
      where: { id: move.registrationId },
      data: { tableNumber: move.tableNumber, seatNumber: move.seatNumber }
    });
  }
}

function buildMinimalBalanceMoves(registrations: ReseatRegistration[]): SeatMove[] {
  if (!registrations.length) return [];

  const tableCount = Math.min(TABLES_COUNT, Math.max(1, Math.ceil(registrations.length / SEATS_PER_TABLE)));
  const targetCounts = getBalancedTargetCounts(registrations.length, tableCount);
  const selectedTables = selectTablesToKeep(registrations, targetCounts);
  const selectedSet = new Set(selectedTables.map((item) => item.tableNumber));
  const targets = new Map(selectedTables.map((item) => [item.tableNumber, item.target]));
  const grouped = groupByTable(registrations);
  const keepByTable = new Map<number, ReseatRegistration[]>();
  const movers: ReseatRegistration[] = [];

  for (let tableNumber = 1; tableNumber <= TABLES_COUNT; tableNumber += 1) {
    const tableRegistrations = grouped.get(tableNumber) ?? [];
    if (!selectedSet.has(tableNumber)) {
      movers.push(...tableRegistrations);
      continue;
    }

    const target = targets.get(tableNumber) ?? 0;
    const { kept, moved } = splitKeptAndMoved(tableRegistrations, target);
    keepByTable.set(tableNumber, kept);
    movers.push(...moved);
  }

  movers.push(...(grouped.get(0) ?? []));
  movers.sort(compareRegistrations);

  const assignments = new Map<string, { tableNumber: number; seatNumber: number }>();
  for (const { tableNumber, target } of selectedTables) {
    const kept = keepByTable.get(tableNumber) ?? [];
    const occupiedSeats = new Set(kept.map((registration) => registration.seatNumber).filter(isSeatNumber));
    const freeSeats = Array.from({ length: SEATS_PER_TABLE }, (_, index) => index + 1).filter((seat) => !occupiedSeats.has(seat));
    const missing = Math.max(0, target - kept.length);

    for (let index = 0; index < missing; index += 1) {
      const mover = movers.shift();
      const seatNumber = freeSeats[index];
      if (!mover || !seatNumber) break;
      assignments.set(mover.id, { tableNumber, seatNumber });
    }
  }

  return [...assignments.entries()]
    .map(([registrationId, assignment]) => ({ registrationId, ...assignment }))
    .filter((move) => {
      const registration = registrations.find((item) => item.id === move.registrationId);
      return registration?.tableNumber !== move.tableNumber || registration?.seatNumber !== move.seatNumber;
    });
}

function getBalancedTargetCounts(total: number, tableCount: number) {
  const baseCount = Math.floor(total / tableCount);
  const extraTables = total % tableCount;
  return Array.from({ length: tableCount }, (_, index) => baseCount + (index < extraTables ? 1 : 0));
}

function selectTablesToKeep(registrations: ReseatRegistration[], targetCounts: number[]) {
  const counts = new Map<number, number>();
  for (let tableNumber = 1; tableNumber <= TABLES_COUNT; tableNumber += 1) counts.set(tableNumber, 0);
  for (const registration of registrations) {
    if (registration.tableNumber && registration.tableNumber >= 1 && registration.tableNumber <= TABLES_COUNT) {
      counts.set(registration.tableNumber, (counts.get(registration.tableNumber) ?? 0) + 1);
    }
  }

  let best: { tableNumber: number; target: number }[] = [];
  let bestScore = { kept: -1, occupied: -1, tablePenalty: Number.POSITIVE_INFINITY };

  for (const tableNumbers of combinations([1, 2, 3, 4, 5], targetCounts.length)) {
    for (const targets of uniquePermutations(targetCounts)) {
      const plan = tableNumbers.map((tableNumber, index) => ({ tableNumber, target: targets[index] }));
      const kept = plan.reduce((sum, item) => sum + Math.min(counts.get(item.tableNumber) ?? 0, item.target), 0);
      const occupied = plan.reduce((sum, item) => sum + (counts.get(item.tableNumber) ?? 0), 0);
      const tablePenalty = plan.reduce((sum, item) => sum + item.tableNumber, 0);
      const score = { kept, occupied, tablePenalty };

      if (isBetterBalanceScore(score, bestScore)) {
        best = plan;
        bestScore = score;
      }
    }
  }

  return best.sort((a, b) => a.tableNumber - b.tableNumber);
}

function splitKeptAndMoved(registrations: ReseatRegistration[], target: number) {
  const kept: ReseatRegistration[] = [];
  const moved: ReseatRegistration[] = [];
  const occupiedSeats = new Set<number>();

  for (const registration of [...registrations].sort(compareRegistrations)) {
    if (kept.length < target && isSeatNumber(registration.seatNumber) && !occupiedSeats.has(registration.seatNumber)) {
      kept.push(registration);
      occupiedSeats.add(registration.seatNumber);
    } else {
      moved.push(registration);
    }
  }

  return { kept, moved };
}

function groupByTable(registrations: ReseatRegistration[]) {
  const grouped = new Map<number, ReseatRegistration[]>();
  for (const registration of registrations) {
    const tableNumber = registration.tableNumber && registration.tableNumber >= 1 && registration.tableNumber <= TABLES_COUNT
      ? registration.tableNumber
      : 0;
    const items = grouped.get(tableNumber) ?? [];
    items.push(registration);
    grouped.set(tableNumber, items);
  }
  return grouped;
}

function compareRegistrations(a: ReseatRegistration, b: ReseatRegistration) {
  return (
    (a.tableNumber ?? TABLES_COUNT + 1) - (b.tableNumber ?? TABLES_COUNT + 1) ||
    (a.seatNumber ?? SEATS_PER_TABLE + 1) - (b.seatNumber ?? SEATS_PER_TABLE + 1) ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

function isSeatNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= SEATS_PER_TABLE;
}

function isBetterBalanceScore(
  score: { kept: number; occupied: number; tablePenalty: number },
  bestScore: { kept: number; occupied: number; tablePenalty: number }
) {
  return (
    score.kept > bestScore.kept ||
    (score.kept === bestScore.kept && score.occupied > bestScore.occupied) ||
    (score.kept === bestScore.kept && score.occupied === bestScore.occupied && score.tablePenalty < bestScore.tablePenalty)
  );
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((combination) => [first, ...combination]),
    ...combinations(rest, size)
  ];
}

function uniquePermutations(values: number[]) {
  const result: number[][] = [];
  const seen = new Set<string>();

  function walk(prefix: number[], rest: number[]) {
    if (!rest.length) {
      const key = prefix.join(":");
      if (!seen.has(key)) {
        seen.add(key);
        result.push(prefix);
      }
      return;
    }
    for (let index = 0; index < rest.length; index += 1) {
      walk([...prefix, rest[index]], [...rest.slice(0, index), ...rest.slice(index + 1)]);
    }
  }

  walk([], values);
  return result;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

async function buildLiveState(tx: Prisma.TransactionClient, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound("Tournament");

  const [registrations, knockouts] = await Promise.all([
    tx.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.ACTIVE },
      include: liveRegistrationInclude,
      orderBy: [{ liveStatus: "asc" }, { tableNumber: "asc" }, { seatNumber: "asc" }, { createdAt: "asc" }]
    }),
    tx.knockout.findMany({
      where: { tournamentId },
      include: {
        eliminatedRegistration: { include: { user: true } },
        killerRegistration: { include: { user: true } }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const inGame = registrations.filter((registration) => registration.liveStatus === "IN_GAME" && registration.checkedInAt);
  const eliminated = registrations.filter((registration) => registration.liveStatus === "ELIMINATED");
  const bySeat = new Map(inGame.map((registration) => [`${registration.tableNumber}:${registration.seatNumber}`, registration]));

  const tables = Array.from({ length: TABLES_COUNT }, (_, tableIndex) => {
    const tableNumber = tableIndex + 1;
    const seats = Array.from({ length: SEATS_PER_TABLE }, (_, seatIndex) => {
      const seatNumber = seatIndex + 1;
      return {
        seatNumber,
        registration: bySeat.get(`${tableNumber}:${seatNumber}`) ?? null
      };
    });

    return {
      tableNumber,
      occupied: seats.filter((seat) => seat.registration).length,
      seats
    };
  });

  return { tournament, registrations, inGame, eliminated, tables, knockouts };
}

function assertSeat(tableNumber: number, seatNumber: number) {
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > TABLES_COUNT) {
    throw new AppError(400, "Invalid table number", "INVALID_TABLE_NUMBER");
  }
  if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > SEATS_PER_TABLE) {
    throw new AppError(400, "Invalid seat number", "INVALID_SEAT_NUMBER");
  }
}
