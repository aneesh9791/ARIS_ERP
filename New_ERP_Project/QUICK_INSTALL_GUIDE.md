# 🚀 **QUICK INSTALL GUIDE**
## Simple ARIS ERP Installation on Hostinger Ubuntu VPS

---

## 🎯 **OVERVIEW**

Since your current ERP v3 is not a production system, this is a **simple, clean installation** without any migration complexity. We'll install the new Docker-based ARIS ERP from scratch.

### **⚡ What This Does**
- ✅ Installs Docker and Docker Compose
- ✅ Deploys ARIS ERP with all services
- ✅ Sets up SSL certificate
- ✅ Configures firewall
- ✅ Creates admin user
- ✅ Ready to use in ~15 minutes

---

## 🚀 **ONE-CLICK INSTALLATION**

### **Step 1: SSH into your Hostinger Server**
```bash
ssh user@erp.feenixtech.com
```

### **Step 2: Download and Run Quick Install**
```bash
# Download the quick install script
curl -fsSL https://your-domain.com/QUICK_INSTALL.sh -o quick-install.sh

# Make it executable
chmod +x quick-install.sh

# Run the installation
./quick-install.sh
```

**That's it!** The script will handle everything automatically.

---

## 📋 **MANUAL INSTALLATION (Optional)**

If you prefer to install manually:

### **1. Update System**
```bash
sudo apt update && sudo apt upgrade -y
```

### **2. Install Docker**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### **3. Setup Project**
```bash
# Create project directory
sudo mkdir -p /opt/aris-erp
sudo chown $USER:$USER /opt/aris-erp

# Copy project files (from your local machine)
scp -r /Volumes/DATA\ HD/ARIS_ERP/New_ERP_Project/* user@erp.feenixtech.com:/opt/aris-erp/

# SSH into server and setup
ssh user@erp.feenixtech.com
cd /opt/aris-erp

# Setup environment
cp .env.example .env
# Edit .env with your domain: erp.feenixtech.com
```

### **4. Install SSL**
```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/C=US/ST=State/L=City/O=ARIS Healthcare/CN=erp.feenixtech.com"

# Install Certbot (for Let's Encrypt later)
sudo apt install -y certbot python3-certbot-nginx
```

### **5. Build and Start**
```bash
# Build containers
sudo docker compose build --no-cache

# Start services
sudo docker compose up -d

# Wait for services to start
sleep 60

# Check status
sudo docker compose ps
```

### **6. Setup Database**
```bash
# Wait for database
until sudo docker compose exec -T db pg_isready -U aris_user -d aris_erp; do
    echo "Waiting for database..."
    sleep 5
done

# Run migrations
sudo docker compose exec -T db psql -U aris_user -d aris_erp < backend/migrations/init.sql

# Create admin user
sudo docker compose exec -T backend npm run seed
```

### **7. Setup Firewall**
```bash
# Configure firewall
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 🔗 **ACCESS YOUR NEW ERP**

### **🌐 Access URLs**
```
Frontend:     http://erp.feenixtech.com
Frontend:     https://erp.feenixtech.com
Backend API:  http://erp.feenixtech.com/api
Health Check: http://erp.feenixtech.com/health
```

### **🔑 Default Login**
```
Email:    admin@aris.com
Password: admin123
```

---

## 🛠️ **POST-INSTALLATION**

### **1. Change Default Password**
1. Login to your ERP
2. Go to Settings → Users
3. Change admin password
4. Create other admin users

### **2. Setup Let's Encrypt SSL**
```bash
# Setup proper SSL certificate
sudo certbot --nginx -d erp.feenixtech.com -d www.erp.feenixtech.com
```

### **3. Configure Email**
```bash
# Edit .env file
cd /opt/aris-erp
nano .env

# Update email settings
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Restart services
sudo docker compose restart backend
```

### **4. Setup Backups**
```bash
# Backup script is already configured
# Manual backup:
cd /opt/aris-erp
sudo docker compose exec db pg_dump -U aris_user aris_erp > backup.sql

# View backup schedule:
crontab -l
```

---

## 📊 **MANAGEMENT COMMANDS**

### **🔧 Common Commands**
```bash
cd /opt/aris-erp

# View logs
sudo docker compose logs -f

# View specific service logs
sudo docker compose logs -f backend
sudo docker compose logs -f frontend
sudo docker compose logs -f db

# Restart services
sudo docker compose restart
sudo docker compose restart backend
sudo docker compose restart frontend

# Stop services
sudo docker compose down

