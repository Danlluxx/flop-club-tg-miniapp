import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { RATING_TOURNAMENTS } from "../services/rating.js";

export const meRouter = express.Router();

export const currentRulesVersion = "2026-05-22";
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(48).optional(),
  photoUrl: z.string().max(600000).optional()
}).refine((value) => value.displayName || value.photoUrl, {
  message: "displayName or photoUrl is required"
});

meRouter.post("/rules/accept", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        rulesAcceptedAt: new Date(),
        rulesVersion: currentRulesVersion
      }
    });
    console.log(`[rules:accept] user=${user.id} version=${currentRulesVersion}`);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

meRouter.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data
    });
    console.log(`[profile:update] user=${user.id} displayName=${user.displayName} photo=${Boolean(data.photoUrl)}`);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

meRouter.post("/intro/complete", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { introCompletedAt: new Date() }
    });
    console.log(`[intro:complete] user=${user.id}`);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

meRouter.get("/registrations", requireAuth, async (req, res, next) => {
  try {
    const registrations = await prisma.registration.findMany({
      where: { userId: req.user!.id },
      include: {
        tournament: {
          include: { _count: { select: { registrations: { where: { status: "ACTIVE" } } } } }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(registrations);
  } catch (error) {
    next(error);
  }
});

meRouter.get("/awards", requireAuth, async (req, res, next) => {
  try {
    const wins = await prisma.tournamentRatingResult.findMany({
      where: { userId: req.user!.id, place: 1 },
      include: { tournament: { select: { title: true } } },
      orderBy: { createdAt: "asc" }
    });
    const winByTitle = new Map(wins.map((win) => [win.tournament.title, win.createdAt]));

    res.json(
      RATING_TOURNAMENTS.map((title) => ({
        title,
        unlocked: winByTitle.has(title),
        wonAt: winByTitle.get(title)?.toISOString() ?? null
      }))
    );
  } catch (error) {
    next(error);
  }
});
