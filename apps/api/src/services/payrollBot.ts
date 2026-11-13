import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { dateKey } from "./tournamentSchedule.js";
import { exportPendingShifts, getMasterWorkbook, saveMasterWorkbook } from "./payrollWorkbook.js";

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

export type TelegramDocumentMessage = {
  chat: { id: number; type: string };
  from?: { username?: string };
  document?: { file_id: string; file_name?: string; file_size?: number };
};

// The owner sends the corrected table back to the bot: it becomes the file new shifts are written into.
export async function handlePayrollDocument(message: TelegramDocumentMessage | undefined) {
  const document = message?.document;
  if (!message || !document || message.chat.type !== "private" || !isPayrollUsername(message.from?.username)) return;
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
    const pending = await prisma.staffShift.count({ where: { exportedAt: null } });
    const skipped = saved.sync.skipped ? ` Строк без турнира в этот день пропущено: ${saved.sync.skipped}.` : "";
    await sendText(message.chat.id, `Таблица принята, смен в приложении: ${saved.sync.imported}.${skipped} Новые смены (${pending}) попадут в неё при следующей отправке.`);
  } catch (error) {
    console.error("[payroll] workbook upload failed", error);
    await sendText(message.chat.id, error instanceof Error && "statusCode" in error ? error.message : "Не удалось принять таблицу, попробуйте ещё раз.");
  }
}
