# FLOP DEVIL DEAL — concise context

## Current event configuration

- Date/start: 31.10.2026, 18:00 `Asia/Barnaul`.
- Late registration: until 21:00.
- Buy-in: 500 ₽; starting stack: 30,000.
- Re-entry: 500 ₽, available until late registration closes.
- Blind levels: 15 minutes.
- Add-on: one per player, 1,000 ₽ for 100,000 chips; available after late registration.
- Deal after confirmed elimination: one attempt, 50% no revival / 30% 5 BB / 20% 10 BB.
- Successful revival automatically restores active status and seating.
- Sixes: winning showdown with pocket 66 gives +6 BB; set of sixes gives +13 BB, with admin confirmation.
- Confirmed knockout: +50 rating points; Bounty continues to the end.

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
- The random outcome is generated and persisted server-side; retry returns the same result.
- Chip/rating operations are journaled and protected against duplicate requests.
- Add-on and Re-entry are distinct operations with separate time windows and prices.
- Existing registrations must survive schedule synchronization.

The longer `docs/FLOP_DEVIL_DEAL.md` contains historical implementation detail and test instructions. If it conflicts with this capsule, verify against current code/tests; parts of the long document describe pre-release defaults.

