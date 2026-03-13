# 🔄 **ERP MIGRATION GUIDE**
## Migrating from ERP v3 to New Docker-Based ARIS ERP

---

## 🎯 **MIGRATION OVERVIEW**

This guide helps you migrate from your existing ERP v3 running at `erp.feenixtech.com` to the new Docker-based ARIS ERP system with minimal downtime and data preservation.

### **📋 Current Setup**
- **Existing ERP**: Version 3
- **Domain**: erp.feenixtech.com
- **Platform**: Hostinger Ubuntu VPS
- **Database**: PostgreSQL (assumed)
- **Status**: Currently running

### **🎯 Target Setup**
- **New ERP**: Docker-based ARIS ERP
- **Domain**: erp.feenixtech.com (same domain)
- **Platform**: Hostinger Ubuntu VPS KVM2
- **Database**: PostgreSQL 15 (Docker)
- **Deployment**: Docker containers

---

## 📊 **MIGRATION STRATEGY**

### **🔄 Phased Migration Approach**

#### **Phase 1: Preparation**
- ✅ Backup existing data
- ✅ Setup Docker environment
- ✅ Test new system in parallel
- ✅ Prepare domain migration

#### **Phase 2: Data Migration**
- ✅ Export existing database
- ✅ Transform data schema
- ✅ Import to new system
- ✅ Validate data integrity

#### **Phase 3: Switch Over**
- ✅ Schedule downtime window
- ✅ Update DNS settings
- ✅ Deploy new system
- ✅ Test production functionality

#### **Phase 4: Post-Migration**
- ✅ Monitor system performance
- ✅ Validate all features
- ✅ User training and support
- ✅ Decommission old system

---

## 🛠️ **PREPARATION STEPS**

### **1. Backup Existing System**
```bash
# SSH into your current Hostinger server
ssh user@erp.feenixtech.com

# Create backup directory
mkdir -p /home/user/erp-backup/$(date +%Y%m%d)
cd /home/user/erp-backup/$(date +%Y%m%d)

# Backup database (adjust based on your actual setup)
pg_dump -h localhost -U erp_user erp_database > erp_database_backup.sql

# Backup application files
tar -czf erp_application_backup.tar.gz /var/www/erp/

# Backup configuration files
cp -r /etc/nginx/sites-available/erp* ./
cp -r /etc/ssl/certs/erp* ./

# List backup files
ls -la
```

### **2. Analyze Current Database Structure**
```bash
# Connect to existing database
psql -h localhost -U erp_user erp_database

# List all tables
\dt

# List table schemas
\d table_name

# Export schema
pg_dump -h localhost -U erp_user --schema-only erp_database > erp_schema.sql

# Export data
pg_dump -h localhost -U erp_user --data-only erp_database > erp_data.sql
```

### **3. Setup Docker Environment**
```bash
# Install Docker on existing server
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Clone new ERP project
git clone https://github.com/your-repo/aris-erp.git
cd aris-erp

# Setup environment
cp .env.example .env
# Edit .env with your current configuration
```

---

## 📊 **DATA MIGRATION**

### **1. Database Schema Analysis**
```sql
-- Analyze existing tables
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
ORDER BY table_name, ordinal_position;

-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### **2. Data Mapping**
Create a mapping between old and new database schemas:

```javascript
// data-mapping.js
const dataMapping = {
  // Old table -> New table
  'users': {
    newTable: 'users',
    fieldMapping: {
      'id': 'id',
      'username': 'email',
      'full_name': 'full_name',
      'email': 'email',
      'password': 'password',
      'role': 'role',
      'created_at': 'created_at',
      'updated_at': 'updated_at'
    }
  },
  'patients': {
    newTable: 'patients',
    fieldMapping: {
      'id': 'id',
      'name': 'full_name',
      'email': 'email',
      'phone': 'phone',
      'address': 'address',
      'dob': 'date_of_birth',
      'gender': 'gender',
      'created_at': 'created_at'
    }
  },
  'appointments': {
    newTable: 'appointments',
    fieldMapping: {
      'id': 'id',
      'patient_id': 'patient_id',
      'doctor_id': 'doctor_id',
      'appointment_date': 'appointment_date',
      'status': 'status',
      'notes': 'notes',
      'created_at': 'created_at'
    }
  }
};
```

### **3. Migration Script**
```bash
#!/bin/bash
# migrate-data.sh

