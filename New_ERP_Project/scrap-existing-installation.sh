#!/bin/bash

# 🗑️ Scrap Existing Installation Script
# Completely removes aris-deploy9 installation and prepares for clean deployment

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

# Stop running services
stop_services() {
    print_header "Stopping Running Services"
    
    # Stop Docker containers if any
    if command -v docker &> /dev/null; then
        print_status "Stopping Docker containers..."
        docker stop $(docker ps -q) 2>/dev/null || true
        docker rm $(docker ps -aq) 2>/dev/null || true
        docker system prune -f 2>/dev/null || true
    fi
    
    # Stop Node.js processes
    print_status "Stopping Node.js processes..."
    pkill -f "node" 2>/dev/null || true
    pkill -f "npm" 2>/dev/null || true
    pkill -f "yarn" 2>/dev/null || true
    
    # Stop Nginx
    print_status "Stopping Nginx..."
    systemctl stop nginx 2>/dev/null || true
    systemctl disable nginx 2>/dev/null || true
    
    # Stop PostgreSQL
    print_status "Stopping PostgreSQL..."
    systemctl stop postgresql 2>/dev/null || true
    systemctl disable postgresql 2>/dev/null || true
    
    # Stop Redis
    print_status "Stopping Redis..."
    systemctl stop redis-server 2>/dev/null || true
    systemctl disable redis-server 2>/dev/null || true
    
    print_status "Services stopped successfully!"
}

# Remove aris-deploy9 directory
remove_aris_deploy() {
    print_header "Removing aris-deploy9 Directory"
    
    if [ -d "/root/aris-deploy9" ]; then
        print_status "Removing /root/aris-deploy9 directory..."
        rm -rf /root/aris-deploy9
        print_status "aris-deploy9 directory removed!"
    else
        print_warning "aris-deploy9 directory not found"
    fi
    
    # Also check in other common locations
    for dir in "/opt/aris-deploy9" "/home/aris-deploy9" "/var/www/aris-deploy9"; do
        if [ -d "$dir" ]; then
            print_status "Removing $dir directory..."
            rm -rf "$dir"
        fi
    done
}

# Remove Docker containers and images
remove_docker() {
    print_header "Removing Docker Containers and Images"
    
    if command -v docker &> /dev/null; then
        print_status "Removing all Docker containers..."
        docker rm -f $(docker ps -aq) 2>/dev/null || true
        
        print_status "Removing all Docker images..."
        docker rmi -f $(docker images -q) 2>/dev/null || true
        
        print_status "Removing Docker volumes..."
        docker volume rm $(docker volume ls -q) 2>/dev/null || true
        
        print_status "Removing Docker networks..."
        docker network rm $(docker network ls -q) 2>/dev/null || true
        
        print_status "Cleaning Docker system..."
        docker system prune -af --volumes 2>/dev/null || true
        
        print_status "Docker cleanup completed!"
    else
        print_warning "Docker not found, skipping Docker cleanup"
    fi
}

# Remove Node.js and npm
remove_nodejs() {
    print_header "Removing Node.js and npm"
    
    # Remove Node.js packages
    apt remove -y nodejs npm 2>/dev/null || true
    apt purge -y nodejs npm 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # Remove Node.js from source
    rm -rf /usr/local/bin/node 2>/dev/null || true
    rm -rf /usr/local/bin/npm 2>/dev/null || true
    rm -rf /usr/local/lib/node_modules 2>/dev/null || true
    rm -rf /usr/local/include/node 2>/dev/null || true
    rm -rf /usr/local/share/man/man1/node.1 2>/dev/null || true
    rm -rf /usr/local/share/man/man1/npm.1 2>/dev/null || true
    
    # Remove NodeSource repository
    rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/nodesource.list.save 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/nodesource.list.distro 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/nodesource.list.distro.save 2>/dev/null || true
    rm -f /usr/share/keyrings/nodesource.gpg 2>/dev/null || true
    
    # Remove Yarn
    apt remove -y yarn 2>/dev/null || true
    apt purge -y yarn 2>/dev/null || true
    rm -rf /usr/local/bin/yarn 2>/dev/null || true
    rm -rf /usr/local/lib/node_modules/yarn 2>/dev/null || true
    
    print_status "Node.js and npm removed!"
}

# Remove PostgreSQL
remove_postgresql() {
    print_header "Removing PostgreSQL"
    
    # Stop PostgreSQL service
    systemctl stop postgresql 2>/dev/null || true
    systemctl disable postgresql 2>/dev/null || true
    
    # Remove PostgreSQL packages
    apt remove -y postgresql postgresql-contrib postgresql-client 2>/dev/null || true
    apt purge -y postgresql postgresql-contrib postgresql-client 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # Remove PostgreSQL data directory
    rm -rf /var/lib/postgresql 2>/dev/null || true
    rm -rf /etc/postgresql 2>/dev/null || true
    rm -rf /var/log/postgresql 2>/dev/null || true
    rm -rf /usr/lib/postgresql 2>/dev/null || true
    rm -rf /usr/share/postgresql 2>/dev/null || true
    rm -rf /etc/init.d/postgresql 2>/dev/null || true
    
    # Remove PostgreSQL user
    deluser postgres 2>/dev/null || true
    delgroup postgres 2>/dev/null || true
    
    print_status "PostgreSQL removed!"
}

