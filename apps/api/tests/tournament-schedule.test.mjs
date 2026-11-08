import assert from "node:assert/strict";
import test from "node:test";

import { scheduledTournamentForDate } from "../dist/services/tournamentSchedule.js";

test("2026-11-02 is not scheduled because its tournament was created manually", () => {
  assert.equal(scheduledTournamentForDate("2026-11-02"), null);
});

test("2026-11-03 is a free-entry FLOP BOMB POT tournament", () => {
  const tournament = scheduledTournamentForDate("2026-11-03");

  assert.ok(tournament);
  assert.equal(tournament.id, "2026-11-03-flop-bomb-pot");
  assert.equal(tournament.title, "FLOP BOMB POT");
  assert.equal(tournament.startsAt.toISOString(), "2026-11-03T12:00:00.000Z");
  assert.equal(tournament.lateRegistrationEndsAt.toISOString(), "2026-11-03T15:00:00.000Z");
  assert.equal(tournament.buyIn, 0);
  assert.equal(tournament.reEntry, 500);
  assert.equal(tournament.prizePool, 0);
  assert.equal(tournament.ratingPool, 15000);
  assert.equal(tournament.profile, "BASE");
});

test("2026-11-05 is a FLOP Phoenix tournament with standard pricing", () => {
  const tournament = scheduledTournamentForDate("2026-11-05");

  assert.ok(tournament);
  assert.equal(tournament.id, "2026-11-05-flop-phoenix");
  assert.equal(tournament.title, "Flop Phoenix");
  assert.equal(tournament.startsAt.toISOString(), "2026-11-05T12:00:00.000Z");
  assert.equal(tournament.lateRegistrationEndsAt.toISOString(), "2026-11-05T15:00:00.000Z");
  assert.equal(tournament.buyIn, 500);
  assert.equal(tournament.reEntry, 1000);
  assert.equal(tournament.prizePool, 25000);
  assert.equal(tournament.ratingPool, 10000);
  assert.equal(tournament.profile, "PHOENIX");
});

test("2026-11-08 Deep Stack gives a 200 000 chip add-on, other Deep Stack days keep 100 000", () => {
  const today = scheduledTournamentForDate("2026-11-08");
  assert.equal(today.title, "Flop Deep Stack");
  assert.equal(today.addOnChips, 200000);
  assert.equal(today.addOnPrice, 1000);
  assert.equal(scheduledTournamentForDate("2026-09-06").addOnChips, 100000);
});