# Configuration
OLD_DB_HOST="localhost"
OLD_DB_USER="erp_user"
OLD_DB_NAME="erp_database"
OLD_DB_PASSWORD="old_password"

NEW_DB_HOST="localhost"
NEW_DB_USER="aris_user"
NEW_DB_NAME="aris_erp"
NEW_DB_PASSWORD="new_password"

# Export old data
echo "Exporting data from old database..."
pg_dump -h $OLD_DB_HOST -U $OLD_DB_USER $OLD_DB_NAME > old_data.sql

# Transform data (using Node.js script)
echo "Transforming data..."
node transform-data.js old_data.sql transformed_data.sql

# Import to new database
echo "Importing data to new database..."
docker compose exec -T db psql -U $NEW_DB_USER -d $NEW_DB_NAME < transformed_data.sql

# Validate data
echo "Validating data migration..."
docker compose exec db psql -U $NEW_DB_USER -d $NEW_DB_NAME -c "
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_patients FROM patients;
SELECT COUNT(*) as total_appointments FROM appointments;
"

echo "Migration completed!"
```

---

## 🔄 **PARALLEL DEPLOYMENT**

### **1. Deploy New System Alongside Existing**
```bash
# Deploy new system on different ports
cd /opt/aris-erp

# Update docker-compose.yml to use different ports
# Frontend: 3001 instead of 3000
# Backend: 5001 instead of 5000
# Database: 5433 instead of 5432

# Start new system
sudo docker compose up -d

