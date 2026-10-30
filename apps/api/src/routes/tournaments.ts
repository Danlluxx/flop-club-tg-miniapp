import express from "express";
import { z } from "zod";
import { Prisma, RegistrationStatus, TournamentProfile, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { TOURNAMENT_MAX_PARTICIPANTS, cancelRegistration, getTournament, registerForTournament, tournamentInclude } from "../services/tournaments.js";
import { dateKey, ensureScheduledTournaments } from "../services/tournamentSchedule.js";
import { AppError, notFound } from "../utils/errors.js";

import { mechanicsSchema } from "../services/tournamentMechanics.js";
import { assertDevilCanFinish, lockTournament } from "../services/devilDeal.js";

export const tournamentsRouter = express.Router();

const tournamentSchema = z.object({
  mechanics: mechanicsSchema.optional(),
  title: z.string().min(2),
  description: z.string().min(2),
  startsAt: z.coerce.date(),
  location: z.string().min(2),
  buyIn: z.coerce.number().int().min(0),
  reEntry: z.coerce.number().int().min(0).default(500),
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
    const specialPlayers = await prisma.registration.groupBy({ by: ["tournamentId", "userId"], where: { tournamentId: { in: tournaments.filter(t => t.mechanics).map(t => t.id) }, status: "ACTIVE" } });
    const specialCounts = new Map<string, number>();
    for (const item of specialPlayers) specialCounts.set(item.tournamentId, (specialCounts.get(item.tournamentId) ?? 0) + 1);
    res.json(tournaments.map((tournament) => ({
      ...tournament,
      ...(tournament.mechanics ? { _count: { registrations: specialCounts.get(tournament.id) ?? 0 } } : {}),
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
    if (data.mechanics) {
      if (new Date(data.mechanics.registrationClosesAt) <= data.startsAt) throw new AppError(400, "Закрытие регистрации должно быть после начала", "INVALID_CUTOFF");
      data.lateRegistrationEndsAt = new Date(data.mechanics.registrationClosesAt); data.prizePool = 0; data.addOnEnabled = false;
    }
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
    const tournament = await prisma.$transaction(async tx => {
      const old = await lockTournament(tx, id);
      if (old.mechanics && data.status === "FINISHED") await assertDevilCanFinish(tx, old);
      if (old.mechanics || data.mechanics) {
        const count = await tx.registration.count({ where: { tournamentId: id } });
        if (count && (data.mechanics || (data.startsAt && data.startsAt.getTime() !== old.startsAt.getTime()) || (data.lateRegistrationEndsAt && data.lateRegistrationEndsAt.getTime() !== old.lateRegistrationEndsAt?.getTime()) || (data.title && data.title !== old.title))) throw new AppError(409, "Правила и время нельзя менять после регистрации участников", "RULES_LOCKED");
        const mechanics = data.mechanics ?? old.mechanics;
        if (mechanics) { const rules = mechanicsSchema.parse(mechanics); if (new Date(rules.registrationClosesAt) <= (data.startsAt ?? old.startsAt)) throw new AppError(400, "Некорректное время закрытия", "INVALID_CUTOFF"); data.lateRegistrationEndsAt = new Date(rules.registrationClosesAt); data.prizePool = 0; data.addOnEnabled = false; }
      }
      return tx.tournament.update({ where: { id }, data, include: tournamentInclude });
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
      await lockTournament(tx, id);
      if (await tx.tournamentGameEvent.count({ where: { tournamentId: id } })) throw new AppError(409, "Турнир с игровым журналом можно отменить, но нельзя удалить", "EVENT_HISTORY_PROTECTED");
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

tournamentsRouter.get("/:id/public-participants", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const tournament = await getTournament(id);
    const participants = await prisma.registration.findMany({
      where: { tournamentId: id, status: "ACTIVE" },
      select: {
        id: true,
        status: true,
        liveStatus: true,
        finishPlace: true,
        entryNumber: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            photoUrl: true,
            ratingPoints: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    res.json(tournament.mechanics ? participants.filter((r, _, all) => !all.some(x => x.user.id === r.user.id && x.entryNumber > r.entryNumber)) : participants);
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
    const tournament = await getTournament(id);
    res.json(tournament.mechanics ? participants.filter((r, _, all) => !all.some(x => x.userId === r.userId && x.entryNumber > r.entryNumber)) : participants);
  } catch (error) {
    next(error);
  }
});

tournamentsRouter.get("/:id/results", requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const tournament = await prisma.tournament.findUnique({ where: { id }, include: { ratingResults: true, gameEvents: { where: { ratingPoints: { not: 0 } } }, registrations: { where: { status: "ACTIVE" }, orderBy: [{ entryNumber: "desc" }, { createdAt: "desc" }], include: { user: { select: { id: true, displayName: true, firstName: true, username: true } } } } } });
    if (!tournament) throw notFound("Tournament");
    if (tournament.status !== "FINISHED") { res.json([]); return; }
    const users = new Set<string>();
    res.json(tournament.registrations.filter(r => { if (users.has(r.userId)) return false; users.add(r.userId); return true; }).map(r => {
      const result = tournament.ratingResults.find(x => x.userId === r.userId);
      return { userId: r.userId, name: r.user.displayName || r.user.firstName || r.user.username || "Игрок", place: result?.place ?? r.finishPlace, points: (result ? result.points + result.knockouts + result.chipLeaderBonus : 0) + tournament.gameEvents.filter(e => e.userId === r.userId).reduce((sum,e) => sum + e.ratingPoints,0) };
    }).sort((a,b) => (a.place ?? 9999) - (b.place ?? 9999)));
  } catch (error) { next(error); }
});
