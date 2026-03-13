#!/bin/bash

# Switch-Over Script for ERP Migration
# Switches from old ERP v3 to new Docker-based ARIS ERP

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Configuration
PROJECT_DIR="/opt/aris-erp"
BACKUP_DIR="/home/user/erp-backup/$(date +%Y%m%d)"
DOMAIN="erp.feenixtech.com"
ROLLBACK_FILE="/tmp/rollback-$(date +%Y%m%d-%H%M%S).sh"

# Safety checks
safety_checks() {
    log "Performing safety checks..."
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        error "Please run this script as a regular user with sudo privileges"
    fi
    
    # Check if parallel deployment is running
    cd $PROJECT_DIR
    if ! sudo docker compose -f docker-compose.parallel.yml ps | grep -q "Up"; then
        error "Parallel deployment is not running. Please run parallel-deploy.sh first"
    fi
    
    # Check if new system is healthy
    if ! curl -f http://localhost:3001 > /dev/null 2>&1; then
        error "New system frontend is not healthy on port 3001"
    fi
    
    if ! curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
        error "New system backend is not healthy on port 5001"
    fi
    
    # Check if user is sure
    echo ""
    echo "⚠️  WARNING: This will switch your production ERP from version 3 to the new Docker-based system!"
    echo "⚠️  Make sure you have tested the new system thoroughly at new.erp.feenixtech.com"
    echo "⚠️  This operation will cause downtime of approximately 5-10 minutes"
    echo ""
    read -p "Are you sure you want to continue? (type 'yes' to continue): " confirm
    if [[ $confirm != "yes" ]]; then
        log "Switch-over cancelled by user"
        exit 0
    fi
    
    log "Safety checks passed"
}

# Create rollback script
create_rollback() {
    log "Creating rollback script..."
    
    cat > $ROLLBACK_FILE << EOF
#!/bin/bash

# Rollback script generated on $(date)
# To rollback, run: bash $ROLLBACK_FILE

echo "Starting rollback to old ERP system..."

# Stop new system
cd $PROJECT_DIR
sudo docker compose -f docker-compose.parallel.yml down

# Restore old Nginx configuration
if [ -f "/etc/nginx/sites-available/erp-old" ]; then
    sudo rm -f /etc/nginx/sites-enabled/erp-new
    sudo ln -sf /etc/nginx/sites-available/erp-old /etc/nginx/sites-enabled/erp
    sudo nginx -t
    sudo systemctl reload nginx
fi

# Start old system (adjust based on your setup)
if command -v systemctl > /dev/null 2>&1; then
    sudo systemctl start erp-app || sudo systemctl start apache2 || sudo systemctl start nginx
fi

# Verify old system
if curl -f http://$DOMAIN > /dev/null 2>&1; then
    echo "Rollback completed successfully!"
else
    echo "Rollback failed. Please check system manually."
fi
EOF

    chmod +x $ROLLBACK_FILE
    log "Rollback script created: $ROLLBACK_FILE"
}

# Create final backup
create_final_backup() {
    log "Creating final backup of old system..."
    
    mkdir -p $BACKUP_DIR/final
    cd $BACKUP_DIR/final
    
    # Backup database
    info "Creating final database backup..."
    if command -v pg_dump > /dev/null 2>&1; then
        pg_dump -h localhost -U erp_user erp_database > final_database_backup.sql 2>/dev/null || \
        pg_dump -h localhost -U postgres erp_database > final_database_backup.sql 2>/dev/null || \
        warning "Could not create final database backup"
    fi
    
    # Backup application state
    info "Backing up application state..."
    if [ -d "/var/www/erp" ]; then
        tar -czf final_application_backup.tar.gz /var/www/erp/ 2>/dev/null || \
        tar -czf final_application_backup.tar.gz /var/www/html/ 2>/dev/null || \
        warning "Could not backup application files"
    fi
    
    # Backup Nginx configuration
    info "Backing up Nginx configuration..."
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
        cp /etc/nginx/sites-enabled/default ./nginx_default_backup
    fi
    
    # Save current running processes
    ps aux > current_processes.txt
    
    log "Final backup completed: $BACKUP_DIR/final"
}

