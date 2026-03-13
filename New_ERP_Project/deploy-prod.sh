#!/bin/bash

# ARIS ERP Production Deployment Script
# This script deploys the ARIS ERP system to production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Configuration
APP_NAME="aris-erp"
APP_DIR="/opt/$APP_NAME"
BACKUP_DIR="/opt/backups/$APP_NAME"
NGINX_CONF="/etc/nginx/sites-available/$APP_NAME"
SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
DB_BACKUP_FILE="$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Backup current deployment
backup_deployment() {
    print_header "Creating backup of current deployment..."
    
    # Create backup directory
    mkdir -p $BACKUP_DIR
    
    # Backup application
    if [ -d "$APP_DIR" ]; then
        print_status "Backing up application..."
        cp -r $APP_DIR $BACKUP_DIR/app_backup_$(date +%Y%m%d_%H%M%S)
    fi
    
    # Backup database
    if command -v pg_dump &> /dev/null; then
        print_status "Backing up database..."
        pg_dump -h localhost -U postgres aris_erp > $DB_BACKUP_FILE
        print_status "Database backup created: $DB_BACKUP_FILE"
    else
        print_warning "pg_dump not found. Skipping database backup."
    fi
    
    # Backup nginx config
    if [ -f "$NGINX_CONF" ]; then
        print_status "Backing up nginx configuration..."
        cp $NGINX_CONF $BACKUP_DIR/nginx_backup_$(date +%Y%m%d_%H%M%S)
    fi
}

# Install system dependencies
install_dependencies() {
    print_header "Installing system dependencies..."
    
    # Update package list
    apt update
    
    # Install required packages
    apt install -y \
        curl \
        wget \
        gnupg2 \
        software-properties-common \
        build-essential \
        nginx \
        postgresql \
        postgresql-contrib \
        redis-server \
        certbot \
        python3-certbot-nginx \
        ufw
    
    # Install Node.js 18
    print_status "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Install PM2
    npm install -g pm2
    
    print_status "Dependencies installed successfully"
}

# Setup PostgreSQL
setup_postgresql() {
    print_header "Setting up PostgreSQL..."
    
    # Start and enable PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql
    
    # Create database and user
    sudo -u postgres psql -c "CREATE DATABASE aris_erp;" || print_warning "Database already exists"
    sudo -u postgres psql -c "CREATE USER aris_erp WITH PASSWORD 'secure_password_here';" || print_warning "User already exists"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE aris_erp TO aris_erp;"
    sudo -u postgres psql -c "ALTER USER aris_erp CREATEDB;"
    
    print_status "PostgreSQL setup completed"
}

# Setup Redis
setup_redis() {
    print_header "Setting up Redis..."
    
    # Configure Redis
    sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    
    # Start and enable Redis
    systemctl restart redis.service
    systemctl enable redis.service
    
    print_status "Redis setup completed"
}

# Setup application
setup_application() {
    print_header "Setting up application..."
    
    # Create application directory
    mkdir -p $APP_DIR
    chown $SUDO_USER:$SUDO_USER $APP_DIR
    
    # Copy application files
    print_status "Copying application files..."
    cp -r * $APP_DIR/
    chown -R $SUDO_USER:$SUDO_USER $APP_DIR
    
    # Install dependencies
    cd $APP_DIR
    print_status "Installing backend dependencies..."
    sudo -u $SUDO_USER npm ci --production
    
    print_status "Installing frontend dependencies..."
    sudo -u $SUDO_USER cd frontend && npm ci --production
    
    # Build frontend
    print_status "Building frontend..."
    sudo -u $SUDO_USER cd frontend && npm run build
    
    # Run database migrations
    print_status "Running database migrations..."
    sudo -u $SUDO_USER cd backend && npm run migrate
    
    print_status "Application setup completed"
}

# Setup environment
setup_environment() {
    print_header "Setting up environment..."
    
    # Create production environment file
    if [ ! -f "$APP_DIR/backend/.env" ]; then
        print_status "Creating production environment file..."
        sudo -u $SUDO_USER cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
        
        # Update environment variables
        sudo -u $SUDO_USER sed -i "s/NODE_ENV=development/NODE_ENV=production/" $APP_DIR/backend/.env
        sudo -u $SUDO_USER sed -i "s/PORT=5000/PORT=3000/" $APP_DIR/backend/.env
        sudo -u $SUDO_USER sed -i "s/DB_HOST=localhost/DB_HOST=localhost/" $APP_DIR/backend/.env
        sudo -u $SUDO_USER sed -i "s/DB_PASSWORD=password/DB_PASSWORD=secure_password_here/" $APP_DIR/backend/.env
        sudo -u $SUDO_USER sed -i "s/SESSION_SECRET=your-super-secret-session-key-change-in-production/SESSION_SECRET=$(openssl rand -base64 32)/" $APP_DIR/backend/.env
        sudo -u $SUDO_USER sed -i "s/JWT_SECRET=your-super-secret-jwt-key-change-in-production/JWT_SECRET=$(openssl rand -base64 32)/" $APP_DIR/backend/.env
        
        print_warning "Please update $APP_DIR/backend/.env with your production values"
    fi
    
    # Create frontend environment file
    if [ ! -f "$APP_DIR/frontend/.env" ]; then
        print_status "Creating frontend environment file..."
        sudo -u $SUDO_USER cat > $APP_DIR/frontend/.env << EOF
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_ENV=production
REACT_APP_VERSION=1.0.0
REACT_APP_TITLE=ARIS ERP - Kerala Diagnostic Centers
EOF
    fi
    
    print_status "Environment setup completed"
}

