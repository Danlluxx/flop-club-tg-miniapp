import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { dateKey } from "./tournamentSchedule.js";
import { parsePayrollCommand, PAYROLL_HELP, type PayrollCommand } from "./payrollCommands.js";
import { deleteShift, exportPendingShifts, getMasterWorkbook, readRoster, saveMasterWorkbook } from "./payrollWorkbook.js";

const sentDateKey = "payroll:lastSentDate";
const unsentKey = "payroll:unsent";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const payrollUsernames = new Set(
  config.PAYROLL_TELEGRAM_USERNAMES.split(",").map((name) => name.trim().replace(/^@/, "").toLowerCase()).filter(Boolean)
);

export const isPayrollUsername = (username?: string | null) => Boolean(username) && payrollUsernames.has(username!.toLowerCase());

const apiUrl = (method: string) => `${config.TELEGRAM_API_BASE_URL}/bot${config.BOT_TOKEN}/${method}`;

async function sendText(chatId: string | number, text: string) {
  await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function sendWorkbook(chatId: string, fileName: string, data: Uint8Array, caption: string) {
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", caption);
  form.set("document", new Blob([Uint8Array.from(data)], { type: XLSX_TYPE }), fileName);
  const response = await fetch(apiUrl("sendDocument"), { method: "POST", body: form });
  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.description || `sendDocument failed: ${response.status}`);
}

async function recipients() {
  const subscribers = await prisma.telegramSubscriber.findMany({ where: { active: true }, select: { chatId: true, username: true } });
  return subscribers.filter((subscriber) => isPayrollUsername(subscriber.username));
}

async function getState(key: string) {
  return (await prisma.telegramBotState.findUnique({ where: { key } }))?.value ?? null;
}

