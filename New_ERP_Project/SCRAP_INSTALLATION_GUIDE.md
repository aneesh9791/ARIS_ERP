# 🗑️ **SCRAP EXISTING INSTALLATION GUIDE**
## Complete Removal of aris-deploy9 from Hostinger VPS

---

## 🎯 **OVERVIEW**

This guide provides a complete solution to scrap the existing `aris-deploy9` installation in your VPS root directory and prepare the system for a clean, fresh installation.

---

## 🚨 **WARNING**

### **⚠️ Complete Data Loss**
This script will **PERMANENTLY DELETE**:
- ✅ The entire `/root/aris-deploy9` directory
- ✅ All Docker containers and images
- ✅ All databases and data
- ✅ All SSL certificates
- ✅ All application files
- ✅ All configuration files
- ✅ All log files
- ✅ All user data

**Backup any important data before proceeding!**

---

## 📋 **SCRAPING PROCESS**

### **🗑️ What Gets Removed**
1. **Application Directory** - `/root/aris-deploy9`
2. **Docker Services** - All containers, images, volumes
3. **Node.js** - Node.js, npm, yarn
4. **PostgreSQL** - Database server and data
5. **Redis** - Cache server and data
6. **Nginx** - Web server and configuration
7. **SSL Certificates** - Let's Encrypt certificates
8. **Application Files** - All related files and services
9. **System Processes** - All running processes
10. **Package Cache** - System package cache

---

## 🚀 **SCRAPING INSTRUCTIONS**

### **📋 Step 1: Connect to VPS**
```bash
ssh root@your-vps-ip
```

### **📋 Step 2: Download Scraping Script**
```bash
# Option 1: Upload from your Mac
scp "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/scrap-existing-installation.sh" root@your-vps-ip:/root/

# Option 2: Download directly (if available)
wget https://your-domain.com/scrap-existing-installation.sh

# Option 3: Create directly on VPS
nano scrap-existing-installation.sh
# (copy script content)
```

### **📋 Step 3: Make Script Executable**
```bash
chmod +x scrap-existing-installation.sh
```

### **📋 Step 4: Run Scraping Script**
```bash
./scrap-existing-installation.sh
```

### **📋 Step 5: Confirm Removal**
```bash
# Check if directory is gone
ls -la /root/ | grep aris-deploy9

# Check if services are stopped
systemctl status nginx postgresql redis-server docker

# Check if packages are removed
which docker node npm psql redis-cli nginx
```

---

## 🔧 **MANUAL SCRAPPING (Optional)**

### **🗑️ Manual Removal Steps**
If the script doesn't work, you can manually remove everything:

#### **1. Stop Services**
```bash
# Stop all services
systemctl stop nginx postgresql redis-server docker
systemctl disable nginx postgresql redis-server docker

# Kill processes
pkill -f node
pkill -f npm
pkill -f docker
pkill -f postgres
pkill -f redis
pkill -f nginx
```

#### **2. Remove Directory**
```bash
# Remove aris-deploy9 directory
rm -rf /root/aris-deploy9

# Remove other possible locations
rm -rf /opt/aris-erp
rm -rf /var/www/aris-erp
rm -rf /home/aris-erp
```

#### **3. Remove Docker**
```bash
# Remove Docker containers and images
docker rm -f $(docker ps -aq) 2>/dev/null || true
docker rmi -f $(docker images -q) 2>/dev/null || true
docker volume rm $(docker volume ls -q) 2>/dev/null || true
docker system prune -af --volumes 2>/dev/null || true

# Remove Docker packages
apt remove -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
apt purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
apt autoremove -y

# Remove Docker directories
rm -rf /var/lib/docker
rm -rf /etc/docker
rm -rf /var/lib/containerd
```

#### **4. Remove Node.js**
```bash
# Remove Node.js packages
apt remove -y nodejs npm yarn
apt purge -y nodejs npm yarn
apt autoremove -y

# Remove Node.js manually
rm -rf /usr/local/bin/node
rm -rf /usr/local/bin/npm
rm -rf /usr/local/lib/node_modules
rm -rf /usr/local/include/node

# Remove NodeSource repository
rm -f /etc/apt/sources.list.d/nodesource.list
rm -f /usr/share/keyrings/nodesource.gpg
```

#### **5. Remove PostgreSQL**
```bash
# Stop PostgreSQL
systemctl stop postgresql
systemctl disable postgresql

# Remove packages
apt remove -y postgresql postgresql-contrib postgresql-client
apt purge -y postgresql postgresql-contrib postgresql-client
apt autoremove -y

# Remove data
rm -rf /var/lib/postgresql
rm -rf /etc/postgresql
rm -rf /var/log/postgresql

# Remove user
deluser postgres
```

#### **6. Remove Redis**
```bash
# Stop Redis
systemctl stop redis-server
systemctl disable redis-server

# Remove packages
apt remove -y redis-server redis-tools
apt purge -y redis-server redis-tools
apt autoremove -y

# Remove data
rm -rf /var/lib/redis
rm -rf /etc/redis
rm -rf /var/log/redis

# Remove user
deluser redis
```

#### **7. Remove Nginx**
```bash
# Stop Nginx
systemctl stop nginx
systemctl disable nginx

# Remove packages
apt remove -y nginx nginx-common nginx-core
apt purge -y nginx nginx-common nginx-core
apt autoremove -y

# Remove directories
rm -rf /etc/nginx
rm -rf /var/log/nginx
rm -rf /var/www/html
rm -rf /usr/share/nginx

# Remove user
deluser www-data
```

