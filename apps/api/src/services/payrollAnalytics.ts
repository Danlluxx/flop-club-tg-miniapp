import { prisma } from "../prisma.js";
import { dateKey } from "./tournamentSchedule.js";
import { IMPORT_FROM, getMasterWorkbook, readRoster, shiftHours, type RosterEntry } from "./payrollWorkbook.js";

export type PayrollPeriod = "day" | "week" | "month";

function utc(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function addDays(key: string, days: number) {
  return new Date(utc(key).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function periodRange(period: PayrollPeriod, date: string) {
  if (period === "day") return { from: date, to: date };
  if (period === "week") {
    const weekday = (utc(date).getUTCDay() + 6) % 7;
    const from = addDays(date, -weekday);
    return { from, to: addDays(from, 6) };
  }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 1)).toISOString().slice(0, 10);
  return { from, to: addDays(next, -1) };
}

// Same rule as column L of the table: hourly pay, or a flat rate per shift; planned and no-show shifts pay nothing.
// Bonuses and fines (column K) are not part of a shift in the app, so they are not included here.
export function shiftEarnings(hours: number, status: string, employee: RosterEntry | undefined) {
  if (!employee || status !== "Отработана") return 0;
  if (/за смену/i.test(employee.payType)) return employee.shiftRate;
  return Math.round(hours * employee.hourlyRate * 100) / 100;
}

export async function payrollAnalytics(period: PayrollPeriod, date: string, withFines = true) {
  const range = periodRange(period, date);
  const master = await getMasterWorkbook();
  const roster = master ? await readRoster(Buffer.from(master.data)) : [];
  const shifts = await prisma.staffShift.findMany({
    where: { workDate: { gte: range.from, lte: range.to }, status: "Отработана" },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }]
  });
  const byName = new Map(roster.map((employee) => [employee.name, employee]));
  const rows = new Map<string, { name: string; shifts: number; hours: number; pay: number; adjustment: number; days: Set<string> }>();
  const adjustments: Array<{ id: string; date: string; name: string; amount: number; comment: string }> = [];
  for (const shift of shifts) {
    const hours = shiftHours(shift);
    const amount = shift.adjustment ?? 0;
    const row = rows.get(shift.employeeName) ?? { name: shift.employeeName, shifts: 0, hours: 0, pay: 0, adjustment: 0, days: new Set<string>() };
    if (hours > 0) {
      row.shifts += 1;
      row.hours += hours;
      row.pay += shiftEarnings(hours, shift.status, byName.get(shift.employeeName));
      row.days.add(shift.workDate);
    }
    row.adjustment += amount;
    rows.set(shift.employeeName, row);
    if (amount) adjustments.push({ id: shift.id, date: shift.workDate, name: shift.employeeName, amount, comment: shift.comment ?? (amount < 0 ? "Штраф" : "Премия") });
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const employees = [...rows.values()]
    .map((row) => ({
      name: row.name,
      shifts: row.shifts,
      days: row.days.size,
      hours: round(row.hours),
      pay: Math.round(row.pay),
      adjustment: Math.round(row.adjustment),
      earned: Math.round(row.pay + (withFines ? row.adjustment : 0))
    }))
    .sort((a, b) => b.earned - a.earned || b.hours - a.hours || a.name.localeCompare(b.name, "ru"));
  const sum = (pick: (row: (typeof employees)[number]) => number) => employees.reduce((total, row) => total + pick(row), 0);
  return {
    period,
    ...range,
    withFines,
    importFrom: IMPORT_FROM,
    today: dateKey(new Date()),
    totals: {
      shifts: sum((row) => row.shifts),
      hours: round(sum((row) => row.hours)),
      pay: sum((row) => row.pay),
      adjustment: sum((row) => row.adjustment),
      earned: sum((row) => row.earned),
      employees: employees.length
    },
    employees,
    adjustments
  };
}
