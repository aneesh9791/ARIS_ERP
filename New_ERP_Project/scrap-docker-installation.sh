#!/bin/bash

# 🐳 Scrap Docker-Based Installation Script
# Specifically for removing Docker-based aris-deploy9 installation

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

# Stop and remove Docker containers
stop_docker_containers() {
    print_header "Stopping and Removing Docker Containers"
    
    # Stop running containers
    print_status "Stopping running containers..."
    if [ -f "docker-compose.yml" ]; then
        docker-compose down 2>/dev/null || true
        docker-compose down --volumes 2>/dev/null || true
        docker-compose down --rmi all 2>/dev/null || true
    fi
    
    # Force stop any remaining containers
    print_status "Force stopping remaining containers..."
    docker stop $(docker ps -q) 2>/dev/null || true
    
    # Remove all containers
    print_status "Removing all containers..."
    docker rm -f $(docker ps -aq) 2>/dev/null || true
    
    # Remove any aris-specific containers
    print_status "Removing aris-specific containers..."
    docker rm -f $(docker ps -a --filter "name=aris" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=erp" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=postgres" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=redis" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=nginx" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=backend" -q) 2>/dev/null || true
    docker rm -f $(docker ps -a --filter "name=frontend" -q) 2>/dev/null || true
    
    print_status "Docker containers stopped and removed!"
}

# Remove Docker images
remove_docker_images() {
    print_header "Removing Docker Images"
    
    # Remove project-specific images
    print_status "Removing project-specific images..."
    if [ -f "docker-compose.yml" ]; then
        docker-compose down --rmi all 2>/dev/null || true
    fi
    
    # Remove aris-specific images
    print_status "Removing aris-specific images..."
    docker rmi -f $(docker images --filter "reference=*aris*" -q) 2>/dev/null || true
    docker rmi -f $(docker images --filter "reference=*erp*" -q) 2>/dev/null || true
    
    # Remove all images (optional - uncomment if you want to remove all)
    # print_status "Removing all Docker images..."
    # docker rmi -f $(docker images -q) 2>/dev/null || true
    
    print_status "Docker images removed!"
}

# Remove Docker volumes
remove_docker_volumes() {
    print_header "Removing Docker Volumes"
    
    # Remove project-specific volumes
    print_status "Removing project-specific volumes..."
    if [ -f "docker-compose.yml" ]; then
        docker-compose down --volumes 2>/dev/null || true
    fi
    
    # Remove aris-specific volumes
    print_status "Removing aris-specific volumes..."
    docker volume rm $(docker volume ls --filter "name=aris*" -q) 2>/dev/null || true
    docker volume rm $(docker volume ls --filter "name=erp*" -q) 2>/dev/null || true
    docker volume rm $(docker volume ls --filter "name=postgres*" -q) 2>/dev/null || true
    docker volume rm $(docker volume ls --filter "name=redis*" -q) 2>/dev/null || true
    
    # Remove all volumes (optional - uncomment if you want to remove all)
    # print_status "Removing all Docker volumes..."
    # docker volume rm $(docker volume ls -q) 2>/dev/null || true
    
    print_status "Docker volumes removed!"
}

# Remove Docker networks
remove_docker_networks() {
    print_header "Removing Docker Networks"
    
    # Remove project-specific networks
    print_status "Removing project-specific networks..."
    if [ -f "docker-compose.yml" ]; then
        docker-compose down --remove-orphans 2>/dev/null || true
    fi
    
    # Remove aris-specific networks
    print_status "Removing aris-specific networks..."
    docker network rm $(docker network ls --filter "name=aris*" -q) 2>/dev/null || true
    docker network rm $(docker network ls --filter "name=erp*" -q) 2>/dev/null || true
    
    # Remove all networks (optional - uncomment if you want to remove all)
    # print_status "Removing all Docker networks..."
    # docker network rm $(docker network ls -q) 2>/dev/null || true
    
    print_status "Docker networks removed!"
}

# Clean Docker system
clean_docker_system() {
    print_header "Cleaning Docker System"
    
    # Prune Docker system
    print_status "Pruning Docker system..."
    docker system prune -f 2>/dev/null || true
    docker system prune -af --volumes 2>/dev/null || true
    
    # Clean up unused resources
    print_status "Cleaning up unused resources..."
    docker container prune -f 2>/dev/null || true
    docker image prune -f 2>/dev/null || true
    docker volume prune -f 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
    
    print_status "Docker system cleaned!"
}

# Remove Docker Compose files
remove_compose_files() {
    print_header "Removing Docker Compose Files"
    
    # Remove docker-compose files
    print_status "Removing docker-compose files..."
    rm -f docker-compose.yml 2>/dev/null || true
    rm -f docker-compose.override.yml 2>/dev/null || true
    rm -f docker-compose.prod.yml 2>/dev/null || true
    rm -f docker-compose.dev.yml 2>/dev/null || true
    rm -f docker-compose.*.yml 2>/dev/null || true
    
    # Remove .env files
    print_status "Removing environment files..."
    rm -f .env 2>/dev/null || true
    rm -f .env.example 2>/dev/null || true
    rm -f .env.local 2>/dev/null || true
    rm -f .env.production 2>/dev/null || true
    rm -f .env.development 2>/dev/null || true
    
    print_status "Docker Compose files removed!"
}

# Remove application directories
remove_app_directories() {
    print_header "Removing Application Directories"
    
    # Remove common application directories
    print_status "Removing application directories..."
    rm -rf backend 2>/dev/null || true
    rm -rf frontend 2>/dev/null || true
    rm -rf nginx 2>/dev/null || true
    rm -rf logs 2>/dev/null || true
    rm -rf uploads 2>/dev/null || true
    rm -rf backups 2>/dev/null || true
    rm -rf ssl 2>/dev/null || true
    rm -rf data 2>/dev/null || true
    rm -rf config 2>/dev/null || true
    rm -rf scripts 2>/dev/null || true
    rm -rf docs 2>/dev/null || true
    
    print_status "Application directories removed!"
}

# Remove Docker-related system services
remove_docker_services() {
    print_header "Removing Docker Services"
    
    # Stop Docker service
    print_status "Stopping Docker service..."
    systemctl stop docker 2>/dev/null || true
    systemctl disable docker 2>/dev/null || true
    
    # Remove Docker socket
    print_status "Removing Docker socket..."
    rm -f /var/run/docker.sock 2>/dev/null || true
    rm -f /var/run/docker.pid 2>/dev/null || true
    
    print_status "Docker services removed!"
}

# Remove Docker installation (optional)
remove_docker_installation() {
    print_header "Removing Docker Installation"
    
    read -p "Do you want to completely remove Docker installation? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing Docker packages..."
        apt remove -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
        apt purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || true
        apt autoremove -y 2>/dev/null || true
        
        # Remove Docker directories
        print_status "Removing Docker directories..."
        rm -rf /var/lib/docker 2>/dev/null || true
        rm -rf /etc/docker 2>/dev/null || true
        rm -rf /var/lib/containerd 2>/dev/null || true
        rm -rf /usr/share/docker 2>/dev/null || true
        rm -rf /run/docker 2>/dev/null || true
        
        # Remove Docker group
        print_status "Removing Docker group..."
        groupdel docker 2>/dev/null || true
        
        # Remove Docker repository
        print_status "Removing Docker repository..."
        rm -f /etc/apt/sources.list.d/docker.list 2>/dev/null || true
        rm -f /usr/share/keyrings/docker-archive-keyring.gpg 2>/dev/null || true
        
        print_status "Docker installation removed!"
    else
        print_status "Docker installation kept intact"
    fi
}

# Clean project directory
clean_project_directory() {
    print_header "Cleaning Project Directory"
    
    # Get current directory
    CURRENT_DIR=$(pwd)
    
    # Remove all files except the script itself
    print_status "Cleaning project directory..."
    find . -type f ! -name "*.sh" -delete 2>/dev/null || true
    find . -type d -empty -delete 2>/dev/null || true
    
    # Remove hidden files
    print_status "Removing hidden files..."
    find . -name ".*" -type f -delete 2>/dev/null || true
    find . -name ".*" -type d -empty -delete 2>/dev/null || true
    
    print_status "Project directory cleaned!"
}

# Remove aris-deploy9 directory
remove_aris_deploy_directory() {
    print_header "Removing aris-deploy9 Directory"
    
    cd /root
    
    # Remove the entire directory
    if [ -d "aris-deploy9" ]; then
        print_status "Removing /root/aris-deploy9 directory..."
        rm -rf aris-deploy9
        print_status "aris-deploy9 directory removed!"
    else
        print_warning "aris-deploy9 directory not found"
    fi
    
    # Check other possible locations
    for dir in "/opt/aris-deploy9" "/home/aris-deploy9" "/var/www/aris-deploy9"; do
        if [ -d "$dir" ]; then
            print_status "Removing $dir directory..."
            rm -rf "$dir"
        fi
    done
}

# Verify removal
verify_removal() {
    print_header "Verifying Removal"
    
    local all_clean=true
    
    # Check if aris-deploy9 directory exists
    if [ -d "/root/aris-deploy9" ]; then
        print_error "aris-deploy9 directory still exists"
        all_clean=false
    else
        print_status "✅ aris-deploy9 directory removed"
    fi
    
    # Check if Docker containers are running
    local container_count=$(docker ps -q | wc -l)
    if [ "$container_count" -gt 0 ]; then
        print_error "Docker containers still running: $container_count"
        all_clean=false
    else
        print_status "✅ No Docker containers running"
    fi
    
    # Check if aris-specific containers exist
    local aris_containers=$(docker ps -a --filter "name=aris" --filter "name=erp" -q | wc -l)
    if [ "$aris_containers" -gt 0 ]; then
        print_error "aris-specific containers still exist: $aris_containers"
        all_clean=false
    else
        print_status "✅ No aris-specific containers found"
    fi
    
    # Check if aris-specific volumes exist
    local aris_volumes=$(docker volume ls --filter "name=aris" --filter "name=erp" -q | wc -l)
    if [ "$aris_volumes" -gt 0 ]; then
        print_error "aris-specific volumes still exist: $aris_volumes"
        all_clean=false
    else
        print_status "✅ No aris-specific volumes found"
    fi
    
    # Check Docker status
    if command -v docker &> /dev/null; then
        print_status "✅ Docker is still installed (kept by user choice)"
    else
        print_status "✅ Docker removed"
    fi
    
    if [[ $all_clean == true ]]; then
        print_status "✅ Docker-based installation completely removed!"
        return 0
    else
        print_warning "Some Docker components may still be present"
        return 1
    fi
}

# Main function
main() {
    print_header "🐳 Scraping Docker-Based Installation"
    echo "This script will completely remove the Docker-based aris-deploy9 installation"
    echo "including all containers, images, volumes, networks, and application files."
    echo ""
    echo "⚠️  WARNING: This will permanently delete all Docker data!"
    echo ""
    
    # Ask for confirmation
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled by user"
        exit 0
    fi
    
    echo ""
    print_status "Starting Docker-based installation removal..."
    echo ""
    
    # Execute removal steps
    check_root
    check_docker
    navigate_to_project
    stop_docker_containers
    remove_docker_images
    remove_docker_volumes
    remove_docker_networks
    clean_docker_system
    remove_compose_files
    remove_app_directories
    remove_docker_services
    remove_docker_installation
    clean_project_directory
    remove_aris_deploy_directory
    
    echo ""
    verify_removal
    
    echo ""
    print_header "🎉 Docker-Based Installation Scraping Completed!"
    echo ""
    echo "✅ The Docker-based aris-deploy9 installation has been completely removed."
    echo "✅ All containers, images, volumes, and networks have been deleted."
    echo "✅ All application files and directories have been removed."
    echo "✅ System is clean and ready for fresh installation."
    echo ""
    echo "📋 Next steps:"
    echo "1. Reboot the system: reboot"
    echo "2. Run fresh deployment: ./hostinger-deploy.sh"
    echo ""
}

# Run main function
main "$@"
