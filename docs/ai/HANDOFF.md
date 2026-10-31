# Current handoff

Last updated: 2026-10-31.

## Production state

- `main` / `origin/main`: `72dbff8` (`Add Devil Deal add-on support`).
- FLOP DEVIL DEAL and its latest UI/configuration are deployed.
- Production health was verified after the last release.
- Direct SSH currently times out during banner exchange; Timeweb serial web console was used as fallback.

## Latest completed work

- Devil Deal schedule: 18:00 start, 21:00 late registration, 15-minute levels.
- Buy-in and Re-entry: 500 ₽ each.
- Add-on: 1,000 ₽ / 100,000 chips after late registration, once per player.
- Revival is offered only after elimination; success restores active player status.
- Tournament card copy was localized, venue changed to `Геблера 33б`, status badge simplified, participants gradient strengthened.
- Relevant Devil Deal integration suite passed 29 tests before deployment.

## Preserve local work

At the time of this update, these tracked files contain intentional uncommitted user changes:

```text
apps/web/src/index.css
apps/web/src/lib/tournamentAssets.ts
```

There are also numerous untracked operational SQL/scripts, output screenshots, and temporary files. Do not bulk-delete, reset, or include them in a commit without checking scope.

## Known operational note

- Strix could not authenticate because its ChatGPT token expired. Do not claim a successful Strix audit until authentication is restored and the check is rerun.
- Local resurrection screenshots are under `output/resurrection-*.png`; they were produced using isolated test data, not production data.