# Start services
sudo docker compose up -d

# Update services
sudo docker compose pull
sudo docker compose up -d

# View resource usage
sudo docker stats
```

### **📱 Service Status**
```bash
# Check all services
sudo docker compose ps

# Check service health
curl http://erp.feenixtech.com/health
curl http://erp.feenixtech.com/api/health

# Check database
sudo docker compose exec db pg_isready -U aris_user -d aris_erp
```

---

## 🔧 **TROUBLESHOOTING**

### **🐛 Common Issues**

#### **1. Services Not Starting**
```bash
# Check logs
sudo docker compose logs

# Restart services
sudo docker compose restart

# Check Docker status
sudo systemctl status docker
```

#### **2. Database Connection Issues**
```bash
# Check database status
sudo docker compose exec db pg_isready -U aris_user -d aris_erp

# Restart database
sudo docker compose restart db

# Check network
sudo docker compose exec backend ping db
```

#### **3. SSL Issues**
```bash
# Check SSL certificate
sudo openssl x509 -in nginx/ssl/cert.pem -text -noout

# Regenerate certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/C=US/ST=State/L=City/O=ARIS Healthcare/CN=erp.feenixtech.com"

# Restart nginx
sudo docker compose restart nginx
```

#### **4. Performance Issues**
```bash
# Check resource usage
sudo docker stats
sudo htop
sudo df -h

# Clean up Docker
sudo docker system prune -a
```

---

## 📈 **PERFORMANCE OPTIMIZATION**

### **⚡ Quick Optimizations**
```bash
# Optimize database
sudo docker compose exec db psql -U aris_user -d aris_erp -c "
ANALYZE;
VACUUM ANALYZE;
"

# Scale services (if needed)
sudo docker compose up -d --scale backend=2

# Monitor performance
sudo docker stats
```

### **🔧 Configuration Tuning**
```bash
# Edit .env for performance
cd /opt/aris-erp
nano .env

# Add these settings:
MAX_WORKERS=4
POOL_MIN=2
POOL_MAX=10
CACHE_TTL=3600

# Restart services
sudo docker compose restart
```

---

## 🎯 **NEXT STEPS**

### **📋 Immediate Actions**
1. ✅ **Change Default Password** - Security first
2. ✅ **Setup SSL Certificate** - Use Let's Encrypt
3. ✅ **Configure Email** - For notifications
4. ✅ **Add Users** - Create user accounts
5. ✅ **Setup Departments** - Configure organization

### **🔧 Configuration**
1. ✅ **Organization Settings** - Company info
2. ✅ **Financial Settings** - Currency, fiscal year
3. ✅ **User Roles** - Permissions and access
4. ✅ **Backup Schedule** - Automated backups
5. ✅ **Monitoring** - Health checks

### **📊 Data Entry**
1. ✅ **Add Centers** - Hospital/clinic locations
2. ✅ **Add Departments** - Medical departments
3. ✅ **Add Staff** - Doctors, nurses, admin
4. ✅ **Add Services** - Consultations, tests
5. ✅ **Add Pricing** - Service rates

---

## 🎉 **SUCCESS!**

Your ARIS ERP is now running on Hostinger Ubuntu VPS with Docker!

### **✅ What's Installed**
- ✅ **PostgreSQL Database** - Persistent data storage
- ✅ **Redis Cache** - Session management
- ✅ **Backend API** - RESTful API server
- ✅ **Frontend** - React web application
- ✅ **Nginx** - Reverse proxy with SSL
- ✅ **Backup Service** - Automated backups
- ✅ **Firewall** - Security configured

### **🔗 Quick Links**
- **ERP System**: https://erp.feenixtech.com
- **Admin Login**: admin@aris.com / admin123
- **API Docs**: https://erp.feenixtech.com/api/docs

### **🛠️ Management**
```bash
# All management from one directory
cd /opt/aris-erp

# View logs
sudo docker compose logs -f

# Restart services
sudo docker compose restart

# Update system
sudo docker compose pull && sudo docker compose up -d
```

### **🎊 Congratulations!**
Your ARIS ERP is ready to use! The system includes:
- 🏥 **Patient Management**
- 👨‍⚕️ **Doctor/Staff Management**
- 📅 **Appointment Scheduling**
- 💊 **Pharmacy Management**
- 🧪 **Laboratory Management**
- 💰 **Financial Management**
- 📊 **BI Dashboard**
- 📱 **Mobile Responsive**

The installation is complete and your ERP is ready for production use! 🚀✨
