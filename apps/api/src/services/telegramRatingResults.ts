import { createHash } from "node:crypto";
import { Prisma, RegistrationStatus } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../prisma.js";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

// Bounty tournaments list placement points and bounty points apart. The ids are the Telegram custom
// (Premium) emoji used in the @FlopClub22 results posts; a list is used one id per occurrence in the text
// (five stars, crowns for places 1-3). An emoji without an id is sent as the plain character.
// The full catalogue of the channel's emoji is in docs/ai/PREMIUM_EMOJI.md.
const BOUNTY_TEMPLATE_TITLES = new Set(["flop bounty", "flop mystery knockout"]);
const EMOJI = { star: "\u{1F31F}", coconut: "\u{1F965}", crown: "\u{1F451}", energy: "\u26A1\uFE0F", glove: "\u{1F94A}" } as const;
type EmojiIds = Partial<Record<keyof typeof EMOJI, string | string[]>>;
export const PREMIUM_EMOJI_IDS: EmojiIds = {
  star: ["5395608259656709199", "5395543087822959661", "5395607374893448117", "5395790774291954136", "5395608259656709199"],
  coconut: "5429249222362810005",
  crown: ["5260367375957516164", "5260409118744665341", "5260512090585588535"],
  energy: "5456140674028019486",
  glove: "5231406626228948265"
};

function usesBountyTemplate(title: string) {
  return BOUNTY_TEMPLATE_TITLES.has(title.trim().toLowerCase());
}

export function premiumEmojiEntities(text: string, ids: EmojiIds = PREMIUM_EMOJI_IDS) {
  const entities: Array<{ type: "custom_emoji"; offset: number; length: number; custom_emoji_id: string }> = [];
  for (const [name, emoji] of Object.entries(EMOJI)) {
    const configured = ids[name as keyof typeof EMOJI];
    if (!configured) continue;
    const list = Array.isArray(configured) ? configured : [configured];
    let occurrence = 0;
    for (let at = text.indexOf(emoji); at !== -1; at = text.indexOf(emoji, at + emoji.length)) {
      entities.push({ type: "custom_emoji", offset: at, length: emoji.length, custom_emoji_id: list[occurrence % list.length] });
      occurrence += 1;
    }
  }
  return entities.sort((left, right) => left.offset - right.offset);
}

type RatingUser = {
  displayName: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  telegramId: string;
};

function playerName(user: RatingUser) {
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

async function sendTelegramMessage(chatId: string, text: string, premiumEmoji = false) {
  const entities = premiumEmoji ? premiumEmojiEntities(text) : [];
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.TELEGRAM_REQUEST_TIMEOUT_MS);

  const response = await fetch(`${config.TELEGRAM_API_BASE_URL}/bot${config.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(entities.length ? { entities } : {}),
      disable_web_page_preview: true
    }),
    signal: abortController.signal
  }).finally(() => clearTimeout(timeout));

  const body = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Telegram rating publication failed: ${response.status} ${body.description ?? "Unknown error"}`);
  }
}

export async function getTournamentRatingRows(tournamentId: string) {
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

  const basePointsByUserId = new Map(tournament.ratingResults.map((result) => [result.userId, result.points]));
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
  const toRow = (userId: string, place: number, user: RatingUser) => {
    const points = pointsByUserId.get(userId);
    const basePoints = basePointsByUserId.get(userId) ?? 0;
    return { place, user, points, basePoints, bonusPoints: (points ?? 0) - basePoints };
  };
  const placedUserIds = new Set<string>();
  const rows = tournament.registrations
    .filter((registration) => registration.finishPlace !== null)
    .sort((left, right) =>
      left.finishPlace! - right.finishPlace! || left.createdAt.getTime() - right.createdAt.getTime()
    )
    .filter((registration, index, all) => all.findIndex(r => r.userId === registration.userId) === index)
    .map((registration) => {
      placedUserIds.add(registration.userId);
      return toRow(
        registration.userId,
        tournament.ratingResults.find(result => result.userId === registration.userId)?.place ?? registration.finishPlace!,
        registration.user
      );
    });

  for (const result of tournament.ratingResults) {
    if (placedUserIds.has(result.userId)) continue;
    rows.push(toRow(result.userId, result.place, result.user));
  }
  rows.sort((left, right) => left.place - right.place);
  return { title: tournament.title, startsAt: tournament.startsAt, rows };
}

export async function getTournamentRatingText(tournamentId: string) {
  const rating = await getTournamentRatingRows(tournamentId);
  if (!rating) return null;

  if (usesBountyTemplate(rating.title)) {
    const lines = rating.rows.map((row) => {
      const prefix = row.place <= 3 ? `${EMOJI.crown} -` : `${row.place} -`;
      const placement = row.basePoints > 0 ? ` (${formatNumber(row.basePoints)}${EMOJI.energy})` : "";
      const bounty = row.bonusPoints > 0 ? ` (+${formatNumber(row.bonusPoints)}${EMOJI.glove})` : "";
      return `${prefix} ${playerName(row.user).replace(/[\r\n]+/g, " ")}${placement}${bounty}`;
    });
    return [
      EMOJI.star.repeat(5), "", `${EMOJI.coconut} ${rating.title.toUpperCase()} ${EMOJI.coconut}`, "", ...lines,
      "━━━━━━━━━━━━━", "", `${EMOJI.energy} — рейтинговые очки за место`, `${EMOJI.glove} — бонусные очки за выбивания`
    ].join("\n");
  }

  const resultLines = rating.rows.map((row) => {
    const prefix = row.place <= 3 ? "👑 -" : `${row.place} -`;
    const points = row.points ? ` (${formatNumber(row.points)}⚡️)` : "";
    return `${prefix} ${playerName(row.user).replace(/[\r\n]+/g, " ")}${points}`;
  });
  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Barnaul", day: "2-digit", month: "2-digit", year: "numeric" }).format(rating.startsAt);
  return [`♠️ ${rating.title.toUpperCase()} · ${date} ♠️`, "", ...resultLines].join("\n");
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
    const premiumEmoji = text.startsWith(EMOJI.star);
    const parts = splitRatingMessage(`${previous ? "Обновлённые результаты\n\n" : ""}${text}`);
    for (const [index, part] of parts.entries()) {
      const key = `${publicationKey}:part:${index}`;
      if (await prisma.telegramBotState.findUnique({ where: { key } })) continue;
      await sendTelegramMessage(chatId, part, premiumEmoji);
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
