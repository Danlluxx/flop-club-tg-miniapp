import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-admin-analytics-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { buildAdminAnalytics, periodRange, tournamentFigures } = await import("../dist/services/adminAnalytics.js");

const { isAnalyticsOwner, requireAnalyticsOwner } = await import("../dist/middleware/auth.js");

function guardResult(username) {
  let result;
  requireAnalyticsOwner({ user: { username } }, {}, (error) => { result = error; });
  return result;
}

test("only the owner's account passes the analytics guard", () => {
  assert.equal(guardResult("danlluxx"), undefined);
  assert.equal(guardResult("@DanLLuxx"), undefined);
  for (const username of ["flopclub", "danlluxx2", "", null, undefined]) {
    assert.equal(guardResult(username)?.statusCode ?? guardResult(username)?.status, 403);
    assert.equal(isAnalyticsOwner(username), false);
  }
});

const user = (id) => ({ displayName: id, firstName: null, lastName: null, username: null, telegramId: id });
const entry = (userId, entryNumber = 1, addOnCount = 0, checkedIn = true) => ({
  userId,
  entryNumber,
  addOnCount,
  checkedInAt: checkedIn ? new Date(0) : null,
  user: user(userId)
});
const tournament = (id, day, registrations, extra = {}) => ({
  id,
  title: id,
  // 19:00 in Barnaul
  startsAt: new Date(`${day}T12:00:00.000Z`),
  status: "FINISHED",
  buyIn: 500,
  reEntry: 300,
  addOnPrice: 1000,
  maxParticipants: 10,
  registrations,
  ...extra
});

test("revenue is entries, re-entries and add-ons at the tournament's own prices", () => {
  const figures = tournamentFigures(tournament("t", "2026-11-02", [entry("a", 3, 1), entry("b")]));
  assert.equal(figures.buyInRevenue, 1000);
  assert.equal(figures.reEntryRevenue, 600);
  assert.equal(figures.addOnRevenue, 1000);
  assert.equal(figures.revenue, 2600);
  assert.equal(figures.spentByUser.get("a"), 2100);
});

test("a self-service re-entry row is one player with two entries, not two buy-ins", () => {
  const figures = tournamentFigures(tournament("t", "2026-11-02", [entry("a", 1), entry("a", 2)]));
  assert.equal(figures.players, 1);
  assert.equal(figures.revenue, 800);
});

test("players who never checked in add no money and count as no-shows", () => {
  const data = buildAdminAnalytics([tournament("t", "2026-11-02", [entry("a"), entry("b", 1, 0, false)])], "week", "2026-11-02", "2026-11-05");
  assert.equal(data.summary.revenue, 500);
  assert.equal(data.summary.registered, 2);
  assert.equal(data.summary.noShows, 1);
});

test("weeks run Monday to Sunday and months are calendar months", () => {
  assert.deepEqual(periodRange("week", "2026-11-05"), { from: "2026-11-02", to: "2026-11-08" });
  assert.deepEqual(periodRange("week", "2026-11-08"), { from: "2026-11-02", to: "2026-11-08" });
  assert.deepEqual(periodRange("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
});

test("a tournament belongs to its Barnaul date, not the UTC one", () => {
  // 18:30 UTC on Sunday is 01:30 on Monday in Barnaul.
  const late = tournament("late", "2026-11-08", [entry("a")], { startsAt: new Date("2026-11-08T18:30:00.000Z") });
  const data = buildAdminAnalytics([late], "week", "2026-11-09", "2026-11-12");
  assert.equal(data.summary.tournaments, 1);
});

test("periods split revenue, and cancelled or empty tournaments are ignored", () => {
  const data = buildAdminAnalytics([
    tournament("this", "2026-11-03", [entry("a")]),
    tournament("last", "2026-10-27", [entry("a"), entry("b")]),
    tournament("cancelled", "2026-11-04", [entry("c")], { status: "CANCELLED" }),
    tournament("upcoming", "2026-11-06", [entry("d", 1, 0, false)], { status: "OPEN" })
  ], "week", "2026-11-05", "2026-11-05");
  assert.equal(data.summary.revenue, 500);
  assert.equal(data.previous.revenue, 1000);
  assert.equal(data.isComplete, false);
  assert.equal(data.hasNext, false);
  assert.equal(data.trend.length, 12);
  assert.equal(data.trend.at(-1).revenue, 500);
  assert.equal(data.trend.at(-2).revenue, 1000);
});

test("new players are those whose first visit falls in the period", () => {
  const data = buildAdminAnalytics([
    tournament("old", "2026-10-27", [entry("a")]),
    tournament("now", "2026-11-03", [entry("a"), entry("b")])
  ], "week", "2026-11-03", "2026-11-05");
  assert.equal(data.summary.newPlayers, 1);
  assert.equal(data.summary.returningPlayers, 1);
});

test("a day covers one Barnaul date and lists who brought how much", () => {
  const data = buildAdminAnalytics([
    tournament("old", "2026-10-27", [entry("a")]),
    tournament("day", "2026-11-03", [entry("a", 2, 1), entry("b"), entry("c", 1, 0, false)]),
    tournament("next", "2026-11-04", [entry("b")])
  ], "day", "2026-11-03", "2026-11-05");
  assert.deepEqual([data.from, data.to], ["2026-11-03", "2026-11-03"]);
  assert.equal(data.summary.tournaments, 1);
  assert.equal(data.summary.revenue, 2300);
  assert.equal(data.summary.noShows, 1);
  assert.deepEqual(data.tournaments[0].roster, [
    { name: "a", entries: 2, addOns: 1, spent: 1800, isNew: false },
    { name: "b", entries: 1, addOns: 0, spent: 500, isNew: true }
  ]);
});

test("a day compares with the same weekday a week earlier", () => {
  const data = buildAdminAnalytics([
    tournament("week-ago", "2026-10-27", [entry("a")]),
    tournament("yesterday", "2026-11-02", [entry("a"), entry("b")]),
    tournament("day", "2026-11-03", [entry("a")])
  ], "day", "2026-11-03", "2026-11-05");
  assert.equal(data.previous.revenue, 500);
  assert.equal(data.trend.length, 12);
  assert.equal(data.trend.at(-2).revenue, 1000);
});

test("day arrows skip empty days and stop at the last held day", () => {
  const held = [
    tournament("first", "2026-10-30", [entry("a")]),
    tournament("middle", "2026-11-02", [entry("a")]),
    tournament("last", "2026-11-04", [entry("a")])
  ];
  const middle = buildAdminAnalytics(held, "day", "2026-11-02", "2026-11-05");
  assert.equal(middle.previousFrom, "2026-10-30");
  assert.equal(middle.nextAnchor, "2026-11-04");
  assert.equal(middle.hasNext, true);
  assert.equal(buildAdminAnalytics(held, "day", "2026-11-04", "2026-11-05").hasNext, false);
});

test("without a date the day view opens on the latest held day, others on today", () => {
  const held = [tournament("last", "2026-11-04", [entry("a")])];
  assert.equal(buildAdminAnalytics(held, "day", undefined, "2026-11-05").from, "2026-11-04");
  assert.equal(buildAdminAnalytics([], "day", undefined, "2026-11-05").from, "2026-11-05");
  assert.equal(buildAdminAnalytics(held, "week", undefined, "2026-11-05").from, "2026-11-02");
});
