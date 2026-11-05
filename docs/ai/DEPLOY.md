# Production deployment — concise context

## Current topology

- Public frontend (Mini App menu button): `https://flop-club-app-pages.pages.dev/`, serves the same bundle as the VPS web container. The VPS itself cannot reach it, so check it from the Mac.
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
- With the Mac's VPN on, traffic to the VPS goes through `utun5` and SSH/HTTPS time out at the banner. Use `ssh -o BindInterface=en0 root@<VPS_IP>`. The Timeweb serial web console is the fallback; public mutations through either still require explicit approval.
- `deploy/run-soft-design-timeweb.sh` releases `origin/main` with a dry run first. It is not on the server's checkout path: extract it with `git show <sha>:deploy/run-soft-design-timeweb.sh > /tmp/flop-release.sh`.
- `run-soft-design-timeweb.sh` stops on any file deleted in the release. `555013c` went out through a server copy that backs up and removes reviewed deletions under `apps/web/public` only.
- When piping a script to `ssh ... bash -s`, give `docker compose exec -T` its own stdin (`</dev/null` or a heredoc), or it consumes the rest of the script. `run-soft-design-timeweb.sh` has this trap in its health check: copy it to a server file and run that, or the run exits 0 right after `Ожидаем API...`, skipping the public check and `.deploy-commit`.

