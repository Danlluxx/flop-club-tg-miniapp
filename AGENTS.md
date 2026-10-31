# Codex workflow for this repository

Before working, read `docs/ai/INDEX.md`. Then open only the context capsule named there for the current task.

## Context discipline

- Do not load every document by default.
- Treat code, migrations, and tests as the source of truth; context files are navigation aids.
- Never put passwords, tokens, cookies, private keys, or full production `.env` values in Markdown.
- Keep `docs/ai/HANDOFF.md` short and current. Replace obsolete facts instead of appending a diary.
- Add a durable convention to `docs/ai/PATTERNS.md` only when it is likely to be reused.
- Update the relevant context capsule in the same change when architecture, production state, deployment flow, or a reusable pattern changes.
- Keep capsules concise: decisions, file paths, commands, invariants, and known traps. Do not paste logs or large code excerpts.

## Working rules

- Preserve unrelated local changes. Check `git status --short` before editing.
- Implement and verify locally first. Publish once after the user approves the finished local result.
- For user-facing changes, run the smallest relevant build/test and verify the changed flow in a browser.
- Production data mutations require explicit scope from the user and a read-only check first.
- Use `apply_patch` for hand-written file edits.

