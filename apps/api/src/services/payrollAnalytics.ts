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

export async function payrollAnalytics(period: PayrollPeriod, date: string) {
  const range = periodRange(period, date);
  const master = await getMasterWorkbook();
  const roster = master ? await readRoster(Buffer.from(master.data)) : [];
  const shifts = await prisma.staffShift.findMany({
    where: { workDate: { gte: range.from, lte: range.to }, status: "Отработана" },
    orderBy: [{ workDate: "asc" }]
  });
  const byName = new Map(roster.map((employee) => [employee.name, employee]));
  const rows = new Map<string, { name: string; shifts: number; hours: number; earned: number; days: Set<string> }>();
  for (const shift of shifts) {
    const hours = shiftHours(shift);
    const row = rows.get(shift.employeeName) ?? { name: shift.employeeName, shifts: 0, hours: 0, earned: 0, days: new Set<string>() };
    row.shifts += 1;
    row.hours += hours;
    row.earned += shiftEarnings(hours, shift.status, byName.get(shift.employeeName));
    row.days.add(shift.workDate);
    rows.set(shift.employeeName, row);
  }
  const employees = [...rows.values()]
    .map((row) => ({ name: row.name, shifts: row.shifts, days: row.days.size, hours: Math.round(row.hours * 100) / 100, earned: Math.round(row.earned) }))
    .sort((a, b) => b.earned - a.earned || b.hours - a.hours || a.name.localeCompare(b.name, "ru"));
  return {
    period,
    ...range,
    importFrom: IMPORT_FROM,
    today: dateKey(new Date()),
    totals: {
      shifts: employees.reduce((sum, row) => sum + row.shifts, 0),
      hours: Math.round(employees.reduce((sum, row) => sum + row.hours, 0) * 100) / 100,
      earned: employees.reduce((sum, row) => sum + row.earned, 0),
      employees: employees.length
    },
    employees
  };
}
