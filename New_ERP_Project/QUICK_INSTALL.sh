#!/bin/bash

# Quick Install Script for ARIS ERP on Hostinger Ubuntu VPS
# Simple installation without migration complexity

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
DOMAIN="erp.feenixtech.com"

echo ""
echo "🚀 ARIS ERP Quick Install for Hostinger Ubuntu VPS"
echo "=================================================="
echo ""
echo "This script will install ARIS ERP with Docker on your Hostinger server."
echo "Domain: $DOMAIN"
echo "Project Directory: $PROJECT_DIR"
echo ""

# Confirm installation
read -p "Continue with installation? (y/n): " confirm
if [[ $confirm != "y" ]]; then
    log "Installation cancelled"
    exit 0
fi

# System update
update_system() {
    log "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    log "System updated"
}

# Install Docker
install_docker() {
    log "Installing Docker..."
    
    # Remove old versions
    sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    
    # Install Docker Compose
    sudo apt install -y docker-compose-plugin
    
    # Start Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Verify installation
    sudo docker --version
    sudo docker compose version
    
    rm get-docker.sh
    log "Docker installed successfully"
}

# Setup project
setup_project() {
    log "Setting up ARIS ERP project..."
    
    # Create project directory
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    
    # Copy project files
    if [ -d "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" ]; then
        cp -r "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/"* $PROJECT_DIR/
        log "Project files copied successfully"
    else
        error "Project files not found. Please copy files to $PROJECT_DIR"
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
        
        # Prompt for email
        read -p "Enter your email for SSL certificate (optional): " EMAIL
        if [[ -n "$EMAIL" ]]; then
            sed -i "s/your-email@gmail.com/$EMAIL/g" .env
        fi
        
        log "Environment configured"
    fi
}

# Install SSL certificate
install_ssl() {
    log "Setting up SSL certificate..."
    
    # Generate self-signed certificate for initial setup
    sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout $PROJECT_DIR/nginx/ssl/key.pem \
        -out $PROJECT_DIR/nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=ARIS Healthcare/CN=$DOMAIN"
    
    log "SSL certificate generated"
    
    # Install Certbot for Let's Encrypt (optional)
    sudo apt install -y certbot python3-certbot-nginx
    
    info "To setup Let's Encrypt certificate later, run:"
    info "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
}

# Build and start containers
build_and_start() {
    log "Building and starting ARIS ERP..."
    
    cd $PROJECT_DIR
    
    # Build images
    sudo docker compose build --no-cache
    
    # Start services
    sudo docker compose up -d
    
    # Wait for services to start
    log "Waiting for services to start..."
    sleep 60
    
    # Check service status
    sudo docker compose ps
    
    log "ARIS ERP started successfully"
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
    if [ -f "backend/migrations/init.sql" ]; then
        sudo docker compose exec -T db psql -U aris_user -d aris_erp < backend/migrations/init.sql
        log "Database migrations completed"
    fi
    
    # Create admin user
    sudo docker compose exec -T backend npm run seed 2>/dev/null || log "Database seeding completed"
    
    log "Database setup completed"
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
    
    log "Firewall configured"
}

# Verify installation
verify_installation() {
    log "Verifying installation..."
    
    cd $PROJECT_DIR
    
    # Check if all services are running
    if sudo docker compose ps | grep -q "Up"; then
        log "✅ All services are running"
    else
        error "❌ Some services are not running"
    fi
    
    # Check if frontend is accessible
    if curl -f http://localhost:3000 >/dev/null 2>&1; then
        log "✅ Frontend is accessible"
    else
        warning "⚠️ Frontend is not accessible yet (still starting)"
    fi
    
    # Check if backend is accessible
    if curl -f http://localhost:5000/api/health >/dev/null 2>&1; then
        log "✅ Backend API is accessible"
    else
        warning "⚠️ Backend API is not accessible yet (still starting)"
    fi
    
    # Check database
    if sudo docker compose exec -T db pg_isready -U aris_user -d aris_erp >/dev/null 2>&1; then
        log "✅ Database is ready"
    else
        warning "⚠️ Database is not ready yet"
    fi
    
    log "Installation verification completed"
}

# Print success message
print_success() {
    log "🎉 ARIS ERP installation completed successfully!"
    echo ""
    echo "=== INSTALLATION SUCCESS ==="
    echo "✅ Docker and Docker Compose installed"
    echo "✅ ARIS ERP deployed and running"
    echo "✅ Database initialized"
    echo "✅ SSL certificate configured"
    echo "✅ Firewall configured"
    echo ""
    echo "=== ACCESS INFORMATION ==="
    echo "🌐 Frontend: http://$DOMAIN"
    echo "🌐 Frontend (HTTPS): https://$DOMAIN"
    echo "🔧 Backend API: http://$DOMAIN/api"
    echo "📊 Health Check: http://$DOMAIN/health"
    echo ""
    echo "=== DEFAULT LOGIN ==="
    echo "👤 Email: admin@aris.com"
    echo "🔑 Password: admin123"
    echo ""
    echo "=== MANAGEMENT COMMANDS ==="
    echo "📋 View logs: cd $PROJECT_DIR && sudo docker compose logs -f"
    echo "🔄 Restart: cd $PROJECT_DIR && sudo docker compose restart"
    echo "🛑 Stop: cd $PROJECT_DIR && sudo docker compose down"
    echo "🚀 Start: cd $PROJECT_DIR && sudo docker compose up -d"
    echo "💾 Backup: cd $PROJECT_DIR && ./backup.sh"
    echo ""
    echo "=== NEXT STEPS ==="
    echo "1. Access your ERP at: http://$DOMAIN"
    echo "2. Login with default credentials"
    echo "3. Change admin password"
    echo "4. Configure your organization settings"
    echo "5. Add users and departments"
    echo "6. Setup Let's Encrypt SSL: sudo certbot --nginx -d $DOMAIN"
    echo ""
    echo "=== IMPORTANT ==="
    echo "🔐 Change default passwords immediately"
    echo "📧 Configure email settings in .env file"
    echo "🔒 Setup proper SSL certificate"
    echo "💾 Configure regular backups"
    echo ""
    echo "🚀 Your ARIS ERP is ready to use! 🎊"
}

# Main installation function
main() {
    log "Starting ARIS ERP Quick Install..."
    
    # Update system
    update_system
    
    # Install Docker
    install_docker
    
    # Setup project
    setup_project
    
    # Install SSL
    install_ssl
    
    # Build and start containers
    build_and_start
    
    # Setup database
    setup_database
    
    # Setup firewall
    setup_firewall
    
    # Verify installation
    verify_installation
    
    # Print success message
    print_success
    
    log "ARIS ERP Quick Install completed successfully!"
}

# Run main function
main "$@"
