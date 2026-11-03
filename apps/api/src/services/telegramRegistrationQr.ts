import QRCode from "qrcode";
import { config } from "../config.js";
import { prisma } from "../prisma.js";

const timeZone = "Asia/Barnaul";

type RegistrationQrMessage = {
  entryNumber: number;
  tournament: { title: string; startsAt: Date; location: string };
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}

// Must stay in sync with buildCheckInUrl in apps/web/src/components/CheckInQr.tsx: the manager scans both.
export function buildCheckInUrl(token: string) {
  const botUsername = config.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
  const appName = config.TELEGRAM_APP_NAME.replace(/^\/|\/$/g, "");
  const botPath = appName ? `${botUsername}/${appName}` : botUsername;
  return `https://t.me/${botPath}?startapp=${encodeURIComponent(`checkin_${token}`)}`;
}

export function buildRegistrationCaption({ entryNumber, tournament }: RegistrationQrMessage) {
  return [
    entryNumber > 1 ? `Re-entry подтверждён ✅ Вход №${entryNumber}` : "Запись на турнир подтверждена ✅",
    tournament.title.toUpperCase(),
    "",
    `📅 ${formatDate(tournament.startsAt)}, ${formatTime(tournament.startsAt)}`,
    `📍 ${tournament.location}`,
    "",
    "Покажи этот QR-код на входе — открывать приложение не нужно.",
    "",
    "Удачи в игре! 🍀"
  ].join("\n");
}

export async function sendRegistrationQr(registrationId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      status: true,
      checkInToken: true,
      entryNumber: true,
      user: { select: { telegramId: true } },
      tournament: { select: { title: true, startsAt: true, location: true } }
    }
  });
  if (!registration || registration.status !== "ACTIVE") return;

  const chatId = registration.user.telegramId;
  const photo = await QRCode.toBuffer(buildCheckInUrl(registration.checkInToken), {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 640,
    color: { dark: "#111111", light: "#ffffff" }
  });

  const body = new FormData();
  body.set("chat_id", chatId);
  body.set("caption", buildRegistrationCaption(registration));
  body.set("reply_markup", JSON.stringify({
    inline_keyboard: [[{ text: "Открыть приложение", web_app: { url: config.FRONTEND_URL } }]]
  }));
  body.set("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "flop-club-qr.png");

  const response = await fetch(`${config.TELEGRAM_API_BASE_URL}/bot${config.BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(config.TELEGRAM_REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    const details = await response.text();
    if (response.status === 403) {
      await prisma.telegramSubscriber.updateMany({ where: { chatId }, data: { active: false } });
    }
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${details}`);
  }

  console.log(`[telegram:registration-qr] sent registration=${registrationId}`);
}

// The QR also stays available in the app, so a Telegram failure must never affect the registration itself.
export function notifyRegistrationCreated(registrationId: string) {
  if (config.NODE_ENV === "test") return;
  sendRegistrationQr(registrationId).catch((error) => {
    console.error(`[telegram:registration-qr] failed registration=${registrationId}`, error);
  });
}
