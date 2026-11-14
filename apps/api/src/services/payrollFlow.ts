// Button-driven entry of fines, re-entries, add-ons, bonuses and shifts in the payroll bot.
// The conversation state lives in TelegramBotState (one card per chat), the card is edited in place.
import { addDays, clubDay, createEntry, dayLabel, getState, setState, undoEntry } from "./payrollEntries.js";
import { ADDON_AMOUNT, REENTRY_AMOUNT, isNumber, normalizeTime, parseDateToken, toNumber } from "./payrollCommands.js";
import { isPayrollUsername, sendText, tg, type InlineKeyboard } from "./payrollTelegram.js";
import { getMasterWorkbook, readRoster } from "./payrollWorkbook.js";

export const BTN_ADD = "➕ Запись";
export const BTN_UNDO = "↩️ Отменить";
export const BTN_TABLE = "📄 Таблица";

type Kind = "fine" | "bonus" | "reentry" | "addon" | "shift";
type Flow = {
  step: "kind" | "employee" | "amount" | "hours" | "confirm";
  employees: string[];
  kind?: Kind;
  employee?: string;
  amount?: number;
  startTime?: string;
  endTime?: string;
  manualHours?: number;
  comment?: string;
  date: string | null;
  messageId?: number;
};

const LABEL: Record<Kind, string> = { fine: "Штраф", bonus: "Премия", reentry: "Ре-энтри", addon: "Адон", shift: "Смена" };
const MAX_AMOUNT = 100_000;
const flowKey = (chatId: number) => `payroll:flow:${chatId}`;
const CANCEL = [{ text: "✖ Отмена", callback_data: "x" }];

async function loadFlow(chatId: number) {
  const raw = await getState(flowKey(chatId));
  return raw ? JSON.parse(raw) as Flow : null;
}
const saveFlow = (chatId: number, flow: Flow) => setState(flowKey(chatId), JSON.stringify(flow));
const clearFlow = (chatId: number) => setState(flowKey(chatId), "");

async function activeEmployees() {
  const master = await getMasterWorkbook();
  if (!master) return null;
  return (await readRoster(Buffer.from(master.data))).filter((employee) => !/уволен/i.test(employee.status)).map((employee) => employee.name);
}

function dayText(flow: Flow) {
  const today = clubDay();
  if (!flow.date || flow.date === today) return `сегодня (${dayLabel(today)})`;
  if (flow.date === addDays(today, -1)) return `вчера (${dayLabel(flow.date)})`;
  return dayLabel(flow.date);
}

const rub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

function render(flow: Flow): { text: string; keyboard: InlineKeyboard } {
  if (flow.step === "kind") {
    return {
      text: "Что записать?",
      keyboard: [
        [{ text: "Штраф", callback_data: "k:fine" }, { text: "Премия", callback_data: "k:bonus" }],
        [{ text: "Ре-энтри", callback_data: "k:reentry" }, { text: "Адон", callback_data: "k:addon" }],
        [{ text: "Смена", callback_data: "k:shift" }],
        CANCEL
      ]
    };
  }
  if (flow.step === "employee") {
    const rows: InlineKeyboard = [];
    flow.employees.forEach((name, index) => {
      if (index % 3 === 0) rows.push([]);
      rows[rows.length - 1].push({ text: name, callback_data: `e:${index}` });
    });
    return { text: `${LABEL[flow.kind!]}. Кому?`, keyboard: [...rows, CANCEL] };
  }
  if (flow.step === "amount") {
    const row = (values: number[]) => values.map((value) => ({ text: String(value), callback_data: `m:${value}` }));
    return {
      text: `${LABEL[flow.kind!]} · ${flow.employee}\nВыберите сумму или напишите её числом.`,
      keyboard: [row([100, 200, 300]), row([500, 1000, 2000]), CANCEL]
    };
  }
  if (flow.step === "hours") {
    return {
      text: `Смена · ${flow.employee}\nНапишите время (19:00 23:30) или число часов (4,5), либо выберите.`,
      keyboard: [
        [{ text: "19:00–23:00", callback_data: "t:19:00-23:00" }, { text: "19:00–00:00", callback_data: "t:19:00-00:00" }],
        [{ text: "4 ч", callback_data: "h:4" }, { text: "5 ч", callback_data: "h:5" }, { text: "6 ч", callback_data: "h:6" }],
        CANCEL
      ]
    };
  }
  const today = clubDay();
  const lines = [`${LABEL[flow.kind!]} · ${flow.employee}`];
  if (flow.kind === "shift") lines.push(`Смена: ${flow.startTime ? `${flow.startTime}–${flow.endTime}` : `${String(flow.manualHours).replace(".", ",")} ч`}`);
  else lines.push(`Сумма: ${flow.kind === "bonus" ? "+" : "−"}${rub(flow.amount!)}`);
  lines.push(`День: ${dayText(flow)}`);
  if (flow.comment) lines.push(`Комментарий: ${flow.comment}`);
  lines.push("", "Можно написать сообщением сумму, дату (12.11) или причину.");
  const onToday = !flow.date || flow.date === today;
  return {
    text: lines.join("\n"),
    keyboard: [
      [{ text: "✅ Записать", callback_data: "ok" }],
      [{ text: onToday ? "📅 Вчера" : "📅 Сегодня", callback_data: onToday ? "d:y" : "d:t" }, ...CANCEL]
    ]
  };
}

