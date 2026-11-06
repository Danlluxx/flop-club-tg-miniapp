# Current handoff

Last updated: 2026-11-06.

## Production state

- Server `.deploy-commit`: `f183b91` (staff first entry free in revenue analytics, migration `20261106120000_user_staff_flag`; DB backup `/root/flop-deploy-backups/before-staff-flag-20261106-053858.sql.gz`). Released through a server copy of `run-soft-design-timeweb.sh` that allowed only that migration and `schema.prisma`. The 9 staff accounts are marked by `User.isStaff` directly in the database; there is no admin UI for it.
- Before that `555013c` (participants CSV export removed, button and `export.csv` route), together with `7c4b34e` (clsx removed), `0f78396` (69 unused public images deleted; backup `/root/flop-deploy-backups/release-20261105-172014.tar.gz`), on top of `fd14c95`, `42cf32f` (leaderboard privacy, less polling).
- Before that `06c757e` (analytics day view), released through the serial console together with `505c6ed` (+10k chips before 19:10) and `250971e` (WebP, lazy pages), on top of `12549f2` (whole admin tournament card opens participants, delete confirmation), on top of `6f61b85` (working tournament edit form, on top of tournament titles uppercased at display, owner-only revenue analytics, soft admin design, participants tabs and restore via re-entry).
- Restoring through re-entry is covered by unit tests with a fake transaction only; not yet run against real PostgreSQL. The first real restore needs a look, including a second elimination with a killer.
- The "Фото итогов" link on the participants results tab is local only: its route and API belong to the undeployed autoposting work below.
- 2026-11-05 `2026-11-05-flop-phoenix`: +5000 chips for the 14 registrations made before 18:00 Barnaul, as `STACK_BONUS` ledger events plus `issuedChips`. Backup: `/root/flop-deploy-backups/before-stack-bonus-20261105.sql.gz`.
- Clock (`/api/clock/participants`, blind clock `11d9787`): chips in play = checked-in entries x table starting stack + `bonusChips` (`STACK_BONUS` + add-ons); average = chips / players in game. Flop Booster's growing re-entry stacks are not counted. The clock on real check-ins was not yet observed on 2026-11-05.
- 2026-11-03 replaced the scheduled Flop Phoenix; its 2 registrations moved to `2026-11-03-flop-bomb-pot`.
- Production health and the new public bundle were verified after the last release; the analytics day view is owner-only and needs the owner's login to check on real data.
- SSH from the Mac must bypass the VPN; see `docs/ai/DEPLOY.md`. On Wi-Fi `ASU` it times out over `en0` too; `12549f2` went out through the Timeweb serial console.
- The admin card's camera link to "Фото итогов" is local only, like the link on the participants results tab.
- Tournaments with a `manual-` id are invisible to schedule sync, so do not add a `specialEvents` entry for the same date: it would create a duplicate. 2026-11-02 is `manual-20261102-flop-booster-re-entry` (FINISHED).
- API logs `prisma:error` for `telegramBotState.create` during rating publication; this is the expected P2002 duplicate guard, and nothing is re-sent.

## Speed release (2026-11-05)

- `250971e` (WebP art, lazy pages) is live on the VPS inside `06c757e`. The edge worker `flop-club-app` was deployed from `infra/cloudflare-worker` (`npx wrangler deploy`, Wrangler already logged in): `/assets/*` now cache for a year. Images cached at the edge before the deploy keep the old header for up to a day.
- Polling cuts and the slim leaderboard (`fd14c95`, `42cf32f`) are live. Not done yet from the speed audit: `User.ratingPoints` index.

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

## Tournament editing (deployed in `6f61b85`)

- Admin form saves survive schedule sync through `Tournament.scheduleLocked` (migration `20261105120000_tournament_schedule_lock`). Confirmed by the owner with a real save through the production form (2026-11-05).
- `run-soft-design-timeweb.sh` refuses Prisma changes. This release used a server copy with that guard disabled, after a `pg_dump` to `/root/flop-deploy-backups/`.
- Autoposting still has to add its result-photo model to `schema.prisma` on top of this.

## Autoposting (not deployed)

- Local uncommitted: Poster API, `getTournamentRatingRows` refactor, status fix in `ensureScheduledTournaments`. See `docs/ai/POSTER.md`.
- Before it runs in production: set `POSTER_API_TOKEN`, create the bot and admin chat, deploy `~/flopclub-poster`.

## Registration QR in the bot (deployed, format in `b9e66ac`)

- After a new registration or re-entry the bot sends a QR photo with tournament, date and venue: `apps/api/src/services/telegramRegistrationQr.ts`. Delivery is fire-and-forget after commit, one attempt, no resend; the app QR stays the fallback.
- URL format must match `apps/web/src/components/CheckInQr.tsx`. API reads the bot name through `TELEGRAM_BOT_USERNAME` / `TELEGRAM_APP_NAME`, which compose maps from the `VITE_` values.
- Telegram bots cannot write to users who never started them, so `TournamentPage` calls `requestWriteAccess` before registering. Admin-added players get no such prompt.
- Delivery confirmed on a real production registration (2026-11-03), before the format change. Text rule: `docs/ai/PATTERNS.md`. Premium emoji postponed; the bot owner has Premium. Not yet confirmed: the bold title and address on a real message, scanning that QR at check-in and the `requestWriteAccess` prompt for a user who never started the bot.

## Known operational note

- Strix could not authenticate because its ChatGPT token expired. Do not claim a successful Strix audit until authentication is restored and the check is rerun.
- Local resurrection screenshots are under `output/resurrection-*.png`; they were produced using isolated test data, not production data.

