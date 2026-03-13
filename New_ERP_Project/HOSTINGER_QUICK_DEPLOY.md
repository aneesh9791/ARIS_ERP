# 🚀 **HOSTINGER QUICK DEPLOY**
## One-Click Deployment for Hostinger VPS

---

## 🎯 **QUICK DEPLOYMENT**

### **📋 Prerequisites**
- Hostinger Ubuntu VPS (4GB+ RAM, 50GB+ SSD)
- Domain name pointing to VPS IP
- SSH access to VPS

### **🚀 One-Command Deployment**

#### **Step 1: Connect to VPS**
```bash
ssh root@your-vps-ip
```

#### **Step 2: Run Deployment Script**
```bash
# Download and run deployment script
wget https://your-domain.com/hostinger-deploy.sh
chmod +x hostinger-deploy.sh
./hostinger-deploy.sh
```

#### **Step 3: Configure Domain**
```bash
# Point your domain to VPS IP
# Wait for DNS propagation
# Then run SSL setup
cd /opt/aris-erp
./setup_ssl.sh
```

---

## 📦 **DEPLOYMENT PACKAGE INCLUDES**

### **🗑️ Clean Installation**
- Removes all existing Docker, Node.js, PostgreSQL, Redis
- Cleans up old files and configurations
- Fresh installation with no conflicts

### **🐳 Docker Services**
- PostgreSQL 15 database
- Redis 7 cache
- Node.js 18 backend API
- React 18 frontend
- Nginx reverse proxy
- Automated backup service

### **🔒 Security Features**
- SSL/TLS encryption
- Firewall configuration
- Rate limiting
- Security headers
- Non-root containers

### **⚡ Performance Optimizations**
- Gzip compression
- Static file caching
- Database indexing
- Redis caching
- Load balancing

---

## 🌐 **ACCESS POINTS**

### **📱 Main Application**
- **URL**: https://erp.feenixtech.com
- **Login**: admin@erp.feenixtech.com
- **Password**: admin123

### **⚙️ Admin Features**
- Patient management
- Appointment scheduling
- Medical records
- Billing system
- Inventory management
- Financial reports
- User management
- Logo customization

---

## 🔧 **DEPLOYMENT PROCESS**

### **📋 What the Script Does**
1. **System Update** - Updates Ubuntu packages
2. **Clean Installation** - Removes existing dependencies
3. **Install Dependencies** - Docker, Node.js, Nginx, etc.
4. **Create Structure** - Sets up project directories
5. **Configure Services** - Creates Docker configurations
6. **Build Containers** - Builds and starts services
7. **Setup Database** - Creates database and admin user
8. **Configure Firewall** - Sets up security rules
9. **Create Monitoring** - Sets up monitoring scripts

### **⏱️ Deployment Time**
- **First deployment**: 15-20 minutes
- **Subsequent deployments**: 5-10 minutes

---

## 📊 **MONITORING & MAINTENANCE**

### **🔍 System Monitoring**
```bash
# Check system status
cd /opt/aris-erp
./monitor.sh

# View container logs
docker-compose logs -f

# Check container status
docker-compose ps
```

### **🔄 Backup Management**
```bash
# Manual backup
docker-compose exec db pg_dump -U aris_user -d aris_erp > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T db psql -U aris_user -d aris_erp < backup_20240313.sql
```

### **📈 Performance Monitoring**
```bash
# Monitor resource usage
docker stats

# Check API health
curl -f https://erp.feenixtech.com/api/health

# Monitor database
docker-compose exec db psql -U aris_user -d aris_erp -c "SELECT COUNT(*) FROM users;"
```

---

## 🔒 **SSL CONFIGURATION**

### **📋 SSL Setup Steps**
```bash
cd /opt/aris-erp

# Install Certbot
apt install -y certbot python3-certbot-nginx

# Request SSL certificate
certbot --nginx -d erp.feenixtech.com --email admin@erp.feenixtech.com --agree-tos --non-interactive

# Set up auto-renewal
echo "0 12 * * * /usr/bin/certbot renew --quiet" | crontab -
```

### **🔒 SSL Features**
- Let's Encrypt SSL certificate
- Auto-renewal setup
- HTTPS redirect
- Security headers
- SSL termination

---

## 🛠️ **CUSTOMIZATION**

### **🎨 Logo Customization**
```bash
# Access logo settings
https://erp.feenixtech.com/settings/logo

# Upload custom logo
# Change colors
# Update organization details
```

