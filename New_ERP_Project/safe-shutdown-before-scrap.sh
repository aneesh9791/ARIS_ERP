#!/bin/bash

# 🔒 Safe Shutdown Before Scraping
# Properly stops Docker containers before scraping

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
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
    echo -e "${BLUE}[HEADER]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Check Docker installation
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
}

# Navigate to aris-deploy9 directory
navigate_to_project() {
    print_header "Navigating to aris-deploy9 Directory"
    
    if [ -d "/root/aris-deploy9" ]; then
        cd /root/aris-deploy9
        print_status "Navigated to /root/aris-deploy9"
    else
        print_error "aris-deploy9 directory not found at /root/aris-deploy9"
        
        # Check other possible locations
        for dir in "/opt/aris-deploy9" "/home/aris-deploy9" "/var/www/aris-deploy9"; do
            if [ -d "$dir" ]; then
                cd "$dir"
                print_status "Found aris-deploy9 at $dir"
                return 0
            fi
        done
        
        print_error "aris-deploy9 directory not found anywhere"
        exit 1
    fi
}

# Show current status
show_current_status() {
    print_header "Current Docker Status"
    
    print_status "Checking running containers..."
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20
    
    print_status ""
    print_status "Checking volumes..."
    docker volume ls --format "table {{.Name}}\t{{.Driver}}" | head -10
    
    print_status ""
    print_status "Checking networks..."
    docker network ls --format "table {{.Name}}\t{{.Driver}}" | head -10
    
    print_status ""
    print_status "Checking resource usage..."
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUS}}\t{{.MemUsage}}" | head -10
}

# Backup important data (optional)
backup_data() {
    print_header "Backup Important Data"
    
    read -p "Do you want to backup database data before stopping? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Creating database backup..."
        
        # Create backup directory
        BACKUP_DIR="/root/aris-backup-$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        # Backup PostgreSQL database
        if docker ps --format "{{.Names}}" | grep -q "postgres"; then
            print_status "Backing up PostgreSQL database..."
            docker exec aris-erp-db pg_dump -U aris_user -d aris_erp > "$BACKUP_DIR/postgres_backup_$(date +%Y%m%d_%H%M%S).sql"
            print_status "PostgreSQL backup saved to $BACKUP_DIR/"
        fi
        
        # Backup Redis data
        if docker ps --format "{{.Names}}" | grep -q "redis"; then
            print_status "Backing up Redis data..."
            docker exec aris-erp-redis redis-cli BGSAVE
            docker cp aris-erp-redis:/data/dump.rdb "$BACKUP_DIR/redis_backup_$(date +%Y%m%d_%H%M%S).rdb"
            print_status "Redis backup saved to $BACKUP_DIR/"
        fi
        
        # Backup application files
        print_status "Backing up application files..."
        cp -r backend "$BACKUP_DIR/" 2>/dev/null || true
        cp -r frontend "$BACKUP_DIR/" 2>/dev/null || true
        cp -r nginx "$BACKUP_DIR/" 2>/dev/null || true
        cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true
        cp .env "$BACKUP_DIR/" 2>/dev/null || true
        
        print_status "Backup completed! Files saved to $BACKUP_DIR"
        print_warning "Remember to download these backup files to your local machine!"
    else
        print_status "Skipping backup (user choice)"
    fi
}

# Gracefully stop application services
stop_application_services() {
    print_header "Stopping Application Services"
    
    # Stop frontend first (no data loss)
    print_status "Stopping frontend service..."
    if docker ps --format "{{.Names}}" | grep -q "frontend"; then
        docker stop aris-erp-frontend 2>/dev/null || true
        print_status "Frontend service stopped"
    else
        print_status "Frontend service not running"
    fi
    
    # Stop backend (no data loss)
    print_status "Stopping backend service..."
    if docker ps --format "{{.Names}}" | grep -q "backend"; then
        docker stop aris-erp-backend 2>/dev/null || true
        print_status "Backend service stopped"
    else
        print_status "Backend service not running"
    fi
    
    # Stop nginx (no data loss)
    print_status "Stopping nginx service..."
    if docker ps --format "{{.Names}}" | grep -q "nginx"; then
        docker stop aris-erp-nginx 2>/dev/null || true
        print_status "Nginx service stopped"
    else
        print_status "Nginx service not running"
    fi
    
    print_status "Application services stopped gracefully!"
}

# Gracefully stop database services
stop_database_services() {
    print_header "Stopping Database Services"
    
    # Stop Redis (cache - no data loss)
    print_status "Stopping Redis service..."
    if docker ps --format "{{.Names}}" | grep -q "redis"; then
        # Save Redis data before stopping
        docker exec aris-erp-redis redis-cli BGSAVE 2>/dev/null || true
        sleep 2
        docker stop aris-erp-redis 2>/dev/null || true
        print_status "Redis service stopped (data saved)"
    else
        print_status "Redis service not running"
    fi
    
    # Stop PostgreSQL last (database - data preserved in volumes)
    print_status "Stopping PostgreSQL database..."
    if docker ps --format "{{.Names}}" | grep -q "postgres"; then
        # Gracefully stop PostgreSQL
        docker exec aris-erp-db pg_ctl -D /var/lib/postgresql/data -m fast 2>/dev/null || true
        sleep 3
        docker stop aris-erp-db 2>/dev/null || true
        print_status "PostgreSQL database stopped (data preserved in volumes)"
    else
        print_status "PostgreSQL database not running"
    fi
    
    print_status "Database services stopped gracefully!"
}

