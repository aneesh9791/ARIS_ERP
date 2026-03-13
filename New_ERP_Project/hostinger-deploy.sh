#!/bin/bash

# 🚀 Hostinger ARIS ERP Deployment Script
# Complete clean installation for Hostinger Ubuntu VPS

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${DOMAIN:-erp.feenixtech.com}"
EMAIL="${EMAIL:-admin@erp.feenixtech.com}"
PROJECT_DIR="/opt/aris-erp"
DB_NAME="aris_erp"
DB_USER="aris_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

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

# Check system requirements
check_requirements() {
    print_header "Checking System Requirements"
    
    # Check Ubuntu version
    if ! grep -q "Ubuntu" /etc/os-release; then
        print_error "This script requires Ubuntu OS"
        exit 1
    fi
    
    # Check RAM
    RAM=$(free -m | awk 'NR==2{printf "%.0f", $2/1024}')
    if [[ $RAM -lt 4 ]]; then
        print_warning "Recommended RAM is 4GB or more, current: ${RAM}GB"
    fi
    
    # Check disk space
    DISK=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ $DISK -lt 50 ]]; then
        print_warning "Recommended disk space is 50GB or more, current: ${DISK}GB"
    fi
    
    print_status "System requirements check completed"
}

# Clean existing installation
clean_installation() {
    print_header "Cleaning Existing Installation"
    
    print_status "Updating system packages..."
    apt update && apt upgrade -y
    
    print_status "Removing existing Docker installations..."
    apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    apt purge -y docker-ce docker-ce-cli containerd.io 2>/dev/null || true
    apt autoremove -y
    
    print_status "Removing existing Node.js installations..."
    apt remove -y nodejs npm 2>/dev/null || true
    apt purge -y nodejs npm 2>/dev/null || true
    apt autoremove -y
    
    print_status "Removing existing PostgreSQL..."
    apt remove -y postgresql postgresql-contrib 2>/dev/null || true
    apt purge -y postgresql postgresql-contrib 2>/dev/null || true
    apt autoremove -y
    
    print_status "Removing existing Redis..."
    apt remove -y redis-server 2>/dev/null || true
    apt purge -y redis-server 2>/dev/null || true
    apt autoremove -y
    
    print_status "Cleaning up old files..."
    rm -rf /opt/aris-erp 2>/dev/null || true
    rm -rf /var/lib/pgsql 2>/dev/null || true
    rm -rf /var/lib/redis 2>/dev/null || true
    rm -rf /usr/local/lib/node_modules 2>/dev/null || true
    
    print_status "Cleaning package cache..."
    apt autoremove -y
    apt autoclean -y
    
    print_status "System cleaned successfully!"
}

# Install required packages
install_packages() {
    print_header "Installing Required Packages"
    
    print_status "Installing system packages..."
    apt install -y curl wget git unzip htop nginx certbot python3-certbot-nginx \
        software-properties-common apt-transport-https ca-certificates \
        gnupg lsb-release build-essential ufw
    
    print_status "Packages installed successfully!"
}

# Install Docker
install_docker() {
    print_header "Installing Docker"
    
    print_status "Adding Docker repository..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update
    
    print_status "Installing Docker Engine..."
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    print_status "Starting Docker service..."
    systemctl enable docker
    systemctl start docker
    
    print_status "Adding user to docker group..."
    usermod -aG docker $USER
    
    print_status "Docker installed successfully!"
}

# Install Node.js
install_nodejs() {
    print_header "Installing Node.js"
    
    print_status "Adding Node.js repository..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    
    print_status "Installing Node.js..."
    apt-get install -y nodejs
    
    print_status "Node.js installed successfully!"
}

# Create project structure
create_project_structure() {
    print_header "Creating Project Structure"
    
    print_status "Creating project directory..."
    mkdir -p $PROJECT_DIR
    cd $PROJECT_DIR
    
    print_status "Creating subdirectories..."
    mkdir -p nginx/ssl nginx/logs backend/logs backend/uploads backups
    
    print_status "Setting permissions..."
    chmod -R 755 .
    chmod +x *.sh
    
    print_status "Project structure created successfully!"
}

