# FLOP DEVIL DEAL — concise context

## Current event configuration

- Date/start: 31.10.2026, 18:00 `Asia/Barnaul`.
- Late registration: until 21:00.
- Buy-in: 500 ₽; starting stack: 30,000.
- Re-entry: 500 ₽, available to an eliminated player until the tournament is finished, including after late registration closes.
- Blind levels: 15 minutes.
- Add-on: one per player, 1,000 ₽ for 100,000 chips; available after late registration.
- Deal after confirmed elimination: one attempt, 50% no revival / 30% 5 BB / 20% 10 BB.
- Successful revival automatically restores active status and seating.
- Sixes: winning showdown with pocket 66 gives +6 BB; set of sixes gives +13 BB, with admin confirmation.
- Bounty is a separate per-player counter: each `+1` gives 50 rating points and does not store who eliminated whom. Bounty continues to the end.

## Key implementation paths

```text
apps/api/src/routes/devilDeal.ts
apps/api/src/services/devilDeal.ts
apps/api/src/services/tournamentMechanics.ts
apps/api/src/services/tournamentSchedule.ts
apps/api/tests/devil-deal.test.mjs
apps/web/src/components/DevilDealPanel.tsx
apps/web/src/components/devilDeal.css
apps/web/src/pages/admin/DevilControlPage.tsx
apps/web/src/lib/tournamentRules.ts
apps/web/public/awards/color/flop-devil-deal.png
```

## Invariants

- Revival UI appears only after a confirmed elimination and only while an unused attempt is available.
- Elimination is recorded like an ordinary tournament: only the eliminated player is selected; no opponent is required.
- Paid Re-entry is an admin action after elimination and remains available while the tournament is running, even after registration and resurrection close. It records a new paid entry, issues the starting stack, checks the player in, and seats them atomically.
- The admin state keeps `registrationOpen` aligned with paid Re-entry availability for compatibility with cached pre-change clients; authenticated player state keeps the strict late-registration meaning. New clients use `paidReEntryOpen` explicitly.
- The legacy `Registration_active_once_key` partial index must be absent: special formats intentionally keep each paid Re-entry as a separate active registration row. Registration changes remain serialized by the tournament-row lock.
- The random outcome is generated and persisted server-side; retry returns the same result.
- Chip/rating operations are journaled and protected against duplicate requests.
- Add-on and Re-entry are distinct operations with separate availability rules and prices.
- Bounty increments are append-only `BOUNTY_ELIMINATION` events without an `eliminationId`; corrections use compensating events.
- Existing registrations must survive schedule synchronization.

The longer `docs/FLOP_DEVIL_DEAL.md` contains historical implementation detail and test instructions. If it conflicts with this capsule, verify against current code/tests; parts of the long document describe pre-release defaults.

