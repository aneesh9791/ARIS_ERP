#!/usr/bin/env bash
set -Eeuo pipefail
[[ $# -eq 1 ]] || { echo "Usage: ./restore.sh /path/to/backup.dump"; exit 1; }
FILE="$1"
[[ -f "$FILE" ]] || { echo "Backup file not found: $FILE"; exit 1; }
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "Starting database container if needed..."
docker compose up -d db

echo "Waiting for database to become ready..."
for i in {1..30}; do
  if docker exec aris_db pg_isready -U aris -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Stopping app and proxy for restore..."
docker compose stop app caddy || true

echo "Recreating database..."
docker exec aris_db dropdb -U aris --if-exists aris_erp
docker exec aris_db createdb -U aris aris_erp

echo "Restoring from $FILE ..."
cat "$FILE" | docker exec -i aris_db pg_restore -U aris -d aris_erp --clean --if-exists --no-owner --no-privileges

echo "Starting app and proxy..."
docker compose up -d
echo "Restore completed."