# Stop old system
stop_old_system() {
    log "Stopping old ERP system..."
    
    # Save old Nginx configuration
    if [ -f "/etc/nginx/sites-enabled/default" ]; then
        sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-available/erp-old
    fi
    
    # Stop old services (adjust based on your actual setup)
    if systemctl is-active --quiet apache2 2>/dev/null; then
        info "Stopping Apache2..."
        sudo systemctl stop apache2
    fi
    
    if systemctl is-active --quiet nginx 2>/dev/null; then
        info "Stopping Nginx temporarily..."
        sudo systemctl stop nginx
    fi
    
    # Stop any Node.js processes
    if pgrep -f "node.*erp" > /dev/null; then
        info "Stopping Node.js ERP processes..."
        sudo pkill -f "node.*erp" || true
    fi
    
    # Check if old system is stopped
    sleep 5
    if ! curl -f http://localhost:80 > /dev/null 2>&1; then
        log "Old system stopped successfully"
    else
        warning "Old system may still be running"
    fi
}

# Switch to new system
switch_to_new() {
    log "Switching to new Docker-based system..."
    
    cd $PROJECT_DIR
    
    # Stop parallel deployment
    sudo docker compose -f docker-compose.parallel.yml down
    
    # Update production docker-compose to use standard ports
    info "Configuring production deployment..."
    
    # Create production docker-compose file
    cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: aris_erp
      POSTGRES_USER: aris_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    networks:
      - aris-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aris_user -d aris_erp"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - aris-network
    restart: unless-stopped

  # Backend API
  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://aris_user:${POSTGRES_PASSWORD}@db:5432/aris_erp
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    ports:
      - "5000:5000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - aris-network
    volumes:
      - ./backend/logs:/app/logs
      - ./backend/uploads:/app/uploads
    restart: unless-stopped

  # Frontend
  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_API_URL=http://$DOMAIN:5000
        - REACT_APP_ENV=production
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - aris-network
    restart: unless-stopped

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/logs:/var/log/nginx
    depends_on:
      - backend
      - frontend
    networks:
      - aris-network
    restart: unless-stopped

  # Backup Service
  backup:
    image: postgres:15-alpine
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ./backups:/backups
      - postgres_data:/var/lib/postgresql/data:ro
    networks:
      - aris-network
    depends_on:
      - db
    restart: unless-stopped
    command: >
      sh -c "
        while true; do
          echo 'Creating backup...'
          pg_dump -h db -U aris_user -d aris_erp > /backups/backup_\$(date +%Y%m%d_%H%M%S).sql
          echo 'Backup completed'
          find /backups -name 'backup_*.sql' -mtime +7 -delete
          sleep 86400
        done
      "

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  aris-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
EOF

    # Start production deployment
    info "Starting production deployment..."
    sudo docker compose -f docker-compose.prod.yml up -d
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 60
    
    # Check service status
    sudo docker compose -f docker-compose.prod.yml ps
}

# Update Nginx configuration
update_nginx() {
    log "Updating Nginx configuration..."
    
    # Update main Nginx configuration for production
    sudo tee /etc/nginx/sites-available/erp << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL configuration (update paths as needed)
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/m;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_cache_bypass \$http_upgrade;
    }

    # API routes
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_cache_bypass \$http_upgrade;
        
        # CORS headers
        add_header Access-Control-Allow-Origin \$http_origin;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
        add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization";
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range";
    }

    # Login endpoint with stricter rate limiting
    location /api/auth/login {
        limit_req zone=login burst=5 nodelay;
        
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # File uploads
    location /api/uploads/ {
        client_max_body_size 50M;
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://localhost:3000;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }

    location ~ /(\.env|\.git|package\.json|node_modules) {
        deny all;
    }
}
EOF

    # Enable new site
    sudo ln -sf /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
    
    # Remove old site
    sudo rm -f /etc/nginx/sites-enabled/erp-new
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    sudo nginx -t
    
    # Reload Nginx
    sudo systemctl reload nginx
    
    log "Nginx configuration updated"
}

# Validate new system
validate_new_system() {
    log "Validating new system..."
    
    # Wait for services to be fully ready
    sleep 30
    
    # Test frontend
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        log "✅ Frontend test passed"
    else
        error "❌ Frontend test failed"
    fi
    
    # Test backend API
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        log "✅ Backend API test passed"
    else
        error "❌ Backend API test failed"
    fi
    
    # Test domain access
    if curl -f http://$DOMAIN > /dev/null 2>&1; then
        log "✅ Domain access test passed"
    else
        error "❌ Domain access test failed"
    fi
    
    # Test HTTPS (if SSL is configured)
    if curl -f https://$DOMAIN > /dev/null 2>&1; then
        log "✅ HTTPS test passed"
    else
        warning "⚠️ HTTPS test failed - SSL may not be configured yet"
    fi
    
    # Test database connectivity
    if sudo docker compose -f docker-compose.prod.yml exec -T db pg_isready -U aris_user -d aris_erp > /dev/null 2>&1; then
        log "✅ Database connectivity test passed"
    else
        error "❌ Database connectivity test failed"
    fi
    
    log "New system validation completed"
}

