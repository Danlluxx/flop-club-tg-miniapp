-- Special tournament formats represent every paid re-entry as a separate
-- active registration. The application serializes registration changes by
-- locking the tournament row, so the legacy one-active-row partial index is
-- both obsolete and incompatible with that model.
DROP INDEX IF EXISTS "Registration_active_once_key";

-- Preserve the lookup path used when checking a player's active entries.
CREATE INDEX IF NOT EXISTS "Registration_userId_tournamentId_status_idx"
ON "Registration"("userId", "tournamentId", "status");
