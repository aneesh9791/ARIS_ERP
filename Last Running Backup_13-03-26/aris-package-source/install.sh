#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

log(){ echo "[ARIS v9] $*"; }
err(){ echo "[ARIS v9][ERROR] $*" >&2; }
need_file(){ [[ -e "$1" ]] || { err "Required file missing: $1"; exit 1; }; }
random_alnum() {
python3 - <<PY
import secrets, string
alphabet = string.ascii_letters + string.digits
print(''.join(secrets.choice(alphabet) for _ in range(int($1))))
PY
}

install_docker_ubuntu() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release apt-transport-https software-properties-common ufw cron python3
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  . /etc/os-release
  cat >/etc/apt/sources.list.d/docker.list <<EOT

deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOT
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

[[ $EUID -eq 0 ]] || { err "Run as root"; exit 1; }

for f in Dockerfile docker-compose.yml docker-entrypoint.sh Caddyfile.template package.json package-lock.json server.js seed.js schema.sql; do
  need_file "$f"
done

if ! command -v docker >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    log "Docker not found. Installing Docker and required packages..."
    install_docker_ubuntu
  else
    err "Docker is not installed and automatic installation is only supported on Ubuntu/Debian."
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  err "Docker Compose plugin is missing. Install docker-compose-plugin and retry."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    log "python3 not found. Installing python3..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y python3
  else
    err "python3 is required by the installer."
    exit 1
  fi
fi

systemctl enable docker >/dev/null 2>&1 || true
systemctl restart docker >/dev/null 2>&1 || true
systemctl enable cron >/dev/null 2>&1 || true
systemctl restart cron >/dev/null 2>&1 || true

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

read -rp "Enter domain (example: erp.feenixtech.com): " DOMAIN
[[ -n "${DOMAIN:-}" ]] || { err "Domain cannot be empty"; exit 1; }
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  err "Domain contains invalid characters."
  exit 1
fi

[[ -f .env ]] && cp .env ".env.bak.$(date +%s)"
[[ -f Caddyfile ]] && cp Caddyfile "Caddyfile.bak.$(date +%s)"

POSTGRES_PASSWORD="$(random_alnum 28)"
SESSION_SECRET="$(openssl rand -hex 32)"
SUPERADMIN_PASSWORD="$(random_alnum 20)"
ADMIN_PASSWORD="$(random_alnum 20)"
ADMIN_KLM_PASSWORD="$(random_alnum 20)"
ADMIN_PRP_PASSWORD="$(random_alnum 20)"
RECEPTION_KLM_PASSWORD="$(random_alnum 20)"
RECEPTION_PRP_PASSWORD="$(random_alnum 20)"
FINANCE_PASSWORD="$(random_alnum 20)"
RADIOLOGIST_PASSWORD="$(random_alnum 20)"
HR_PASSWORD="$(random_alnum 20)"
OPERATIONS_PASSWORD="$(random_alnum 20)"

cat > .env <<EOT
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgres://aris:${POSTGRES_PASSWORD}@db:5432/aris_erp
DB_SSL=false
SESSION_SECRET=${SESSION_SECRET}
TRUST_PROXY=1
PORT=3000
NODE_ENV=production
ARIS_SEED_SUPERADMIN_PASSWORD=${SUPERADMIN_PASSWORD}
ARIS_SEED_ADMIN_PASSWORD=${ADMIN_PASSWORD}
ARIS_SEED_ADMIN_KLM_PASSWORD=${ADMIN_KLM_PASSWORD}
ARIS_SEED_ADMIN_PRP_PASSWORD=${ADMIN_PRP_PASSWORD}
ARIS_SEED_RECEPTION_KLM_PASSWORD=${RECEPTION_KLM_PASSWORD}
ARIS_SEED_RECEPTION_PRP_PASSWORD=${RECEPTION_PRP_PASSWORD}
ARIS_SEED_FINANCE_PASSWORD=${FINANCE_PASSWORD}
ARIS_SEED_RADIOLOGIST_PASSWORD=${RADIOLOGIST_PASSWORD}
ARIS_SEED_HR_PASSWORD=${HR_PASSWORD}
ARIS_SEED_OPERATIONS_PASSWORD=${OPERATIONS_PASSWORD}
EOT
chmod 600 .env

sed "s/{{DOMAIN}}/${DOMAIN}/g" Caddyfile.template > Caddyfile
chmod 644 Caddyfile

cat > initial_credentials.txt <<EOT
ARIS deployment created on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Domain: ${DOMAIN}

SUPERADMIN     superadmin      ${SUPERADMIN_PASSWORD}
ADMIN          admin           ${ADMIN_PASSWORD}
ADMIN_KLM      admin.klm       ${ADMIN_KLM_PASSWORD}
ADMIN_PRP      admin.prp       ${ADMIN_PRP_PASSWORD}
RECEPTION_KLM  reception.klm   ${RECEPTION_KLM_PASSWORD}
RECEPTION_PRP  reception.prp   ${RECEPTION_PRP_PASSWORD}
FINANCE        finance         ${FINANCE_PASSWORD}
RADIOLOGIST    radiologist     ${RADIOLOGIST_PASSWORD}
HR             hr              ${HR_PASSWORD}
OPERATIONS     operations      ${OPERATIONS_PASSWORD}

Change all passwords immediately after first login.
EOT
chmod 600 initial_credentials.txt

log "Stopping old stack if present"
docker compose down --remove-orphans || true

log "Building containers"
docker compose build --pull --no-cache

log "Starting stack"
docker compose up -d

mkdir -p /var/backups/aris
cat > /etc/cron.daily/aris-backup <<EOT
#!/usr/bin/env bash
cd ${APP_DIR} && ./backup.sh >/var/log/aris-backup.log 2>&1
EOT
chmod +x /etc/cron.daily/aris-backup

log "Waiting for services to become healthy"
for i in {1..60}; do
  APP_HEALTH="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' aris_app 2>/dev/null || true)"
  DB_HEALTH="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' aris_db 2>/dev/null || true)"
  if [[ "$APP_HEALTH" == "healthy" && "$DB_HEALTH" == "healthy" ]]; then
    break
  fi
  sleep 2
done

docker compose ps
echo
log "Credential file: ${APP_DIR}/initial_credentials.txt"
log "App logs: docker logs aris_app --tail 100"
log "Caddy logs: docker logs aris_caddy --tail 50"
echo "Open: https://${DOMAIN}"
