# AI context index

Read this file first. Open only the capsule needed for the task.

## Project in 30 seconds

Flop Club Telegram Mini App: React 18 + TypeScript + Vite frontend, Express + Prisma API, PostgreSQL, Docker Compose production stack. Telegram `initData` is verified by the API, which issues JWTs. Admin authorization is enforced on the backend.

```text
apps/web/                 UI, routing, React Query, Telegram Mini App integration
apps/api/src/routes/      REST endpoints
apps/api/src/services/    business rules
apps/api/prisma/          schema and migrations
apps/api/tests/           integration tests
deploy/                   production configuration and operational scripts
docs/                     feature documentation
```

## Open by task

| Task | Read |
| --- | --- |
| Any implementation | `docs/ai/PATTERNS.md` |
| Continue recent work / deploy | `docs/ai/HANDOFF.md` |
| FLOP DEVIL DEAL | `docs/ai/DEVIL_DEAL.md`, then detailed `docs/FLOP_DEVIL_DEAL.md` only if needed |
| Смены сотрудников, таблица зарплат, ежедневный файл от бота | `docs/ai/PAYROLL.md` |
| VPS deployment | `docs/ai/DEPLOY.md`, then `deploy/VPS_DEPLOY.md` only if needed |
| General onboarding | `README.md` |

## Fast verification

```bash
npm run lint --workspace @flop-club/api
npm run build --workspace @flop-club/api
npm run lint --workspace @flop-club/web
npm run build --workspace @flop-club/web
```

Run only checks relevant to the changed area during iteration; run both builds before a substantial release.

## Source-of-truth order

1. Current code, Prisma migrations, and tests.
2. `docs/ai/*` concise context capsules.
3. Detailed feature and deployment documents.
4. Old screenshots, output files, and chat history.

