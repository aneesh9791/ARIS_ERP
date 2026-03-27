#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"
./backup.sh
docker compose build --pull --no-cache
docker compose up -d
docker compose ps
