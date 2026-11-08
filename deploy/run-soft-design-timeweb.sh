#!/usr/bin/env bash
# Targeted release for servers whose git checkout is not fast-forwarded (files are copied in
# from commits). Applies only the files that changed between the last deployed commit and
# EXPECTED_COMMIT, and refuses to overwrite anything that was edited on the server.
#
#   EXPECTED_COMMIT=<40-char sha> bash run-soft-design-timeweb.sh          # dry run, changes nothing
#   EXPECTED_COMMIT=<40-char sha> APPLY=1 bash run-soft-design-timeweb.sh  # backup, apply, build, verify
#
# BASE_COMMIT defaults to the sha stored in .deploy-commit; set it explicitly when that file is stale.
# ALLOW_OVERWRITE="path1 path2" accepts specific server-side differences after they were reviewed
# (the files are still backed up first).
# DB_BACKUP_FILE=<path to a fresh pg_dump> is required when the release contains apps/api/prisma changes.
set -Eeuo pipefail

EXPECTED_COMMIT="${EXPECTED_COMMIT:-ВСТАВИТЬ_SHA}"
APPLY="${APPLY:-0}"
ALLOW_OVERWRITE="${ALLOW_OVERWRITE:-}"
DB_BACKUP_FILE="${DB_BACKUP_FILE:-}"
APP_DIR="${APP_DIR:-/root/flop-club-tg-miniapp}"
BACKUP_DIR="${BACKUP_DIR:-/root/flop-deploy-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/release-$STAMP.tar.gz"

COMPOSE=(
  docker compose
  --env-file .env.production
  -f docker-compose.prod.yml
)

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
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

echo "Получаем origin/main..."
git fetch --no-tags origin main

ACTUAL_COMMIT="$(git rev-parse origin/main)"
if [[ "$ACTUAL_COMMIT" != "$EXPECTED_COMMIT" ]]; then
  echo "origin/main не совпадает с указанным коммитом"
  echo "Ожидался: $EXPECTED_COMMIT"
  echo "Получен:  $ACTUAL_COMMIT"
  exit 1
fi

BASE_COMMIT="${BASE_COMMIT:-}"
if [[ -z "$BASE_COMMIT" && -f .deploy-commit ]]; then
  BASE_COMMIT="$(tr -d '[:space:]' < .deploy-commit)"
fi
if [[ ! "$BASE_COMMIT" =~ ^[0-9a-f]{7,40}$ ]] || ! git cat-file -e "$BASE_COMMIT^{commit}" 2>/dev/null; then
  echo "Не удалось определить последний выкаченный коммит (.deploy-commit: '${BASE_COMMIT}')."
  echo "Запустите с BASE_COMMIT=<sha>."
  exit 1
fi
BASE_COMMIT="$(git rev-parse "$BASE_COMMIT")"

echo "Выкачен:   $BASE_COMMIT"
echo "Выкатываем: $EXPECTED_COMMIT"

# Only runtime inputs; docs and deploy tooling never travel with a release.
FILES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && FILES+=("$line")
done < <(git diff --name-only --diff-filter=AMR "$BASE_COMMIT" "$EXPECTED_COMMIT" -- . ':!docs' ':!deploy' ':!.claude')

DELETED=()
while IFS= read -r line; do
  [[ -n "$line" ]] && DELETED+=("$line")
done < <(git diff --name-only --diff-filter=D "$BASE_COMMIT" "$EXPECTED_COMMIT" -- . ':!docs' ':!deploy' ':!.claude')

if [[ "${#FILES[@]}" -eq 0 ]]; then
  echo "Между коммитами нет изменений в рабочих файлах"
  exit 0
fi

if [[ "${#DELETED[@]}" -gt 0 ]]; then
  echo "В релизе есть удаляемые файлы, скрипт их не трогает. Разберите вручную:"
  printf '  %s\n' "${DELETED[@]}"
  exit 1
fi

for file in "${FILES[@]}"; do
  case "$file" in
    apps/api/prisma/*)
      # A release with migrations needs a fresh, non-empty pg_dump taken in the last 30 minutes.
      if [[ -n "$DB_BACKUP_FILE" && -s "$DB_BACKUP_FILE" && -n "$(find "$DB_BACKUP_FILE" -mmin -30 2>/dev/null)" ]]; then
        echo "Релиз содержит миграции ($file); резервная копия БД: $DB_BACKUP_FILE"
        break
      fi
      echo "Релиз затрагивает базу данных ($file). Сделайте pg_dump и передайте его путь в DB_BACKUP_FILE (файл не пустой, не старше 30 минут)."
      exit 1
      ;;
  esac
done

EXISTING_FILES=()
NEW_FILES=()
CONFLICTS=()
ACCEPTED=()
# Portable "$@"-style expansion of possibly-empty arrays under set -u (bash < 4.4).

for file in "${FILES[@]}"; do
  if [[ -f "$file" ]]; then
    EXISTING_FILES+=("$file")
    server_hash="$(git hash-object -- "$file")"
    base_hash="$(git rev-parse -q --verify "$BASE_COMMIT:$file" 2>/dev/null || true)"
    target_hash="$(git rev-parse "$EXPECTED_COMMIT:$file")"
    # Already identical to the target is fine; otherwise it must still be what was last deployed.
    if [[ "$server_hash" != "$target_hash" && "$server_hash" != "$base_hash" ]]; then
      if [[ " $ALLOW_OVERWRITE " == *" $file "* ]]; then
        ACCEPTED+=("$file")
      else
        CONFLICTS+=("$file")
      fi
    fi
  else
    NEW_FILES+=("$file")
  fi
done

echo
echo "Файлы релиза: ${#FILES[@]} (изменяются: ${#EXISTING_FILES[@]}, новые: ${#NEW_FILES[@]})"
printf '  %s\n' "${FILES[@]}"

if [[ "${#CONFLICTS[@]}" -gt 0 ]]; then
  echo
  echo "На сервере эти файлы отличаются от выкаченной версии, их не перезаписываем:"
  printf '  %s\n' "${CONFLICTS[@]}"
  echo "Сверьте их вручную или укажите верный BASE_COMMIT."
  exit 1
fi

if [[ "${#ACCEPTED[@]}" -gt 0 ]]; then
  echo
  echo "Перезаписываем с вашего разрешения (резервная копия будет сделана):"
  printf '  %s\n' "${ACCEPTED[@]}"
fi

if [[ "$APPLY" != "1" ]]; then
  echo
  echo "Пробный запуск: ничего не изменено. Конфликтов нет."
  echo "Чтобы применить, запустите с APPLY=1."
  exit 0
fi

mkdir -p "$BACKUP_DIR"

echo "Проверяем Docker Compose..."
"${COMPOSE[@]}" config --quiet

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

echo "Создаём резервную копию..."
if [[ "${#EXISTING_FILES[@]}" -gt 0 ]]; then
  tar -czf "$BACKUP_FILE" "${EXISTING_FILES[@]}"
else
  tar -czf "$BACKUP_FILE" --files-from /dev/null
fi
sha256sum "$BACKUP_FILE"

rollback() {
  local exit_code=$?
  trap - ERR
  set +e

  echo "Deploy завершился ошибкой. Восстанавливаем файлы..."
  cd "$APP_DIR" || exit "$exit_code"
  tar -xzf "$BACKUP_FILE"
  if [[ "${#NEW_FILES[@]}" -gt 0 ]]; then
    rm -f -- "${NEW_FILES[@]}"
  fi

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

echo "Извлекаем файлы релиза..."
git archive "$EXPECTED_COMMIT" -- "${FILES[@]}" |
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
