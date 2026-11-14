import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-duo-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { planMerge, shufflePairs, partnerOf, duoMergeOpensAt, teamCards } = await import("../dist/services/duoTeams.js");
const { scheduledTournamentForDate } = await import("../dist/services/tournamentSchedule.js");
const { tournamentEntryChipsFor } = await import("../dist/services/tournamentRules.js");

const at = (minute) => new Date(Date.UTC(2026, 10, 12, 12, minute));
const reg = (id, userId, liveStatus, minute) => ({ id, userId, liveStatus, checkedInAt: minute === null ? null : at(minute), issuedChips: 0 });
const pair = (eventId, a, b) => ({ eventId, userIds: [a, b] });

test("Friday 2026-11-13 is FLOP DUO with the agreed terms", () => {
  const duo = scheduledTournamentForDate("2026-11-13");
  assert.equal(duo.title, "FLOP DUO 2x2");
  assert.equal(duo.buyIn, 500);
  assert.equal(duo.reEntry, 750);
  assert.equal(duo.ratingPool, 15000);
  assert.equal(duo.addOnEnabled, false);
  assert.equal(duo.startsAt.toISOString(), "2026-11-13T12:00:00.000Z");
  assert.equal(duo.lateRegistrationEndsAt.toISOString(), "2026-11-13T15:00:00.000Z");
  assert.equal(tournamentEntryChipsFor("FLOP DUO 2x2"), 50000);
});

test("Thursday 2026-11-12 is Flop Mystery Knockout", () => {
  const mystery = scheduledTournamentForDate("2026-11-12");
  assert.equal(mystery.title, "Flop Mystery Knockout");
  assert.equal(mystery.startsAt.toISOString(), "2026-11-12T12:00:00.000Z");
});

test("both partners alive: the earlier check-in leads, the other is parked", () => {
  const plan = planMerge([pair("p", "a", "b")], [reg("ra", "a", "IN_GAME", 10), reg("rb", "b", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, [{ leadId: "rb", parkedId: "ra" }]);
});

test("one partner out before the merge: no one is parked and no bonus is given", () => {
  const plan = planMerge([pair("p", "a", "b")], [reg("ra", "a", "ELIMINATED", 1), reg("rb", "b", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, []);
  assert.equal("bonuses" in plan, false);
  assert.equal(duoMergeOpensAt(new Date("2026-11-13T12:00:00Z")).toISOString(), "2026-11-13T14:40:00.000Z");
});

test("a team of one is left alone by the merge", () => {
  const plan = planMerge([{ eventId: "solo", userIds: ["a"] }], [reg("ra", "a", "IN_GAME", 5)]);
  assert.deepEqual(plan.merges, []);
  assert.equal(partnerOf([{ eventId: "solo", userIds: ["a"] }], "a"), null);
});

test("both out, or a player who never checked in: nothing to merge", () => {
  const plan = planMerge([pair("p", "a", "b"), pair("q", "c", "d")], [
    reg("ra", "a", "ELIMINATED", 1), reg("rb", "b", "ELIMINATED", 2),
    reg("rc", "c", "IN_GAME", null), reg("rd", "d", "IN_GAME", 3)
  ]);
  assert.deepEqual(plan.merges, []);
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

test("team cards: two of each kind, one running at a time", () => {
  const now = new Date("2026-11-13T15:00:00Z");
  const event = (card, endsAt, pairId = "p") => ({ details: { pairId, card, endsAt } });
  assert.deepEqual(teamCards([], "p", now), { timeoutLeft: 2, hintLeft: 2, active: null });
  const used = [event("timeout", "2026-11-13T14:50:00Z"), event("hint", "2026-11-13T14:40:00Z"), event("timeout", "2026-11-13T14:55:00Z"), event("hint", "2026-11-13T15:00:30Z", "other")];
  assert.deepEqual(teamCards(used, "p", now), { timeoutLeft: 0, hintLeft: 1, active: null });
  const running = teamCards([event("hint", "2026-11-13T15:00:20Z")], "p", now);
  assert.deepEqual(running.active, { card: "hint", endsAt: "2026-11-13T15:00:20Z" });
});

test("rating: partners of a team share a place and split its points", async () => {
  const { prisma } = await import("../dist/prisma.js");
  const { applyTournamentRatingResults } = await import("../dist/services/rating.js");
  const created = [];
  const tournament = {
    id: "t", title: "FLOP DUO 2x2", ratingPool: 15000, mechanics: null, profile: "BASE", ratingResults: [], chipLeaderAward: null,
    registrations: ["a", "b", "c"].map((userId) => ({ id: `r-${userId}`, userId })).concat([{ id: "r-a-old", userId: "a" }])
  };
  const tx = {
    $queryRaw: async () => [],
    tournament: { findUnique: async () => tournament, update: async () => ({}) },
    tournamentGameEvent: { findMany: async () => [{ id: "p1", type: "DUO_PAIR", createdAt: new Date(), reversesId: null, details: { userIds: ["a", "b"] } }] },
    tournamentRatingResult: { deleteMany: async () => ({}), create: async ({ data }) => { created.push(data); return data; }, findMany: async () => created },
    tournamentChipLeaderAward: { deleteMany: async () => ({}) },
    user: { update: async () => ({}) }
  };
  prisma.$transaction = async (fn) => fn(tx);
  const results = await applyTournamentRatingResults("t", 10, [
    { registrationId: "r-a", place: 1 }, { registrationId: "r-b", place: 1 }, { registrationId: "r-a-old", place: 1 }, { registrationId: "r-c", place: 2 }
  ]);
  assert.equal(results.length, 3);
  assert.deepEqual(created.map((item) => [item.userId, item.place, item.points]), [["a", 1, 3750], ["b", 1, 3750], ["c", 2, 4500]]);
  await assert.rejects(applyTournamentRatingResults("t", 10, [{ registrationId: "r-a", place: 1 }, { registrationId: "r-c", place: 1 }]), /duplicated/);
});
