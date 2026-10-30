import { createHash } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../prisma.js";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function playerName(user: {
  displayName: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  telegramId: string;
}) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (user.displayName?.trim()) return user.displayName.trim();
  if (fullName) return fullName;
  if (user.username?.trim()) return `@${user.username.replace(/^@/, "")}`;
  return user.telegramId;
}

async function resolveRatingChatId() {
  const target = config.TELEGRAM_RATING_CHAT_ID.trim();
  if (!target.startsWith("@")) return target;

  const username = target.slice(1);
  const privateSubscriber = await prisma.telegramSubscriber.findFirst({
    where: {
      active: true,
      username: { equals: username, mode: "insensitive" }
    },
    select: { chatId: true }
  });

  if (!privateSubscriber || !/^[1-9]\d*$/.test(privateSubscriber.chatId)) {
    throw new Error(`Private recipient ${target} must start the bot first`);
  }
  return privateSubscriber.chatId;
}

async function sendTelegramMessage(chatId: string, text: string) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.TELEGRAM_REQUEST_TIMEOUT_MS);

  const response = await fetch(`${config.TELEGRAM_API_BASE_URL}/bot${config.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    }),
    signal: abortController.signal
  }).finally(() => clearTimeout(timeout));

  const body = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram rating publication failed: ${response.status} ${body.description ?? "Unknown error"}`);
  }
}

export async function getTournamentRatingText(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      title: true,
      startsAt: true,
      registrations: {
        where: { status: RegistrationStatus.ACTIVE },
        select: {
          finishPlace: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              displayName: true,
              username: true,
              firstName: true,
              lastName: true,
              telegramId: true
            }
          }
        }
      },
      ratingResults: {
        select: {
          userId: true,
          place: true,
          points: true,
          knockouts: true,
          chipLeaderBonus: true,
          user: {
            select: {
              displayName: true,
              username: true,
              firstName: true,
              lastName: true,
              telegramId: true
            }
          }
        },
        orderBy: { place: "asc" }
      },
      chipLeaderAward: true,
      gameEvents: { where: { ratingPoints: { not: 0 } }, select: { userId: true, ratingPoints: true } }
    }
  });

  if (!tournament || !tournament.ratingResults.length) return null;

  const pointsByUserId = new Map(
    tournament.ratingResults.map((result) => [
      result.userId,
      result.points + result.knockouts + result.chipLeaderBonus
    ])
  );
  if (tournament.chipLeaderAward) {
    pointsByUserId.set(
      tournament.chipLeaderAward.userId,
      (pointsByUserId.get(tournament.chipLeaderAward.userId) ?? 0) + tournament.chipLeaderAward.points
    );
  }
  for (const event of tournament.gameEvents ?? []) {
    if (event.userId) pointsByUserId.set(event.userId, (pointsByUserId.get(event.userId) ?? 0) + event.ratingPoints);
  }
  const placedUserIds = new Set<string>();
  const rows = tournament.registrations
    .filter((registration) => registration.finishPlace !== null)
    .sort((left, right) =>
      left.finishPlace! - right.finishPlace! || left.createdAt.getTime() - right.createdAt.getTime()
    )
    .filter((registration, index, all) => all.findIndex(r => r.userId === registration.userId) === index)
    .map((registration) => {
      placedUserIds.add(registration.userId);
      return {
        place: tournament.ratingResults.find(result => result.userId === registration.userId)?.place ?? registration.finishPlace!,
        name: playerName(registration.user),
        points: pointsByUserId.get(registration.userId)
      };
    });

  for (const result of tournament.ratingResults) {
    if (placedUserIds.has(result.userId)) continue;
    rows.push({
      place: result.place,
      name: playerName(result.user),
      points: pointsByUserId.get(result.userId)
    });
  }
  rows.sort((left, right) => left.place - right.place);

  const resultLines = rows.map((row) => {
    const prefix = row.place <= 3 ? "👑 -" : `${row.place} -`;
    const points = row.points ? ` (${formatNumber(row.points)}⚡️)` : "";
    return `${prefix} ${row.name.replace(/[\r\n]+/g, " ")}${points}`;
  });
  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Barnaul", day: "2-digit", month: "2-digit", year: "numeric" }).format(tournament.startsAt);
  return [`♠️ ${tournament.title.toUpperCase()} · ${date} ♠️`, "", ...resultLines].join("\n");
}

