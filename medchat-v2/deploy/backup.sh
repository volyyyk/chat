#!/usr/bin/env bash
# MedChat: бэкап PostgreSQL (прод-контур). Запускать из папки deploy/.
#
# Регулярный запуск (ротация — 14 дней):
#   chmod +x backup.sh
#   crontab -e
#   15 3 * * * cd /path/to/medchat-v2/deploy && ./backup.sh >> backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"

# Значения — из .env.prod (того же, с которым работает docker compose)
DB_USER=medchat
DB_NAME=medchat_v2
if [ -f .env.prod ]; then
  DB_USER="$(grep -E '^DB_USER=' .env.prod | tail -1 | cut -d= -f2-)"
  DB_NAME="$(grep -E '^DB_NAME=' .env.prod | tail -1 | cut -d= -f2-)"
fi
: "${DB_USER:?DB_USER не задан}"
: "${DB_NAME:?DB_NAME не задан}"

mkdir -p backups
STAMP="$(date +%F-%H%M)"
OUT="backups/medchat-${STAMP}.sql.gz"

docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# Ротация: копии старше 14 дней
find backups -name 'medchat-*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') бэкап: $OUT"