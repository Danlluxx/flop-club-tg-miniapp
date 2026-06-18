CREATE TABLE "TelegramSubscriber" (
  "chatId" TEXT NOT NULL,
  "telegramId" TEXT,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramSubscriber_pkey" PRIMARY KEY ("chatId")
);

CREATE TABLE "TelegramBotState" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramBotState_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "TelegramSubscriber_active_idx" ON "TelegramSubscriber"("active");
CREATE INDEX "TelegramSubscriber_telegramId_idx" ON "TelegramSubscriber"("telegramId");
