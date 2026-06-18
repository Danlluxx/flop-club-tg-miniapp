import { config } from "../config.js";
import { prisma } from "../prisma.js";

const pollingStateKey = "getUpdatesOffset";
const retryDelayMs = 5000;

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    from?: TelegramUser;
    chat: TelegramChat;
  };
};

type GetUpdatesResponse = {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSavedOffset() {
  const state = await prisma.telegramBotState.findUnique({ where: { key: pollingStateKey } });
  const value = Number(state?.value ?? 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function saveOffset(offset: number) {
  await prisma.telegramBotState.upsert({
    where: { key: pollingStateKey },
    update: { value: String(offset) },
    create: { key: pollingStateKey, value: String(offset) }
  });
}

async function savePrivateSubscriber(update: TelegramUpdate) {
  const message = update.message;
  if (!message || message.chat.type !== "private") return;

  const user = message.from;
  const chatId = String(message.chat.id);
  const telegramId = user?.id ? String(user.id) : chatId;
  await prisma.telegramSubscriber.upsert({
    where: { chatId },
    update: {
      telegramId,
      username: user?.username ?? message.chat.username,
      firstName: user?.first_name ?? message.chat.first_name,
      lastName: user?.last_name ?? message.chat.last_name,
      active: true,
      lastSeenAt: new Date()
    },
    create: {
      chatId,
      telegramId,
      username: user?.username ?? message.chat.username,
      firstName: user?.first_name ?? message.chat.first_name,
      lastName: user?.last_name ?? message.chat.last_name
    }
  });
}

async function pollTelegramUpdates() {
  let offset = await getSavedOffset();

  while (true) {
    try {
      const url = new URL(`https://api.telegram.org/bot${config.BOT_TOKEN}/getUpdates`);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("timeout", "25");
      url.searchParams.set("allowed_updates", JSON.stringify(["message"]));

      const response = await fetch(url);
      const payload = await response.json() as GetUpdatesResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.description || `Telegram getUpdates failed: ${response.status}`);
      }

      for (const update of payload.result ?? []) {
        await savePrivateSubscriber(update);
        offset = Math.max(offset, update.update_id + 1);
      }

      if (payload.result?.length) await saveOffset(offset);
    } catch (error) {
      console.error("[telegram:subscribers] polling failed", error);
      await wait(retryDelayMs);
    }
  }
}

export function startTelegramSubscriberPolling() {
  pollTelegramUpdates().catch((error) => {
    console.error("[telegram:subscribers] stopped", error);
  });
}
