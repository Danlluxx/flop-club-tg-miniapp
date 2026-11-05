import express from "express";
import { z } from "zod";
import { RegistrationStatus, TournamentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { isAnalyticsOwner, requireAdmin, requireAnalyticsOwner, requireAuth } from "../middleware/auth.js";
import { AppError, notFound } from "../utils/errors.js";
import { registerForTournament } from "../services/tournaments.js";
import { applyTournamentRatingResults, getRatingAwards } from "../services/rating.js";
import {
  addMarkedReEntry,
  autoReseatTournament,
  checkInTournamentRegistration,
  formFinalTable,
  getTournamentLiveState,
  moveLiveSeat,
  recordElimination
} from "../services/liveTournament.js";
import { buildAdminAnalytics } from "../services/adminAnalytics.js";
import { buildGameDayRatingWorkbook } from "../services/dayReport.js";
import { dateKey } from "../services/tournamentSchedule.js";
import { getTournamentRatingText, publishTournamentRatingResults } from "../services/telegramRatingResults.js";
import { issueDevilAddOn, removeDevilAddOn } from "../services/devilDeal.js";

export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin);

const analyticsQuerySchema = z.object({
  period: z.enum(["day", "week", "month"]).default("month"),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value))).optional()
});

adminRouter.get("/analytics/access", (req, res) => {
  res.json({ allowed: isAnalyticsOwner(req.user?.username) });
});