# Cleanup old system
cleanup_old_system() {
    log "Cleaning up old system..."
    
    # Stop parallel deployment
    cd $PROJECT_DIR
    sudo docker compose -f docker-compose.parallel.yml down 2>/dev/null || true
    
    # Remove parallel configuration
    sudo rm -f /etc/nginx/sites-enabled/erp-new
    
    # Clean up old application files (optional - commented out for safety)
    # if [ -d "/var/www/erp" ]; then
    #     sudo mv /var/www/erp /var/www/erp-old-$(date +%Y%m%d)
    # fi
    
    log "Old system cleanup completed"
}

# Post-migration setup
post_migration_setup() {
    log "Setting up post-migration tasks..."
    
    cd $PROJECT_DIR
    
    # Create backup script
    cat > backup.sh << 'EOF'
#!/bin/bash

# Backup script for ARIS ERP
BACKUP_DIR="/opt/aris-erp/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"

# Create backup
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U aris_user aris_erp > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

    chmod +x backup.sh
    
    # Setup cron job for daily backups
    (crontab -l 2>/dev/null; echo "0 2 * * * $PROJECT_DIR/backup.sh") | crontab -
    
    # Create health check script
    cat > health-check.sh << 'EOF'
#!/bin/bash

# Health check script for ARIS ERP
PROJECT_DIR="/opt/aris-erp"

cd $PROJECT_DIR

# Check if containers are running
if ! docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
    echo "Some containers are not running. Restarting..."
    docker compose -f docker-compose.prod.yml restart
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [[ $DISK_USAGE -gt 80 ]]; then
    echo "Disk usage is high: ${DISK_USAGE}%"
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if [[ $MEM_USAGE -gt 80 ]]; then
    echo "Memory usage is high: ${MEM_USAGE}%"
fi
EOF

    chmod +x health-check.sh
    
    # Setup cron job for health checks
    (crontab -l 2>/dev/null; echo "*/5 * * * * $PROJECT_DIR/health-check.sh") | crontab -
    
    log "Post-migration setup completed"
}

# Print completion message
print_completion() {
    log "ERP migration switch-over completed successfully!"
    echo ""
    echo "=== MIGRATION COMPLETED ==="
    echo "✅ New Docker-based ARIS ERP is now running"
    echo "✅ Old system has been stopped"
    echo "✅ All services are healthy"
    echo "✅ Domain is pointing to new system"
    echo ""
    echo "=== ACCESS INFORMATION ==="
    echo "🌐 Main System: https://$DOMAIN"
    echo "🔧 API: https://$DOMAIN/api"
    echo "📊 Health: https://$DOMAIN/health"
    echo ""
    echo "=== MANAGEMENT COMMANDS ==="
    echo "📋 View logs: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml logs -f"
    echo "🔄 Restart: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml restart"
    echo "🛑 Stop: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml down"
    echo "💾 Backup: cd $PROJECT_DIR && ./backup.sh"
    echo ""
    echo "=== ROLLBACK INFORMATION ==="
    echo "🔄 Rollback script: $ROLLBACK_FILE"
    echo "⚠️  To rollback: bash $ROLLBACK_FILE"
    echo ""
    echo "=== BACKUP LOCATION ==="
    echo "💾 Final backup: $BACKUP_DIR/final"
    echo "💾 Ongoing backups: $PROJECT_DIR/backups"
    echo ""
    echo "=== NEXT STEPS ==="
    echo "1. Monitor system performance for 24 hours"
    echo "2. Verify all user functionality"
    echo "3. Setup SSL certificate (if not already done)"
    echo "4. Configure email settings"
    echo "5. Train users on new features"
    echo "6. Decommission old system after 1 week"
    echo ""
    echo "🎉 Congratulations! Your ERP is now running on Docker! 🚀"
}

# Main function
main() {
    log "Starting ERP migration switch-over..."
    
    # Safety checks
    safety_checks
    
    # Create rollback script
    create_rollback
    
    # Create final backup
    create_final_backup
    
    # Stop old system
    stop_old_system
    
    # Switch to new system
    switch_to_new
    
    # Update Nginx
    update_nginx
    
    # Validate new system
    validate_new_system
    
    # Cleanup old system
    cleanup_old_system
    
    # Post-migration setup
    post_migration_setup
    
    # Print completion message
    print_completion
    
    log "ERP migration switch-over completed successfully!"
}

# Run main function
main "$@"
