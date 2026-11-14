import { prisma } from "../prisma.js";
import { dateKey } from "./tournamentSchedule.js";
import { deleteShift } from "./payrollWorkbook.js";

export async function getState(key: string) {
  return (await prisma.telegramBotState.findUnique({ where: { key } }))?.value ?? null;
}

export async function setState(key: string, value: string) {
  await prisma.telegramBotState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export const money = (value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString("ru-RU")} ₽`;
export const dayLabel = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;
export const addDays = (key: string, days: number) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

// Entries made from the bot go to the tournament of the current club day: a night game that ends after midnight
// still belongs to the day it started, so the day changes at 06:00 Barnaul time.
export const clubDay = (now = new Date()) => dateKey(new Date(now.getTime() - 6 * 60 * 60 * 1000));

const undoKey = (chatId: number) => `payroll:undo:${chatId}`;

async function rememberEntry(chatId: number, id: string) {
  const previous = JSON.parse((await getState(undoKey(chatId))) ?? "[]") as string[];
  await setState(undoKey(chatId), JSON.stringify([...previous, id].slice(-20)));
}

async function tournamentOn(date: string) {
  return prisma.tournament.findFirst({
    where: { startsAt: { gte: new Date(`${date}T00:00:00+07:00`), lt: new Date(new Date(`${date}T00:00:00+07:00`).getTime() + 86_400_000) }, status: { not: "CANCELLED" } },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true }
  });
}

export type EntrySpec =
  | { kind: "adjust"; employee: string; amount: number; comment: string; date: string | null }
  | { kind: "shift"; employee: string; startTime: string | null; endTime: string | null; manualHours: number | null; comment: string | null; date: string | null };

// Writes one entry to the tournament of the given (or current) club day.
export async function createEntry(chatId: number, spec: EntrySpec) {
  const date = spec.date ?? clubDay();
  const tournament = await tournamentOn(date);
  if (!tournament) return { ok: false as const, error: `На ${dayLabel(date)} нет турнира. Выберите другой день.` };
  const base = { tournamentId: tournament.id, workDate: date, employeeName: spec.employee, status: "Отработана" };
  const shift = spec.kind === "adjust"
    ? await prisma.staffShift.create({ data: { ...base, adjustment: spec.amount, comment: spec.comment } })
    : await prisma.staffShift.create({ data: { ...base, startTime: spec.startTime, endTime: spec.endTime, manualHours: spec.manualHours, comment: spec.comment } });
  await rememberEntry(chatId, shift.id);
  const detail = spec.kind === "adjust"
    ? `${spec.comment} ${money(spec.amount)}`
    : `смена ${spec.startTime ? `${spec.startTime}–${spec.endTime}` : `${String(spec.manualHours).replace(".", ",")} ч`}`;
  return { ok: true as const, id: shift.id, date, tournament: tournament.title, detail };
}

function describe(shift: { employeeName: string; workDate: string; adjustment: number | null; comment: string | null }) {
  const what = shift.adjustment ? `${shift.comment ?? "запись"} ${money(shift.adjustment)}` : "смена";
  return `${shift.employeeName}, ${dayLabel(shift.workDate)}, ${what}`;
}

// Removes one entry by id (an entry already in the table is also removed from the table file).
export async function undoEntry(id: string) {
  const shift = await prisma.staffShift.findUnique({ where: { id } });
  if (!shift) return null;
  const result = await deleteShift(id);
  return `${describe(shift)}.${result.fromTable ? " Убрал и из таблицы." : ""}`;
}

// Removes the latest entry made from the bot.
export async function undoLastEntry(chatId: number) {
  const stack = JSON.parse((await getState(undoKey(chatId))) ?? "[]") as string[];
  while (stack.length) {
    const id = stack.pop()!;
    await setState(undoKey(chatId), JSON.stringify(stack));
    const text = await undoEntry(id);
    if (text) return text;
  }
  return null;
}
