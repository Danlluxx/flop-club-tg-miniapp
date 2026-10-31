#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_COMMIT="${EXPECTED_COMMIT:-ВСТАВИТЬ_SHA}"
APP_DIR="/root/flop-club-tg-miniapp"
BACKUP_DIR="/root/flop-deploy-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/devil-control-$STAMP.tar.gz"

COMPOSE=(
  docker compose
  --env-file .env.production
  -f docker-compose.prod.yml
)

RUNTIME_FILES=(
  apps/api/src/routes/devilDeal.ts
  apps/api/src/services/devilDeal.ts
  apps/web/src/components/DevilDealPanel.tsx
  apps/web/src/components/devilDeal.css
  apps/web/src/pages/admin/DevilControlPage.tsx
  apps/web/src/types.ts
)

if [[ "$EXPECTED_COMMIT" == "ВСТАВИТЬ_SHA" || ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Укажите полный 40-символьный SHA в EXPECTED_COMMIT"
  exit 1
fi

exec 9>/tmp/flop-club-deploy.lock
flock -n 9 || {
  echo "Другой deploy уже выполняется"
  exit 1
}

cd "$APP_DIR"
test -d .git
test -f .env.production
test -f docker-compose.prod.yml
mkdir -p "$BACKUP_DIR"

PUBLIC_BASE_URL="$(sed -n 's/^FRONTEND_URL=//p' .env.production | tail -n 1 | tr -d '\r')"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL#\"}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%\"}"
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  APP_DOMAIN="$(sed -n 's/^APP_DOMAIN=//p' .env.production | tail -n 1 | tr -d '\r')"
  APP_DOMAIN="${APP_DOMAIN#\"}"
  APP_DOMAIN="${APP_DOMAIN%\"}"
  test -n "$APP_DOMAIN"
  PUBLIC_BASE_URL="https://$APP_DOMAIN"
fi
PUBLIC_HEALTH_URL="${PUBLIC_BASE_URL%/}/health"

echo "Проверяем Docker Compose..."
"${COMPOSE[@]}" config --quiet

echo "Получаем origin/main..."
git fetch --no-tags origin main

ACTUAL_COMMIT="$(git rev-parse origin/main)"
if [[ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ]]; then
  echo "origin/main не совпадает с указанным коммитом"
  echo "Ожидался: $EXPECTED_COMMIT"
  echo "Получен:  $ACTUAL_COMMIT"
  exit 1
fi

for file in "${RUNTIME_FILES[@]}"; do
  git cat-file -e "$EXPECTED_COMMIT:$file"
  test -f "$file"
done

echo "Создаём резервную копию..."
tar -czf "$BACKUP_FILE" "${RUNTIME_FILES[@]}"
sha256sum "$BACKUP_FILE"

rollback() {
  local exit_code=$?
  trap - ERR
  set +e

  echo "Deploy завершился ошибкой. Восстанавливаем файлы..."
  cd "$APP_DIR" || exit "$exit_code"
  tar -xzf "$BACKUP_FILE"

  "${COMPOSE[@]}" build api web
  local rollback_build_code=$?
  if [[ "$rollback_build_code" -eq 0 ]]; then
    "${COMPOSE[@]}" up -d api web
    local rollback_up_code=$?
    if [[ "$rollback_up_code" -eq 0 ]]; then
      echo "Rollback выполнен из $BACKUP_FILE"
    else
      echo "Файлы восстановлены, но перезапуск после rollback завершился ошибкой"
    fi
  else
    echo "Файлы восстановлены, но сборка rollback завершилась ошибкой"
  fi

  exit "$exit_code"
}

trap rollback ERR

echo "Извлекаем только файлы DEVIL CONTROL..."
git archive "$EXPECTED_COMMIT" "${RUNTIME_FILES[@]}" |
  tar -x -C "$APP_DIR"

echo "Собираем API и frontend..."
"${COMPOSE[@]}" build api web
"${COMPOSE[@]}" up -d api web

echo "Ожидаем API..."
health_ok=0

for attempt in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api node -e \
    'fetch("http://127.0.0.1:4000/health").then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'
  then
    health_ok=1
    break
  fi

  sleep 2
done

if [[ "$health_ok" -ne 1 ]]; then
  echo "API не прошёл health-check"
  "${COMPOSE[@]}" logs --tail=100 api
  false
fi

echo "Проверяем публичный адрес..."
curl --fail --silent --show-error --retry 6 --retry-delay 3 "$PUBLIC_HEALTH_URL"
echo

"${COMPOSE[@]}" ps api web

printf '%s\n' "$EXPECTED_COMMIT" > .deploy-commit
trap - ERR

echo
echo "Публикация завершена"
echo "Коммит: $EXPECTED_COMMIT"
echo "Резервная копия: $BACKUP_FILE"