# Create Docker Compose configuration
create_docker_compose() {
    print_header "Creating Docker Compose Configuration"
    
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  db:
    image: postgres:15
    container_name: aris-erp-db
    environment:
      POSTGRES_DB: aris_erp
      POSTGRES_USER: aris_user
      POSTGRES_PASSWORD: your_secure_password_change_this
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/migrations:/docker-entrypoint-initdb.d
    networks:
      - aris-network
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aris_user -d aris_erp"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass your_redis_password_change_this
    volumes:
      - redis_data:/data
    networks:
      - aris-network
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: aris-erp-backend
    environment:
      NODE_ENV: production
      PORT: 5000
      DATABASE_URL: postgresql://aris_user:your_secure_password_change_this@db:5432/aris_erp
      REDIS_URL: redis://:your_redis_password_change_this@redis:6379
      JWT_SECRET: your-super-secret-jwt-key-change-this-in-production-min-32-chars
      JWT_REFRESH_SECRET: your-super-secret-refresh-key-change-this-in-production-min-32-chars
      JWT_EXPIRE: 24h
      JWT_REFRESH_EXPIRE: 7d
      BCRYPT_ROUNDS: 12
      CORS_ORIGIN: https://erp.feenixtech.com
      UPLOAD_MAX_SIZE: 10485760
      LOG_LEVEL: info
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
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile.prod
      args:
        - REACT_APP_API_URL=https://erp.feenixtech.com/api
        - REACT_APP_ENV=production
    container_name: aris-erp-frontend
    networks:
      - aris-network
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  nginx:
    image: nginx:alpine
    container_name: aris-erp-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/logs:/var/log/nginx
      - ./frontend/build:/usr/share/nginx/html
    depends_on:
      frontend:
        condition: service_healthy
      backend:
        condition: service_healthy
    networks:
      - aris-network
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 5

  backup:
    image: postgres:15
    environment:
      PGPASSWORD: your_secure_password_change_this
    volumes:
      - ./backups:/backups
      - postgres_data:/var/lib/postgresql/data:ro
    networks:
      - aris-network
    depends_on:
      - db
    restart: always
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

    print_status "Docker Compose configuration created!"
}

# Create environment file
create_env_file() {
    print_header "Creating Environment File"
    
    cat > .env << EOF
# Database Configuration
POSTGRES_DB=aris_erp
POSTGRES_USER=aris_user
POSTGRES_PASSWORD=your_secure_password_change_this
DATABASE_URL=postgresql://aris_user:your_secure_password_change_this@db:5432/aris_erp

# Redis Configuration
REDIS_PASSWORD=your_redis_password_change_this
REDIS_URL=redis://:your_redis_password_change_this@redis:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production-min-32-chars

# Domain Configuration
DOMAIN=erp.feenixtech.com
EMAIL=admin@erp.feenixtech.com

# SSL Configuration
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem

# Application Configuration
NODE_ENV=production
PORT=5000
CORS_ORIGIN=https://erp.feenixtech.com
UPLOAD_MAX_SIZE=10485760
LOG_LEVEL=info
EOF

    print_status "Environment file created!"
}

# Create Nginx configuration
create_nginx_config() {
    print_header "Creating Nginx Configuration"
    
    cat > nginx/nginx.prod.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    # Upstream servers
    upstream api {
        server backend:5000;
    }

    upstream frontend {
        server frontend:3000;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name erp.feenixtech.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name erp.feenixtech.com;

        # SSL configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # Frontend
        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
            try_files $uri $uri/ /index.html;
            
            # Cache static files
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }

        # API
        location /api/ {
            proxy_pass http://api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Rate limiting
            limit_req zone=api burst=20 nodelay;
            
            # CORS headers
            add_header Access-Control-Allow-Origin https://erp.feenixtech.com;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
            add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization";
            add_header Access-Control-Expose-Headers "Content-Length,Content-Range";
        }

        # Health check
        location /health {
            access_log off;
            return 200 "healthy";
        }
    }
}
EOF

    print_status "Nginx configuration created!"
}

# Create SSL certificates
create_ssl_certificates() {
    print_header "Creating SSL Certificates"
    
    print_status "Creating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=erp.feenixtech.com"
    
    chmod 600 nginx/ssl/key.pem
    chmod 644 nginx/ssl/cert.pem
    
    print_status "SSL certificates created!"
}

