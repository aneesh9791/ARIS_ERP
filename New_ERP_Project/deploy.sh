#!/bin/bash

# ARIS ERP Deployment Script for Hostinger Ubuntu VPS KVM2
# This script automates the deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if running on Ubuntu
check_system() {
    log "Checking system requirements..."
    
    if [[ ! -f /etc/os-release ]]; then
        error "Cannot detect operating system"
    fi
    
    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        error "This script is designed for Ubuntu systems"
    fi
    
    log "System: $PRETTY_NAME"
    
    # Check if user has sudo privileges
    if ! sudo -n true 2>/dev/null; then
        error "This script requires sudo privileges"
    fi
    
    # Check available disk space (minimum 10GB)
    available_space=$(df / | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 10485760 ]]; then
        error "Insufficient disk space. Minimum 10GB required"
    fi
    
    log "System requirements passed"
}

# Update system packages
update_system() {
    log "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    log "System packages updated"
}

# Install Docker and Docker Compose
install_docker() {
    log "Installing Docker and Docker Compose..."
    
    # Remove old versions
    sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install Docker
    sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Set up the stable repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    
    # Verify Docker installation
    sudo docker --version
    sudo docker compose version
    
    log "Docker and Docker Compose installed successfully"
}

# Install additional tools
install_tools() {
    log "Installing additional tools..."
    
    sudo apt install -y git curl wget unzip htop certbot python3-certbot-nginx
    
    log "Additional tools installed"
}

# Create project directory
setup_project() {
    log "Setting up project directory..."
    
    PROJECT_DIR="/opt/aris-erp"
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    
    if [[ -d "$PROJECT_DIR" ]]; then
        cd $PROJECT_DIR
        log "Project directory created: $PROJECT_DIR"
    else
        error "Failed to create project directory"
    fi
}

# Clone or update project files
setup_files() {
    log "Setting up project files..."
    
    # Copy files from current location if they exist
    if [[ -f "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/docker-compose.yml" ]]; then
        cp -r "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/"* $PROJECT_DIR/
        log "Project files copied from local directory"
    else
        # Clone from Git repository (replace with your actual repository)
        if [[ -z "$GIT_REPO_URL" ]]; then
            warning "GIT_REPO_URL not set. Please copy project files manually to $PROJECT_DIR"
            read -p "Press Enter to continue after copying files..."
        else
            git clone $GIT_REPO_URL $PROJECT_DIR
            log "Project cloned from repository"
        fi
    fi
    
    # Create necessary directories
    mkdir -p $PROJECT_DIR/{nginx/ssl,nginx/logs,backend/logs,backend/uploads,backups}
    
    # Set permissions
    chmod +x $PROJECT_DIR/deploy.sh
    
    log "Project files setup completed"
}

# Setup environment variables
setup_environment() {
    log "Setting up environment variables..."
    
    if [[ ! -f "$PROJECT_DIR/.env" ]]; then
        cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env
        
        # Generate secure passwords
        DB_PASSWORD=$(openssl rand -base64 32)
        REDIS_PASSWORD=$(openssl rand -base64 32)
        JWT_SECRET=$(openssl rand -base64 64)
        JWT_REFRESH_SECRET=$(openssl rand -base64 64)
        
        # Update .env file with secure values
        sed -i "s/your_secure_password_change_this/$DB_PASSWORD/g" $PROJECT_DIR/.env
        sed -i "s/your_redis_password_change_this/$REDIS_PASSWORD/g" $PROJECT_DIR/.env
        sed -i "s/your-super-secret-jwt-key-change-this-in-production-min-32-chars/$JWT_SECRET/g" $PROJECT_DIR/.env
        sed -i "s/your-super-secret-refresh-key-change-this-in-production-min-32-chars/$JWT_REFRESH_SECRET/g" $PROJECT_DIR/.env
        
        # Prompt for domain name
        read -p "Enter your domain name (e.g., your-domain.com): " DOMAIN_NAME
        if [[ -n "$DOMAIN_NAME" ]]; then
            sed -i "s/your-domain.com/$DOMAIN_NAME/g" $PROJECT_DIR/.env
            sed -i "s/your-domain.com/$DOMAIN_NAME/g" $PROJECT_DIR/nginx/nginx.conf
        fi
        
        # Prompt for email for SSL
        read -p "Enter your email for SSL certificate: " EMAIL
        if [[ -n "$EMAIL" ]]; then
            sed -i "s/your-email@gmail.com/$EMAIL/g" $PROJECT_DIR/.env
        fi
        
        log "Environment variables configured"
    else
        log "Environment file already exists"
    fi
}

# Setup SSL certificate
setup_ssl() {
    log "Setting up SSL certificate..."
    
    # Extract domain from .env file
    DOMAIN=$(grep "DOMAIN_NAME=" $PROJECT_DIR/.env | cut -d '=' -f2)
    EMAIL=$(grep "EMAIL_USER=" $PROJECT_DIR/.env | cut -d '=' -f2)
    
    if [[ -z "$DOMAIN" || "$DOMAIN" == "your-domain.com" ]]; then
        warning "Domain not properly configured. Skipping SSL setup."
        return
    fi
    
    # Generate self-signed certificate for initial setup
    if [[ ! -f "$PROJECT_DIR/nginx/ssl/cert.pem" ]]; then
        sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout $PROJECT_DIR/nginx/ssl/key.pem \
            -out $PROJECT_DIR/nginx/ssl/cert.pem \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
        
        log "Self-signed SSL certificate generated"
    fi
    
    # Setup Let's Encrypt (optional)
    if [[ -n "$EMAIL" ]]; then
        info "To setup Let's Encrypt certificate, run:"
        info "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --no-eff-email"
    fi
}

