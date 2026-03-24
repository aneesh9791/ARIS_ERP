#!/bin/bash
# PostgreSQL backup script for ARIS ERP
# Usage: bash backup.sh
# Cron (daily at 2am): 0 2 * * * /path/to/backup.sh >> /var/log/aris-backup.log 2>&1

set -e

# Load .env if running manually
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)
fi

# Config
DB_NAME="${DB_NAME:-aris_erpdb}"
DB_USER="${DB_USER:-ariserp}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/aris-erp}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

echo "[$(date)] Starting backup of $DB_NAME"

# Create backup directory
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Run pg_dump (custom format — compressed, restoreable with pg_restore)
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -Fc \
  --no-password \
  "$DB_NAME" > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Delete backups older than RETAIN_DAYS
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -mtime +${RETAIN_DAYS} -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Removed $DELETED backup(s) older than ${RETAIN_DAYS} days"
fi

echo "[$(date)] Done. Backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/*.dump 2>/dev/null | tail -5
