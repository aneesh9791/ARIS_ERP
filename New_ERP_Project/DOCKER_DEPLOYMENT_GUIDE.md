# 🐳 **DOCKER DEPLOYMENT GUIDE**
## Complete Docker Setup for ARIS ERP on Hostinger Ubuntu VPS KVM2

---

## 🎯 **DEPLOYMENT OVERVIEW**

This guide provides a complete Docker-based deployment solution for the ARIS ERP system on Hostinger Ubuntu VPS KVM2. Docker offers excellent isolation, scalability, and management capabilities.

### **📋 Prerequisites**
- Ubuntu 20.04+ (Hostinger VPS KVM2)
- Minimum 2GB RAM, 2 CPU cores, 10GB storage
- SSH access with sudo privileges
- Domain name (optional, for SSL)
- Git repository (optional)

---

## 🚀 **QUICK DEPLOYMENT**

### **1. Automated Deployment**
```bash
# Download and run the deployment script
curl -fsSL https://your-domain.com/deploy.sh | bash

# Or clone and run manually
git clone https://github.com/your-repo/aris-erp.git
cd aris-erp
chmod +x deploy.sh
./deploy.sh
```

### **2. Manual Deployment**
```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 3. Install Docker Compose
sudo apt install docker-compose-plugin

# 4. Clone project
git clone https://github.com/your-repo/aris-erp.git
cd aris-erp

# 5. Setup environment
cp .env.example .env
# Edit .env with your configuration

# 6. Build and start
sudo docker compose build
sudo docker compose up -d
```

---

## 📁 **PROJECT STRUCTURE**

```
aris-erp/
├── docker-compose.yml          # Main Docker Compose configuration
├── Dockerfile                  # Multi-stage build file
├── .env.example               # Environment variables template
├── deploy.sh                  # Automated deployment script
├── nginx/
│   ├── nginx.conf             # Nginx reverse proxy configuration
│   ├── ssl/                   # SSL certificates directory
│   └── logs/                  # Nginx logs
├── backend/
│   ├── Dockerfile             # Backend Docker configuration
│   ├── src/                   # Backend source code
│   ├── package.json           # Backend dependencies
│   └── logs/                  # Backend logs
├── frontend/
│   ├── Dockerfile             # Frontend Docker configuration
│   ├── nginx.conf             # Frontend Nginx configuration
│   ├── src/                   # Frontend source code
│   └── package.json           # Frontend dependencies
├── backups/                   # Database backups
└── uploads/                   # File uploads
```

---

## ⚙️ **CONFIGURATION FILES**

### **🐳 Docker Compose Configuration**
```yaml
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

  # Redis for sessions and caching
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
        - REACT_APP_API_URL=http://localhost:5000
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
          pg_dump -h db -U aris_user -d aris_erp > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql
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
```

### **🔧 Environment Variables**
```bash
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
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d

# Application Configuration
APP_NAME=ARIS Healthcare ERP
APP_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com
BACKEND_URL=https://your-domain.com/api

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
SMTP_SERVICE=gmail
EMAIL_FROM=noreply@your-domain.com

# Hostinger VPS Specific
DOMAIN_NAME=your-domain.com
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem

# Backup Configuration
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=7
BACKUP_PATH=./backups
```

---

## 🔒 **SECURITY CONFIGURATION**

### **🛡️ Nginx Security**
```nginx
# SSL Configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# Security Headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self';" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Rate Limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
```

### **🔐 Docker Security**
```dockerfile
# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1
```

### **🔥 Firewall Configuration**
```bash
# Setup UFW firewall
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 📊 **MONITORING & LOGGING**

### **📈 Health Checks**
```bash
# Check container status
sudo docker compose ps

# Check service health
sudo docker compose exec backend curl -f http://localhost:5000/api/health
sudo docker compose exec frontend curl -f http://localhost:3000
sudo docker compose exec db pg_isready -U aris_user -d aris_erp
```

### **📝 Logs Management**
```bash
# View all logs
sudo docker compose logs -f

# View specific service logs
sudo docker compose logs -f backend
sudo docker compose logs -f frontend
sudo docker compose logs -f db
sudo docker compose logs -f nginx

# View Nginx logs
sudo tail -f nginx/logs/access.log
sudo tail -f nginx/logs/error.log
```

### **🔍 Monitoring Script**
```bash
#!/bin/bash
# health-check.sh

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
```

---

## 💾 **BACKUP & RECOVERY**

### **🔄 Automated Backup**
```bash
#!/bin/bash
# backup.sh

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
```

### **🔄 Manual Backup**
```bash
# Database backup
sudo docker compose exec db pg_dump -U aris_user aris_erp > backup.sql

