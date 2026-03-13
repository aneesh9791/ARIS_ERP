# 🔒 **SAFE SHUTDOWN BEFORE SCRAPPING**
## Properly Stop Docker Services Before Scraping

---

## 🎯 **OVERVIEW**

This guide provides a safe shutdown process for Docker-based ARIS ERP installations before scraping. It ensures proper shutdown of applications and databases to prevent data loss.

---

## 🚨 **WHY SAFE SHUTDOWN IS IMPORTANT**

### **🔒 Data Protection**
- ✅ **Database Data** - Preserved in Docker volumes
- ✅ **Application State** - Gracefully stopped
- ✅ **Cache Data** - Saved before stopping
- ✅ **User Sessions** - Properly terminated
- ✅ **File Operations** - Completed before shutdown

### **📋 Shutdown Order**
1. **Frontend** - No data loss risk
2. **Backend** - No data loss risk
3. **Nginx** - No data loss risk
4. **Redis** - Cache data saved
5. **PostgreSQL** - Data preserved in volumes
6. **Backup Container** - Stopped last

---

## 🚀 **SAFE SHUTDOWN INSTRUCTIONS**

### **📋 Step 1: Upload Script to VPS**
```bash
# From your Mac, upload to Hostinger VPS
scp "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/safe-shutdown-before-scrap.sh" root@your-vps-ip:/root/
```

### **📋 Step 2: Connect to VPS**
```bash
ssh root@your-vps-ip
```

### **📋 Step 3: Make Script Executable**
```bash
chmod +x safe-shutdown-before-scrap.sh
```

### **📋 Step 4: Run Safe Shutdown Script**
```bash
./safe-shutdown-before-scrap.sh
```

### **📋 Step 5: Verify Shutdown**
```bash
# Check containers are stopped
docker ps -a | grep -E "(aris|erp|postgres|redis|nginx)"

# Check ports are free
netstat -tulpn | grep -E "(80|443|3000|5000|5432|6379)"
```

---

## 🔧 **SAFE SHUTDOWN PROCESS**

### **📊 What the Script Does**

#### **1. Show Current Status**
```bash
# Shows running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Shows volumes
docker volume ls --format "table {{.Name}}\t{{.Driver}}"

# Shows networks
docker network ls --format "table {{.Name}}\t{{.Driver}}"

# Shows resource usage
docker stats --no-stream --format "table {{.Container}}\t{{.CPUS}}\t{{.MemUsage}}"
```

#### **2. Backup Data (Optional)**
```bash
# Creates backup directory
BACKUP_DIR="/root/aris-backup-$(date +%Y%m%d_%H%M%S)"

# Backup PostgreSQL
docker exec aris-erp-db pg_dump -U aris_user -d aris_erp > "$BACKUP_DIR/postgres_backup_$(date +%Y%m%d_%H%M%S).sql"

# Backup Redis
docker exec aris-erp-redis redis-cli BGSAVE
docker cp aris-erp-redis:/data/dump.rdb "$BACKUP_DIR/redis_backup_$(date +%Y%m%d_%H%M%S).rdb"

# Backup application files
cp -r backend frontend nginx docker-compose.yml .env "$BACKUP_DIR/"
```

#### **3. Stop Application Services**
```bash
# Stop frontend first
docker stop aris-erp-frontend

# Stop backend
docker stop aris-erp-backend

# Stop nginx
docker stop aris-erp-nginx
```

#### **4. Stop Database Services**
```bash
# Stop Redis (save data first)
docker exec aris-erp-redis redis-cli BGSAVE
sleep 2
docker stop aris-erp-redis

# Stop PostgreSQL (graceful)
docker exec aris-erp-db pg_ctl -D /var/lib/postgresql/data -m fast
sleep 3
docker stop aris-erp-db
```

#### **5. Stop Remaining Containers**
```bash
# Stop any remaining aris containers
docker stop $(docker ps --filter "name=aris" -q)
docker stop $(docker ps --filter "name=erp" -q)

# Stop backup container
docker stop $(docker ps --filter "name=backup" -q)
```

---

## 📊 **VERIFICATION**

### **✅ After Safe Shutdown**
```bash
# Check containers are stopped
docker ps -a --format "table {{.Names}}\t{{.Status}}"

# Expected result: All containers show "Exited" status

# Check volumes are preserved
docker volume ls --format "table {{.Name}}\t{{.Driver}}"

# Expected result: All volumes still exist

# Check ports are free
netstat -tulpn | grep -E ":(80|443|3000|5000|5432|6379)"

# Expected result: No output (ports are free)
```

### **✅ Expected Status**
```
✅ All containers are stopped
✅ No aris containers found
✅ All ports are free
✅ Data preserved in volumes
✅ System ready for scraping
```

---

## 🔧 **MANUAL SAFE SHUTDOWN**

### **🐳 Manual Docker Shutdown**
If the script doesn't work, you can manually stop services:

#### **1. Navigate to Project Directory**
```bash
cd /root/aris-deploy9
```

#### **2. Check Running Containers**
```bash
docker ps
```

#### **3. Stop Services in Order**
```bash
# Stop frontend
docker stop aris-erp-frontend

# Stop backend
docker stop aris-erp-backend

# Stop nginx
docker stop aris-erp-nginx

# Save Redis data
docker exec aris-erp-redis redis-cli BGSAVE

# Stop Redis
docker stop aris-erp-redis

# Gracefully stop PostgreSQL
docker exec aris-erp-db pg_ctl -D /var/lib/postgresql/data -m fast
docker stop aris-erp-db
```

