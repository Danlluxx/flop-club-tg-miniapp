import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-schedule-lock-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { prisma } = await import("../dist/prisma.js");
const { ensureScheduledTournaments, scheduledTournamentForDate } = await import("../dist/services/tournamentSchedule.js");

const dateKeyValue = "2026-11-05";
const day = new Date(`${dateKeyValue}T12:00:00+07:00`);
const expected = scheduledTournamentForDate(dateKeyValue);

function fakeDb(rows) {
  const updates = [];
  const deleted = [];
  const matches = (row, where) =>
    (!where.id?.startsWith || row.id.startsWith(where.id.startsWith)) &&
    (!where.id?.not || row.id !== where.id.not) &&
    (where.scheduleLocked === undefined || row.scheduleLocked === where.scheduleLocked);
  const tx = {
    tournament: {
      findUnique: async ({ where }) => rows.find((row) => row.id === where.id) ?? null,
      findFirst: async ({ where }) => rows.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
      findUniqueOrThrow: async ({ where }) => rows.find((row) => row.id === where.id),
      update: async ({ where, data }) => {
        updates.push({ id: where.id, data });
        return Object.assign(rows.find((row) => row.id === where.id), data);
      },
      create: async ({ data }) => {
        rows.push(data);
        return data;
      },
      delete: async ({ where }) => {
        deleted.push(where.id);
      }
    },
    tournamentReminder: { deleteMany: async () => ({}) },
    tournamentRatingResult: { deleteMany: async () => ({}) },
    knockout: { updateMany: async () => ({}) },
    registration: { updateMany: async () => ({}) }
  };
  return { tx, updates, deleted };
}

async function syncWith(db) {
  const originalDeleted = prisma.deletedScheduledTournament;
  const originalTransaction = prisma.$transaction;
  Object.defineProperty(prisma, "deletedScheduledTournament", { configurable: true, value: { findMany: async () => [] } });
  Object.defineProperty(prisma, "$transaction", { configurable: true, value: (run) => run(db.tx) });
  try {
    await ensureScheduledTournaments(day, day);
  } finally {
    Object.defineProperty(prisma, "deletedScheduledTournament", { configurable: true, value: originalDeleted });
    Object.defineProperty(prisma, "$transaction", { configurable: true, value: originalTransaction });
  }
}

test("schedule sync still overwrites a tournament nobody saved by hand", async () => {
  const db = fakeDb([{ id: expected.id, title: "Старое", buyIn: 1, scheduleLocked: false, mechanics: null }]);
  await syncWith(db);
  assert.equal(db.updates[0].id, expected.id);
  assert.equal(db.updates[0].data.title, expected.title);
});

test("schedule sync leaves a tournament saved by an admin alone", async () => {
  const row = { id: expected.id, title: "Своё название", buyIn: 777, scheduleLocked: true, mechanics: null };
  const db = fakeDb([row]);
  await syncWith(db);
  assert.deepEqual(db.updates, []);
  assert.equal(row.title, "Своё название");
  assert.equal(row.buyIn, 777);
});

test("schedule sync does not create a duplicate next to a saved tournament with an outdated id", async () => {
  const rows = [{ id: `${dateKeyValue}-old-format`, title: "Своё", scheduleLocked: true, mechanics: null }];
  const db = fakeDb(rows);
  await syncWith(db);
  assert.equal(rows.length, 1);
  assert.deepEqual(db.updates, []);
  assert.deepEqual(db.deleted, []);
});

test("merging duplicates never removes a saved tournament", async () => {
  const saved = { id: `${dateKeyValue}-saved`, title: "Своё", scheduleLocked: true, mechanics: null };
  const stale = { id: `${dateKeyValue}-stale`, title: "Дубль", scheduleLocked: false, mechanics: null };
  const db = fakeDb([{ id: expected.id, title: expected.title, scheduleLocked: false, mechanics: null }, saved, stale]);
  await syncWith(db);
  assert.deepEqual(db.deleted, [stale.id]);
});
