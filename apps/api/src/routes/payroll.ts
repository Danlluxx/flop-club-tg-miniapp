import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAdmin, requireAnalyticsOwner, requireAuth } from "../middleware/auth.js";
import { AppError, notFound } from "../utils/errors.js";
import { dateKey } from "../services/tournamentSchedule.js";
import {
  exportPendingShifts,
  getMasterWorkbook,
  IMPORT_FROM,
  readRoster,
  saveMasterWorkbook,
  shiftHours
} from "../services/payrollWorkbook.js";

export const payrollRouter = express.Router();
payrollRouter.use(requireAuth, requireAdmin);

const STATUSES = ["Отработана", "Запланирована", "Неявка"] as const;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const shiftSchema = z.object({
  employeeName: z.string().trim().min(1).max(80),
  startTime: time.nullish(),
  endTime: time.nullish(),
  breakHours: z.number().min(0).max(12).nullish(),
  manualHours: z.number().min(0).max(24).nullish(),
  status: z.enum(STATUSES).default("Отработана"),
  comment: z.string().trim().max(200).nullish()
}).superRefine((value, ctx) => {
  const counted = value.status === "Отработана";
  if (counted && value.manualHours == null && !(value.startTime && value.endTime)) {
    ctx.addIssue({ code: "custom", message: "Укажите начало и конец смены или число часов", path: ["startTime"] });
  }
});

const shiftView = (shift: {
  id: string; employeeName: string; workDate: string; startTime: string | null; endTime: string | null;
  breakHours: number | null; manualHours: number | null; status: string; comment: string | null; exportedAt: Date | null;
}) => ({
  id: shift.id,
  employeeName: shift.employeeName,
  workDate: shift.workDate,
  startTime: shift.startTime,
  endTime: shift.endTime,
  breakHours: shift.breakHours,
  manualHours: shift.manualHours,
  status: shift.status,
  comment: shift.comment,
  hours: shift.status === "Отработана" ? shiftHours(shift) : 0,
  exported: Boolean(shift.exportedAt)
});

async function assertKnownEmployee(name: string) {
  const master = await getMasterWorkbook();
  if (!master) return;
  const roster = await readRoster(Buffer.from(master.data));
  if (!roster.some((employee) => employee.name === name)) {
    throw new AppError(400, `«${name}» нет в справочнике таблицы — добавьте сотрудника на лист «Сотрудники»`, "PAYROLL_UNKNOWN_EMPLOYEE");
  }
}

payrollRouter.get("/status", async (_req, res, next) => {
  try {
    const [master, pending] = await Promise.all([
      prisma.payrollWorkbook.findUnique({ where: { key: "master" }, select: { fileName: true, updatedAt: true } }),
      prisma.staffShift.count({ where: { exportedAt: null } })
    ]);
    res.json({ hasWorkbook: Boolean(master), fileName: master?.fileName ?? null, updatedAt: master?.updatedAt ?? null, pending });
  } catch (error) {
    next(error);
  }
});

payrollRouter.get("/staff", async (_req, res, next) => {
  try {
    const master = await getMasterWorkbook();
    const roster = master ? await readRoster(Buffer.from(master.data)) : [];
    res.json(roster.filter((employee) => !/уволен/i.test(employee.status)).map(({ name, position }) => ({ name, position })));
  } catch (error) {
    next(error);
  }
});

payrollRouter.get("/tournaments", async (_req, res, next) => {
  try {
    const since = new Date(`${IMPORT_FROM}T00:00:00+07:00`);
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tournaments = await prisma.tournament.findMany({
      where: { startsAt: { gte: since, lte: until }, status: { not: "CANCELLED" } },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true, startsAt: true, _count: { select: { shifts: true } } }
    });
    res.json(tournaments.map((t) => ({ id: t.id, title: t.title, startsAt: t.startsAt, date: dateKey(t.startsAt), shifts: t._count.shifts })));
  } catch (error) {
    next(error);
  }
});

payrollRouter.get("/tournaments/:id/shifts", async (req, res, next) => {
  try {
    const shifts = await prisma.staffShift.findMany({ where: { tournamentId: req.params.id }, orderBy: { createdAt: "asc" } });
    res.json(shifts.map(shiftView));
  } catch (error) {
    next(error);
  }
});

payrollRouter.post("/tournaments/:id/shifts", async (req, res, next) => {
  try {
    const body = shiftSchema.parse(req.body);
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { startsAt: true } });
    if (!tournament) throw notFound("Tournament");
    await assertKnownEmployee(body.employeeName);
    const shift = await prisma.staffShift.create({
      data: {
        tournamentId: req.params.id,
        workDate: dateKey(tournament.startsAt),
        employeeName: body.employeeName,
        startTime: body.startTime || null,
        endTime: body.endTime || null,
        breakHours: body.breakHours ?? null,
        manualHours: body.manualHours ?? null,
        status: body.status,
        comment: body.comment || null
      }
    });
    res.status(201).json(shiftView(shift));
  } catch (error) {
    next(error);
  }
});

payrollRouter.patch("/shifts/:id", async (req, res, next) => {
  try {
    const body = shiftSchema.parse(req.body);
    const existing = await prisma.staffShift.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Shift");
    if (existing.exportedAt) throw new AppError(409, "Смена уже в таблице зарплат — исправьте её там", "PAYROLL_SHIFT_EXPORTED");
    await assertKnownEmployee(body.employeeName);
    const shift = await prisma.staffShift.update({
      where: { id: existing.id },
      data: {
        employeeName: body.employeeName,
        startTime: body.startTime || null,
        endTime: body.endTime || null,
        breakHours: body.breakHours ?? null,
        manualHours: body.manualHours ?? null,
        status: body.status,
        comment: body.comment || null
      }
    });
    res.json(shiftView(shift));
  } catch (error) {
    next(error);
  }
});

payrollRouter.delete("/shifts/:id", async (req, res, next) => {
  try {
    const existing = await prisma.staffShift.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Shift");
    if (existing.exportedAt) throw new AppError(409, "Смена уже в таблице зарплат — удалите её там", "PAYROLL_SHIFT_EXPORTED");
    await prisma.staffShift.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Salary figures are owner-only, like revenue: the file holds everyone's rates and payouts.
payrollRouter.get("/workbook", requireAnalyticsOwner, async (_req, res, next) => {
  try {
    const { fileName, data } = await exportPendingShifts();
    res.setHeader("Content-Type", XLSX_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(data);
  } catch (error) {
    next(error);
  }
});

payrollRouter.put("/workbook", requireAnalyticsOwner, express.raw({ type: () => true, limit: "15mb" }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError(400, "Файл не передан", "PAYROLL_BAD_FILE");
    const fileName = typeof req.query.name === "string" && req.query.name.trim() ? req.query.name.trim().slice(0, 120) : "ЗП FLOP CLUB.xlsx";
    const saved = await saveMasterWorkbook(fileName, req.body);
    res.json({ fileName: saved.fileName, updatedAt: saved.updatedAt, ...saved.sync });
  } catch (error) {
    next(error);
  }
});
