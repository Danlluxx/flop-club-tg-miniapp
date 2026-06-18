import { Prisma, TournamentProfile, TournamentStatus } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { ensureScheduledTournaments } from "./tournamentSchedule.js";
import { tournamentRuleFeaturesFor } from "./tournamentRules.js";

const reminderKind = "3h";
const reminderLeadMs = 3 * 60 * 60 * 1000;
const reminderWindowMs = 70 * 1000;
const schedulerIntervalMs = 60 * 1000;

type ReminderTournament = Prisma.TournamentGetPayload<{
  select: {
    id: true;
    title: true;
    startsAt: true;
    lateRegistrationEndsAt: true;
    buyIn: true;
    reEntry: true;
    ratingPool: true;
    profile: true;
    addOnEnabled: true;
    addOnPrice: true;
    addOnChips: true;
  };
}>;

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Barnaul",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function reminderLines(tournament: ReminderTournament) {
  const lines = tournamentRuleFeaturesFor(tournament.title).map((feature) => `• ${feature}`);
  if (tournament.ratingPool > 0) {
    lines.push(`• Гарантия ${formatNumber(tournament.ratingPool)} очков для участия в финале месяца`);
  }

  if (tournament.buyIn === 0) {
    lines.push("• Вход бесплатный");
  } else {
    lines.push(`• Вход ${formatNumber(tournament.buyIn)} ₽`);
  }
  if (tournament.profile === TournamentProfile.FREEZE) {
    if (!lines.some((line) => line.toLowerCase().includes("без re-entry"))) {
      lines.push("• Без re-entry");
    }
  } else if (tournament.reEntry > 0) {
    lines.push(`• Re-entry ${formatNumber(tournament.reEntry)} ₽ до конца поздней регистрации`);
  }

  if (tournament.addOnEnabled && tournament.addOnChips > 0) {
    lines.push(
      `• Add-on после окончания поздней регистрации: ${formatNumber(tournament.addOnPrice)} ₽ / ${formatNumber(tournament.addOnChips)} фишек`
    );
  } else {
    lines.push("• Add-on не предусмотрен");
  }

  return lines;
}

function buildReminderMessage(tournament: ReminderTournament) {
  const startsAt = formatTime(tournament.startsAt);
  const lateUntil = tournament.lateRegistrationEndsAt ? formatTime(tournament.lateRegistrationEndsAt) : null;
  const title = tournament.title.toUpperCase();
  const lateText = lateUntil ? ` Возможность войти в игру до ${lateUntil}` : "";

  return [
    `Через 3 часа начнётся турнир`,
    `${title} 😍`,
    "",
    "Что будет:",
    ...reminderLines(tournament),
    `• Начало в ${startsAt}.${lateText}`,
    "",
    "Записывайся на турнир в приложении 🔻"
  ].join("\n");
}

async function sendTelegramMessage(chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${config.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть приложение", url: config.FRONTEND_URL }]]
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }
}

async function reminderRecipients() {
  const recipients = new Set<string>();

  if (config.TELEGRAM_REMINDER_CHAT_ID) {
    recipients.add(config.TELEGRAM_REMINDER_CHAT_ID);
  }

  if (config.TOURNAMENT_REMINDER_BROADCAST_USERS) {
    const users = await prisma.user.findMany({
      where: { telegramId: { not: "" } },
      select: { telegramId: true }
    });

    users.forEach((user) => recipients.add(user.telegramId));
  }

  return [...recipients];
}

async function sendDueTournamentReminders() {
  if (!config.TOURNAMENT_REMINDERS_ENABLED) return;

  const now = new Date();
  await ensureScheduledTournaments(now, new Date(now.getTime() + reminderLeadMs + 24 * 60 * 60 * 1000));

  const target = now.getTime() + reminderLeadMs;
  const from = new Date(target - reminderWindowMs);
  const to = new Date(target + reminderWindowMs);

  const tournaments = await prisma.tournament.findMany({
    where: {
      status: TournamentStatus.OPEN,
      startsAt: { gte: from, lte: to }
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      lateRegistrationEndsAt: true,
      buyIn: true,
      reEntry: true,
      ratingPool: true,
      profile: true,
      addOnEnabled: true,
      addOnPrice: true,
      addOnChips: true
    },
    orderBy: { startsAt: "asc" }
  });

  for (const tournament of tournaments) {
    try {
      await prisma.tournamentReminder.create({
        data: { tournamentId: tournament.id, kind: reminderKind }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }

    try {
      const text = buildReminderMessage(tournament);
      const recipients = await reminderRecipients();
      let sentCount = 0;

      for (const chatId of recipients) {
        try {
          await sendTelegramMessage(chatId, text);
          sentCount += 1;
        } catch (error) {
          console.error(`[telegram:reminder] recipient failed tournamentId=${tournament.id} chatId=${chatId}`, error);
        }
      }

      if (!sentCount) {
        throw new Error("No reminder recipients accepted the message");
      }

      console.log(`[telegram:reminder] sent tournamentId=${tournament.id} kind=${reminderKind} recipients=${sentCount}`);
    } catch (error) {
      await prisma.tournamentReminder.deleteMany({
        where: { tournamentId: tournament.id, kind: reminderKind }
      });
      throw error;
    }
  }
}

export function startTournamentReminderScheduler() {
  if (!config.TOURNAMENT_REMINDERS_ENABLED) {
    console.log("[telegram:reminder] disabled");
    return;
  }

  if (!config.TELEGRAM_REMINDER_CHAT_ID && !config.TOURNAMENT_REMINDER_BROADCAST_USERS) {
    console.log("[telegram:reminder] skipped: no reminder recipients configured");
    return;
  }

  const tick = () => {
    sendDueTournamentReminders().catch((error) => {
      console.error("[telegram:reminder] failed", error);
    });
  };

  tick();
  setInterval(tick, schedulerIntervalMs);
}
