# Flop Club Telegram Mini App

Telegram Mini App для Flop Club в Барнауле: турниры, запись игроков, профиль, рейтинг, админка, live-рассадка, учет вылетов, bounty-нокауты и XLSX-отчеты игрового дня.

## Архитектура

```text
apps/
  web/                 React + TypeScript + Vite + Tailwind
  api/                 Node.js + Express + Prisma
  api/prisma/          schema, migrations, seed
Dockerfile             backend Docker image
Dockerfile.api         production API image for VPS
Dockerfile.web         production frontend image for VPS
docker-compose.yml     локальный PostgreSQL
docker-compose.prod.yml production VPS stack
deploy/                Caddy/Nginx config and VPS guide
railway.json           Railway backend deploy
vercel.json            Vercel frontend deploy
.env.example
.env.production.example
```

Frontend работает с backend через REST API. Авторизация идет через Telegram `initData`; backend проверяет подпись через `BOT_TOKEN`, создает/обновляет пользователя и выдает JWT.

## Основные возможности

- Автоматическая генерация турниров по циклу Flop Club.
- Первый турнир в расписании: `04.06.2026`.
- Запись и отмена записи.
- 5 столов по 10 боксов, максимум 50 игроков.
- Live-рассадка и ручная пересадка.
- Балансировка столов с минимальным количеством пересаженных игроков.
- Фиксация вылетов и автоматическое место финиша.
- Bounty-нокауты только для `Flop Bounty` / `Flop Mystery Knockout`.
- Финальный стол при 9 и меньше активных игроках.
- Рейтинг: очки получает верхние 20% участников.
- XLSX-отчет за игровой день.
- Админка доступна только username из `ADMIN_TELEGRAM_USERNAMES`.

## Локальный запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env`:

```bash
cp .env.example .env
```

3. Запустить PostgreSQL:

```bash
docker compose up -d postgres
```

4. Применить миграции и seed:

```bash
npm run prisma:migrate
npm run seed
```

5. Запустить API и web:

```bash
npm run dev
```

Локально:
- Web: `http://localhost:5173` или следующий свободный порт Vite.
- API: `http://localhost:4000`.
- Health: `http://localhost:4000/health`.

Для браузерной проверки без Telegram используется:

```env
VITE_DEV_INIT_DATA="dev"
DEV_TELEGRAM_ID="111111111"
DEV_TELEGRAM_USERNAME="danIIuxx"
```

Этот bypass работает только при `NODE_ENV=development`.

## Env

Backend:

```env
DATABASE_URL="postgresql://..."
PORT=4000
NODE_ENV=production
BOT_TOKEN="..."
JWT_SECRET="long-random-secret-at-least-24-chars"
FRONTEND_URL="https://your-vercel-domain.vercel.app"
ADMIN_TELEGRAM_USERNAMES="danIIuxx"
ALLOW_CANCEL_AFTER_CLOSE=false
```

Frontend:

```env
VITE_API_URL="https://your-api-domain"
VITE_SUPPORT_URL="https://t.me/flopclub"
```

## Deploy: VPS + Docker Compose

Основной production-вариант без Railway/Vercel: один VPS, Docker Compose, PostgreSQL, API, frontend и HTTPS через Caddy.

Подробная инструкция находится здесь: [deploy/VPS_DEPLOY.md](/Users/danlluxx/flop-club-tg/deploy/VPS_DEPLOY.md).

Коротко:

```bash
git clone https://github.com/Danlluxx/flop-club-tg-miniapp.git
cd flop-club-tg-miniapp
cp .env.production.example .env.production
nano .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

После запуска:

```bash
curl https://your-domain/health
```

## Deploy: Backend на Railway

В проекте уже есть [railway.json](/Users/danlluxx/flop-club-tg/railway.json).

1. Создать новый Railway project.
2. Добавить PostgreSQL service.
3. Добавить backend service из GitHub repo.
4. Указать env backend:
   - `DATABASE_URL` из Railway Postgres.
   - `BOT_TOKEN`.
   - `JWT_SECRET`.
   - `FRONTEND_URL`.
   - `ADMIN_TELEGRAM_USERNAMES=danIIuxx`.
   - `NODE_ENV=production`.
5. Railway выполнит:

```bash
npm install
npm run prisma:generate:prod --workspace @flop-club/api
npm run build --workspace @flop-club/api
npm run prisma:deploy:prod --workspace @flop-club/api
npm run start --workspace @flop-club/api
```

После деплоя проверить:

```text
https://your-api-domain/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

## Deploy: Frontend на Vercel

В проекте уже есть [vercel.json](/Users/danlluxx/flop-club-tg/vercel.json).

1. Создать Vercel project из GitHub repo.
2. Root directory оставить корнем репозитория.
3. Указать env frontend:

```env
VITE_API_URL=https://your-api-domain
VITE_SUPPORT_URL=https://t.me/flopclub
```

4. Vercel выполнит:

```bash
npm install
npm run build --workspace @flop-club/web
```

Output:

```text
apps/web/dist
```

## Telegram BotFather

1. Открыть `@BotFather`.
2. Создать бота или открыть существующего.
3. Сохранить `BOT_TOKEN` в Railway backend env.
4. Настроить Mini App:
   - `Bot Settings`
   - `Menu Button`
   - URL: Vercel frontend URL.
5. Настроить domain/web app URL на домен frontend.

После этого Mini App нужно открывать внутри Telegram, чтобы backend получил настоящий подписанный `initData`.

## Admin

Админка показывается только пользователям с username из:

```env
ADMIN_TELEGRAM_USERNAMES="danIIuxx"
```

Проверка идет на backend, поэтому скрыть админку только на frontend недостаточно. Username нормализуется без `@` и без учета регистра.

## Live-режим турнира

Путь:

```text
Админка -> Турниры -> Участники
```

Действия:
- `Вылет игрока`: фиксирует вылет и автоматически назначает `finishPlace`.
- В bounty-турнирах дополнительно можно выбрать, кто выбил игрока.
- `Баланс`: пересаживает минимальное количество игроков для ровных столов.
- `Финал`: формирует финальный стол при 9 или меньше активных игроках.
- Иконка скачивания в блоке рейтинга: XLSX-отчет за игровой день.

## Проверки перед публикацией

```bash
npm run lint --workspace @flop-club/api
npm run build --workspace @flop-club/api
npm run lint --workspace @flop-club/web
npm run build --workspace @flop-club/web
```

## Security

- Telegram `initData` проверяется на backend.
- Admin endpoints защищены JWT и ролью `ADMIN`.
- CORS ограничивается `FRONTEND_URL`.
- Секреты хранятся только в env платформы.
- Существенные действия логируются в консоль backend.
