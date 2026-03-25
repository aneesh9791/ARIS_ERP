#!/bin/bash
# Migration runner — runs pending numbered migrations in order
# Usage: ./migrate.sh [--dry-run]
# Requires: DATABASE_URL env var, or falls back to local psql defaults

set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/migrations" && pwd)}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# Build psql command
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL="psql $DATABASE_URL"
else
  PSQL="psql -U ${DB_USER:-ariserp} -d ${DB_NAME:-aris_erpdb} -h ${DB_HOST:-localhost}"
fi

# Ensure tracking table exists
$PSQL -q -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(10)  PRIMARY KEY,
    filename    VARCHAR(200) NOT NULL,
    applied_at  TIMESTAMP    DEFAULT NOW()
  );"

echo "=== ARIS Migration Runner ==="
echo "Migrations dir: $MIGRATIONS_DIR"
echo ""

APPLIED=0
SKIPPED=0
FAILED=0

for filepath in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql | sort); do
  filename=$(basename "$filepath")
  # Extract version prefix (e.g. "084" from "084_widen_varchar_columns.sql")
  version=$(echo "$filename" | grep -oE '^[0-9]+')

  # Check if already applied
  count=$($PSQL -At -c "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version';")
  if [[ "$count" -gt 0 ]]; then
    echo "  SKIP  [$version] $filename (already applied)"
    ((SKIPPED++)) || true
    continue
  fi

  if $DRY_RUN; then
    echo "  PENDING [$version] $filename"
    continue
  fi

  echo -n "  RUN   [$version] $filename ... "

  # Run in a transaction; on error, rollback and log but continue
  if $PSQL -q -v ON_ERROR_STOP=1 \
      -c "BEGIN;" \
      -f "$filepath" \
      -c "INSERT INTO schema_migrations (version, filename) VALUES ('$version', '$filename');" \
      -c "COMMIT;" 2>/tmp/migration_error.txt; then
    echo "OK"
    ((APPLIED++)) || true
  else
    echo "FAILED"
    echo "    Error: $(cat /tmp/migration_error.txt | grep 'ERROR' | head -3)"
    $PSQL -q -c "ROLLBACK;" 2>/dev/null || true
    ((FAILED++)) || true
  fi
done

echo ""
echo "=== Done: $APPLIED applied, $SKIPPED skipped, $FAILED failed ==="