export function splitRatingMessage(text: string, limit = 3900) {
  const parts: string[] = [];
  let part = "";
  for (const line of text.split("\n")) {
    if (part && part.length + line.length + 1 > limit) { parts.push(part); part = ""; }
    // Array.from keeps surrogate pairs intact even for unusually long names.
    for (const char of Array.from(`${part ? "\n" : ""}${line}`)) {
      if (part.length + char.length > limit) { parts.push(part); part = ""; }
      part += char;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export async function publishTournamentRatingResults(tournamentId: string) {
  const text = await getTournamentRatingText(tournamentId);
  if (!text) return false;
  const chatId = await resolveRatingChatId();
  const fingerprint = createHash("sha256").update(text).digest("hex");
  const prefix = `ratingPublication:${tournamentId}:`;
  const publicationKey = `${prefix}${chatId}:${fingerprint}`;
  const lease = `pending:${Date.now()}`;

  try {
    await prisma.telegramBotState.create({ data: { key: publicationKey, value: lease } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const reclaimed = await prisma.telegramBotState.updateMany({
      where: { key: publicationKey, value: { startsWith: "pending" }, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      data: { value: lease }
    });
    if (!reclaimed.count) return false;
  }

  try {
    const previous = await prisma.telegramBotState.findFirst({ where: {
      key: { startsWith: prefix, not: publicationKey }, value: `sent:${chatId}`
    } });
    const parts = splitRatingMessage(`${previous ? "Обновлённые результаты\n\n" : ""}${text}`);
    for (const [index, part] of parts.entries()) {
      const key = `${publicationKey}:part:${index}`;
      if (await prisma.telegramBotState.findUnique({ where: { key } })) continue;
      await sendTelegramMessage(chatId, part);
      await prisma.telegramBotState.upsert({ where: { key }, create: { key, value: "delivered" }, update: {} });
    }
    await prisma.telegramBotState.update({
      where: { key: publicationKey },
      data: { value: `sent:${chatId}` }
    });
    console.log(`[telegram:rating] sent tournamentId=${tournamentId} chatId=${chatId}`);
    return true;
  } catch (error) {
    await prisma.telegramBotState.deleteMany({ where: { key: publicationKey, value: lease } });
    throw error;
  }
}

let schedulerStarted = false;
export function startRatingPublicationScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      // Persist activation time so restarts catch missed SQL writes without mailing old seasons.
      const key = "ratingPublication:watchSince";
      const state = await prisma.telegramBotState.upsert({ where: { key },
        create: { key, value: new Date().toISOString() }, update: {} });
      const since = new Date(state.value);
      if (!Number.isFinite(since.getTime())) throw new Error("Invalid rating watcher activation timestamp");
      const tournaments = await prisma.tournament.findMany({
        where: { status: "FINISHED", ratingResults: { some: {} }, OR: [
          { updatedAt: { gte: since } }, { ratingResults: { some: { updatedAt: { gte: since } } } },
          { chipLeaderAward: { is: { updatedAt: { gte: since } } } }
        ] }, select: { id: true, updatedAt: true, ratingResults: { select: { updatedAt: true } } }
      });
      for (const tournament of tournaments) {
        const lastChange = Math.max(tournament.updatedAt.getTime(), ...tournament.ratingResults.map(r => r.updatedAt.getTime()));
        if (Date.now() - lastChange < 30_000) continue;
        try { await publishTournamentRatingResults(tournament.id); }
        catch (error) { console.error(`[telegram:rating] retry pending tournamentId=${tournament.id}`, error); }
      }
    } catch (error) { console.error("[telegram:rating] watcher failed", error); }
    finally { running = false; }
  };
  void run();
  setInterval(() => { void run(); }, 60_000).unref();
}