# Test new system
curl http://localhost:3001
curl http://localhost:5001/api/health
```

### **2. Configure Nginx for Parallel Access**
```nginx
# /etc/nginx/sites-available/erp-new
server {
    listen 80;
    server_name new.erp.feenixtech.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Enable new site
sudo ln -s /etc/nginx/sites-available/erp-new /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### **3. Test New System**
```bash
# Access new system at new.erp.feenixtech.com
# Test all functionality:
# - User authentication
# - Patient management
# - Appointments
# - Billing
# - Reports

# Performance testing
ab -n 100 -c 10 http://new.erp.feenixtech.com/
```

---

## 🚀 **SWITCH OVER PLAN**

### **1. Pre-Switch Checklist**
- [ ] All data migrated successfully
- [ ] New system tested thoroughly
- [ ] SSL certificates ready
- [ ] Backup of old system complete
- [ ] Rollback plan prepared
- [ ] User communication sent
- [ ] Maintenance window scheduled

### **2. Switch Over Script**
```bash
#!/bin/bash
# switch-over.sh

echo "Starting ERP migration switch over..."

# Step 1: Stop old system
echo "Stopping old ERP system..."
sudo systemctl stop nginx
sudo systemctl stop erp-app  # Adjust based on your setup

# Step 2: Backup final data
echo "Creating final backup..."
pg_dump -h localhost -U erp_user erp_database > final_backup.sql

# Step 3: Update new system to use production ports
echo "Configuring new system for production..."
cd /opt/aris-erp
# Update docker-compose.yml to use ports 3000, 5000, 5432
sudo docker compose down
sudo docker compose up -d

# Step 4: Update Nginx configuration
echo "Updating Nginx configuration..."
sudo rm /etc/nginx/sites-enabled/erp-old
sudo ln -s /etc/nginx/sites-available/erp-new /etc/nginx/sites-enabled/erp
sudo nginx -t
sudo systemctl reload nginx

# Step 5: Verify new system
echo "Verifying new system..."
sleep 30
curl -f http://localhost:3000
curl -f http://localhost:5000/api/health

# Step 6: DNS update (if needed)
echo "DNS update may be required..."
echo "Current IP: $(curl -s ifconfig.me)"
echo "Update A record for erp.feenixtech.com to point to this IP"

echo "Switch over completed!"
echo "Monitor system for 24 hours before decommissioning old system"
```

### **3. Post-Switch Validation**
```bash
# Test main domain
curl http://erp.feenixtech.com
curl https://erp.feenixtech.com

# Test API endpoints
curl http://erp.feenixtech.com/api/health
curl http://erp.feenixtech.com/api/users

# Check database
docker compose exec db psql -U aris_user -d aris_erp -c "
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_patients FROM patients;
"

# Monitor logs
sudo docker compose logs -f --tail=50
```

---

## 🚨 **ROLLBACK PLAN**

### **If Migration Fails**
```bash
#!/bin/bash
# rollback.sh

echo "Starting rollback to old ERP system..."

# Step 1: Stop new system
cd /opt/aris-erp
sudo docker compose down

# Step 2: Restore old system
echo "Restoring old ERP system..."
sudo systemctl start erp-app
sudo systemctl start nginx

# Step 3: Verify old system
curl http://erp.feenixtech.com

# Step 4: Notify team
echo "Rollback completed!"
echo "Investigate migration issues and retry later"
```

### **Rollback Triggers**
- Database migration fails
- Critical functionality not working
- Performance degradation > 50%
- User complaints > 10%
- System instability

---

## 📊 **POST-MIGRATION**

### **1. Monitoring**
```bash
# Monitor system performance
sudo docker stats
sudo docker compose logs -f

# Monitor database
docker compose exec db psql -U aris_user -d aris_erp -c "
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Monitor Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### **2. Performance Optimization**
```bash
# Optimize database
docker compose exec db psql -U aris_user -d aris_erp -c "
ANALYZE;
REINDEX DATABASE aris_erp;
VACUUM ANALYZE;
"

# Optimize Docker resources
sudo docker compose up -d --scale backend=2
```

### **3. User Training**
- Create user guide for new features
- Schedule training sessions
- Provide support contact information
- Collect user feedback

---

## 📋 **MIGRATION CHECKLIST**

### **Pre-Migration**
- [ ] Backup all data
- [ ] Test migration script on staging
- [ ] Prepare rollback plan
- [ ] Schedule maintenance window
- [ ] Notify users

### **Migration**
- [ ] Export old data
- [ ] Transform data schema
- [ ] Import to new system
- [ ] Validate data integrity
- [ ] Test functionality

### **Post-Migration**
- [ ] Monitor system performance
- [ ] Validate all features
- [ ] User training
- [ ] Decommission old system
- [ ] Document lessons learned

---

## 🎯 **SUCCESS METRICS**

### **Technical Metrics**
- ✅ Zero data loss
- ✅ < 30 minutes downtime
- ✅ All features working
- ✅ Performance improvement > 20%
- ✅ No security issues

### **Business Metrics**
- ✅ User satisfaction > 90%
- ✅ Training completion > 95%
- ✅ Support tickets < 5/day
- ✅ System availability > 99.9%

---

## 🎉 **MIGRATION COMPLETE!**

Your ERP system has been successfully migrated from version 3 to the new Docker-based ARIS ERP system!

### **✅ Benefits Achieved**
- ✅ **Modern Architecture** - Docker-based deployment
- ✅ **Improved Performance** - Optimized containers
- ✅ **Better Security** - Enhanced security features
- ✅ **Easier Maintenance** - Containerized services
- ✅ **Scalability** - Easy to scale individual services
- ✅ **Data Integrity** - Zero data loss migration

### **🔗 Access Information**
- **Main System**: https://erp.feenixtech.com
- **Admin Panel**: https://erp.feenixtech.com/admin
- **API Documentation**: https://erp.feenixtech.com/api/docs

### **🛠️ Management**
```bash
# System management
cd /opt/aris-erp
sudo docker compose ps
sudo docker compose logs -f
sudo docker compose restart

# Database management
docker compose exec db psql -U aris_user -d aris_erp

# Backup management
./backup.sh
```

The migration is complete and your ERP system is now running on the modern Docker-based architecture! 🚀✨
