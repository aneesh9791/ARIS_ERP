# ARIS ERP — Deployment Manual

## The Golden Rule
**Never deploy directly to production.** All changes must go through git.

```
Local dev  →  git commit  →  git push  →  ssh deploy.sh
```

---

## Workflow Step by Step

### 1. Make your changes locally
Edit files in `/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/`

### 2. Commit to git
```bash
git add <files>
git commit -m "brief description of what changed"
```

### 3. Push to GitHub
```bash
git push origin main
```

### 4. Deploy to production
```bash
ssh vps-aris "./deploy.sh"
```

That's it. The deploy script does everything:
- Pulls latest from GitHub
- Installs backend dependencies
- Builds the frontend
- Restarts the backend via PM2

---

## Server Layout

| What | Path |
|------|------|
| Git root | `/opt/aris/` |
| Backend (running) | `/opt/aris/New_ERP_Project/backend/` |
| Frontend build (served) | `/opt/aris/New_ERP_Project/frontend/build/` |
| Deploy script | `/opt/aris/deploy.sh` |
| Backend env vars | `/opt/aris/New_ERP_Project/backend/.env` |
| Backend uploads | `/opt/aris/New_ERP_Project/backend/uploads/` |
| Nginx config | `/etc/nginx/sites-available/aris-erp` |
| PM2 process | `aris-backend` (port 3003) |
| Frontend URL | `https://erp.feenixtech.com` |

---

## Checking Production Status

```bash
# Is the backend running?
ssh vps-aris "pm2 list"

# Recent backend logs
ssh vps-aris "pm2 logs aris-backend --lines 50 --nostream"

# Which commit is live on production?
ssh vps-aris "cd /opt/aris && git log --oneline -5"

# Nginx status
ssh vps-aris "systemctl status nginx"
```

---

## Hotfix (urgent production fix)

Same flow — no exceptions:
```bash
# Fix the file locally
git add <file>
git commit -m "fix: description"
git push origin main
ssh vps-aris "./deploy.sh"
```

---

## Database Migrations

Migrations are SQL files in `database/migrations/`. To run a new migration:
```bash
ssh vps-aris "psql -U aris_user -d aris_erp -h 127.0.0.1 -f /opt/aris/New_ERP_Project/database/migrations/<filename>.sql"
```

Migrations are numbered sequentially (`001_`, `002_`, ...). Never edit an existing migration — add a new one.

---

## What NOT to do

| ❌ Don't | ✅ Do instead |
|---------|-------------|
| `rsync` files directly to production | `git push` + `./deploy.sh` |
| Edit files directly on the server | Edit locally, commit, push, deploy |
| Skip `git commit` before deploying | Always commit first |
| Deploy from a dirty/untested local state | Test locally, then push |
