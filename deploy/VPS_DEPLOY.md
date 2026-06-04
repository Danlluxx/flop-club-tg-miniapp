# VPS deploy

Схема: один VPS, Docker Compose, PostgreSQL в контейнере, API в контейнере, frontend в Nginx, HTTPS через Caddy.

## 1. Подготовить сервер

Минимально: Ubuntu 22.04/24.04, 1-2 CPU, 1-2 GB RAM, 15+ GB SSD.

На сервере:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

После этого выйдите из SSH и зайдите снова, чтобы применились права Docker.

## 2. Настроить домен

В DNS домена создайте `A`-запись:

```text
mini.flopclub.ru -> IP_ВАШЕГО_VPS
```

Для Telegram Mini App нужен HTTPS. Caddy получит сертификат автоматически, когда DNS уже смотрит на сервер.

## 3. Загрузить проект

```bash
git clone https://github.com/Danlluxx/flop-club-tg-miniapp.git
cd flop-club-tg-miniapp
cp .env.production.example .env.production
nano .env.production
```

Обязательно поменяйте:

```text
APP_DOMAIN=ваш-домен
FRONTEND_URL=https://ваш-домен
BOT_TOKEN=токен_бота
JWT_SECRET=длинная_случайная_строка
POSTGRES_PASSWORD=сложный_пароль
DATABASE_URL=postgresql://POSTGRES_USER:POSTGRES_PASSWORD@postgres:5432/POSTGRES_DB?schema=public
```

Важно: значения `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` в `DATABASE_URL` должны совпадать.

## 4. Запустить

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Проверка:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl https://ваш-домен/health
```

## 5. Заполнить тестовыми турнирами

Если нужно выполнить seed:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api npm run seed --workspace @flop-club/api
```

## 6. Обновление после изменений

```bash
cd flop-club-tg-miniapp
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Миграции Prisma применяются автоматически при старте API.

## 7. Telegram BotFather

В BotFather:

1. `/mybots`
2. выбрать бота
3. `Bot Settings`
4. `Menu Button`
5. `Configure menu button`
6. URL: `https://ваш-домен`

Для Web Apps также укажите домен, если BotFather попросит его отдельно.
