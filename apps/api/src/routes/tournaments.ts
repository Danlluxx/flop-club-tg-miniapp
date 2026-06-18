import express from "express";
import { z } from "zod";
import { Prisma, RegistrationStatus, TournamentProfile, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { TOURNAMENT_MAX_PARTICIPANTS, cancelRegistration, getTournament, registerForTournament, tournamentInclude } from "../services/tournaments.js";
import { dateKey, ensureScheduledTournaments } from "../services/tournamentSchedule.js";
import { notFound } from "../utils/errors.js";

export const tournamentsRouter = express.Router();

const tournamentSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  startsAt: z.coerce.date(),
  location: z.string().min(2),
  buyIn: z.coerce.number().int().min(0),
  reEntry: z.coerce.number().int().min(0).default(1000),
  prizePool: z.coerce.number().int().min(0),
  ratingPool: z.coerce.number().int().min(0).default(10000),
  profile: z.nativeEnum(TournamentProfile).default(TournamentProfile.BASE),
  lateRegistrationEndsAt: z.coerce.date().optional().nullable(),
  addOnEnabled: z.coerce.boolean().default(false),
  addOnPrice: z.coerce.number().int().min(0).default(0),
  addOnChips: z.coerce.number().int().min(0).default(0),
  maxParticipants: z.coerce.number().int().min(1).max(TOURNAMENT_MAX_PARTICIPANTS),
  status: z.nativeEnum(TournamentStatus).default(TournamentStatus.OPEN),
  allowCancellation: z.boolean().default(true)
});

tournamentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    if (from && to && Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
      await ensureScheduledTournaments(from, to);
    }
    const where: Prisma.TournamentWhereInput = {
      ...(status ? { status: status as TournamentStatus } : {}),
      ...(from || to ? { startsAt: { gte: from, lte: to } } : {})
    };
    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { startsAt: "asc" },
      include: tournamentInclude
    });
    const activeSeats = tournaments.length
      ? await prisma.registration.groupBy({
        by: ["tournamentId"],
        where: {
          tournamentId: { in: tournaments.map((tournament) => tournament.id) },
          status: RegistrationStatus.ACTIVE,
          liveStatus: "IN_GAME"
        },
        _count: { _all: true }
      })
      : [];
    const activeSeatsByTournament = new Map(activeSeats.map((item) => [item.tournamentId, item._count._all]));
    res.json(tournaments.map((tournament) => ({
      ...tournament,
      activeSeatsCount: activeSeatsByTournament.get(tournament.id) ?? 0
    })));
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const tournament = await getTournament(id);
    const myRegistration = await prisma.registration.findFirst({
      where: { tournamentId: id, userId: req.user!.id, status: "ACTIVE", liveStatus: "IN_GAME" }
    });
    res.json({ ...tournament, myRegistration });
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = tournamentSchema.parse(req.body);
    const tournament = await prisma.tournament.create({ data, include: tournamentInclude });
    console.log(`[tournament:create] admin=${req.user!.id} tournament=${tournament.id}`);
    res.status(201).json(tournament);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    await getTournament(id);
    const data = tournamentSchema.partial().parse(req.body);
    const tournament = await prisma.tournament.update({
      where: { id },
      data,
      include: tournamentInclude
    });
    console.log(`[tournament:update] admin=${req.user!.id} tournament=${tournament.id}`);
    res.json(tournament);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const tournament = await getTournament(id);
    await prisma.$transaction(async (tx) => {
      if (/^\d{4}-\d{2}-\d{2}-/.test(id)) {
        await tx.deletedScheduledTournament.upsert({
          where: { dateKey: dateKey(tournament.startsAt) },
          update: {
            tournamentId: id,
            title: tournament.title,
            deletedByUserId: req.user!.id,
            deletedAt: new Date()
          },
          create: {
            dateKey: dateKey(tournament.startsAt),
            tournamentId: id,
            title: tournament.title,
            deletedByUserId: req.user!.id
          }
        });
      }
      await tx.tournament.delete({ where: { id } });
    });
    console.log(`[tournament:delete] admin=${req.user!.id} tournament=${id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.post("/:id/register", requireAuth, async (req, res, next) => {
  try {
    const registration = await registerForTournament(req.user!.id, String(req.params.id));
    res.status(201).json(registration);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.delete("/:id/register", requireAuth, async (req, res, next) => {
  try {
    const registration = await cancelRegistration(req.user!.id, String(req.params.id));
    res.json(registration);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.get("/:id/participants", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const participants = await prisma.registration.findMany({
      where: { tournamentId: id, status: "ACTIVE" },
      include: { user: true },
      orderBy: [{ liveStatus: "asc" }, { tableNumber: "asc" }, { seatNumber: "asc" }, { createdAt: "asc" }]
    });
    if (!participants) throw notFound("Participants");
    res.json(participants);
  } catch (error) {
    next(error);
  }
});
