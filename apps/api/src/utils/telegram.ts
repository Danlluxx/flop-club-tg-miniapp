import crypto from "node:crypto";
import { AppError } from "./errors.js";

export type TelegramUserPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData) {
    throw new AppError(401, "Telegram initData is required", "INIT_DATA_REQUIRED");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new AppError(401, "Telegram initData hash is missing", "INIT_DATA_HASH_MISSING");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const valid = crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"));
  if (!valid) {
    throw new AppError(401, "Invalid Telegram signature", "INVALID_TELEGRAM_SIGNATURE");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  const maxAgeSeconds = 60 * 60 * 24;
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    throw new AppError(401, "Telegram initData is expired", "INIT_DATA_EXPIRED");
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new AppError(401, "Telegram user payload is missing", "TELEGRAM_USER_MISSING");
  }

  return JSON.parse(rawUser) as TelegramUserPayload;
}
