import express from "express";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { awardSixes, eliminateDevil, getDevilState, resurrect, reverseAward, setBlindLevel, confirmReturn } from "../services/devilDeal.js";
import { devilDealDefaults } from "../services/tournamentMechanics.js";
import { registerForTournament } from "../services/tournaments.js";

export const devilDealRouter = express.Router({ mergeParams: true });
devilDealRouter.use(requireAuth);
devilDealRouter.get("/", async (req, res, next) => {
  try { res.json(await getDevilState(String((req.params as Record<string, string>).id), req.user!.id)); } catch (e) { next(e); }
});
devilDealRouter.post("/resurrect", async (req, res, next) => {
  try { z.object({}).strict().parse(req.body ?? {}); res.json(await resurrect(String((req.params as Record<string, string>).id), req.user!.id)); } catch (e) { next(e); }
});
const key = z.string().trim().min(1).max(100);
export const devilControlRouter = express.Router({ mergeParams: true });
devilControlRouter.use(requireAuth, requireAdmin);
devilControlRouter.get("/", async (req, res, next) => {
  try { res.json(await getDevilState(String((req.params as Record<string, string>).id))); } catch (e) { next(e); }
});
devilControlRouter.post("/eliminate", async (req, res, next) => {
  try {
    const p = z.object({ registrationId: key, killerRegistrationId: key.nullable().optional(), lifeNumber: z.number().int().positive() }).strict().parse(req.body);
    res.json(await eliminateDevil(String((req.params as Record<string, string>).id), p.registrationId, p.killerRegistrationId, p.lifeNumber, req.user!.id));
  } catch (e) { next(e); }
});
devilControlRouter.post("/re-entry", async (req, res, next) => {
  try { const p = z.object({ userId: key }).strict().parse(req.body); res.json(await registerForTournament(p.userId, String((req.params as Record<string, string>).id), req.user!.id)); } catch (e) { next(e); }
});
devilControlRouter.post("/sixes", async (req, res, next) => {
  try {
    const p = z.object({ registrationId: key, handId: key, kind: z.enum(["POCKET_SIXES", "DEVILS_666"]), levelIndex: z.number().int().nonnegative(), showdownConfirmed: z.literal(true), wonHand: z.literal(true), pocketSixesConfirmed: z.literal(true) }).strict().parse(req.body);
    res.json(await awardSixes(String((req.params as Record<string, string>).id), p, req.user!.id));
  } catch (e) { next(e); }
});
devilControlRouter.post("/blinds", async (req, res, next) => {
  try { const p = z.object({ levelIndex: z.number().int().nonnegative(), eventKey: key }).strict().parse(req.body); res.json(await setBlindLevel(String((req.params as Record<string, string>).id), p.levelIndex, p.eventKey, req.user!.id)); } catch (e) { next(e); }
});
devilControlRouter.post("/reverse", async (req, res, next) => {
  try { const p = z.object({ eventId: key, reason: z.string().trim().min(5).max(500), correctedKind: z.enum(["POCKET_SIXES", "DEVILS_666"]).optional() }).strict().parse(req.body); res.json(await reverseAward(String((req.params as Record<string, string>).id), p.eventId, p.reason, req.user!.id, p.correctedKind)); } catch (e) { next(e); }
});

devilControlRouter.post("/confirm-return", async (req, res, next) => {
  try { const p = z.object({ registrationId: key, lifeNumber: z.number().int().positive() }).strict().parse(req.body); res.json(await confirmReturn(String((req.params as Record<string, string>).id), p.registrationId, p.lifeNumber, req.user!.id)); } catch (e) { next(e); }
});

export const mechanicsTemplatesRouter = express.Router();
mechanicsTemplatesRouter.get("/", requireAuth, requireAdmin, (_req, res) => res.json(devilDealDefaults));
