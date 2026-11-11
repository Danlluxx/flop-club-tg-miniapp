import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-clock-chips-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { clockChipTotals, earlyCheckInBonus } = await import("../dist/routes/clock.js");

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
  // free Booster: 20k first entry, re-entries still 45k / 60k, so the extras are measured from 20k
  assert.equal(clockChipTotals([row("a", 3)], 0, false, true, 20000).stackBonus, 25000 + 40000);
});

const at = (iso) => new Date(iso);
const start = at("2026-11-08T12:00:00Z"); // 19:00 Barnaul
const check = (userId, iso, entryNumber = 1) => ({ userId, entryNumber, checkedInAt: iso ? at(iso) : null });

test("punctuality bonus counts check-ins within 10 minutes of the start, once per player", () => {
  const rows = [
    check("a", "2026-11-08T12:05:00Z"),
    check("b", "2026-11-08T12:10:00Z"),
    check("c", "2026-11-08T12:09:59Z"),
    check("d", null),
    check("a", "2026-11-08T12:06:00Z", 2)
  ];
  assert.deepEqual(earlyCheckInBonus(rows, start), { count: 2, chips: 20000 });
});

test("punctuality bonus follows the tournament start and skips a late first check-in", () => {
  const early = at("2026-11-08T10:00:00Z"); // 17:00 Barnaul
  assert.equal(earlyCheckInBonus([check("a", "2026-11-08T10:08:00Z")], early).count, 1);
  assert.equal(earlyCheckInBonus([check("a", "2026-11-08T10:12:00Z")], early).count, 0);
  assert.equal(earlyCheckInBonus([check("a", "2026-11-08T12:30:00Z"), check("a", "2026-11-08T12:02:00Z", 2)], start).count, 1);
});

test("punctuality bonus is not paid in Devil Deal", () => {
  assert.deepEqual(earlyCheckInBonus([check("a", "2026-11-08T12:01:00Z")], start, true), { count: 0, chips: 0 });
});

test("free-entry re-entries add the regular stack over the 20k base", () => {
  assert.equal(clockChipTotals([row("a", 2), row("b")], 0, false, false, 20000, 30000).stackBonus, 10000);
  assert.equal(clockChipTotals([row("a", 3)], 0, false, false, 20000, 30000).stackBonus, 20000);
});
