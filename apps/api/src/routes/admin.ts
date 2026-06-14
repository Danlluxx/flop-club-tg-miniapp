import express from "express";
import { z } from "zod";
import { RegistrationStatus, TournamentProfile, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { AppError, notFound } from "../utils/errors.js";
import { assignNextAvailableSeat, registerForTournament } from "../services/tournaments.js";
import { applyTournamentRatingResults, getRatingAwards } from "../services/rating.js";
import { autoReseatTournament, formFinalTable, getTournamentLiveState, moveLiveSeat, recordElimination } from "../services/liveTournament.js";
import { buildGameDayRatingWorkbook } from "../services/dayReport.js";
import { dateKey } from "../services/tournamentSchedule.js";

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [totalTournaments, activeTournaments, totalRegistrations, totalUsers, tournaments] = await Promise.all([
      prisma.tournament.count(),
      prisma.tournament.count({ where: { status: TournamentStatus.OPEN } }),
      prisma.registration.count({ where: { status: RegistrationStatus.ACTIVE } }),
      prisma.user.count(),
      prisma.tournament.findMany({
        select: {
          id: true,
          title: true,
          startsAt: true,
          status: true,
          maxParticipants: true,
          _count: {
            select: {
              registrations: {
                where: {
                  status: RegistrationStatus.ACTIVE,
                  checkedInAt: { not: null }
                }
              }
            }
          }
        },
        orderBy: { startsAt: "asc" }
      })
    ]);

    const tournamentFillRates = tournaments.map((tournament) => {
      const participants = tournament._count.registrations;
      return {
        id: tournament.id,
        title: tournament.title,
        startsAt: tournament.startsAt,
        status: tournament.status,
        participants,
        capacity: tournament.maxParticipants,
        fillRate: tournament.maxParticipants > 0 ? participants / tournament.maxParticipants : 0
      };
    });

    const averageFillRate = tournaments.length
      ? tournamentFillRates.reduce((sum, item) => sum + item.fillRate, 0) / tournamentFillRates.length
      : 0;

    const dailyFillMap = new Map<string, { tournaments: number; registrations: number; capacity: number; fillRateSum: number }>();
    for (const tournament of tournaments) {
      const key = dateKey(tournament.startsAt);
      const current = dailyFillMap.get(key) ?? { tournaments: 0, registrations: 0, capacity: 0, fillRateSum: 0 };
      current.tournaments += 1;
      current.registrations += tournament._count.registrations;
      current.capacity += tournament.maxParticipants;
      current.fillRateSum += tournament._count.registrations / tournament.maxParticipants;
      dailyFillMap.set(key, current);
    }

    const dailyFillRates = [...dailyFillMap.entries()].map(([date, item]) => ({
      date,
      tournaments: item.tournaments,
      registrations: item.registrations,
      capacity: item.capacity,
      averageFillRate: item.fillRateSum / item.tournaments
    }));

    res.json({ totalTournaments, activeTournaments, totalRegistrations, totalUsers, averageFillRate, dailyFillRates, tournamentFillRates });
  } catch (error) {
    next(error);
  }
});