#### **4. Verify Shutdown**
```bash
# Check all containers are stopped
docker ps -a

# Check ports are free
netstat -tulpn | grep -E ":(80|443|3000|5000|5432|6379)"
```

---

## 🔄 **AFTER SAFE SHUTDOWN**

### **📋 Next Steps**
1. **Run Scraping Script**
   ```bash
   ./scrap-docker-installation.sh
   ```

2. **Reboot System** (recommended)
   ```bash
   reboot
   ```

3. **Wait for Reboot** (1-2 minutes)

4. **Reconnect to VPS**
   ```bash
   ssh root@your-vps-ip
   ```

5. **Deploy Fresh Installation**
   ```bash
   ./hostinger-deploy.sh
   ```

---

## 🚨 **TROUBLESHOOTING**

### **🐳 Container Issues**

#### **Containers Won't Stop**
```bash
# Force stop containers
docker stop $(docker ps -q)
docker kill $(docker ps -q)

# Force remove containers
docker rm -f $(docker ps -aq)
```

#### **Database Won't Stop Gracefully**
```bash
# Force stop PostgreSQL
docker stop aris-erp-db

# Check database status
docker logs aris-erp-db
```

#### **Redis Data Not Saving**
```bash
# Check Redis status
docker exec aris-erp-redis redis-cli INFO

# Force save
docker exec aris-erp-redis redis-cli SAVE
```

### **📁 Backup Issues**

#### **Backup Directory Not Created**
```bash
# Create backup directory manually
mkdir -p /root/aris-backup-$(date +%Y%m%d_%H%M%S)

# Set permissions
chmod 755 /root/aris-backup-$(date +%Y%m%d_%H%M%S)
```

#### **Backup Files Not Created**
```bash
# Check permissions
ls -la /root/aris-backup-$(date +%Y%m%d_%H%M%S)

# Create backups manually
docker exec aris-erp-db pg_dump -U aris_user -d aris_erp > backup.sql
```

---

## 📋 **SHUTDOWN CHECKLIST**

### **✅ Pre-Shutdown Checklist**
- [ ] Connected to VPS as root
- [ ] Navigated to aris-deploy9 directory
- [ ] Docker and Docker Compose installed
- [ ] Scripts uploaded and executable

### **✅ Shutdown Process Checklist**
- [ ] Current status displayed
- [ ] Data backed up (optional)
- [ ] Frontend stopped
- [ ] Backend stopped
- [ ] Nginx stopped
- [ ] Redis data saved
- [ ] Redis stopped
- [ ] PostgreSQL gracefully stopped
- [ ] Remaining containers stopped

### **✅ Post-Shutdown Checklist**
- [ ] All containers stopped
- [ ] All ports free
- [ ] Data preserved in volumes
- [ ] System ready for scraping
- [ ] Backup files created (if chosen)

---

## 🎯 **SUCCESS CRITERIA**

### **✅ Safe Shutdown Successful When**
- ✅ All containers stopped gracefully
- ✅ Database data preserved in volumes
- ✅ Redis data saved before stopping
- ✅ No running processes using ports
- ✅ No active connections to database
- ✅ No file operations in progress
- ✅ System ready for scraping

---

## 🎉 **SAFE SHUTDOWN COMPLETE**

### **✅ What You'll Have After Safe Shutdown**
- 🔒 **Data Protected** - All data preserved in Docker volumes
- 🛑 **Services Stopped** - All containers gracefully stopped
- 📊 **System Clean** - No running processes
- 💾 **Backup Created** - Optional backup files created
- 🔧 **Ready for Scraping** - System prepared for removal
- 📋 **Clear Status** - Full status report provided

---

## 🚀 **NEXT STEPS**

### **📋 After Safe Shutdown**
1. **Run Scraping Script**
   ```bash
   ./scrap-docker-installation.sh
   ```

2. **Verify Scraping Complete**
   ```bash
   docker ps -a
   docker volume ls
   ls -la /root/ | grep aris
   ```

3. **Deploy Fresh Installation**
   ```bash
   ./hostinger-deploy.sh
   ```

---

## 🎊 **READY FOR SAFE SCRAPPING**

Your system is now **safely prepared** for scraping with:

🔒 **Data Protected** - All data preserved in Docker volumes
🛑 **Services Stopped** - All containers gracefully stopped
📊 **System Clean** - No running processes
💾 **Backup Option** - Optional backup files created
🔧 **Ready for Scraping** - System prepared for removal
📋 **Clear Status** - Full status report available

---

## 🚀 **RUN NOW**

### **📋 Quick Commands**
```bash
# Upload script to VPS
scp "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project/safe-shutdown-before-scrap.sh" root@your-vps-ip:/root/

# Connect to VPS
ssh root@your-vps-ip

# Make executable and run
chmod +x safe-shutdown-before-scrap.sh
./safe-shutdown-before-scrap.sh

# After shutdown, scrape
./scrap-docker-installation.sh

# Deploy fresh
./hostinger-deploy.sh
```

---

**Run the safe shutdown script first to properly stop all Docker services and protect your data before scraping!** 🔒✨

---

*This guide ensures safe shutdown of Docker services before scraping, protecting your data and preventing data loss.*
