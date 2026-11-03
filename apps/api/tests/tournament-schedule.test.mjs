import assert from "node:assert/strict";
import test from "node:test";

import { scheduledTournamentForDate } from "../dist/services/tournamentSchedule.js";

test("2026-11-02 is a free-entry FLOP BOOSTER RE-ENTRY tournament", () => {
  const tournament = scheduledTournamentForDate("2026-11-02");

  assert.ok(tournament);
  assert.equal(tournament.id, "2026-11-02-flop-booster-re-entry");
  assert.equal(tournament.title, "FLOP BOOSTER RE-ENTRY");
  assert.equal(tournament.startsAt.toISOString(), "2026-11-02T12:00:00.000Z");
  assert.equal(tournament.lateRegistrationEndsAt.toISOString(), "2026-11-02T15:00:00.000Z");
  assert.equal(tournament.buyIn, 0);
  assert.equal(tournament.reEntry, 500);
  assert.equal(tournament.prizePool, 0);
  assert.equal(tournament.ratingPool, 15000);
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