# Remove Redis
remove_redis() {
    print_header "Removing Redis"
    
    # Stop Redis service
    systemctl stop redis-server 2>/dev/null || true
    systemctl disable redis-server 2>/dev/null || true
    
    # Remove Redis packages
    apt remove -y redis-server redis-tools 2>/dev/null || true
    apt purge -y redis-server redis-tools 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # Remove Redis data directory
    rm -rf /var/lib/redis 2>/dev/null || true
    rm -rf /etc/redis 2>/dev/null || true
    rm -rf /var/log/redis 2>/dev/null || true
    rm -rf /usr/lib/redis 2>/dev/null || true
    rm -rf /usr/share/redis 2>/dev/null || true
    
    # Remove Redis user
    deluser redis 2>/dev/null || true
    delgroup redis 2>/dev/null || true
    
    print_status "Redis removed!"
}

# Remove Nginx
remove_nginx() {
    print_header "Removing Nginx"
    
    # Stop Nginx service
    systemctl stop nginx 2>/dev/null || true
    systemctl disable nginx 2>/dev/null || true
    
    # Remove Nginx packages
    apt remove -y nginx nginx-common nginx-core 2>/dev/null || true
    apt purge -y nginx nginx-common nginx-core 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # Remove Nginx directories
    rm -rf /etc/nginx 2>/dev/null || true
    rm -rf /var/log/nginx 2>/dev/null || true
    rm -rf /var/www/html 2>/dev/null || true
    rm -rf /usr/share/nginx 2>/dev/null || true
    rm -rf /var/cache/nginx 2>/dev/null || true
    rm -rf /usr/share/doc/nginx 2>/dev/null || true
    
    # Remove Nginx user
    deluser www-data 2>/dev/null || true
    delgroup www-data 2>/dev/null || true
    
    print_status "Nginx removed!"
}

# Remove Docker Engine
remove_docker_engine() {
    print_header "Removing Docker Engine"
    
    # Stop Docker service
    systemctl stop docker 2>/dev/null || true
    systemctl disable docker 2>/dev/null || true
    
    # Remove Docker packages
    apt remove -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
    apt purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    # Remove Docker directories
    rm -rf /var/lib/docker 2>/dev/null || true
    rm -rf /etc/docker 2>/dev/null || true
    rm -rf /var/lib/containerd 2>/dev/null || true
    rm -rf /usr/share/docker 2>/dev/null || true
    rm -rf /run/docker 2>/dev/null || true
    rm -rf /etc/systemd/system/docker.service.d 2>/dev/null || true
    rm -rf /etc/systemd/system/docker.service 2>/dev/null || true
    
    # Remove Docker user
    groupdel docker 2>/dev/null || true
    
    # Remove Docker repository
    rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/docker.list.save 2>/dev/null || true
    rm -f /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || true
    
    print_status "Docker Engine removed!"
}

# Remove SSL certificates
remove_ssl() {
    print_header "Removing SSL Certificates"
    
    # Remove Let's Encrypt certificates
    rm -rf /etc/letsencrypt 2>/dev/null || true
    rm -rf /var/lib/letsencrypt 2>/dev/null || true
    rm -rf /var/log/letsencrypt 2>/dev/null || true
    rm -rf /etc/letsencrypt/renewal 2>/dev/null || true
    
    # Remove Certbot
    apt remove -y certbot python3-certbot-nginx 2>/dev/null || true
    apt purge -y certbot python3-certbot-nginx 2>/dev/null || true
    apt autoremove -y 2>/dev/null || true
    
    print_status "SSL certificates removed!"
}

# Remove application-specific files
remove_app_files() {
    print_header "Removing Application-Specific Files"
    
    # Remove common application directories
    for dir in "/opt/aris-erp" "/var/www/aris-erp" "/home/aris-erp"; do
        if [ -d "$dir" ]; then
            print_status "Removing $dir directory..."
            rm -rf "$dir"
        fi
    done
    
    # Remove application services
    systemctl stop aris-erp 2>/dev/null || true
    systemctl disable aris-erp 2>/dev/null || true
    rm -f /etc/systemd/system/aris-erp.service 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true
    
    # Remove log files
    rm -rf /var/log/aris-erp 2>/dev/null || true
    rm -f /var/log/aris-erp*.log 2>/dev/null || true
    
    # Remove configuration files
    rm -f /etc/aris-erp 2>/dev/null || true
    rm -f /etc/nginx/sites-available/aris-erp 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/aris-erp 2>/dev/null || true
    
    print_status "Application-specific files removed!"
}

