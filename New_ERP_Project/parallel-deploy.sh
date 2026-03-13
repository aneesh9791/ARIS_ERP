#!/bin/bash

# Parallel Deployment Script for ERP Migration
# Deploys new Docker-based ERP alongside existing ERP v3

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
NEW_DOMAIN="new.erp.feenixtech.com"

# Check if running on correct server
check_server() {
    log "Checking server configuration..."
    
    # Check if domain resolves to this server
    if ! host $DOMAIN > /dev/null 2>&1; then
        warning "Domain $DOMAIN does not resolve. This is expected for initial setup."
    fi
    
    # Check if existing ERP is running
    if curl -f http://localhost:80 > /dev/null 2>&1; then
        log "Existing ERP detected running on port 80"
    else
        warning "Existing ERP not detected on port 80"
    fi
    
    # Check available ports
    if netstat -tuln | grep -q ":3000 "; then
        error "Port 3000 is already in use"
    fi
    
    if netstat -tuln | grep -q ":5000 "; then
        error "Port 5000 is already in use"
    fi
    
    log "Server configuration check passed"
}

# Backup existing system
backup_existing() {
    log "Creating backup of existing system..."
    
    mkdir -p $BACKUP_DIR
    cd $BACKUP_DIR
    
    # Backup database (adjust based on your actual setup)
    info "Backing up database..."
    if command -v pg_dump > /dev/null 2>&1; then
        pg_dump -h localhost -U erp_user erp_database > erp_database_backup.sql 2>/dev/null || \
        pg_dump -h localhost -U postgres erp_database > erp_database_backup.sql 2>/dev/null || \
        warning "Could not backup database - please check database credentials"
    fi
    
    # Backup application files
    info "Backing up application files..."
    if [ -d "/var/www/erp" ]; then
        tar -czf erp_application_backup.tar.gz /var/www/erp/ 2>/dev/null || \
        tar -czf erp_application_backup.tar.gz /var/www/html/ 2>/dev/null || \
        warning "Could not backup application files"
    fi
    
    # Backup Nginx configuration
    info "Backing up Nginx configuration..."
    if [ -d "/etc/nginx/sites-available" ]; then
        cp -r /etc/nginx/sites-available/erp* ./ 2>/dev/null || true
        cp -r /etc/nginx/sites-enabled/erp* ./ 2>/dev/null || true
    fi
    
    # Backup SSL certificates
    info "Backing up SSL certificates..."
    if [ -d "/etc/ssl/certs" ]; then
        cp -r /etc/ssl/certs/erp* ./ 2>/dev/null || true
    fi
    
    log "Backup completed: $BACKUP_DIR"
}

# Setup Docker environment
setup_docker() {
    log "Setting up Docker environment..."
    
    # Check if Docker is installed
    if ! command -v docker > /dev/null 2>&1; then
        log "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker compose > /dev/null 2>&1; then
        log "Installing Docker Compose..."
        sudo apt update
        sudo apt install -y docker-compose-plugin
    fi
    
    log "Docker environment setup completed"
}

# Clone and setup new project
setup_project() {
    log "Setting up new ARIS ERP project..."
    
    # Create project directory
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    
    # Copy project files from current location
    if [ -d "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" ]; then
        cp -r "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/"* $PROJECT_DIR/
        log "Project files copied from local directory"
    else
        # Clone from Git repository (replace with your actual repository)
        if [ -n "$GIT_REPO_URL" ]; then
            git clone $GIT_REPO_URL $PROJECT_DIR
            log "Project cloned from repository"
        else
            error "Project files not found. Please copy project files to $PROJECT_DIR"
        fi
    fi
    
    cd $PROJECT_DIR
    
    # Create necessary directories
    mkdir -p nginx/ssl nginx/logs backend/logs backend/uploads backups
    
    # Setup environment file
    if [ ! -f ".env" ]; then
        cp .env.example .env
        
        # Generate secure passwords
        DB_PASSWORD=$(openssl rand -base64 32)
        REDIS_PASSWORD=$(openssl rand -base64 32)
        JWT_SECRET=$(openssl rand -base64 64)
        JWT_REFRESH_SECRET=$(openssl rand -base64 64)
        
        # Update .env file
        sed -i "s/your_secure_password_change_this/$DB_PASSWORD/g" .env
        sed -i "s/your_redis_password_change_this/$REDIS_PASSWORD/g" .env
        sed -i "s/your-super-secret-jwt-key-change-this-in-production-min-32-chars/$JWT_SECRET/g" .env
        sed -i "s/your-super-secret-refresh-key-change-this-in-production-min-32-chars/$JWT_REFRESH_SECRET/g" .env
        sed -i "s/your-domain.com/$DOMAIN/g" .env
        
        log "Environment file configured"
    fi
    
    log "Project setup completed"
}

