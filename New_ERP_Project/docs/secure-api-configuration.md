# 🔐 Secure API Integration Guide

## 🎯 Overview

This guide explains how to configure secure token-based authentication for the ARIS ERP local system API integration. The system supports both Bearer tokens and API keys with comprehensive security features.

## 🚀 Quick Setup

### **1. Set Authentication Credentials**

#### **Option A: Bearer Token (Recommended)**
```bash
# Set environment variable
export LOCAL_SYSTEM_API_TOKEN="your_secure_bearer_token_here"

# Or add to .env file
echo "LOCAL_SYSTEM_API_TOKEN=your_secure_bearer_token_here" >> .env
```

#### **Option B: API Key**
```bash
# Set environment variable
export LOCAL_SYSTEM_API_KEY="your_secure_api_key_here"

# Or add to .env file
echo "LOCAL_SYSTEM_API_KEY=your_secure_api_key_here" >> .env
```

### **2. Configure API Endpoint**
```bash
# Set your secure endpoint
export LOCAL_SYSTEM_API_ENDPOINT="https://your-local-system.com/api/patient-demographics"

# Or add to .env file
echo "LOCAL_SYSTEM_API_ENDPOINT=https://your-local-system.com/api/patient-demographics" >> .env
```

### **3. Restart Backend Service**
```bash
npm restart
# or
pm2 restart aris-erp
```

## 🗄 Database Configuration

### **Configure via Database (Alternative to Environment Variables)**
```sql
-- Connect to your database
psql -d aris_erp

-- Update API endpoint
UPDATE system_config 
SET value = 'https://your-local-system.com/api/patient-demographics' 
WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT';

-- Set bearer token
UPDATE system_config 
SET value = 'your_secure_bearer_token_here' 
WHERE key = 'LOCAL_SYSTEM_API_TOKEN';

-- Set API key (alternative)
UPDATE system_config 
SET value = 'your_secure_api_key_here' 
WHERE key = 'LOCAL_SYSTEM_API_KEY';

-- Enable security features
UPDATE system_config SET value = 'true' WHERE key = 'ENABLE_REQUEST_SIGNING';
UPDATE system_config SET value = '3' WHERE key = 'API_RETRY_ATTEMPTS';
UPDATE system_config SET value = '15000' WHERE key = 'API_REQUEST_TIMEOUT';
```

### **Verify Configuration**
```sql
-- Check current configuration
SELECT key, value, description 
FROM system_config 
WHERE key IN (
  'LOCAL_SYSTEM_API_ENDPOINT', 
  'LOCAL_SYSTEM_API_TOKEN', 
  'LOCAL_SYSTEM_API_KEY',
  'ENABLE_REQUEST_SIGNING',
  'API_RETRY_ATTEMPTS'
);
```

## 🔧 Security Options

### **Request Signing**
```bash
# Enable payload signing (recommended)
ENABLE_REQUEST_SIGNING=true

# Disable signing (not recommended for production)
ENABLE_REQUEST_SIGNING=false
```

### **Retry Configuration**
```bash
# Number of retry attempts (default: 3)
API_RETRY_ATTEMPTS=5

# Request timeout in milliseconds (default: 15000)
API_REQUEST_TIMEOUT=30000
```

### **Client Identification**
```bash
# Custom client ID (default: aris-erp)
LOCAL_SYSTEM_CLIENT_ID="your-hospital-erp"
```

## 🧪 Testing Configuration

### **Test API Connection**
```bash
# Use curl to test your endpoint
curl -X POST https://your-local-system.com/api/patient-demographics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token_here" \
  -H "X-Client-ID: aris-erp" \
  -d '{
    "test": true,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "client": "aris-erp"
  }'
```

### **Test with API Key**
```bash
curl -X POST https://your-local-system.com/api/patient-demographics \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -H "X-Client-ID: aris-erp" \
  -d '{
    "test": true,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "client": "aris-erp"
  }'
```

### **Test via ARIS ERP**
```bash
# Send test patient demographics
curl -X POST http://localhost:3001/api/patients/1/send-to-local-system \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 📊 Monitoring and Logs

### **Check API Call Logs**
```sql
-- View recent API calls
SELECT 
  patient_id,
  pid,
  endpoint,
  response_code,
  success,
  error_message,
  created_at
FROM api_call_logs 
ORDER BY created_at DESC 
LIMIT 10;

-- View failed calls only
SELECT 
  patient_id,
  pid,
  endpoint,
  response_code,
  error_message,
  created_at
FROM api_call_logs 
WHERE success = false 
ORDER BY created_at DESC;

-- View authentication failures
SELECT 
  patient_id,
  pid,
  endpoint,
  response_code,
  error_message,
  created_at