async function show(chatId: number, flow: Flow) {
  await saveFlow(chatId, flow);
  const { text, keyboard } = render(flow);
  if (flow.messageId) {
    const edited = await tg("editMessageText", { chat_id: chatId, message_id: flow.messageId, text, reply_markup: { inline_keyboard: keyboard } });
    if (edited?.ok || /not modified/i.test(edited?.description ?? "")) return;
  }
  const sent = await sendText(chatId, text, { inline_keyboard: keyboard });
  flow.messageId = sent?.result?.message_id;
  await saveFlow(chatId, flow);
}

export async function startFlow(chatId: number) {
  const employees = await activeEmployees();
  if (!employees) return sendText(chatId, "Сначала пришлите таблицу зарплат (.xlsx) этим сообщением.");
  await show(chatId, { step: "kind", employees, date: null });
}

export function sendMenu(chatId: number) {
  return sendText(chatId, "Кнопки внизу экрана: запись, отмена последней записи, актуальная таблица.", {
    keyboard: [[{ text: BTN_ADD }], [{ text: BTN_UNDO }, { text: BTN_TABLE }]],
    resize_keyboard: true,
    is_persistent: true
  });
}

function spec(flow: Flow) {
  const note = flow.comment?.trim();
  if (flow.kind === "shift") {
    return { kind: "shift" as const, employee: flow.employee!, startTime: flow.startTime ?? null, endTime: flow.endTime ?? null, manualHours: flow.manualHours ?? null, comment: note || null, date: flow.date };
  }
  const base = { fine: "Штраф", bonus: "Премия", reentry: "Ре-энтри (вычет из ЗП)", addon: "Адон (вычет из ЗП)" }[flow.kind!];
  const comment = note ? (flow.kind === "fine" || flow.kind === "bonus" ? `${base}: ${note}` : `${base} · ${note}`) : base;
  return { kind: "adjust" as const, employee: flow.employee!, amount: flow.kind === "bonus" ? flow.amount! : -flow.amount!, comment: comment.slice(0, 200), date: flow.date };
}

const afterEmployee = (flow: Flow) => {
  if (flow.kind === "shift") flow.step = "hours";
  else if (flow.kind === "reentry" || flow.kind === "addon") {
    flow.amount = flow.kind === "reentry" ? REENTRY_AMOUNT : ADDON_AMOUNT;
    flow.step = "confirm";
  } else flow.step = "amount";
};

// Text typed while a card is open: an amount, a date, hours/times or a reason, depending on the step.
export async function handleFlowText(chatId: number, text: string) {
  const flow = await loadFlow(chatId);
  if (!flow || !["amount", "hours", "confirm"].includes(flow.step)) return false;
  const tokens = text.trim().split(/\s+/);

  if (flow.step === "hours" || (flow.step === "confirm" && flow.kind === "shift" && tokens.every((t) => normalizeTime(t) || isNumber(t.replace(/ч$/i, ""))))) {
    const times = tokens.filter((token) => normalizeTime(token));
    const hours = tokens.find((token) => isNumber(token.replace(/ч$/i, "")));
    if (times.length >= 2) {
      flow.startTime = normalizeTime(times[0])!;
      flow.endTime = normalizeTime(times[1])!;
      delete flow.manualHours;
    } else if (hours && toNumber(hours.replace(/ч$/i, "")) > 0 && toNumber(hours.replace(/ч$/i, "")) <= 24) {
      flow.manualHours = toNumber(hours.replace(/ч$/i, ""));
      delete flow.startTime;
      delete flow.endTime;
    } else if (flow.step === "hours") {
      await sendText(chatId, "Не понял. Напишите время, например 19:00 23:30, или число часов, например 4,5.");
      return true;
    }
    flow.step = "confirm";
    await show(chatId, flow);
    return true;
  }

  let rest = tokens;
  const dateIndex = rest.findIndex((token) => parseDateToken(token, clubDay()) !== null);
  if (dateIndex >= 0) {
    flow.date = parseDateToken(rest[dateIndex], clubDay());
    rest = rest.filter((_, index) => index !== dateIndex);
  }
  if (flow.kind !== "shift" && rest.length && isNumber(rest[0])) {
    const amount = toNumber(rest[0]);
    if (amount <= 0 || amount > MAX_AMOUNT) {
      await sendText(chatId, `Сумма должна быть от 1 до ${MAX_AMOUNT.toLocaleString("ru-RU")} ₽.`);
      return true;
    }
    flow.amount = amount;
    rest = rest.slice(1);
  }
  if (flow.step === "amount" && flow.amount === undefined) {
    await sendText(chatId, "Напишите сумму числом, например 500, или выберите кнопкой.");
    return true;
  }
  const note = rest.join(" ").trim();
  if (note) flow.comment = note.slice(0, 150);
  flow.step = "confirm";
  await show(chatId, flow);
  return true;
}

