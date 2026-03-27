#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

docker compose ps
echo "---- internal app health ----"
docker exec aris_app curl -fsS http://127.0.0.1:3000/health
echo
echo "---- external https health ----"
DOMAIN="$(awk -F= '/^DOMAIN=/{print $2}' .env)"
curl -kfsS "https://${DOMAIN}/health"
echo
