import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { adminTelegramUsernames, config, isAdminTelegramUsername } from "../config.js";
import { prisma } from "../prisma.js";
import { verifyTelegramInitData } from "../utils/telegram.js";

export const authRouter = express.Router();

const bodySchema = z.object({ initData: z.string().min(1) });

authRouter.post("/telegram", async (req, res, next) => {
  try {
    const { initData } = bodySchema.parse(req.body);
    const devUsername = config.DEV_TELEGRAM_USERNAME ?? [...adminTelegramUsernames][0] ?? "dev_user";
    const telegramUser =
      config.NODE_ENV === "development" && initData === "dev"
        ? { id: Number(config.DEV_TELEGRAM_ID ?? "111111111"), first_name: "Dev", username: devUsername }
        : verifyTelegramInitData(initData, config.BOT_TOKEN);
    const telegramId = String(telegramUser.id);
    const role = isAdminTelegramUsername(telegramUser.username) ? "ADMIN" : "USER";

    const user = await prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        photoUrl: telegramUser.photo_url,
        role
      },
      update: {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        role
      }
    });

    const token = jwt.sign({ userId: user.id }, config.JWT_SECRET, { expiresIn: "7d" });
    console.log(`[auth:telegram] telegramId=${telegramId} role=${role}`);
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});