### **⚙️ Configuration**
```bash
# Edit environment file
nano /opt/aris-erp/.env

# Restart services
cd /opt/aris-erp
docker-compose restart
```

### **📧 Email Setup**
```bash
# Configure email settings
# Edit .env file with SMTP details
# Restart backend service
```

---

## 🔧 **TROUBLESHOOTING**

### **🚨 Common Issues**

#### **Container Not Starting**
```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Restart services
docker-compose restart
```

#### **Database Connection Issues**
```bash
# Check database status
docker-compose exec db psql -U aris_user -d aris_erp -c "SELECT 1;"

# Restart database
docker-compose restart db
```

#### **SSL Certificate Issues**
```bash
# Check SSL status
certbot certificates

# Renew certificate
certbot renew

# Reinstall certificate
certbot --nginx -d erp.feenixtech.com --email admin@erp.feenixtech.com --force-renewal
```

#### **Performance Issues**
```bash
# Check resource usage
docker stats

# Clear cache
docker-compose exec redis redis-cli FLUSHALL

# Restart services
docker-compose restart
```

---

## 📋 **SUCCESS CRITERIA**

### **✅ Deployment Success When**
- ✅ All containers running (`docker-compose ps`)
- ✅ Frontend accessible at domain
- ✅ Backend API responding
- ✅ Database connected and working
- ✅ Redis cache working
- ✅ SSL certificate installed
- ✅ Admin user can login
- ✅ All modules functional
- ✅ Performance optimized
- ✅ Security configured

### **🌐 Access Verification**
```bash
# Check frontend
curl -f https://erp.feenixtech.com

# Check API
curl -f https://erp.feenixtech.com/api/health

# Check database
docker-compose exec db psql -U aris_user -d aris_erp -c "SELECT COUNT(*) FROM users;"
```

---

## 🎯 **FINAL STEPS**

### **📋 Post-Deployment Checklist**
- [ ] Domain pointing to VPS IP
- [ ] SSL certificate installed
- [ ] Admin user created
- [ ] All modules working
- [ ] Email configured
- [ ] Logo customized
- [ ] Backup system working
- [ ] Monitoring setup
- [ ] Security configured
- [ ] Performance optimized

### **🚀 Go Live**
```bash
# Final verification
cd /opt/aris-erp
./monitor.sh

# Access application
https://erp.feenixtech.com

# Login and configure
# Email: admin@erp.feenixtech.com
# Password: admin123
```

---

## 🎉 **DEPLOYMENT COMPLETE**

### **✅ What You Get**
- 🏥 **Complete ERP System** - All healthcare modules
- 🎨 **Modern UI** - Responsive, intuitive interface
- 🔒 **Enterprise Security** - SSL, firewall, authentication
- ⚡ **High Performance** - Optimized for production
- 📊 **Real-time Monitoring** - Health checks and logging
- 🔄 **Automated Backups** - Daily database backups
- 🌐 **Domain Ready** - SSL and DNS configured
- 📱 **Mobile Compatible** - Works on all devices
- 🎯 **Logo Customization** - Dynamic branding system

### **🎯 Production Ready**
The ARIS ERP system is now **fully deployed and production-ready** on Hostinger VPS with:

🐳 **Docker Containers** - Isolated, scalable services
🔒 **SSL Encryption** - Secure HTTPS access
⚡ **High Performance** - Optimized for Hostinger resources
🛡️ **Security Hardened** - Firewall and security headers
📊 **Monitoring Ready** - Health checks and logging
🔄 **Backup System** - Automated daily backups
🌐 **Domain Configured** - Ready for your domain
📱 **Mobile Optimized** - Responsive design
🎨 **Customizable** - Logo and branding system

---

## 🚀 **DEPLOY NOW**

### **📋 Quick Commands**
```bash
# Connect to VPS
ssh root@your-vps-ip

# Deploy ARIS ERP
wget https://your-domain.com/hostinger-deploy.sh
chmod +x hostinger-deploy.sh
./hostinger-deploy.sh

# Setup SSL (after domain points to VPS)
cd /opt/aris-erp
certbot --nginx -d erp.feenixtech.com --email admin@erp.feenixtech.com --agree-tos --non-interactive

# Monitor system
cd /opt/aris-erp
./monitor.sh
```

---

**Deploy your complete ARIS ERP system on Hostinger VPS in minutes!** 🚀✨

---

*This deployment package provides everything needed for a clean, production-ready installation on Hostinger Ubuntu VPS.*
