# Production deployment — concise context

## Current topology

- Public frontend: `https://flop-club-app-pages.dev/`.
- Application stack: Docker Compose on the VPS; PostgreSQL, API, web, and reverse proxy.
- Health endpoint must return `{"ok":true}` after deployment.
- Detailed baseline instructions: `deploy/VPS_DEPLOY.md`.

## Release checklist

1. Confirm the intended diff and preserve unrelated dirty files.
2. Run relevant tests and production builds locally.
3. Commit only in-scope files and push the intended commit.
4. Obtain explicit user approval for the production publication.
5. On the server: fetch/update source, build, apply Prisma migrations through the normal startup path, restart the affected services.
6. Verify container status, public health, and the changed public flow.
7. Update `docs/ai/HANDOFF.md` with the deployed commit and any remaining operational issue.

## Safety

- Never paste `.env.production` or credentials into logs/docs/chat.
- Back up before a risky migration or production-data correction.
- Do not run seed in production.
- Do not assume a successful build means the public service restarted; verify the public endpoint.
- Direct SSH may be unavailable. The Timeweb serial web console is the current fallback, but public mutations through it still require explicit approval.