type CallbackQuery = { id: string; from?: { username?: string }; data?: string; message?: { message_id: number; chat: { id: number; type: string } } };

export async function handleFlowCallback(query: CallbackQuery | undefined) {
  if (!query?.message || query.message.chat.type !== "private" || !isPayrollUsername(query.from?.username)) return;
  const chatId = query.message.chat.id;
  const data = query.data ?? "";
  void tg("answerCallbackQuery", { callback_query_id: query.id });

  const edit = (text: string, keyboard: InlineKeyboard = []) =>
    tg("editMessageText", { chat_id: chatId, message_id: query.message!.message_id, text, reply_markup: { inline_keyboard: keyboard } });

  if (data.startsWith("u:")) {
    const text = await undoEntry(data.slice(2));
    await edit(text ? `Отменено: ${text}` : "Эта запись уже удалена.", [[{ text: "➕ Новая запись", callback_data: "new" }]]);
    return;
  }
  if (data === "x") {
    await clearFlow(chatId);
    await edit("Отменено.", [[{ text: "➕ Новая запись", callback_data: "new" }]]);
    return;
  }
  if (data === "new") {
    const employees = await activeEmployees();
    if (!employees) return void edit("Сначала пришлите таблицу зарплат (.xlsx) этим сообщением.");
    await show(chatId, { step: "kind", employees, date: null, messageId: query.message.message_id });
    return;
  }

  const flow = await loadFlow(chatId);
  if (!flow) {
    await edit("Эта карточка устарела. Нажмите «➕ Запись» внизу.", [[{ text: "➕ Новая запись", callback_data: "new" }]]);
    return;
  }
  flow.messageId = query.message.message_id;

  if (data.startsWith("k:") && flow.step === "kind") {
    flow.kind = data.slice(2) as Kind;
    flow.step = "employee";
  } else if (data.startsWith("e:") && flow.step === "employee") {
    const name = flow.employees[Number(data.slice(2))];
    if (!name) return;
    flow.employee = name;
    afterEmployee(flow);
  } else if (data.startsWith("m:") && flow.step === "amount") {
    flow.amount = Number(data.slice(2));
    flow.step = "confirm";
  } else if (data.startsWith("t:") && flow.step === "hours") {
    const [start, end] = data.slice(2).split("-");
    flow.startTime = start;
    flow.endTime = end;
    delete flow.manualHours;
    flow.step = "confirm";
  } else if (data.startsWith("h:") && flow.step === "hours") {
    flow.manualHours = Number(data.slice(2));
    delete flow.startTime;
    delete flow.endTime;
    flow.step = "confirm";
  } else if (data === "d:y" && flow.step === "confirm") {
    flow.date = addDays(clubDay(), -1);
  } else if (data === "d:t" && flow.step === "confirm") {
    flow.date = null;
  } else if (data === "ok" && flow.step === "confirm") {
    const result = await createEntry(chatId, spec(flow));
    if (!result.ok) {
      const { keyboard } = render(flow);
      await edit(`${result.error}\n\n${render(flow).text}`, keyboard);
      return;
    }
    await clearFlow(chatId);
    await edit(`✅ ${flow.employee} · ${dayLabel(result.date)} · ${result.tournament}\n${result.detail}`, [
      [{ text: "↩️ Отменить запись", callback_data: `u:${result.id}` }],
      [{ text: "➕ Ещё запись", callback_data: "new" }]
    ]);
    return;
  } else {
    return;
  }
  await show(chatId, flow);
}