# Setup systemd service
setup_systemd() {
    print_header "Setting up systemd service..."
    
    cat > $SERVICE_FILE << EOF
[Unit]
Description=ARIS ERP Application
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$APP_DIR/backend
Environment=NODE_ENV=production
Environment=PATH=/usr/bin
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=aris-erp

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable $APP_NAME.service
    
    print_status "Systemd service setup completed"
}

# Setup Nginx
setup_nginx() {
    print_header "Setting up Nginx..."
    
    # Create Nginx configuration
    cat > $NGINX_CONF << EOF
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Frontend
    location / {
        root $APP_DIR/frontend/build;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static files
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API Documentation
    location /api-docs {
        proxy_pass http://localhost:3000/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # File uploads
    client_max_body_size 10M;
    
    # Logging
    access_log /var/log/nginx/aris_erp.access.log;
    error_log /var/log/nginx/aris_erp.error.log;
}
EOF
    
    # Enable site
    ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
    
    # Test and reload Nginx
    nginx -t && systemctl reload nginx
    
    print_status "Nginx setup completed"
}

# Setup SSL
setup_ssl() {
    print_header "Setting up SSL certificate..."
    
    # Get SSL certificate from Let's Encrypt
    certbot --nginx -d your-domain.com -d www.your-domain.com --non-interactive --agree-tos --email admin@your-domain.com
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    print_status "SSL certificate setup completed"
}

# Setup firewall
setup_firewall() {
    print_header "Setting up firewall..."
    
    # Configure UFW
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw --force enable
    
    print_status "Firewall setup completed"
}

# Start services
start_services() {
    print_header "Starting services..."
    
    # Start application
    systemctl start $APP_NAME.service
    
    # Start Nginx
    systemctl start nginx
    
    # Check service status
    sleep 5
    if systemctl is-active --quiet $APP_NAME.service; then
        print_status "Application service is running"
    else
        print_error "Application service failed to start"
        journalctl -u $APP_NAME.service --no-pager -l
        exit 1
    fi
    
    if systemctl is-active --quiet nginx; then
        print_status "Nginx is running"
    else
        print_error "Nginx failed to start"
        exit 1
    fi
    
    print_status "All services started successfully"
}

# Setup monitoring
setup_monitoring() {
    print_header "Setting up monitoring..."
    
    # Setup log rotation
    cat > /etc/logrotate.d/aris-erp << EOF
$APP_DIR/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $SUDO_USER $SUDO_USER
    postrotate
        systemctl reload $APP_NAME.service
    endscript
}
EOF
    
    # Setup PM2 monitoring (if available)
    if command -v pm2 &> /dev/null; then
        cd $APP_DIR/backend
        sudo -u $SUDO_USER pm2 start ecosystem.config.js --env production
        sudo -u $SUDO_USER pm2 save
        sudo -u $SUDO_USER pm2 startup
    fi
    
    print_status "Monitoring setup completed"
}

# Health check
health_check() {
    print_header "Performing health check..."
    
    # Check application
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        print_status "Application health check passed"
    else
        print_error "Application health check failed"
        exit 1
    fi
    
    # Check database
    if pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
        print_status "Database health check passed"
    else
        print_error "Database health check failed"
        exit 1
    fi
    
    # Check Redis
    if redis-cli ping > /dev/null 2>&1; then
        print_status "Redis health check passed"
    else
        print_error "Redis health check failed"
        exit 1
    fi
    
    print_status "All health checks passed"
}

# Main deployment function
deploy() {
    print_header "Starting ARIS ERP Production Deployment"
    echo "============================================"
    
    # Check prerequisites
    check_root
    
    # Backup current deployment
    backup_deployment
    
    # Setup system
    install_dependencies
    setup_postgresql
    setup_redis
    
    # Setup application
    setup_application
    setup_environment
    setup_systemd
    
    # Setup web server
    setup_nginx
    
    # Setup security
    setup_ssl
    setup_firewall
    
    # Start services
    start_services
    
    # Setup monitoring
    setup_monitoring
    
    # Health check
    health_check
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Application URL: https://your-domain.com"
    echo "API Documentation: https://your-domain.com/api-docs"
    echo "Health Check: https://your-domain.com/api/health"
    echo ""
    echo "Useful commands:"
    echo "- Check service status: systemctl status $APP_NAME"
    echo "- View logs: journalctl -u $APP_NAME.service -f"
    echo "- Restart service: systemctl restart $APP_NAME"
    echo "- Update application: cd $APP_DIR && git pull && npm ci && systemctl restart $APP_NAME"
    echo ""
    echo "Important files:"
    echo "- Application: $APP_DIR"
    echo "- Environment: $APP_DIR/backend/.env"
    echo "- Nginx config: $NGINX_CONF"
    echo "- Service file: $SERVICE_FILE"
    echo "- Backups: $BACKUP_DIR"
    echo ""
    echo "🔧 Don't forget to:"
    echo "1. Update your-domain.com in nginx configuration"
    echo "2. Update SSL certificate email"
    echo "3. Update database password in .env file"
    echo "4. Configure backup strategy"
    echo "5. Set up monitoring alerts"
}

# Run deployment
deploy
