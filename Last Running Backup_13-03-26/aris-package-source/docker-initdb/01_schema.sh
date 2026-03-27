#!/bin/bash
# ── ARIS ERP — Auto-initialise DB on first Docker start ───────────────────────
# PostgreSQL runs every *.sh / *.sql file in /docker-entrypoint-initdb.d/
# in alphabetical order, but ONLY when the data volume is empty (first launch).
#
# This script:
#   1. Runs schema.sql to create all 19 tables
#   2. Runs seed.js via Node to insert initial data + default users
#
# It runs INSIDE the postgres container, so we call Node via the app container
# using docker exec. However, because both containers start at the same time,
# the simpler approach is to just apply the SQL here and let the Node app
# handle the JS seed separately via a one-shot startup script.

set -e

echo "==> ARIS v3.0: Applying schema.sql ..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -f /docker-entrypoint-initdb.d/schema.sql

echo "==> ARIS v3.0: Schema applied successfully (31 tables)."
