import { config } from "../config.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const payrollUsernames = new Set(
  config.PAYROLL_TELEGRAM_USERNAMES.split(",").map((name) => name.trim().replace(/^@/, "").toLowerCase()).filter(Boolean)
);

export const isPayrollUsername = (username?: string | null) => Boolean(username) && payrollUsernames.has(username!.toLowerCase());

export const apiUrl = (method: string) => `${config.TELEGRAM_API_BASE_URL}/bot${config.BOT_TOKEN}/${method}`;

export type InlineKeyboard = Array<Array<{ text: string; callback_data: string }>>;
export type ReplyMarkup = { inline_keyboard: InlineKeyboard } | { keyboard: Array<Array<{ text: string }>>; resize_keyboard: boolean; is_persistent?: boolean };

// Thin Telegram call that never throws on a refused request (a stale button, an unchanged message): the caller
// only needs the result when it asks for it.
export async function tg<T = unknown>(method: string, payload: Record<string, unknown>) {
  const response = await fetch(apiUrl(method), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  return await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
}

export async function sendText(chatId: string | number, text: string, replyMarkup?: ReplyMarkup) {
  return tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function sendWorkbook(chatId: string, fileName: string, data: Uint8Array, caption: string) {
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", caption);
  form.set("document", new Blob([Uint8Array.from(data)], { type: XLSX_TYPE }), fileName);
  const response = await fetch(apiUrl("sendDocument"), { method: "POST", body: form });
  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.description || `sendDocument failed: ${response.status}`);
}
