#!/bin/bash
# SSL setup script for erp.feeenixtech.com using Let's Encrypt + Certbot
# Run as root or with sudo on your production server (Ubuntu/Debian)
# Usage: sudo bash setup-ssl.sh

set -e

DOMAIN="erp.feeenixtech.com"
EMAIL="admin@feeenixtech.com"   # Change to your real admin email

echo "=== Installing Certbot ==="
apt-get update -qq
apt-get install -y certbot python3-certbot-nginx

echo "=== Creating webroot for ACME challenge ==="
mkdir -p /var/www/certbot

echo "=== Copying Nginx config ==="
cp "$(dirname "$0")/../nginx/${DOMAIN}.conf" /etc/nginx/sites-available/${DOMAIN}
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}

echo "=== Testing Nginx config ==="
nginx -t

echo "=== Reloading Nginx (HTTP only for now) ==="
systemctl reload nginx

echo "=== Obtaining SSL certificate ==="
certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "=== Reloading Nginx with SSL ==="
systemctl reload nginx

echo "=== Setting up auto-renewal ==="
# Certbot installs a systemd timer automatically; verify it:
systemctl status certbot.timer

# Add a reload hook so Nginx picks up renewed certs
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'HOOK'
#!/bin/bash
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo ""
echo "=== Done ==="
echo "SSL certificate installed for $DOMAIN"
echo "Auto-renewal is handled by: systemctl certbot.timer"
echo "Test renewal: certbot renew --dry-run"