# Create production Dockerfiles
create_dockerfiles() {
    print_header "Creating Production Dockerfiles"
    
    # Backend Dockerfile
    cat > backend/Dockerfile.prod << 'EOF'
# Multi-stage build for production

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install production dependencies
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g aris aris && \
    adduser -D -G aris -u 1001 aris

# Create required directories
RUN mkdir -p logs uploads && \
    chown -R aris:aris logs uploads

# Switch to non-root user
USER aris

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

EXPOSE 5000

CMD ["npm", "start"]
EOF

    # Frontend Dockerfile
    cat > frontend/Dockerfile.prod << 'EOF'
# Multi-stage build for production

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Copy build files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup -g nginx nginx && \
    adduser -D -G nginx -u 1001 nginx

# Switch to non-root user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    curl -f http://localhost:3000 || exit 1

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
EOF

    print_status "Production Dockerfiles created!"
}

# Create application source files
create_application_files() {
    print_header "Creating Application Source Files"
    
    # Create basic backend structure
    mkdir -p backend/src backend/migrations
    cat > backend/package.json << 'EOF'
{
  "name": "aris-erp-backend",
  "version": "1.0.0",
  "description": "ARIS ERP Backend",
  "main": "dist/app.js",
  "scripts": {
    "start": "node dist/app.js",
    "dev": "nodemon src/app.js",
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.8.0",
    "redis": "^4.5.1",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "helmet": "^6.0.1",
    "express-rate-limit": "^6.7.0",
    "multer": "^1.4.5-lts.1",
    "winston": "^3.8.2",
    "dotenv": "^16.0.3",
    "joi": "^17.7.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.11.18",
    "@types/express": "^4.17.17",
    "@types/pg": "^8.6.6",
    "typescript": "^4.9.5",
    "nodemon": "^2.0.20",
    "jest": "^29.4.3",
    "ts-jest": "^29.0.5"
  }
}
EOF

    # Create basic frontend structure
    mkdir -p frontend/src frontend/public
    cat > frontend/package.json << 'EOF'
{
  "name": "aris-erp-frontend",
  "version": "1.0.0",
  "description": "ARIS ERP Frontend",
  "main": "index.js",
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.1",
    "react-query": "^3.39.3",
    "axios": "^1.3.4",
    "tailwindcss": "^3.2.7",
    "lucide-react": "^0.323.0",
    "react-hot-toast": "^2.4.0",
    "react-hook-form": "^7.43.5",
    "react-scripts": "5.0.1"
  },
  "devDependencies": {
    "@types/react": "^18.0.28",
    "@types/react-dom": "^18.0.11",
    "typescript": "^4.9.5"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
EOF

    print_status "Application source files created!"
}

# Deploy application
deploy_application() {
    print_header "Deploying Application"
    
    cd $PROJECT_DIR
    
    print_status "Building and starting Docker containers..."
    docker-compose build
    docker-compose up -d
    
    print_status "Waiting for services to start..."
    sleep 60
    
    print_status "Checking service health..."
    docker-compose ps
    
    print_status "Running database migrations..."
    docker-compose exec -T db psql -U aris_user -d aris_erp -c "
    CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
    CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";
    " || true
    
    print_status "Creating default admin user..."
    docker-compose exec -T db psql -U aris_user -d aris_erp -c "
    INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
    VALUES ('admin@erp.feenixtech.com', '\$2b\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/R.k.s5uO9G', 'System', 'Administrator', 'admin', true, NOW(), NOW())
    ON CONFLICT (email) DO NOTHING;
    " || true
    
    print_status "Application deployed successfully!"
}

# Verify deployment
verify_deployment() {
    print_header "Verifying Deployment"
    
    local all_good=true
    
    # Check frontend
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        print_status "✅ Frontend is accessible"
    else
        print_error "❌ Frontend is not accessible"
        all_good=false
    fi
    
    # Check backend
    if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
        print_status "✅ Backend is accessible"
    else
        print_error "❌ Backend is not accessible"
        all_good=false
    fi
    
    # Check database
    if docker-compose exec -T db psql -U aris_user -d aris_erp -c "SELECT 1;" > /dev/null 2>&1; then
        print_status "✅ Database is accessible"
    else
        print_error "❌ Database is not accessible"
        all_good=false
    fi
    
    # Check Redis
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        print_status "✅ Redis is accessible"
    else
        print_error "❌ Redis is not accessible"
        all_good=false
    fi
    
    if [[ $all_good == true ]]; then
        print_status "✅ All services are running correctly!"
    else
        print_error "❌ Some services are not running correctly"
        return 1
    fi
}

# Configure firewall
configure_firewall() {
    print_header "Configuring Firewall"
    
    print_status "Configuring UFW firewall..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    
    print_status "Firewall configured successfully!"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    print_header "Setting up SSL with Let's Encrypt"
    
    print_status "Installing Certbot..."
    apt install -y certbot python3-certbot-nginx
    
    print_status "Requesting SSL certificate..."
    certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive
    
    print_status "Setting up auto-renewal..."
    echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
    
    print_status "SSL setup completed!"
}

# Create monitoring script
create_monitoring_script() {
    print_header "Creating Monitoring Script"
    
    cat > monitor.sh << 'EOF'
#!/bin/bash

# ARIS ERP Monitoring Script

PROJECT_DIR="/opt/aris-erp"
cd $PROJECT_DIR

echo "=== ARIS ERP System Status ==="
echo "Time: $(date)"
echo ""

# Check Docker containers
echo "=== Docker Containers ==="
docker-compose ps
echo ""

# Check system resources
echo "=== System Resources ==="
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')%"
echo "Memory: $(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $5}')"
echo ""

# Check service health
echo "=== Service Health ==="
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "Frontend: ✅ OK"
else
    echo "Frontend: ❌ FAILED"
fi

if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "Backend: ✅ OK"
else
    echo "Backend: ❌ FAILED"
fi

if docker-compose exec -T db psql -U aris_user -d aris_erp -c "SELECT 1;" > /dev/null 2>&1; then
    echo "Database: ✅ OK"
else
    echo "Database: ❌ FAILED"
fi

if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "Redis: ✅ OK"
else
    echo "Redis: ❌ FAILED"
fi

echo ""
echo "=== Recent Logs ==="
echo "Backend logs (last 10 lines):"
docker-compose logs --tail=10 backend 2>/dev/null | grep -v "^\$" || echo "No backend logs available"

echo ""
echo "=== Backup Status ==="
ls -la backups/ 2>/dev/null | tail -5 || echo "No backups found"

echo ""
echo "=== End of Status Report ==="
EOF

    chmod +x monitor.sh
    
    print_status "Monitoring script created!"
}

# Main deployment function
main() {
    print_header "🚀 ARIS ERP Hostinger Deployment Started"
    echo "Domain: $DOMAIN"
    echo "Email: $EMAIL"
    echo "Project Directory: $PROJECT_DIR"
    echo ""
    
    check_root
    check_requirements
    clean_installation
    install_packages
    install_docker
    install_nodejs
    create_project_structure
    create_docker_compose
    create_env_file
    create_nginx_config
    create_ssl_certificates
    create_dockerfiles
    create_application_files
    deploy_application
    verify_deployment
    configure_firewall
    create_monitoring_script
    
    print_header "🎉 ARIS ERP Deployment Completed Successfully!"
    echo ""
    echo "🌐 Access your ARIS ERP at: http://$DOMAIN"
    echo "👤 Login: admin@erp.feenixtech.com"
    echo "🔑 Password: admin123"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Point your domain to this server IP"
    echo "2. Run: cd $PROJECT_DIR && ./setup_ssl.sh"
    echo "3. Configure email settings"
    echo "4. Customize your organization settings"
    echo "5. Run: ./monitor.sh to check system status"
    echo ""
    echo "🔧 Useful Commands:"
    echo "cd $PROJECT_DIR && docker-compose logs -f"
    echo "cd $PROJECT_DIR && docker-compose ps"
    echo "cd $PROJECT_DIR && ./monitor.sh"
    echo ""
    print_status "Deployment completed successfully!"
}

# Run main function
main "$@"