async function setState(key: string, value: string) {
  await prisma.telegramBotState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// Appends the shifts entered since the last file and sends the new table. When the send fails the table is already
// saved as the master, so the next run sends the same file again instead of writing the shifts twice.
export async function runDailyPayrollReport(now = new Date()) {
  const today = dateKey(now);
  if (await getState(sentDateKey) === today) return;
  const master = await getMasterWorkbook();
  if (!master) return;
  const pending = await prisma.staffShift.count({ where: { exportedAt: null } });
  if (pending) {
    await exportPendingShifts();
    await setState(unsentKey, String(pending));
  }
  const unsent = await getState(unsentKey);
  if (!unsent || unsent === "0") {
    await setState(sentDateKey, today);
    return;
  }
  const target = await recipients();
  if (!target.length) throw new Error("Payroll recipients have not started the bot yet");
  const latest = await getMasterWorkbook();
  for (const subscriber of target) {
    await sendWorkbook(subscriber.chatId, latest!.fileName, latest!.data, `Таблица зарплат: новых смен — ${unsent}. Правки вносите в этот файл и отправляйте его мне обратно.`);
  }
  await setState(unsentKey, "0");
  await setState(sentDateKey, today);
}

let started = false;
export function startPayrollScheduler() {
  if (started) return;
  started = true;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const barnaulHour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
      if (barnaulHour >= config.PAYROLL_REPORT_HOUR) await runDailyPayrollReport();
    } catch (error) {
      console.error("[payroll] daily report failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(() => { void run(); }, 10 * 60_000).unref();
}

export type TelegramPayrollMessage = {
  chat: { id: number; type: string };
  from?: { username?: string };
  text?: string;
  document?: { file_id: string; file_name?: string; file_size?: number };
};

const undoKey = (chatId: number) => `payroll:undo:${chatId}`;
const money = (value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString("ru-RU")} ₽`;
const dayLabel = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

// Entries made from the bot go to the tournament of the current club day: a night game that ends after midnight
// still belongs to the day it started, so the day changes at 06:00 Barnaul time.
export const clubDay = (now = new Date()) => dateKey(new Date(now.getTime() - 6 * 60 * 60 * 1000));

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

async function runCommand(chatId: number, command: PayrollCommand) {
  if (command.kind === "error") return sendText(chatId, command.message);
  if (command.kind === "help") return sendText(chatId, PAYROLL_HELP);
  if (command.kind === "table") {
    const { fileName, data } = await exportPendingShifts();
    return sendWorkbook(String(chatId), fileName, data, "Актуальная таблица зарплат.");
  }
  if (command.kind === "undo") {
    const stack = JSON.parse((await getState(undoKey(chatId))) ?? "[]") as string[];
    while (stack.length) {
      const id = stack.pop()!;
      const shift = await prisma.staffShift.findUnique({ where: { id } });
      await setState(undoKey(chatId), JSON.stringify(stack));
      if (!shift) continue;
      const result = await deleteShift(id);
      const what = shift.adjustment ? `${shift.comment ?? "Запись"} ${money(shift.adjustment)}` : "смена";
      return sendText(chatId, `Отменено: ${shift.employeeName}, ${dayLabel(shift.workDate)}, ${what}.${result.fromTable ? " Убрал и из таблицы." : ""}`);
    }
    return sendText(chatId, "Нечего отменять: последних записей из бота нет.");
  }

  const date = command.date ?? clubDay();
  const tournament = await tournamentOn(date);
  if (!tournament) return sendText(chatId, `На ${dayLabel(date)} нет турнира. Укажите другую дату, например 12.11 или вчера.`);
  const base = { tournamentId: tournament.id, workDate: date, employeeName: command.employee, status: "Отработана" };
  const shift = command.kind === "adjust"
    ? await prisma.staffShift.create({ data: { ...base, adjustment: command.amount, comment: command.comment } })
    : await prisma.staffShift.create({ data: { ...base, startTime: command.startTime, endTime: command.endTime, manualHours: command.manualHours, comment: command.comment } });
  await rememberEntry(chatId, shift.id);
  const detail = command.kind === "adjust"
    ? `${command.comment} ${money(command.amount)}`
    : `смена ${command.startTime ? `${command.startTime}–${command.endTime}` : `${String(command.manualHours).replace(".", ",")} ч`}`;
  await sendText(chatId, `✅ ${command.employee} · ${dayLabel(date)} · ${tournament.title}\n${detail}\nОтменить: /отмена`);
}

async function handleCommand(message: TelegramPayrollMessage) {
  const text = message.text?.trim();
  if (!text?.startsWith("/")) return;
  const master = await getMasterWorkbook();
  const roster = master ? (await readRoster(Buffer.from(master.data))).filter((employee) => !/уволен/i.test(employee.status)).map((employee) => employee.name) : [];
  const command = parsePayrollCommand(text, roster, clubDay());
  if (!command) return;
  if (!master && command.kind !== "help") return sendText(message.chat.id, "Сначала пришлите таблицу зарплат (.xlsx) этим сообщением.");
  await runCommand(message.chat.id, command);
}

// The owner talks to the bot in private: commands add fines/re-entries/shifts, and a table file replaces the master
// (merged with what the app already recorded).
export async function handlePayrollMessage(message: TelegramPayrollMessage | undefined) {
  if (!message || message.chat.type !== "private" || !isPayrollUsername(message.from?.username)) return;
  if (message.text) {
    try {
      await handleCommand(message);
    } catch (error) {
      console.error("[payroll] command failed", error);
      await sendText(message.chat.id, "Не получилось записать, попробуйте ещё раз.");
    }
    return;
  }
  await handleDocument(message);
}

async function handleDocument(message: TelegramPayrollMessage) {
  const document = message.document;
  if (!document) return;
  if (!/\.xlsx$/i.test(document.file_name ?? "")) {
    await sendText(message.chat.id, "Пришлите таблицу в формате .xlsx.");
    return;
  }
  if ((document.file_size ?? 0) > 15 * 1024 * 1024) {
    await sendText(message.chat.id, "Файл слишком большой, лимит 15 МБ.");
    return;
  }
  try {
    const info = await (await fetch(apiUrl(`getFile?file_id=${encodeURIComponent(document.file_id)}`))).json() as { ok?: boolean; result?: { file_path?: string } };
    if (!info.ok || !info.result?.file_path) throw new Error("getFile failed");
    const file = await fetch(`${config.TELEGRAM_API_BASE_URL}/file/bot${config.BOT_TOKEN}/${info.result.file_path}`);
    if (!file.ok) throw new Error(`file download failed: ${file.status}`);
    const saved = await saveMasterWorkbook(document.file_name!, Buffer.from(await file.arrayBuffer()));
    const { added, updated, restored, skipped } = saved.sync;
    const lines = [`Таблица принята. Из файла в приложение: добавлено ${added}, обновлено ${updated}.`];
    if (skipped) lines.push(`Строк без турнира в этот день пропущено: ${skipped}.`);
    if (restored) lines.push(`В вашем файле не хватало записей, которые уже были в приложении (${restored}). Я вернул их в таблицу, высылаю итоговый файл: используйте его как основной.`);
    await sendText(message.chat.id, lines.join("\n"));
    if (restored) {
      const merged = await getMasterWorkbook();
      if (merged) await sendWorkbook(String(message.chat.id), merged.fileName, merged.data, "Итоговая таблица после объединения.");
    }
  } catch (error) {
    console.error("[payroll] workbook upload failed", error);
    await sendText(message.chat.id, error instanceof Error && "statusCode" in error ? error.message : "Не удалось принять таблицу, попробуйте ещё раз.");
  }
}
