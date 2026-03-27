#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
mkdir -p /var/backups/aris
STAMP="$(date +%F_%H-%M-%S)"
OUT="/var/backups/aris/aris_${STAMP}.dump"
docker exec aris_db pg_dump -U aris -d aris_erp -Fc > "$OUT"
find /var/backups/aris -type f -name 'aris_*.dump' -mtime +14 -delete
printf 'Backup created: %s\n' "$OUT"
