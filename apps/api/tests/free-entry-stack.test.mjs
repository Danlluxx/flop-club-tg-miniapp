import test from "node:test";
import assert from "node:assert/strict";

const { tournamentEntryChipsFor, tournamentRuleFeaturesFor, blindStructureFor } = await import("../dist/services/tournamentRules.js");
const { scheduledTournamentForDate } = await import("../dist/services/tournamentSchedule.js");

const norm = (f) => f.replaceAll("\u00a0", " ");

test("free-entry tournaments start from 20 000 chips, paid ones keep their stack", () => {
  assert.equal(tournamentEntryChipsFor("Flop Classic", 0), 20000);
  assert.equal(tournamentEntryChipsFor("Flop Deep Stack", 0), 20000);
  assert.equal(tournamentEntryChipsFor("Flop Classic", 500), 30000);
  assert.equal(tournamentEntryChipsFor("Flop Deep Stack", 500), 60000);
  assert.ok(tournamentRuleFeaturesFor("Flop Classic", 0).map(norm).includes("Стартовый стек 20 000 фишек"));
  assert.ok(tournamentRuleFeaturesFor("Flop Classic", 500).map(norm).includes("Стартовый стек 30 000 фишек"));
});

test("Rampage keeps the fast blind structure, everything else uses the standard one", () => {
  assert.equal(blindStructureFor("Flop Rampage"), "turbo");
  assert.equal(blindStructureFor("FLOP BOMB POT"), "standard");
  assert.equal(blindStructureFor("Flop Last Call"), "standard");
});

test("2026-11-11 is a free FLOP BOMB POT with a 200 000 chip add-on", () => {
  const t = scheduledTournamentForDate("2026-11-11");
  assert.equal(t.title, "FLOP BOMB POT");
  assert.equal(t.buyIn, 0);
  assert.equal(t.reEntry, 500);
  assert.equal(t.addOnEnabled, true);
  assert.equal(t.addOnPrice, 1000);
  assert.equal(t.addOnChips, 200000);
});