const addParticipantSchema = z.object({
  telegramId: z.string().min(1),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const ratingResultsSchema = z.object({
  entriesCount: z.coerce.number().int().min(1).optional(),
  results: z.array(
    z.object({
      registrationId: z.string().optional(),
      userId: z.string().optional(),
      place: z.coerce.number().int().min(1),
      knockouts: z.coerce.number().int().min(0).default(0)
    }).refine((value) => value.registrationId || value.userId, {
      message: "registrationId or userId is required"
    })
  ).min(1)
});

const moveSeatSchema = z.object({
  tableNumber: z.coerce.number().int().min(1).max(5),
  seatNumber: z.coerce.number().int().min(1).max(10)
});

const knockoutSchema = z.object({
  eliminatedRegistrationId: z.string().min(1),
  killerRegistrationId: z.string().min(1).optional().nullable()
});

const checkInSchema = z.object({
  token: z.string().min(8)
});

function normalizeCheckInToken(token: string) {
  return token.trim().replace(/^flop-checkin:/i, "");
}

adminRouter.post("/check-in", async (req, res, next) => {
  try {
    const payload = checkInSchema.parse(req.body);
    const checkInToken = normalizeCheckInToken(payload.token);
    const updated = await prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({
        where: { checkInToken },
        include: { user: true, tournament: true }
      });
      if (!registration) throw notFound("Registration");
      if (registration.status !== RegistrationStatus.ACTIVE) {
        throw new AppError(409, "Registration is not active", "REGISTRATION_NOT_ACTIVE");
      }
      if (registration.liveStatus !== "IN_GAME") {
        throw new AppError(409, "Participant is not in game", "PARTICIPANT_NOT_IN_GAME");
      }

      const seat = registration.checkedInAt && registration.tableNumber && registration.seatNumber
        ? { tableNumber: registration.tableNumber, seatNumber: registration.seatNumber }
        : await assignNextAvailableSeat(tx, registration.tournamentId, registration.tournament.maxParticipants, registration.id);
      const checkedInAt = registration.checkedInAt ?? new Date();

      return tx.registration.update({
        where: { id: registration.id },
        data: { checkedInAt, ...seat },
        include: { user: true, tournament: true }
      });
    });
    console.log(`[admin:check-in] registration=${updated.id} tournament=${updated.tournamentId} user=${updated.userId}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/participants", async (req, res, next) => {
  try {
    const payload = addParticipantSchema.parse(req.body);
    const user = await prisma.user.upsert({
      where: { telegramId: payload.telegramId },
      create: { ...payload, role: "USER" },
      update: payload
    });
    const registration = await registerForTournament(user.id, req.params.id);
    console.log(`[admin:participant:add] tournament=${req.params.id} user=${user.id}`);
    res.status(201).json(registration);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/tournaments/:id/live", async (req, res, next) => {
  try {
    const state = await getTournamentLiveState(req.params.id);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/tournaments/:id/live/registrations/:registrationId/seat", async (req, res, next) => {
  try {
    const payload = moveSeatSchema.parse(req.body);
    const state = await moveLiveSeat(req.params.id, req.params.registrationId, payload.tableNumber, payload.seatNumber);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/live/knockouts", async (req, res, next) => {
  try {
    const payload = knockoutSchema.parse(req.body);
    const state = await recordElimination(req.params.id, payload.eliminatedRegistrationId, payload.killerRegistrationId);
    res.status(201).json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/live/eliminations", async (req, res, next) => {
  try {
    const payload = knockoutSchema.parse(req.body);
    const state = await recordElimination(req.params.id, payload.eliminatedRegistrationId, payload.killerRegistrationId);
    res.status(201).json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/live/reseat", async (req, res, next) => {
  try {
    const state = await autoReseatTournament(req.params.id);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/live/final-table", async (req, res, next) => {
  try {
    const state = await formFinalTable(req.params.id);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/registrations/:registrationId/add-on", async (req, res, next) => {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.registrationId },
      include: { tournament: true }
    });
    if (!registration) throw notFound("Registration");
    if (!registration.tournament.addOnEnabled) {
      throw new AppError(409, "Add-on is disabled for this tournament", "ADD_ON_DISABLED");
    }
    if (registration.addOnCount >= 1) {
      throw new AppError(409, "Add-on already used", "ADD_ON_LIMIT_REACHED");
    }
    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { addOnCount: { increment: 1 } }
    });
    console.log(`[admin:add-on] registration=${registration.id} tournament=${registration.tournamentId}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/registrations/:registrationId/add-on", async (req, res, next) => {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.registrationId },
      include: { tournament: true }
    });
    if (!registration) throw notFound("Registration");
    if (registration.addOnCount <= 0) {
      throw new AppError(409, "Add-on is not marked", "ADD_ON_NOT_MARKED");
    }
    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { addOnCount: { decrement: 1 } }
    });
    console.log(`[admin:add-on:remove] registration=${registration.id} tournament=${registration.tournamentId}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/registrations/:registrationId/re-entry", async (req, res, next) => {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.registrationId },
      include: { tournament: true }
    });
    if (!registration) throw notFound("Registration");
    if (registration.status !== RegistrationStatus.ACTIVE) {
      throw new AppError(409, "Registration is not active", "REGISTRATION_NOT_ACTIVE");
    }
    if (registration.tournament.profile === TournamentProfile.FREEZE || registration.tournament.reEntry <= 0) {
      throw new AppError(409, "Re-entry is disabled for this tournament", "RE_ENTRY_DISABLED");
    }
    if (registration.tournament.profile === TournamentProfile.PHOENIX && registration.entryNumber >= 2) {
      throw new AppError(409, "Re-entry limit reached", "RE_ENTRY_LIMIT_REACHED");
    }
    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { entryNumber: { increment: 1 } }
    });
    console.log(`[admin:re-entry] registration=${registration.id} tournament=${registration.tournamentId}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/registrations/:registrationId/re-entry", async (req, res, next) => {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.registrationId },
      include: { tournament: true }
    });
    if (!registration) throw notFound("Registration");
    if (registration.entryNumber <= 1) {
      throw new AppError(409, "Re-entry is not marked", "RE_ENTRY_NOT_MARKED");
    }
    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { entryNumber: { decrement: 1 } }
    });
    console.log(`[admin:re-entry:remove] registration=${registration.id} tournament=${registration.tournamentId}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/reports/day.xlsx", async (req, res, next) => {
  try {
    const report = await buildGameDayRatingWorkbook(req.query.date);
    console.log(`[admin:report:day:xlsx] admin=${req.user!.id} date=${report.dateKey}`);
    res.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.attachment(`flop-club-rating-${report.dateKey}.xlsx`).send(report.buffer);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/registrations/:registrationId", async (req, res, next) => {
  try {
    const registration = await prisma.registration.findUnique({ where: { id: req.params.registrationId } });
    if (!registration) throw notFound("Registration");
    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { status: RegistrationStatus.CANCELLED, tableNumber: null, seatNumber: null }
    });
    console.log(`[admin:participant:remove] registration=${registration.id}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/tournaments/:id/rating-results", async (req, res, next) => {
  try {
    const requestedEntriesCount = Number(req.query.entriesCount);
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { ratingResults: { include: { user: true }, orderBy: { place: "asc" } } }
    });
    if (!tournament) throw notFound("Tournament");
    const entriesCount = Number.isFinite(requestedEntriesCount) && requestedEntriesCount > 0
      ? requestedEntriesCount
      : tournament.entriesCount ?? 1;
    res.json({
      entriesCount,
      ratingPool: tournament.ratingPool,
      awards: getRatingAwards(tournament.ratingPool, entriesCount),
      results: tournament.ratingResults
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/rating-results", async (req, res, next) => {
  try {
    const payload = ratingResultsSchema.parse(req.body);
    const results = await applyTournamentRatingResults(req.params.id, payload.entriesCount, payload.results);
    console.log(`[rating:apply] admin=${req.user!.id} tournament=${req.params.id} results=${results.length}`);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/tournaments/:id/export.csv", async (req, res, next) => {
  try {
    const registrations = await prisma.registration.findMany({
      where: { tournamentId: req.params.id, status: RegistrationStatus.ACTIVE },
      include: { user: true, tournament: true },
      orderBy: { createdAt: "asc" }
    });
    if (!registrations.length) {
      const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
      if (!tournament) throw notFound("Tournament");
    }

    const rows = [
      [
        "telegramId",
        "username",
        "displayName",
        "tableNumber",
        "seatNumber",
        "entries",
        "reEntries",
        "addOns",
        "liveStatus",
        "finishPlace",
        "firstName",
        "lastName",
        "registeredAt",
        "checkedInAt"
      ],
      ...registrations.map((item) => [
        item.user.telegramId,
        item.user.username ?? "",
        item.user.displayName ?? "",
        item.tableNumber ?? "",
        item.seatNumber ?? "",
        item.entryNumber,
        Math.max(0, item.entryNumber - 1),
        item.addOnCount,
        item.liveStatus,
        item.finishPlace ?? "",
        item.user.firstName ?? "",
        item.user.lastName ?? "",
        item.createdAt.toISOString(),
        item.checkedInAt?.toISOString() ?? ""
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment("participants.csv").send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});
