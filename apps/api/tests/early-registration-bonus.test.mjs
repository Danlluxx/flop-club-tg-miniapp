import assert from "node:assert/strict";
import test from "node:test";

const { earlyRegistrationBonusFor, earlyRegistrationDeadline } = await import("../dist/services/earlyRegistrationBonus.js");

// 19:00 Barnaul on 2026-11-06.
const tournament = { startsAt: new Date("2026-11-06T19:00:00+07:00"), mechanics: null };

test("the deadline is 18:00 Barnaul on the tournament day", () => {
  assert.equal(earlyRegistrationDeadline(tournament.startsAt).toISOString(), "2026-11-06T11:00:00.000Z");
});

test("registering before 18:00, even days earlier, gives 5000 chips", () => {
  assert.equal(earlyRegistrationBonusFor(tournament, new Date("2026-11-06T17:59:59+07:00"), 1), 5000);
  assert.equal(earlyRegistrationBonusFor(tournament, new Date("2026-11-02T10:00:00+07:00"), 1), 5000);
});

test("registering at or after 18:00 gives nothing", () => {
  assert.equal(earlyRegistrationBonusFor(tournament, new Date("2026-11-06T18:00:00+07:00"), 1), 0);
  assert.equal(earlyRegistrationBonusFor(tournament, new Date("2026-11-06T18:30:00+07:00"), 1), 0);
});

test("re-entries and Devil Deal get no bonus", () => {
  assert.equal(earlyRegistrationBonusFor(tournament, new Date("2026-11-06T12:00:00+07:00"), 2), 0);
  assert.equal(earlyRegistrationBonusFor({ ...tournament, mechanics: {} }, new Date("2026-11-06T12:00:00+07:00"), 1), 0);
});

test("an 18:00 start still uses the same day", () => {
  const early = { startsAt: new Date("2026-11-07T18:00:00+07:00"), mechanics: null };
  assert.equal(earlyRegistrationDeadline(early.startsAt).toISOString(), "2026-11-07T11:00:00.000Z");
});
