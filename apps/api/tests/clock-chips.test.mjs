import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-clock-chips-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { clockChipTotals } = await import("../dist/routes/clock.js");

const row = (userId, entryNumber = 1, addOnCount = 0, issuedChips = 0) => ({ userId, entryNumber, addOnCount, issuedChips });

test("a marked re-entry on the same row counts as a second entry", () => {
  assert.equal(clockChipTotals([row("a", 2), row("b")], 0, false).entries, 3);
});

test("a self-service re-entry row is not counted twice", () => {
  assert.equal(clockChipTotals([row("a", 1), row("a", 2), row("b")], 0, false).entries, 3);
});

test("add-ons are multiplied by the tournament add-on chips", () => {
  assert.equal(clockChipTotals([row("a", 1, 1), row("b", 1, 1), row("c")], 100000, false).addOnTotal, 200000);
});

test("no registrations give zero totals", () => {
  assert.deepEqual(clockChipTotals([], 100000, false), { entries: 0, addOnTotal: 0, stackBonus: 0 });
});

test("early registration chips are added outside Devil Deal only", () => {
  const rows = [row("a", 1, 0, 5000), row("b", 1, 0, 5000), row("c")];
  assert.equal(clockChipTotals(rows, 0, false).stackBonus, 10000);
  assert.equal(clockChipTotals(rows, 0, true).stackBonus, 0);
});

test("Flop Booster re-entries add their bigger stacks on top of the flat starting stack", () => {
  // entry 2 = +15k, entry 3 = +15k +30k, entry 6 = 15+30+45+60+60
  assert.equal(clockChipTotals([row("a", 2)], 0, false, true).stackBonus, 15000);
  assert.equal(clockChipTotals([row("a", 3)], 0, false, true).stackBonus, 45000);
  assert.equal(clockChipTotals([row("a", 6), row("b")], 0, false, true).stackBonus, 210000);
  assert.equal(clockChipTotals([row("a", 3)], 0, false, false).stackBonus, 0);
});
