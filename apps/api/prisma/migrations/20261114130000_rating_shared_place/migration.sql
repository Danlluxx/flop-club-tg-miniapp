-- FLOP DUO: the two partners of a team share one rating place.
DROP INDEX "TournamentRatingResult_tournamentId_place_key";
CREATE INDEX "TournamentRatingResult_tournamentId_place_idx" ON "TournamentRatingResult"("tournamentId", "place");