# Full application backup
sudo docker compose down
sudo tar -czf aris-erp-backup-$(date +%Y%m%d).tar.gz .
sudo docker compose up -d
```

### **🔧 Recovery**
```bash
# Restore database
sudo docker compose exec -T db psql -U aris_user aris_erp < backup.sql

# Restore full application
sudo docker compose down
sudo tar -xzf aris-erp-backup-20240313.tar.gz
sudo docker compose up -d
```

---

## 🔄 **UPDATES & MAINTENANCE**

### **⬆️ Update Containers**
```bash
# Pull latest images
sudo docker compose pull

# Rebuild and restart
sudo docker compose build --no-cache
sudo docker compose up -d

# Clean up old images
sudo docker image prune -f
```

### **🧹 Maintenance**
```bash
# Clean up unused containers and images
sudo docker system prune -a

# Clean up unused volumes
sudo docker volume prune

# View resource usage
sudo docker stats
```

### **🔄 Rolling Updates**
```bash
# Update backend without downtime
sudo docker compose up -d --no-deps backend

# Update frontend without downtime
sudo docker compose up -d --no-deps frontend
```

---

## 🚨 **TROUBLESHOOTING**

### **🐛 Common Issues**

#### **1. Container Won't Start**
```bash
# Check logs
sudo docker compose logs service-name

# Check resource usage
sudo docker stats

# Restart service
sudo docker compose restart service-name
```

#### **2. Database Connection Issues**
```bash
# Check database status
sudo docker compose exec db pg_isready -U aris_user -d aris_erp

# Check network connectivity
sudo docker compose exec backend ping db

# Reset database
sudo docker compose down
sudo docker volume rm aris-erp_postgres_data
sudo docker compose up -d
```

#### **3. SSL Certificate Issues**
```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem

# Setup Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### **4. Performance Issues**
```bash
# Check resource usage
sudo docker stats
sudo htop
sudo df -h

# Optimize Docker
sudo docker system prune -a
sudo docker volume prune
```

### **📞 Support Commands**
```bash
# Full system status
sudo docker compose ps
sudo docker compose logs --tail=50

# Service-specific status
sudo docker compose exec backend npm run health
sudo docker compose exec db pg_isready -U aris_user -d aris_erp

# Network connectivity
sudo docker compose exec frontend curl -f http://backend:5000/api/health
```

---

## 🎯 **PRODUCTION TIPS**

### **⚡ Performance Optimization**
- Use Redis for session storage and caching
- Enable Nginx gzip compression
- Optimize database queries and indexes
- Use CDN for static assets
- Monitor resource usage regularly

### **🔒 Security Best Practices**
- Use strong, unique passwords
- Enable SSL/TLS encryption
- Regularly update containers
- Implement rate limiting
- Use non-root users in containers
- Regular security audits

### **📈 Scalability**
- Use Docker Swarm or Kubernetes for large deployments
- Implement load balancing
- Use read replicas for database
- Implement caching strategies
- Monitor performance metrics

### **🔄 High Availability**
- Use multiple database instances
- Implement failover mechanisms
- Use health checks
- Monitor service uptime
- Implement disaster recovery

---

## 🎉 **DEPLOYMENT SUCCESS!**

Your ARIS ERP system is now running in Docker containers on Hostinger Ubuntu VPS KVM2!

### **✅ What's Deployed**
- ✅ **PostgreSQL Database** - Persistent data storage
- ✅ **Redis Cache** - Session management and caching
- ✅ **Backend API** - RESTful API server
- ✅ **Frontend** - React web application
- ✅ **Nginx Proxy** - Reverse proxy with SSL
- ✅ **Backup Service** - Automated database backups
- ✅ **Monitoring** - Health checks and logging

### **🔗 Access URLs**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Database**: localhost:5432
- **Redis**: localhost:6379

### **🛠️ Management Commands**
```bash
# View logs
cd /opt/aris-erp && sudo docker compose logs -f

# Stop services
cd /opt/aris-erp && sudo docker compose down

# Start services
cd /opt/aris-erp && sudo docker compose up -d

# Update services
cd /opt/aris-erp && sudo docker compose pull && sudo docker compose up -d

# Backup database
cd /opt/aris-erp && ./backup.sh
```

### **🎯 Next Steps**
1. Configure your domain name
2. Setup SSL certificate with Let's Encrypt
3. Configure email settings
4. Setup monitoring alerts
5. Regular backup verification

The Docker deployment provides excellent isolation, scalability, and management capabilities for your ARIS ERP system! 🚀✨