# Build and start containers
build_and_start() {
    log "Building and starting Docker containers..."
    
    cd $PROJECT_DIR
    
    # Build images
    sudo docker compose build --no-cache
    
    # Start services
    sudo docker compose up -d
    
    # Wait for services to be ready
    log "Waiting for services to start..."
    sleep 30
    
    # Check service status
    sudo docker compose ps
    
    log "Docker containers started"
}

# Setup database
setup_database() {
    log "Setting up database..."
    
    cd $PROJECT_DIR
    
    # Wait for database to be ready
    until sudo docker compose exec -T db pg_isready -U aris_user -d aris_erp; do
        info "Waiting for database to be ready..."
        sleep 5
    done
    
    # Run migrations
    if [[ -f "$PROJECT_DIR/backend/migrations/init.sql" ]]; then
        sudo docker compose exec -T db psql -U aris_user -d aris_erp < $PROJECT_DIR/backend/migrations/init.sql
        log "Database migrations completed"
    fi
    
    # Create default admin user
    sudo docker compose exec -T backend npm run seed || warning "Database seeding failed or not available"
    
    log "Database setup completed"
}

# Setup backup script
setup_backup() {
    log "Setting up backup script..."
    
    BACKUP_SCRIPT="$PROJECT_DIR/backup.sh"
    cat > $BACKUP_SCRIPT << 'EOF'
#!/bin/bash

# Backup script for ARIS ERP
BACKUP_DIR="/opt/aris-erp/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"

# Create backup
docker compose exec -T db pg_dump -U aris_user aris_erp > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF
    
    chmod +x $BACKUP_SCRIPT
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT") | crontab -
    
    log "Backup script setup completed"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up basic monitoring..."
    
    # Create health check script
    HEALTH_SCRIPT="$PROJECT_DIR/health-check.sh"
    cat > $HEALTH_SCRIPT << 'EOF'
#!/bin/bash

# Health check script for ARIS ERP
PROJECT_DIR="/opt/aris-erp"

cd $PROJECT_DIR

# Check if containers are running
if ! docker compose ps | grep -q "Up"; then
    echo "Some containers are not running. Restarting..."
    docker compose restart
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
    
    chmod +x $HEALTH_SCRIPT
    
    # Add to crontab for every 5 minutes
    (crontab -l 2>/dev/null; echo "*/5 * * * * $HEALTH_SCRIPT") | crontab -
    
    log "Monitoring setup completed"
}

# Setup firewall
setup_firewall() {
    log "Setting up firewall..."
    
    # Allow SSH, HTTP, and HTTPS
    sudo ufw allow ssh
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    # Enable firewall
    sudo ufw --force enable
    
    log "Firewall setup completed"
}

# Final verification
verify_deployment() {
    log "Verifying deployment..."
    
    cd $PROJECT_DIR
    
    # Check if all services are running
    if sudo docker compose ps | grep -q "Up"; then
        log "All services are running"
    else
        error "Some services are not running"
    fi
    
    # Check if frontend is accessible
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        log "Frontend is accessible"
    else
        warning "Frontend is not accessible"
    fi
    
    # Check if backend is accessible
    if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
        log "Backend is accessible"
    else
        warning "Backend is not accessible"
    fi
    
    log "Deployment verification completed"
}

# Print deployment information
print_info() {
    log "Deployment completed successfully!"
    echo ""
    echo "=== DEPLOYMENT INFORMATION ==="
    echo "Project Directory: $PROJECT_DIR"
    echo "Frontend URL: http://localhost:3000"
    echo "Backend URL: http://localhost:5000"
    echo "Database: localhost:5432"
    echo "Redis: localhost:6379"
    echo ""
    echo "=== USEFUL COMMANDS ==="
    echo "View logs: cd $PROJECT_DIR && docker compose logs -f"
    echo "Stop services: cd $PROJECT_DIR && docker compose down"
    echo "Start services: cd $PROJECT_DIR && docker compose up -d"
    echo "Restart services: cd $PROJECT_DIR && docker compose restart"
    echo "Update services: cd $PROJECT_DIR && docker compose pull && docker compose up -d"
    echo ""
    echo "=== BACKUP ==="
    echo "Manual backup: cd $PROJECT_DIR && ./backup.sh"
    echo "Backup location: $PROJECT_DIR/backups"
    echo ""
    echo "=== SSL SETUP ==="
    echo "For production SSL, run:"
    echo "sudo certbot --nginx -d your-domain.com -d www.your-domain.com"
    echo ""
    echo "=== NEXT STEPS ==="
    echo "1. Configure your domain name to point to this server"
    echo "2. Setup SSL certificate with Let's Encrypt"
    echo "3. Update your domain name in .env file"
    echo "4. Restart services: cd $PROJECT_DIR && docker compose restart"
    echo ""
}

# Main deployment function
main() {
    log "Starting ARIS ERP deployment..."
    
    # Check if running as root for system operations
    if [[ $EUID -eq 0 ]]; then
        error "Please run this script as a regular user with sudo privileges"
    fi
    
    # Run deployment steps
    check_system
    update_system
    install_docker
    install_tools
    setup_project
    setup_files
    setup_environment
    setup_ssl
    build_and_start
    setup_database
    setup_backup
    setup_monitoring
    setup_firewall
    verify_deployment
    print_info
    
    log "Deployment completed successfully!"
}

# Run main function
main "$@"
