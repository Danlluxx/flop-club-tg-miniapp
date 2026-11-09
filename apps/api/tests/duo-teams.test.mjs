import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-duo-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { planMerge, shufflePairs, partnerOf, DUO_SURVIVOR_BONUS_CHIPS } = await import("../dist/services/duoTeams.js");
const { scheduledTournamentForDate } = await import("../dist/services/tournamentSchedule.js");
const { tournamentEntryChipsFor } = await import("../dist/services/tournamentRules.js");

const at = (minute) => new Date(Date.UTC(2026, 10, 12, 12, minute));
const reg = (id, userId, liveStatus, minute) => ({ id, userId, liveStatus, checkedInAt: minute === null ? null : at(minute), issuedChips: 0 });
const pair = (eventId, a, b) => ({ eventId, userIds: [a, b] });

test("Thursday 2026-11-12 is FLOP DUO with the agreed terms", () => {
  const duo = scheduledTournamentForDate("2026-11-12");
  assert.equal(duo.title, "FLOP DUO 2x2");
  assert.equal(duo.buyIn, 500);
  assert.equal(duo.reEntry, 750);
  assert.equal(duo.ratingPool, 15000);
  assert.equal(duo.addOnEnabled, false);
  assert.equal(duo.startsAt.toISOString(), "2026-11-12T12:00:00.000Z");
  assert.equal(duo.lateRegistrationEndsAt.toISOString(), "2026-11-12T15:30:00.000Z");
  assert.equal(tournamentEntryChipsFor("FLOP DUO 2x2"), 50000);
});

test("both partners alive: the earlier check-in leads, the other is parked", () => {
  const plan = planMerge([pair("p", "a", "b")], [reg("ra", "a", "IN_GAME", 10), reg("rb", "b", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, [{ leadId: "rb", parkedId: "ra" }]);
  assert.deepEqual(plan.bonuses, []);
});

test("one partner out before the merge: the survivor gets the bonus and no one is parked", () => {
  const plan = planMerge([pair("p", "a", "b")], [reg("ra", "a", "ELIMINATED", 1), reg("rb", "b", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, []);
  assert.deepEqual(plan.bonuses, [{ registrationId: "rb", userId: "b" }]);
  assert.equal(DUO_SURVIVOR_BONUS_CHIPS, 25000);
});

test("both out, or a player who never checked in: nothing to merge", () => {
  const plan = planMerge([pair("p", "a", "b"), pair("q", "c", "d")], [
    reg("ra", "a", "ELIMINATED", 1), reg("rb", "b", "ELIMINATED", 2),
    reg("rc", "c", "IN_GAME", null), reg("rd", "d", "IN_GAME", 3)
  ]);
  assert.deepEqual(plan.merges, []);
  assert.deepEqual(plan.bonuses, [{ registrationId: "rd", userId: "d" }]);
});

test("a re-entered player counts as alive through the new registration", () => {
  const plan = planMerge([pair("p", "a", "b")], [reg("ra1", "a", "ELIMINATED", 1), reg("ra2", "a", "IN_GAME", 20), reg("rb", "b", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, [{ leadId: "rb", parkedId: "ra2" }]);
});

test("the draw pairs everyone and leaves one out for an odd count", () => {
  const even = shufflePairs(["a", "b", "c", "d"], () => 0.5);
  assert.equal(even.pairs.length, 2);
  assert.equal(even.left, null);
  const odd = shufflePairs(["a", "b", "c"], () => 0.1);
  assert.equal(odd.pairs.length, 1);
  assert.ok(odd.left);
  assert.equal(new Set([...odd.pairs[0], odd.left]).size, 3);
});

test("partnerOf finds the partner", () => {
  assert.equal(partnerOf([pair("p", "a", "b")], "a"), "b");
  assert.equal(partnerOf([pair("p", "a", "b")], "z"), null);
});