adminRouter.get("/analytics", requireAnalyticsOwner, async (req, res, next) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const today = dateKey(new Date());
    const tournaments = await prisma.tournament.findMany({
      where: { registrations: { some: { checkedInAt: { not: null } } } },
      select: {
        id: true,
        title: true,
        startsAt: true,
        status: true,
        buyIn: true,
        reEntry: true,
        addOnPrice: true,
        maxParticipants: true,
        registrations: {
          where: { status: RegistrationStatus.ACTIVE },
          select: {
            userId: true,
            entryNumber: true,
            addOnCount: true,
            checkedInAt: true,
            user: { select: { displayName: true, firstName: true, lastName: true, username: true, telegramId: true } }
          }
        }
      }
    });
    res.json(buildAdminAnalytics(tournaments, query.period, query.anchor, today));
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [totalTournaments, finishedTournaments, activeTournaments, totalRegistrations, totalUsers, tournaments] = await Promise.all([
      prisma.tournament.count(),
      prisma.tournament.count({ where: { status: TournamentStatus.FINISHED } }),
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
          registrations: {
            where: { status: RegistrationStatus.ACTIVE },
            select: { id: true }
          },
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

    const participantStatsTournaments = tournaments.filter((tournament) => tournament.status !== TournamentStatus.CANCELLED);
    const totalTournamentParticipants = participantStatsTournaments.reduce(
      (sum, tournament) => sum + tournament.registrations.length,
      0
    );
    const averageParticipantsPerTournament = participantStatsTournaments.length
      ? totalTournamentParticipants / participantStatsTournaments.length
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

    const monthlyParticipantMap = new Map<string, { tournaments: number; participants: number }>();
    for (const tournament of participantStatsTournaments) {
      const month = dateKey(tournament.startsAt).slice(0, 7);
      const current = monthlyParticipantMap.get(month) ?? { tournaments: 0, participants: 0 };
      current.tournaments += 1;
      current.participants += tournament.registrations.length;
      monthlyParticipantMap.set(month, current);
    }

    const monthlyParticipantAverages = [...monthlyParticipantMap.entries()]
      .map(([month, item]) => ({
        month,
        tournaments: item.tournaments,
        participants: item.participants,
        averageParticipants: item.tournaments ? item.participants / item.tournaments : 0
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    res.json({
      totalTournaments,
      finishedTournaments,
      activeTournaments,
      totalRegistrations,
      totalUsers,
      averageFillRate,
      averageParticipantsPerTournament,
      monthlyParticipantAverages,
      dailyFillRates,
      tournamentFillRates
    });
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
  chipLeaderRegistrationId: z.string().min(1).optional(),
  chipLeaderBonus: z.coerce.number().int().min(0).default(0),
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
}).superRefine((value, context) => {
  const hasRegistration = Boolean(value.chipLeaderRegistrationId);
  const hasBonus = value.chipLeaderBonus > 0;
  if (hasRegistration !== hasBonus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "chipLeaderRegistrationId and a positive chipLeaderBonus must be provided together"
    });
  }
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

const finishPlaceSchema = z.object({
  finishPlace: z.coerce.number().int().min(1).max(500).nullable()
});

function normalizeCheckInToken(token: string) {
  return token.trim().replace(/^flop-checkin:/i, "");
}

adminRouter.post("/check-in", async (req, res, next) => {
  try {
    const payload = checkInSchema.parse(req.body);
    const checkInToken = normalizeCheckInToken(payload.token);
    const updated = await checkInTournamentRegistration(checkInToken, req.user!.id);
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
    const registration = await registerForTournament(user.id, req.params.id, req.user!.id);
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
    if (registration.tournament.mechanics) {
      res.json(await issueDevilAddOn(registration.tournamentId, registration.id, req.user!.id));
      return;
    }
    if (!registration.tournament.addOnEnabled) {
      throw new AppError(409, "Add-on is disabled for this tournament", "ADD_ON_DISABLED");
    }
    const addOnOpensAt = registration.tournament.lateRegistrationEndsAt
      ?? new Date(registration.tournament.startsAt.getTime() + 3 * 60 * 60 * 1000);
    if (new Date() < addOnOpensAt) {
      throw new AppError(409, "Add-on is available after late registration closes", "ADD_ON_NOT_OPEN");
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
    if (registration.tournament.mechanics) {
      res.json(await removeDevilAddOn(registration.tournamentId, registration.id, req.user!.id));
      return;
    }
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
    const updated = await addMarkedReEntry(req.params.registrationId);
    console.log(`[admin:re-entry] registration=${updated.id} tournament=${updated.tournamentId} status=${updated.liveStatus}`);
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
    if (registration.tournament.mechanics) throw new AppError(409, "Используйте DEVIL CONTROL", "DEVIL_CONTROL_REQUIRED");
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

adminRouter.patch("/registrations/:registrationId/finish-place", async (req, res, next) => {
  try {
    const payload = finishPlaceSchema.parse(req.body);
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.registrationId },
      include: { tournament: true }
    });
    if (!registration) throw notFound("Registration");
    if (registration.tournament.mechanics) throw new AppError(409, "Используйте DEVIL CONTROL", "DEVIL_CONTROL_REQUIRED");
    if (registration.status !== RegistrationStatus.ACTIVE) {
      throw new AppError(409, "Registration is not active", "REGISTRATION_NOT_ACTIVE");
    }
    if (payload.finishPlace !== null) {
      const placeOwner = await prisma.registration.findFirst({
        where: {
          tournamentId: registration.tournamentId,
          status: RegistrationStatus.ACTIVE,
          finishPlace: payload.finishPlace,
          id: { not: registration.id }
        },
        include: { user: true }
      });
      if (placeOwner) {
        const ownerName = placeOwner.user.displayName ?? placeOwner.user.firstName ?? placeOwner.user.username ?? placeOwner.user.telegramId;
        throw new AppError(409, `Place ${payload.finishPlace} is already assigned to ${ownerName}`, "FINISH_PLACE_DUPLICATED");
      }
    }

    const updated = await prisma.registration.update({
      where: { id: registration.id },
      data: { finishPlace: payload.finishPlace }
    });
    console.log(
      `[admin:finish-place:update] registration=${registration.id} tournament=${registration.tournamentId} place=${payload.finishPlace ?? "none"}`
    );
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
    const t = await prisma.tournament.findUnique({ where: { id: registration.tournamentId } });
    if (t?.mechanics) throw new AppError(409, "Используйте DEVIL CONTROL", "DEVIL_CONTROL_REQUIRED");
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

adminRouter.get("/tournaments/:id/rating-publication", async (req, res, next) => {
  try {
    const text = await getTournamentRatingText(req.params.id);
    if (!text) { res.status(404).json({ message: "Сначала начислите рейтинг турнира" }); return; }
    res.json({ text });
  } catch (error) { next(error); }
});

adminRouter.get("/tournaments/:id/rating-results", async (req, res, next) => {
  try {
    const requestedEntriesCount = Number(req.query.entriesCount);
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        ratingResults: { include: { user: true }, orderBy: { place: "asc" } },
        chipLeaderAward: true
      }
    });
    if (!tournament) throw notFound("Tournament");
    const entriesCount = Number.isFinite(requestedEntriesCount) && requestedEntriesCount > 0
      ? requestedEntriesCount
      : tournament.entriesCount ?? 1;
    res.json({
      entriesCount,
      ratingPool: tournament.ratingPool,
      awards: getRatingAwards(tournament.ratingPool, entriesCount),
      results: tournament.ratingResults,
      chipLeaderAward: tournament.chipLeaderAward
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/tournaments/:id/rating-results", async (req, res, next) => {
  try {
    const payload = ratingResultsSchema.parse(req.body);
    const chipLeaderAward = payload.chipLeaderRegistrationId
      ? { registrationId: payload.chipLeaderRegistrationId, points: payload.chipLeaderBonus }
      : undefined;
    const results = await applyTournamentRatingResults(
      req.params.id,
      payload.entriesCount,
      payload.results,
      chipLeaderAward
    );
    console.log(`[rating:apply] admin=${req.user!.id} tournament=${req.params.id} results=${results.length}`);
    try {
      await publishTournamentRatingResults(req.params.id);
    } catch (error) {
      console.error(`[telegram:rating] failed tournamentId=${req.params.id}`, error);
    }
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
