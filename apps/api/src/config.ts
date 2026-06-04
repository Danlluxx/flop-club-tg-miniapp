import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dirname, "../../../.env") });
dotenv.config();

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BOT_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  FRONTEND_URL: z.string().url(),
  ADMIN_TELEGRAM_USERNAMES: z.string().default("danlluxx"),
  ALLOW_CANCEL_AFTER_CLOSE: z.coerce.boolean().default(false),
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