# Stop all remaining containers
stop_remaining_containers() {
    print_header "Stopping Remaining Containers"
    
    # Stop any remaining aris containers
    print_status "Stopping any remaining aris containers..."
    docker stop $(docker ps --filter "name=aris" -q) 2>/dev/null || true
    docker stop $(docker ps --filter "name=erp" -q) 2>/dev/null || true
    
    # Stop backup container
    print_status "Stopping backup container..."
    docker stop $(docker ps --filter "name=backup" -q) 2>/dev/null || true
    
    print_status "All remaining containers stopped!"
}

# Verify services are stopped
verify_services_stopped() {
    print_header "Verifying Services Are Stopped"
    
    local all_stopped=true
    
    # Check containers
    local running_containers=$(docker ps -q | wc -l)
    if [ "$running_containers" -gt 0 ]; then
        print_warning "Some containers are still running:"
        docker ps --format "table {{.Names}}\t{{.Status}}"
        all_stopped=false
    else
        print_status "✅ All containers are stopped"
    fi
    
    # Check aris-specific containers
    local aris_containers=$(docker ps -a --filter "name=aris" --filter "name=erp" -q | wc -l)
    if [ "$aris_containers" -gt 0 ]; then
        print_warning "Some aris containers are still stopped (but not running):"
        docker ps -a --filter "name=aris" --filter "name=erp" --format "table {{.Names}}\t{{.Status}}"
    else
        print_status "✅ No aris containers found"
    fi
    
    # Check ports
    local ports_in_use=$(netstat -tulpn 2>/dev/null | grep -E ":(80|443|3000|5000|5432|6379)" | wc -l)
    if [ "$ports_in_use" -gt 0 ]; then
        print_warning "Some ports are still in use:"
        netstat -tulpn 2>/dev/null | grep -E ":(80|443|3000|5000|5432|6379)"
        all_stopped=false
    else
        print_status "✅ All ports are free"
    fi
    
    if [[ $all_stopped == true ]]; then
        print_status "✅ All services are properly stopped!"
        return 0
    else
        print_warning "Some services may still be active"
        return 1
    fi
}

# Show final status
show_final_status() {
    print_header "Final Status After Shutdown"
    
    print_status "Container status:"
    docker ps -a --format "table {{.Names}}\t{{.Status}}"
    
    print_status ""
    print_status "Volume status:"
    docker volume ls --format "table {{.Name}}\t{{.Driver}}"
    
    print_status ""
    print_status "Network status:"
    docker network ls --format "table {{.Name}}\t{{.Driver}}"
    
    print_status ""
    print_status "Port usage:"
    netstat -tulpn 2>/dev/null | grep -E ":(80|443|3000|5000|5432|6379)" || echo "No relevant ports in use"
    
    print_status ""
    print_status "System resources:"
    df -h | grep -E "(Filesystem|/dev/)"
    free -h | head -2
}

# Main function
main() {
    print_header "🔒 Safe Shutdown Before Scraping"
    echo "This script will safely stop all Docker services before scraping."
    echo "It will properly shutdown applications and databases to prevent data loss."
    echo ""
    echo "📋 Process:"
    echo "1. Show current status"
    echo "2. Backup data (optional)"
    echo "3. Stop application services (frontend, backend, nginx)"
    echo "4. Stop database services (redis, postgres)"
    echo "5. Stop remaining containers"
    echo "6. Verify everything is stopped"
    echo ""
    
    read -p "Do you want to proceed with safe shutdown? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Safe shutdown cancelled by user"
        exit 0
    fi
    
    echo ""
    print_status "Starting safe shutdown process..."
    echo ""
    
    # Execute shutdown steps
    check_root
    check_docker
    navigate_to_project
    show_current_status
    backup_data
    stop_application_services
    stop_database_services
    stop_remaining_containers
    
    echo ""
    verify_services_stopped
    
    echo ""
    show_final_status
    
    echo ""
    print_header "🎉 Safe Shutdown Completed!"
    echo ""
    echo "✅ All services have been safely stopped!"
    echo "✅ Database data is preserved in Docker volumes"
    echo "✅ System is ready for scraping"
    echo ""
    echo "📋 Next steps:"
    echo "1. Run scraping script: ./scrap-docker-installation.sh"
    echo "2. Reboot system: reboot"
    echo "3. Deploy fresh installation: ./hostinger-deploy.sh"
    echo ""
    echo "🔒 Your data is safe in Docker volumes and will be preserved"
    echo "   unless you choose to remove volumes during scraping."
    echo ""
}

# Run main function
main "$@"
