# 🍎 **MAC DOCKER SETUP GUIDE**
## Run ARIS ERP System on macOS

---

## 🎯 **MAC-SPECIFIC SETUP**

### **🐳 Install Docker Desktop for Mac**
```bash
# 1. Download Docker Desktop for Mac
# Visit: https://www.docker.com/products/docker-desktop/

# 2. Install Docker Desktop
# Double-click the downloaded .dmg file
# Drag Docker to Applications folder

# 3. Start Docker Desktop
# Open Docker from Applications folder
# Wait for Docker to start (green status in menu bar)
```

### **🔧 Verify Docker Installation**
```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker-compose --version

# Test Docker with hello-world
docker run hello-world
```

---

## 🚀 **QUICK START ON MAC**

### **📂 Navigate to Project Directory**
```bash
# Using Terminal
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project"

# Or using Finder
# Open Finder → Go → Go to Folder
# Enter: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project
```

### **🐳 Start Docker Services**
```bash
# Start all services
docker-compose up -d

# Check if services are running
docker-compose ps

# View logs (optional)
docker-compose logs -f
```

### **⏱️ Wait for Services to Start**
```
⏱️ 2-3 minutes for all services to start
⏱️ Check status with: docker-compose ps
⏱️ All services should show "Up" status
```

---

## 🌐 **ACCESS POINTS ON MAC**

### **🖥️ Main Application**
```bash
# Open in your default browser
open http://localhost:3000

# Or open in Chrome
open -a "Google Chrome" http://localhost:3000

# Or open in Safari
open -a Safari http://localhost:3000
```

### **📊 Database Admin (PgAdmin)**
```bash
# Open PgAdmin
open http://localhost:5050

# Login credentials:
# Email: admin@aris.com
# Password: admin123
```

### **🗄️ Redis Commander**
```bash
# Open Redis Commander
open http://localhost:8081
```

### **⚙️ Backend API**
```bash
# Test API health
curl http://localhost:5000/api/health

# Open API documentation
open http://localhost:5000/api
```

---

## 🍎 **MAC-SPECIFIC TIPS**

### **🔧 Using Terminal**
```bash
# Open Terminal in project directory
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project"
open -a Terminal .

# Or use iTerm2 if installed
open -a iTerm .
```

### **📱 Test on Safari**
```bash
# Test Safari compatibility
open -a Safari http://localhost:3000

# Enable Developer Tools in Safari
# Safari → Preferences → Advanced → Show Develop menu in menu bar
```

### **🔍 Use Activity Monitor**
```bash
# Open Activity Monitor to monitor Docker
open -a "Activity Monitor"

# Filter for "Docker" processes
# Check CPU and Memory usage
```

### **📁 Use Finder**
```bash
# Open project directory in Finder
open "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project"

# Open Docker Desktop from Finder
open -a Finder "/Applications/Docker.app"
```

---

## 🔧 **MAC TROUBLESHOOTING**

### **🚨 Docker Issues**
```bash
# Check Docker Desktop status
# Look for Docker icon in menu bar (should be green)

# Restart Docker Desktop
# Click Docker icon → Restart

# Check Docker processes
ps aux | grep Docker

# Reset Docker Desktop
# Docker Desktop → Preferences → Reset → Reset to factory defaults
```

### **🔌 Port Conflicts**
```bash
# Check port usage on Mac
lsof -i :3000
lsof -i :5000
lsof -i :5432
lsof -i :6379

# Kill processes using ports
sudo kill -9 <PID>

# Or use Activity Monitor to kill processes
open -a "Activity Monitor"
```

### **📁 File Permissions**
```bash
# Fix file permissions on Mac
chmod +x docker-compose.yml
chmod +x backend/Dockerfile
chmod +x frontend/Dockerfile

# Check directory permissions
ls -la "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project"
```

### **🔧 Memory Issues**
```bash
# Check Docker memory usage
docker stats

# Increase Docker memory allocation
# Docker Desktop → Preferences → Resources → Memory
# Increase to at least 4GB
```

---

## 📱 **MOBILE TESTING ON MAC**

### **📲 Test on iPhone/iPad**
```bash
# Find your Mac's IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Access from mobile device
http://<your-mac-ip>:3000

# Example: http://192.168.1.100:3000
```

### **🔧 Enable Network Access**
```bash
# Check firewall settings
# System Preferences → Security & Privacy → Firewall
# Allow Docker and Node.js connections

# Temporarily disable firewall for testing
sudo pfctl -d
# Remember to re-enable later: sudo pfctl -e
```

---

## 🎯 **MAC-SPECIFIC SHORTCUTS**