# Configure parallel deployment
configure_parallel() {
    log "Configuring parallel deployment..."
    
    cd $PROJECT_DIR
    
    # Create parallel docker-compose file
    cat > docker-compose.parallel.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database (different port)
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: aris_erp
      POSTGRES_USER: aris_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data_parallel:/var/lib/postgresql/data
      - ./backend/migrations:/docker-entrypoint-initdb.d
    ports:
      - "5433:5432"  # Different port
    networks:
      - aris-network-parallel
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aris_user -d aris_erp"]
      interval: 30s
      timeout: 10s
      retries: 5

  # Redis (different port)
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data_parallel:/data
    ports:
      - "6380:6379"  # Different port
    networks:
      - aris-network-parallel
    restart: unless-stopped

  # Backend API (different port)
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
      - "5001:5000"  # Different port
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - aris-network-parallel
    volumes:
      - ./backend/logs:/app/logs
      - ./backend/uploads:/app/uploads
    restart: unless-stopped

  # Frontend (different port)
  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_API_URL=http://$NEW_DOMAIN:5001
        - REACT_APP_ENV=production
    ports:
      - "3001:3000"  # Different port
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - aris-network-parallel
    restart: unless-stopped

volumes:
  postgres_data_parallel:
    driver: local
  redis_data_parallel:
    driver: local

networks:
  aris-network-parallel:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/16
EOF

    log "Parallel deployment configured"
}

# Deploy new system in parallel
deploy_parallel() {
    log "Deploying new ERP system in parallel..."
    
    cd $PROJECT_DIR
    
    # Build and start parallel deployment
    sudo docker compose -f docker-compose.parallel.yml build --no-cache
    sudo docker compose -f docker-compose.parallel.yml up -d
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 60
    
    # Check service status
    sudo docker compose -f docker-compose.parallel.yml ps
    
    # Health checks
    if curl -f http://localhost:3001 > /dev/null 2>&1; then
        log "Frontend is accessible on port 3001"
    else
        error "Frontend is not accessible on port 3001"
    fi
    
    if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
        log "Backend API is accessible on port 5001"
    else
        error "Backend API is not accessible on port 5001"
    fi
    
    log "Parallel deployment completed"
}

