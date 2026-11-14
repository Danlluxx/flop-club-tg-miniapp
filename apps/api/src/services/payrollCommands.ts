// Parsing of the payroll bot commands (штраф, реэнтри, адон, премия, смена, отмена, таблица, помощь).
// Pure functions: the handler in payrollBot.ts does the database work.

export type PayrollCommand =
  | { kind: "adjust"; employee: string; amount: number; comment: string; date: string | null }
  | { kind: "shift"; employee: string; startTime: string | null; endTime: string | null; manualHours: number | null; comment: string | null; date: string | null }
  | { kind: "undo" }
  | { kind: "table" }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const REENTRY_AMOUNT = 500;
export const ADDON_AMOUNT = 1000;
const MAX_AMOUNT = 100_000;

const ALIASES: Record<string, "fine" | "reentry" | "addon" | "bonus" | "shift" | "undo" | "table" | "help"> = {
  штраф: "fine", fine: "fine",
  реэнтри: "reentry", реентри: "reentry", "ре-энтри": "reentry", reentry: "reentry",
  адон: "addon", аддон: "addon", addon: "addon",
  премия: "bonus", bonus: "bonus",
  смена: "shift", shift: "shift",
  отмена: "undo", undo: "undo",
  таблица: "table", table: "table",
  помощь: "help", help: "help"
};

export const PAYROLL_HELP = [
  "Команды для таблицы зарплат:",
  "/штраф Артем 500 опоздание",
  "/реэнтри Гриша — вычет 500 (или своя сумма: /реэнтри Гриша 700)",
  "/адон Гриша — вычет 1000",
  "/премия Лиля 1000 за хорошую работу",
  "/смена Лиля 19:00 23:30 (или /смена Лиля 4,5 — часы)",
  "/отмена — убрать последнюю запись",
  "/таблица — прислать актуальный файл",
  "",
  "Запись идёт на сегодняшний турнир (до 6 утра — на вчерашний). Другой день: добавьте дату, например 12.11 или вчера."
].join("\n");

function addDays(key: string, days: number) {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function parseDateToken(token: string, today: string): string | null {
  const word = token.toLowerCase();
  if (word === "сегодня") return today;
  if (word === "вчера") return addDays(today, -1);
  const match = token.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/);
  if (!match) return null;
  const year = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : Number(today.slice(0, 4));
  const key = `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : key;
}

const isNumber = (token: string) => /^[+\-−]?\d+([.,]\d+)?$/.test(token);
const toNumber = (token: string) => Math.abs(Number(token.replace(/^[+\-−]/, "").replace(",", ".")));

// Finds the employee at the start of the arguments. Roster names may hold several words ("Никита 1"), so the
// longest exact match wins; otherwise the first word may be the beginning of a name.
export function resolveEmployee(tokens: string[], roster: string[]): { name: string; used: number } | { error: string } {
  if (!tokens.length) return { error: "Укажите сотрудника, например: /штраф Артем 500" };
  const lower = roster.map((name) => name.toLowerCase());
  for (let count = Math.min(3, tokens.length); count >= 1; count -= 1) {
    const index = lower.indexOf(tokens.slice(0, count).join(" ").toLowerCase());
    if (index >= 0) return { name: roster[index], used: count };
  }
  const first = tokens[0].toLowerCase();
  const byPrefix = roster.filter((name) => name.toLowerCase().startsWith(first));
  const matches = byPrefix.length ? byPrefix : roster.filter((name) => name.toLowerCase().includes(first));
  if (matches.length === 1) return { name: matches[0], used: 1 };
  if (matches.length > 1) return { error: `Подходит несколько сотрудников: ${matches.join(", ")}. Напишите имя полностью.` };
  return { error: `Не нашёл сотрудника «${tokens[0]}». В таблице: ${roster.join(", ")}.` };
}

function normalizeTime(token: string) {
  const match = token.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function parsePayrollCommand(text: string, roster: string[], today: string): PayrollCommand | null {
  const parts = text.trim().split(/\s+/);
  const name = parts[0].replace(/^\//, "").replace(/@\w+$/, "").toLowerCase();
  const kind = ALIASES[name];
  if (!kind) return null;
  if (kind === "undo") return { kind: "undo" };
  if (kind === "table") return { kind: "table" };
  if (kind === "help") return { kind: "help" };

  const args = parts.slice(1);
  const employee = resolveEmployee(args, roster);
  if ("error" in employee) return { kind: "error", message: employee.error };
  let rest = args.slice(employee.used);

  let date: string | null = null;
  const dateIndex = rest.findIndex((token) => parseDateToken(token, today) !== null);
  if (dateIndex >= 0) {
    date = parseDateToken(rest[dateIndex], today);
    rest = rest.filter((_, index) => index !== dateIndex);
  } else if (rest.some((token) => /^\d{1,2}\.\d{1,2}(\.\d+)?$/.test(token) && !normalizeTime(token))) {
    return { kind: "error", message: "Не понял дату. Напишите, например, 12.11, вчера или сегодня." };
  }

  if (kind === "shift") {
    const times = rest.filter((token) => normalizeTime(token));
    if (times.length >= 2) {
      const comment = rest.filter((token) => !times.slice(0, 2).includes(token)).join(" ").trim();
      return { kind: "shift", employee: employee.name, startTime: normalizeTime(times[0]), endTime: normalizeTime(times[1]), manualHours: null, comment: comment || null, date };
    }
    const hoursIndex = rest.findIndex((token) => isNumber(token.replace(/ч$/i, "")));
    if (hoursIndex < 0) return { kind: "error", message: "Укажите время начала и конца (19:00 23:30) или число часов (4,5)." };
    const hours = toNumber(rest[hoursIndex].replace(/ч$/i, ""));
    if (hours <= 0 || hours > 24) return { kind: "error", message: "Часов должно быть от 0 до 24." };
    const comment = rest.filter((_, index) => index !== hoursIndex).join(" ").trim();
    return { kind: "shift", employee: employee.name, startTime: null, endTime: null, manualHours: hours, comment: comment || null, date };
  }

  const defaultAmount = kind === "reentry" ? REENTRY_AMOUNT : kind === "addon" ? ADDON_AMOUNT : null;
  let amount = defaultAmount;
  if (rest.length && isNumber(rest[0])) {
    amount = toNumber(rest[0]);
    rest = rest.slice(1);
  }
  if (amount === null) return { kind: "error", message: `Укажите сумму, например: /${kind === "fine" ? "штраф" : "премия"} ${employee.name} 500` };
  if (amount <= 0 || amount > MAX_AMOUNT) return { kind: "error", message: `Сумма должна быть от 1 до ${MAX_AMOUNT.toLocaleString("ru-RU")} ₽.` };
  const note = rest.join(" ").trim();
  const base = kind === "fine" ? "Штраф" : kind === "bonus" ? "Премия" : kind === "reentry" ? "Ре-энтри (вычет из ЗП)" : "Адон (вычет из ЗП)";
  const comment = note ? (kind === "fine" || kind === "bonus" ? `${base}: ${note}` : `${base} · ${note}`) : base;
  return { kind: "adjust", employee: employee.name, amount: kind === "bonus" ? amount : -amount, comment: comment.slice(0, 200), date };
}