FROM api_call_logs 
WHERE response_code IN (401, 403) 
ORDER BY created_at DESC;
```

### **Monitor Security Metrics**
```sql
-- Success rate by hour
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN success = true THEN 1 END) as successful_calls,
  COUNT(CASE WHEN success = false THEN 1 END) as failed_calls,
  ROUND(
    COUNT(CASE WHEN success = true THEN 1 END) * 100.0 / COUNT(*), 2
  ) as success_rate
FROM api_call_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Error breakdown
SELECT 
  response_code,
  COUNT(*) as count,
  error_message
FROM api_call_logs 
WHERE success = false 
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY response_code, error_message
ORDER BY count DESC;
```

## 🔍 Troubleshooting

### **Common Issues and Solutions**

#### **401 Unauthorized Error**
**Problem**: Authentication failed
```bash
# Check token validity
curl -X POST https://your-local-system.com/api/patient-demographics \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Solutions**:
- Verify token is correct and not expired
- Check if token has required permissions
- Ensure token is properly encoded (no extra spaces)

#### **403 Forbidden Error**
**Problem**: Insufficient permissions
**Solutions**:
- Check token permissions
- Verify client ID is accepted
- Contact local system administrator

#### **Network Timeout**
**Problem**: Connection timeout
**Solutions**:
```bash
# Increase timeout
API_REQUEST_TIMEOUT=30000

# Check network connectivity
ping your-local-system.com

# Test with curl timeout
curl --max-time 30 -X POST https://your-local-system.com/api/patient-demographics
```

#### **Invalid Checksum Error**
**Problem**: Payload signing issue
**Solutions**:
```bash
# Disable signing temporarily
ENABLE_REQUEST_SIGNING=false

# Check if local system expects signing
# Contact local system administrator
```

### **Debug Mode**
```bash
# Enable debug logging
DEBUG=aris-erp:* npm run dev

# Check logs in real-time
tail -f logs/patients.log | grep "local system"
```

## 🔄 Token Rotation

### **Rotate Bearer Token**
```bash
# 1. Generate new token from your local system
# 2. Update configuration
UPDATE system_config 
SET value = 'new_bearer_token_here' 
WHERE key = 'LOCAL_SYSTEM_API_TOKEN';

# 3. Restart service
npm restart

# 4. Test new token
curl -X POST https://your-local-system.com/api/patient-demographics \
  -H "Authorization: Bearer new_bearer_token_here" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### **Schedule Regular Rotation**
```bash
# Add to crontab for monthly rotation
0 0 1 * * /path/to/rotate-token-script.sh
```

## 🛡️ Security Best Practices

### **Token Security**
- ✅ Use environment variables, not hardcoded tokens
- ✅ Rotate tokens regularly (30-90 days)
- ✅ Use tokens with minimal required permissions
- ✅ Monitor token usage and failed attempts
- ❌ Never commit tokens to version control
- ❌ Don't share tokens via email or chat
- ❌ Don't use tokens in client-side code

### **Network Security**
- ✅ Always use HTTPS endpoints
- ✅ Validate SSL certificates
- ✅ Use firewall rules to restrict access
- ✅ Consider VPN for sensitive data
- ❌ Don't use HTTP in production
- ❌ Don't bypass SSL validation

### **Monitoring**
- ✅ Set up alerts for 401/403 errors
- ✅ Monitor API call patterns
- ✅ Track response times
- ✅ Review failed authentication attempts
- ❌ Don't ignore security logs
- ❌ Don't disable logging in production

## 📞 Support

### **When to Contact Support**
- Repeated 401/403 errors with valid tokens
- Network connectivity issues
- Unexpected error responses
- Security concerns or incidents

### **Information to Provide**
1. Error message and response code
2. Timestamp of the error
3. Patient ID (if applicable)
4. Recent configuration changes
5. Network environment details

### **Debug Information Collection**
```bash
# Collect system information
node --version
npm --version

# Collect configuration
echo "Environment Variables:"
env | grep LOCAL_SYSTEM

echo "Database Config:"
psql -d aris_erp -c "SELECT key, value FROM system_config WHERE key LIKE 'LOCAL_SYSTEM_%'"

# Collect recent logs
tail -n 100 logs/patients.log
```

---

## **🎉 Security Configuration Complete!**

Your ARIS ERP now has:
- ✅ **Token-based authentication** (Bearer tokens or API keys)
- ✅ **Request signing and integrity verification**
- ✅ **Automatic retry logic with exponential backoff**
- ✅ **Comprehensive error handling and logging**
- ✅ **Security monitoring and alerting**
- ✅ **Flexible configuration via environment or database**
- ✅ **Production-ready security features**

The system will now securely authenticate all API calls to your local system with proper token management and security monitoring!
