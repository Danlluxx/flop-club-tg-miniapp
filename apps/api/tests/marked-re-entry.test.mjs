import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-marked-re-entry-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { restoreEliminatedRegistration } = await import("../dist/services/liveTournament.js");

function matches(row, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === null || typeof condition !== "object") return row[key] === condition;
    if ("not" in condition) return row[key] !== condition.not;
    return row[key] !== null && row[key] < condition.lt;
  });
}

function fakeTx(rows) {
  const apply = (row, data) => {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value !== null && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
    }
    return row;
  };
  return {
    registration: {
      findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
      updateMany: async ({ where, data }) => ({ count: rows.filter((row) => matches(row, where)).map((row) => apply(row, data)).length }),
      update: async ({ where, data }) => apply(rows.find((row) => row.id === where.id), data)
    }
  };
}

const player = (id, finishPlace, tableNumber = null, seatNumber = null) => ({
  id,
  tournamentId: "t",
  status: "ACTIVE",
  liveStatus: finishPlace && finishPlace > 1 ? "ELIMINATED" : "IN_GAME",
  checkedInAt: new Date(0),
  eliminatedAt: finishPlace && finishPlace > 1 ? new Date(0) : null,
  finishPlace,
  tableNumber,
  seatNumber,
  entryNumber: 1,
  lifeNumber: 1
});

test("the returning player is back in game on a free seat with a new entry and life", async () => {
  const rows = [player("in", null, 1, 1), player("out", 2)];
  const restored = await restoreEliminatedRegistration(fakeTx(rows), rows[1], 40);
  assert.equal(restored.liveStatus, "IN_GAME");
  assert.equal(restored.finishPlace, null);
  assert.equal(restored.eliminatedAt, null);
  assert.equal(restored.entryNumber, 2);
  assert.equal(restored.lifeNumber, 2);
  assert.deepEqual([restored.tableNumber, restored.seatNumber], [1, 2]);
});

test("those eliminated later move up a place, those eliminated earlier keep theirs", async () => {
  const rows = [player("a", 5), player("b", 4), player("c", 3), player("d", null, 1, 1), player("e", null, 1, 2)];
  await restoreEliminatedRegistration(fakeTx(rows), rows[1], 40);
  assert.deepEqual(rows.map((row) => row.finishPlace), [5, null, 4, null, null]);
  // The next elimination gets place = players in game (3): it must be free.
  assert.ok(!rows.some((row) => row.finishPlace === 3));
});

test("the provisional winner loses 1st place when someone returns", async () => {
  const rows = [player("winner", 1, 1, 1), player("runner-up", 2)];
  await restoreEliminatedRegistration(fakeTx(rows), rows[1], 40);
  assert.deepEqual(rows.map((row) => row.finishPlace), [null, null]);
});