# Clean package cache and system
clean_system() {
    print_header "Cleaning System"
    
    print_status "Updating package lists..."
    apt update
    
    print_status "Cleaning package cache..."
    apt autoremove -y
    apt autoclean -y
    apt clean
    
    print_status "Removing orphaned packages..."
    apt autoremove -y
    
    print_status "Cleaning temporary files..."
    rm -rf /tmp/* 2>/dev/null || true
    rm -rf /var/tmp/* 2>/dev/null || true
    
    print_status "System cleaned successfully!"
}

# Kill remaining processes
kill_remaining_processes() {
    print_header "Killing Remaining Processes"
    
    # Kill any remaining processes
    pkill -f "aris" 2>/dev/null || true
    pkill -f "erp" 2>/dev/null || true
    pkill -f "node" 2>/dev/null || true
    pkill -f "npm" 2>/dev/null || true
    pkill -f "yarn" 2>/dev/null || true
    pkill -f "docker" 2>/dev/null || true
    pkill -f "postgres" 2>/dev/null || true
    pkill -f "redis" 2>/dev/null || true
    pkill -f "nginx" 2>/dev/null || true
    
    # Wait for processes to terminate
    sleep 5
    
    # Force kill any remaining processes
    pkill -9 -f "aris" 2>/dev/null || true
    pkill -9 -f "erp" 2>/dev/null || true
    pkill -9 -f "node" 2>/dev/null || true
    pkill -9 -f "npm" 2>/dev/null || true
    pkill -9 -f "yarn" 2>/dev/null || true
    pkill -9 -f "docker" 2>/dev/null || true
    pkill -9 -f "postgres" 2>/dev/null || true
    pkill -9 -f "redis" 2>/dev/null || true
    pkill -9 -f "nginx" 2>/dev/null || true
    
    print_status "Remaining processes killed!"
}

# Check what was removed
check_removal() {
    print_header "Checking Removal Status"
    
    local all_clean=true
    
    # Check if aris-deploy9 directory exists
    if [ -d "/root/aris-deploy9" ]; then
        print_error "aris-deploy9 directory still exists"
        all_clean=false
    else
        print_status "✅ aris-deploy9 directory removed"
    fi
    
    # Check if Docker is installed
    if command -v docker &> /dev/null; then
        print_error "Docker is still installed"
        all_clean=false
    else
        print_status "✅ Docker removed"
    fi
    
    # Check if Node.js is installed
    if command -v node &> /dev/null; then
        print_error "Node.js is still installed"
        all_clean=false
    else
        print_status "✅ Node.js removed"
    fi
    
    # Check if PostgreSQL is installed
    if command -v psql &> /dev/null; then
        print_error "PostgreSQL is still installed"
        all_clean=false
    else
        print_status "✅ PostgreSQL removed"
    fi
    
    # Check if Redis is installed
    if command -v redis-cli &> /dev/null; then
        print_error "Redis is still installed"
        all_clean=false
    else
        print_status "✅ Redis removed"
    fi
    
    # Check if Nginx is installed
    if command -v nginx &> /dev/null; then
        print_error "Nginx is still installed"
        all_clean=false
    else
        print_status "✅ Nginx removed"
    fi
    
    if [[ $all_clean == true ]]; then
        print_status "✅ All components successfully removed!"
        return 0
    else
        print_warning "Some components may still be installed"
        return 1
    fi
}

# Main function
main() {
    print_header "🗑️ Scraping Existing Installation"
    echo "This script will completely remove the aris-deploy9 installation"
    echo "and all related services, packages, and files."
    echo ""
    echo "⚠️  WARNING: This will permanently delete all data!"
    echo ""
    
    # Ask for confirmation
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled by user"
        exit 0
    fi
    
    echo ""
    print_status "Starting complete removal process..."
    echo ""
    
    # Execute removal steps
    stop_services
    kill_remaining_processes
    remove_aris_deploy
    remove_docker
    remove_nodejs
    remove_postgresql
    remove_redis
    remove_nginx
    remove_docker_engine
    remove_ssl
    remove_app_files
    clean_system
    
    echo ""
    check_removal
    
    echo ""
    print_header "🎉 Scraping Completed!"
    echo ""
    echo "✅ The aris-deploy9 installation has been completely removed."
    echo "✅ All related services, packages, and files have been deleted."
    echo "✅ System is clean and ready for fresh installation."
    echo ""
    echo "📋 Next steps:"
    echo "1. Reboot the system: reboot"
    echo "2. Run fresh deployment: ./hostinger-deploy.sh"
    echo ""
}

# Run main function
main "$@"
