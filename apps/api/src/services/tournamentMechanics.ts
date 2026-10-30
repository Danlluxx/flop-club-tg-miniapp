import { z } from "zod";
import { AppError } from "../utils/errors.js";

export const mechanicsSchema = z.object({
  tournamentType: z.literal("FLOP_DEVIL_DEAL"),
  timezone: z.literal("Asia/Barnaul"),
  startingStack: z.number().int().positive().max(10000000),
  blindLevelMinutes: z.number().int().positive().max(120),
  registrationClosesAt: z.string().datetime({ offset: true }),
  blindLevels: z.array(z.number().int().positive().max(10000000)).min(1).max(100),
  reEntry: z.object({ enabled: z.boolean(), maxEntries: z.number().int().positive().nullable() }).strict(),
  resurrection: z.object({ enabled: z.boolean(), maxAttemptsPerPlayer: z.literal(1), probabilities: z.object({ death: z.number().min(0).max(1), fiveBB: z.number().min(0).max(1), tenBB: z.number().min(0).max(1) }).strict() }).strict(),
  devilsSixes: z.object({ enabled: z.boolean(), pocketSixesBonusBB: z.number().int().positive().max(100), setOfSixesBonusBB: z.number().int().positive().max(100), requiresShowdown: z.literal(true) }).strict(),
  bounty: z.object({ enabled: z.boolean(), ratingPointsPerElimination: z.number().int().positive().max(10000) }).strict()
}).strict().superRefine((rules, ctx) => {
  const p = rules.resurrection.probabilities;
  if (Math.abs(p.death + p.fiveBB + p.tenBB - 1) > 1e-9 || Object.values(p).some(v => Math.abs(v * 1000000 - Math.round(v * 1000000)) > 1e-7)) {
    ctx.addIssue({ code: "custom", message: "Вероятности должны давать 100%, точность до 0,000001" });
  }
});
export type TournamentMechanics = z.infer<typeof mechanicsSchema>;
export const devilDealDefaults: TournamentMechanics = {
  tournamentType: "FLOP_DEVIL_DEAL", timezone: "Asia/Barnaul", startingStack: 30000, blindLevelMinutes: 15,
  registrationClosesAt: "2026-10-31T21:00:00+07:00",
  blindLevels: [100, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 10000, 15000, 20000],
  reEntry: { enabled: true, maxEntries: null },
  resurrection: { enabled: true, maxAttemptsPerPlayer: 1, probabilities: { death: 0.5, fiveBB: 0.3, tenBB: 0.2 } },
  devilsSixes: { enabled: true, pocketSixesBonusBB: 6, setOfSixesBonusBB: 13, requiresShowdown: true },
  bounty: { enabled: true, ratingPointsPerElimination: 50 }
};
export function mechanicsFor(tournament: { mechanics: unknown }) {
  return tournament.mechanics == null ? null : mechanicsSchema.parse(tournament.mechanics);
}
export function assertMechanicsOpen(rules: TournamentMechanics, now: Date) {
  if (now.getTime() >= new Date(rules.registrationClosesAt).getTime()) throw new AppError(409, "Специальные механики и регистрация закрыты", "MECHANICS_CLOSED");
}
export function resurrectionOutcome(roll: number, rules: TournamentMechanics) {
  const p = rules.resurrection.probabilities;
  return roll < Math.round(p.death * 1000000) ? "DEATH" : roll < Math.round((p.death + p.fiveBB) * 1000000) ? "RESURRECT_5" : "RESURRECT_10";
}
