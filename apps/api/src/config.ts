import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dirname, "../../../.env") });
dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  FRONTEND_URL: z.string().url(),
  ADDITIONAL_FRONTEND_URLS: z.string().default(""),
  ADMIN_TELEGRAM_USERNAMES: z.string().default("danlluxx"),
  TELEGRAM_REMINDER_CHAT_ID: z.string().optional(),
  TELEGRAM_RATING_CHAT_ID: z.string().min(1).default("@flopclub"),
  TELEGRAM_API_BASE_URL: z.string().url().default("https://api.telegram.org"),
  TELEGRAM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  TOURNAMENT_REMINDER_BROADCAST_USERS: booleanFromEnv.default(true),
  TOURNAMENT_REMINDERS_ENABLED: booleanFromEnv.default(true),
  ALLOW_CANCEL_AFTER_CLOSE: booleanFromEnv.default(false),
  CLOCK_API_TOKEN: z.string().optional(),
  DEV_TELEGRAM_ID: z.string().optional(),
  DEV_TELEGRAM_USERNAME: z.string().optional()
});

export const config = schema.parse(process.env);

export const adminTelegramUsernames = new Set(
  config.ADMIN_TELEGRAM_USERNAMES.split(",")
    .map((username) => username.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
);

export function isAdminTelegramUsername(username?: string | null) {
  if (!username) return false;
  return adminTelegramUsernames.has(username.trim().replace(/^@/, "").toLowerCase());
}
