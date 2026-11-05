# Reusable implementation patterns

## Change loop

1. Inspect `git status`, relevant route/service/component, and nearby tests.
2. Make the smallest coherent change; avoid unrelated cleanup.
3. Verify with the narrowest useful lint/build/test.
4. For UI, test the real changed flow and check console errors plus mobile width.
5. Show the local result before publication when the user is iterating visually.
6. Publish once after explicit approval, then verify health and the public behavior.

## Tournament feature pattern

- Schedule defaults live in `apps/api/src/services/tournamentSchedule.ts`.
- Business rules belong in API services, not only in React.
- Tournament-specific UI text/rules live near `apps/web/src/lib/tournamentRules.ts` and asset mapping near `apps/web/src/lib/tournamentAssets.ts`.
- Admin operations must be idempotent where retries are possible and must preserve the event/history trail.
- Time rules use explicit timestamps/time zones; production tournament dates are interpreted for `Asia/Barnaul`.
- When changing defaults, also decide whether already-created tournament rows need a safe synchronization path.
- Schedule sync overwrites scheduled rows on every run unless `Tournament.scheduleLocked` is set. The admin PATCH sets it, so a saved tournament no longer receives schedule defaults; change such a row through the form.

## API and database pattern

- Route: authentication, authorization, validation, HTTP response.
- Service: transactions, invariants, calculations, state transitions.
- Prisma migration: schema change; never depend on `db push` for production.
- Inspect schema and existing migrations before any database edit.
- Avoid deleting production history. Prefer corrective/compensating records for tournament accounting.
- Never run development seed against production.

## UI pattern

- Reuse existing cards, typography, spacing, and status treatments before adding new visual primitives.
- Keep tournament-specific styling isolated when mechanics are unique.
- Mobile Telegram viewport is the primary target; also check desktop admin pages.
- Respect `prefers-reduced-motion` for nonessential animation.
- The soft design is on for every screen. Admin screens add `apps/web/src/styles/soft-admin.css`, scoped to `.admin-area` (set in `Layout`) so it never reaches player screens. Local check with mock data: dev server `flop-soft-test`, open `/admin?admin=1`.
- Images in `apps/web/public` are served as WebP (`awards`, `statuses`, club photos); the PNG/JPG originals stay for old clients. Convert new art with `cwebp -q 82 -alpha_q 90`, bump `awardAssetVersion` in `lib/tournamentAssets.ts`, and give below-the-fold `<img>` `width`/`height` and `loading="lazy"`.
- Only `HomePage` and the gates are in the first bundle: every other page is `React.lazy` in `App.tsx`, with `Suspense` around the `Outlet` in `Layout`. Add new pages the same way.
- Browser cache headers come from `infra/cloudflare-worker/src/index.js`: `/assets/*` one year immutable, other statics one week. Changing them needs a worker deploy, not a VPS release.
- User-facing tournament copy is Russian unless a branded mechanic name is intentionally English.

## Admin participants screen

`ParticipantsPage` has three tabs in `?tab=` (players, tables, results). Saving the rating can post to the channel, so it goes through the confirm dialog, as do elimination, restoring, removal and the final table.

A marked re-entry on an eliminated player returns them to the game (`addMarkedReEntry`, `apps/api/src/services/liveTournament.ts`): new entry and life, first free seat, and players eliminated after them move up a place. Blocked for finished tournaments. Removing that entry later leaves the player in the game.

## Revenue analytics

`apps/api/src/services/adminAnalytics.ts` estimates revenue from marks, not payments: checked-in players × `buyIn`, re-entries × `reEntry`, add-ons × `addOnPrice`, at each tournament's own prices, with no prize deduction. Entries come from `entriesByUser` (shared with the clock). A tournament falls in a period by its Barnaul date; weeks start on Monday.

Revenue is owner-only: `requireAnalyticsOwner` (`apps/api/src/middleware/auth.ts`) allows just `danlluxx`, other admins get 403. The client asks `/api/admin/analytics/access` and hides the block and page; the server check is the real boundary.

## Registration QR message

Every tournament gets the same bot text, built only in `buildRegistrationCaption` (`apps/api/src/services/telegramRegistrationQr.ts`). Only the title, date and entry number vary; do not add per-tournament rules, prices or chips here.

1. Status: `Запись на турнир подтверждена ✅`, or `Re-entry подтверждён ✅ Вход №N` from the second entry.
2. Title in bold and upper case, on the next line.
3. Blockquote: `📅 <weekday>, <day> <month>, <HH:mm>` in `Asia/Barnaul`, then `📍 Flop Club, Барнаул, Геблера 33б`. The address is a constant, not `Tournament.location`.
4. `Покажи этот QR-код на входе — открывать приложение не нужно.`
5. `Удачи в игре! 🍀`

Blank lines separate the title, blockquote, instruction and wish. The caption is sent with `parse_mode: HTML`, so escape any dynamic text.

## Testing pattern

- Type safety: workspace `lint` scripts run `tsc --noEmit`.
- Build the modified workspace after meaningful changes.
- Use isolated PostgreSQL data for mechanics/integration scenarios.
- Use Playwright for meaningful user-facing flows; verify visible state, interaction, reload behavior, and browser console.
- Do not touch production data to manufacture screenshots or demos.

## Context maintenance pattern

- Update `HANDOFF.md` with the latest deployed commit, current operational constraint, and intentional dirty files.
- Add a new capsule only for a substantial reusable domain; otherwise extend an existing capsule.
- A capsule should usually stay below 120 lines.
- Record conclusions, not investigation transcripts.
- Link to code paths instead of copying implementations.

