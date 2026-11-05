import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-clock-chips-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { clockChipTotals } = await import("../dist/routes/clock.js");

const row = (userId, entryNumber = 1, addOnCount = 0) => ({ userId, entryNumber, addOnCount });

test("a marked re-entry on the same row counts as a second entry", () => {
  assert.equal(clockChipTotals([row("a", 2), row("b")], 0).entries, 3);
});

test("a self-service re-entry row is not counted twice", () => {
  assert.equal(clockChipTotals([row("a", 1), row("a", 2), row("b")], 0).entries, 3);
});

test("add-ons are multiplied by the tournament add-on chips", () => {
  assert.equal(clockChipTotals([row("a", 1, 1), row("b", 1, 1), row("c")], 100000).addOnTotal, 200000);
});

test("no registrations give zero totals", () => {
  assert.deepEqual(clockChipTotals([], 100000), { entries: 0, addOnTotal: 0 });
});
