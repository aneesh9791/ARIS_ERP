#!/bin/bash
# Install the daily backup cron job
# Usage: sudo bash setup-cron.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"

chmod +x "$BACKUP_SCRIPT"

# Add to root crontab: daily at 2:00am
CRON_LINE="0 2 * * * $BACKUP_SCRIPT >> /var/log/aris-backup.log 2>&1"

# Check if already exists
if crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
  echo "Cron job already installed."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Cron job installed: $CRON_LINE"
fi

echo ""
echo "To restore a backup:"
echo "  pg_restore -h localhost -U ariserp -d aris_erpdb -Fc /var/backups/aris-erp/<file>.dump"