#### **8. Remove SSL**
```bash
# Remove Let's Encrypt
rm -rf /etc/letsencrypt
rm -rf /var/lib/letsencrypt
rm -rf /var/log/letsencrypt

# Remove Certbot
apt remove -y certbot python3-certbot-nginx
apt purge -y certbot python3-certbot-nginx
apt autoremove -y
```

#### **9. Clean System**
```bash
# Update package lists
apt update

# Clean package cache
apt autoremove -y
apt autoclean -y
apt clean

# Remove temporary files
rm -rf /tmp/*
rm -rf /var/tmp/*

# Reload systemd
systemctl daemon-reload
```

---

## 📊 **VERIFICATION**

### **✅ Check Removal Success**
```bash
# Check directory is gone
ls -la /root/ | grep aris-deploy9

# Check services are stopped
systemctl status nginx postgresql redis-server docker

# Check packages are removed
which docker node npm psql redis-cli nginx

# Check processes are killed
ps aux | grep -E "(docker|node|npm|postgres|redis|nginx)"

# Check ports are free
netstat -tulpn | grep -E "(80|443|5432|6379|3000|5000)"

# Check disk space
df -h
```

### **✅ Expected Results**
After successful scraping, you should see:
- ❌ No `/root/aris-deploy9` directory
- ❌ No Docker containers running
- ❌ No Node.js installed
- ❌ No PostgreSQL installed
- ❌ No Redis installed
- ❌ No Nginx installed
- ❌ No processes using ports 80, 443, 5432, 6379, 3000, 5000

---

## 🔄 **AFTER SCRAPPING**

### **📋 Next Steps**
1. **Reboot System** (recommended)
   ```bash
   reboot
   ```

2. **Wait for Reboot**
   ```bash
   # Wait 1-2 minutes for system to reboot
   # Then reconnect via SSH
   ssh root@your-vps-ip
   ```

3. **Verify Clean System**
   ```bash
   # Check system is clean
   ls -la /root/
   which docker node npm psql redis-cli nginx
   ```

4. **Deploy Fresh Installation**
   ```bash
   # Download fresh deployment script
   wget https://your-domain.com/hostinger-deploy.sh
   chmod +x hostinger-deploy.sh
   ./hostinger-deploy.sh
   ```

---

## 🔧 **TROUBLESHOOTING**

### **🚨 Common Issues**

#### **Permission Denied**
```bash
# Make script executable
chmod +x scrap-existing-installation.sh

# Run as root
sudo ./scrap-existing-installation.sh
```

#### **Processes Still Running**
```bash
# Force kill processes
pkill -9 -f node
pkill -9 -f docker
pkill -9 -f postgres
pkill -9 -f redis
pkill -9 -f nginx

# Reboot system
reboot
```

#### **Packages Still Installed**
```bash
# Force remove packages
apt remove --purge -y docker-ce docker-ce-cli containerd.io
apt remove --purge -y nodejs npm
apt remove --purge -y postgresql postgresql-contrib
apt remove --purge -y redis-server redis-tools
apt remove --purge -y nginx nginx-common

# Autoremove
apt autoremove --purge -y
```

#### **Directory Still Exists**
```bash
# Force remove directory
rm -rf /root/aris-deploy9
rm -rf /opt/aris-erp
rm -rf /var/www/aris-erp

# Check for hidden files
ls -la /root/ | grep aris
```

---

## 🎯 **SUCCESS CRITERIA**

### **✅ Scraping Successful When**
- ✅ `/root/aris-deploy9` directory completely removed
- ✅ All Docker containers, images, volumes removed
- ✅ All packages (Docker, Node.js, PostgreSQL, Redis, Nginx) removed
- ✅ All processes killed
- ✅ All ports free
- ✅ System cache cleaned
- ✅ No remaining application files
- ✅ System ready for fresh installation

---

## 🎉 **SCRAPPING COMPLETE**

### **✅ What You'll Have After Scraping**
- 🗑️ **Clean System** - No traces of previous installation
- 🔄 **Fresh Start** - Ready for new deployment
- 💾 **Free Disk Space** - All old files removed
- 🔧 **Clean Ports** - All ports available
- 📦 **Clean Packages** - No conflicting packages
- 🚀 **Ready for Deployment** - Clean slate for new installation

---

## 🚀 **NEXT STEPS**

### **📋 After Scraping**
1. **Reboot System** - `reboot`
2. **Wait for Reboot** - 1-2 minutes
3. **Reconnect** - `ssh root@your-vps-ip`
4. **Deploy Fresh** - `./hostinger-deploy.sh`
5. **Configure** - Set up domain and SSL
6. **Go Live** - Start using your new ARIS ERP

---

## 🎊 **READY FOR FRESH INSTALLATION**

Your system will be **completely clean** and ready for a fresh ARIS ERP installation with:

🗑️ **No Conflicts** - All old components removed
🔄 **Clean Slate** - Fresh installation possible
💾 **More Space** - Disk space freed up
🔧 **Clean Ports** - All ports available
📦 **Clean Packages** - No version conflicts
🚀 **Ready to Deploy** - Perfect for new installation

---

**Run the scraping script and prepare your VPS for a fresh, clean ARIS ERP installation!** 🗑️✨

---

*This guide provides complete instructions for removing the existing aris-deploy9 installation and preparing for a fresh deployment.*