# Configure Nginx for parallel access
configure_nginx() {
    log "Configuring Nginx for parallel access..."
    
    # Create Nginx configuration for new system
    sudo tee /etc/nginx/sites-available/erp-new << EOF
server {
    listen 80;
    server_name $NEW_DOMAIN;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API routes
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Error pages
    error_page 404 /index.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
EOF

    # Enable new site
    sudo ln -sf /etc/nginx/sites-available/erp-new /etc/nginx/sites-enabled/
    
    # Test Nginx configuration
    sudo nginx -t
    
    # Reload Nginx
    sudo systemctl reload nginx
    
    log "Nginx configuration completed"
}

# Test parallel deployment
test_parallel() {
    log "Testing parallel deployment..."
    
    # Test frontend
    if curl -f http://localhost:3001 > /dev/null 2>&1; then
        log "✅ Frontend test passed"
    else
        error "❌ Frontend test failed"
    fi
    
    # Test backend API
    if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
        log "✅ Backend API test passed"
    else
        error "❌ Backend API test failed"
    fi
    
    # Test domain access (if DNS is configured)
    if host $NEW_DOMAIN > /dev/null 2>&1; then
        if curl -f http://$NEW_DOMAIN > /dev/null 2>&1; then
            log "✅ Domain access test passed"
        else
            error "❌ Domain access test failed"
        fi
    else
        warning "⚠️ DNS not configured for $NEW_DOMAIN - skipping domain test"
    fi
    
    log "Parallel deployment tests completed"
}

# Data migration setup
setup_migration() {
    log "Setting up data migration..."
    
    cd $PROJECT_DIR
    
    # Create migration script
    cat > migrate-data.sh << 'EOF'
#!/bin/bash

# Data migration script
OLD_DB_HOST="localhost"
OLD_DB_USER="erp_user"
OLD_DB_NAME="erp_database"
OLD_DB_PASSWORD="old_password"

NEW_DB_HOST="localhost"
NEW_DB_USER="aris_user"
NEW_DB_NAME="aris_erp"
NEW_DB_PASSWORD=$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)

echo "Starting data migration..."

# Export old data
if command -v pg_dump > /dev/null 2>&1; then
    echo "Exporting data from old database..."
    pg_dump -h $OLD_DB_HOST -U $OLD_DB_USER $OLD_DB_NAME > old_data.sql
else
    echo "pg_dump not found. Please export data manually."
    exit 1
fi

# Import to new database
echo "Importing data to new database..."
docker compose -f docker-compose.parallel.yml exec -T db psql -U $NEW_DB_USER -d $NEW_DB_NAME < old_data.sql

# Validate data
echo "Validating data migration..."
docker compose -f docker-compose.parallel.yml exec db psql -U $NEW_DB_USER -d $NEW_DB_NAME -c "
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_patients FROM patients;
SELECT COUNT(*) as total_appointments FROM appointments;
"

echo "Data migration completed!"
EOF

    chmod +x migrate-data.sh
    
    log "Data migration setup completed"
}

# Print next steps
print_next_steps() {
    log "Parallel deployment completed successfully!"
    echo ""
    echo "=== NEXT STEPS ==="
    echo "1. Test new system at: http://$NEW_DOMAIN"
    echo "2. Run data migration: cd $PROJECT_DIR && ./migrate-data.sh"
    echo "3. Validate all functionality works correctly"
    echo "4. Schedule switch-over when ready"
    echo "5. Use switch-over script: cd $PROJECT_DIR && ./switch-over.sh"
    echo ""
    echo "=== ACCESS URLS ==="
    echo "Old ERP: http://$DOMAIN"
    echo "New ERP: http://$NEW_DOMAIN"
    echo ""
    echo "=== USEFUL COMMANDS ==="
    echo "View parallel logs: cd $PROJECT_DIR && docker compose -f docker-compose.parallel.yml logs -f"
    echo "Stop parallel: cd $PROJECT_DIR && docker compose -f docker-compose.parallel.yml down"
    echo "Restart parallel: cd $PROJECT_DIR && docker compose -f docker-compose.parallel.yml restart"
    echo ""
    echo "=== BACKUP LOCATION ==="
    echo "Backup files: $BACKUP_DIR"
    echo ""
}

# Main function
main() {
    log "Starting parallel ERP deployment..."
    
    # Check prerequisites
    check_server
    
    # Backup existing system
    backup_existing
    
    # Setup Docker environment
    setup_docker
    
    # Setup new project
    setup_project
    
    # Configure parallel deployment
    configure_parallel
    
    # Deploy new system in parallel
    deploy_parallel
    
    # Configure Nginx
    configure_nginx
    
    # Test deployment
    test_parallel
    
    # Setup data migration
    setup_migration
    
    # Print next steps
    print_next_steps
    
    log "Parallel deployment completed successfully!"
}

# Run main function
main "$@"