### **⌨️ Terminal Shortcuts**
```bash
# Quick commands for Mac users
alias aris-start="cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose up -d"
alias aris-stop="cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose down"
alias aris-logs="cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose logs -f"
alias aris-ps="cd '/Volumes/DATA HD/ARIS_ERP/New_ERP_Project' && docker-compose ps"

# Add to ~/.zshrc or ~/.bash_profile
echo 'alias aris-start="cd '\''/Volumes/DATA HD/ARIS_ERP/New_ERP_Project'\'' && docker-compose up -d"' >> ~/.zshrc
source ~/.zshrc
```

### **🖥️ Browser Shortcuts**
```bash
# Quick open in Chrome
open -a "Google Chrome" http://localhost:3000

# Quick open in Safari
open -a Safari http://localhost:3000

# Quick open in Firefox
open -a Firefox http://localhost:3000
```

---

## 🔍 **MAC PERFORMANCE MONITORING**

### **📊 System Monitoring**
```bash
# Open Activity Monitor
open -a "Activity Monitor"

# Monitor Docker containers
docker stats

# Check system resources
top -o cpu
top -o memory

# Check disk space
df -h
```

### **🔧 Docker Desktop Settings**
```bash
# Open Docker Desktop preferences
open -a "Docker Desktop"

# Recommended settings for Mac:
# Memory: 4GB or more
# CPUs: 2 or more
# Disk: 64GB or more
# File sharing: Enabled
```

---

## 🎯 **MAC-SPECIFIC SUCCESS CRITERIA**

### **✅ Mac-Specific Checks**
- [ ] Docker Desktop running (green icon in menu bar)
- [ ] All containers accessible via localhost
- [ ] Application loads in Safari, Chrome, Firefox
- [ ] Database accessible via PgAdmin
- [ ] Redis accessible via Redis Commander
- [ ] Mobile devices can access via Mac IP
- [ ] Performance acceptable on Mac hardware
- [ ] File permissions working correctly

### **✅ Mac Browser Testing**
- [ ] Safari compatibility confirmed
- [ ] Chrome compatibility confirmed
- [ ] Firefox compatibility confirmed
- [ ] Touch interactions work on mobile
- [ ] Responsive design works on all screen sizes

---

## 🎉 **MAC SETUP COMPLETE**

### **✅ You're Ready When You See**
```
🟢 Docker Desktop running (green menu bar icon)
🟢 All containers up and running
🟢 Application accessible at http://localhost:3000
🟢 Database accessible at http://localhost:5050
🟢 Redis accessible at http://localhost:8081
🟢 API responding at http://localhost:5000
🟢 Mobile devices can access via Mac IP
🟢 Performance acceptable on Mac hardware
```

---

## 🚀 **QUICK COMMANDS FOR MAC USERS**

### **🎯 One-Command Operations**
```bash
# Start everything
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" && docker-compose up -d

# Stop everything
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" && docker-compose down

# View logs
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" && docker-compose logs -f

# Check status
cd "/Volumes/DATA HD/ARIS_ERP/New_ERP_Project" && docker-compose ps

# Open application
open http://localhost:3000

# Open database admin
open http://localhost:5050

# Open Redis commander
open http://localhost:8081
```

---

## 📞 **MAC-SPECIFIC HELP**

### **🔧 Common Mac Issues**
1. **Docker Desktop not starting** → Restart Docker Desktop
2. **Port conflicts** → Check with `lsof -i :3000`
3. **Permission denied** → Use `chmod +x` on files
4. **Slow performance** → Increase Docker memory allocation
5. **Can't access from mobile** → Check firewall and IP address

### **📱 Mac-Specific Benefits**
- **Native Docker Desktop** integration
- **Activity Monitor** for performance tracking
- **Safari** compatibility testing
- **iCloud** integration for sharing
- **Spotlight** search for quick access
- **Terminal** integration with shell aliases

---

## 🎊 **MAC OPTIMIZATION TIPS**

### **⚡ Performance Tips**
```bash
# Use Docker Desktop preferences to optimize:
# - Memory allocation (4GB+ recommended)
# - CPU allocation (2+ cores)
# - Disk space (64GB+)
# - File sharing enabled
# - Auto-start enabled
```

### **🔧 System Optimization**
```bash
# Close unnecessary apps while testing
# Use Activity Monitor to monitor resources
# Keep Docker Desktop updated
# Use SSD for better performance
# Ensure sufficient RAM (8GB+ recommended)
```

---

**Your ARIS ERP system is now optimized for macOS and ready for visualization!** 🍎✨

---

*For additional help, refer to MAC_DOCKER_SETUP.md or use the quick commands above.*
