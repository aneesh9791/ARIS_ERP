# ARIS Deploy v9

This package contains the ARIS backend plus a production deployment scaffold for Ubuntu/Debian VPS hosts such as Hostinger KVM2.

## Install

```bash
unzip aris-complete-deploy-v9.zip
cd aris-deploy-v9
chmod +x *.sh docker-entrypoint.sh
sudo bash install.sh
```

## What v9 fixes

- Debian-based Node image to avoid Alpine + sharp build failures
- `bcryptjs` instead of native `bcrypt`
- `trust proxy` support behind Caddy
- DB SSL logic respects `DB_SSL=false` in both app and seed scripts
- Random seed passwords generated during install and saved to `initial_credentials.txt`
- Automatic Docker installation on Ubuntu/Debian when missing
- Improved health check, backup, restore, and upgrade scripts

## Useful commands

```bash
./logs.sh
./healthcheck.sh
./backup.sh
./upgrade.sh
./restore.sh /var/backups/aris/aris_YYYY-MM-DD_HH-MM-SS.dump
```
