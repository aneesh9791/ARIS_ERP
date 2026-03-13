# PID and Accession Number Implementation

## 🎯 Overview

This implementation provides automatic PID generation (AR******** format) and accession number generation (ACC-YY-******** format) for the ARIS ERP system. The system automatically generates these identifiers and sends patient demographics to local systems upon billing payment.

## 📋 Key Features

### **PID (Patient ID) Generation**
- **Format**: `AR********` (AR + 8 digits, zero-padded)
- **Automatic Generation**: Triggered on patient creation
- **Unique**: Guaranteed unique across all patients
- **Searchable**: Patients can be searched by PID
- **Manual Generation**: Available if needed

### **Accession Number Generation**
- **Format**: `ACC-YY-********` (ACC + 2-digit year + 8 digits)
- **Automatic Generation**: Triggered when bill payment status = PAID
- **Study Linking**: Links to both studies and bills
- **Billing Integration**: Generated upon successful payment
- **Year-Based**: Changes annually for easy identification

### **Local System Integration**
- **Automatic API Calls**: Sends demographics when accession number is generated
- **Complete Data**: Includes patient info, studies, billing details
- **Configurable Endpoint**: Customizable local system API endpoint
- **Error Handling**: Comprehensive error logging and retry logic
- **Audit Trail**: Complete logging of all API interactions

## 🗄 Database Schema

### **Enhanced Patients Table**
```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pid VARCHAR(20) UNIQUE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pid_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

### **Enhanced Studies Table**
```sql
ALTER TABLE studies ADD COLUMN IF NOT EXISTS accession_number VARCHAR(20) UNIQUE;
ALTER TABLE studies ADD COLUMN IF NOT EXISTS accession_generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

### **Enhanced Patient Bills Table**
```sql
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_number VARCHAR(20);
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_generated BOOLEAN DEFAULT false;
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS accession_generated_at TIMESTAMP;
```

### **Sequences and Functions**
```sql
-- PID Generation Sequence
CREATE SEQUENCE IF NOT EXISTS pid_sequence START WITH 1 INCREMENT BY 1;

-- Accession Number Generation Sequence  
CREATE SEQUENCE IF NOT EXISTS accession_sequence START WITH 1 INCREMENT BY 1;

-- PID Generation Function
CREATE OR REPLACE FUNCTION generate_pid()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
    pid_text TEXT;
BEGIN
    next_num := nextval('pid_sequence');
    pid_text := 'AR' || LPAD(next_num::TEXT, 8, '0');
    RETURN pid_text;
END;
$$ LANGUAGE plpgsql;

-- Accession Number Generation Function
CREATE OR REPLACE FUNCTION generate_accession_number()
RETURNS TEXT AS $$
DECLARE
    next_num BIGINT;
    accession_text TEXT;
    year_text TEXT;
BEGIN
    year_text := TO_CHAR(CURRENT_DATE, 'YY');
    next_num := nextval('accession_sequence');
    accession_text := 'ACC-' || year_text || '-' || LPAD(next_num::TEXT, 8, '0');
    RETURN accession_text;
END;
$$ LANGUAGE plpgsql;
```

## 🔧 Backend Implementation

### **API Endpoints**

#### **Patient Management**
- `GET /api/patients/:id/demographics` - Get patient with accession numbers
- `POST /api/patients/search-by-pid` - Search patients by PID
- `POST /api/patients/:id/send-to-local-system` - Send demographics to local system
- `POST /api/patients/:id/generate-pid` - Manual PID generation
- `GET /api/patients/stats/pid-accession` - PID and accession statistics
- `GET /api/patients/quick-search` - Enhanced search with PID support

#### **Study Management**
- `GET /api/studies/accession/:accession_number` - Get study by accession number
- `POST /api/studies/:id/generate-accession` - Manual accession generation
- `GET /api/studies/api-logs` - API call logs for monitoring

#### **Billing Management**
- `POST /api/billing/patient-bill` - Create bill with accession generation
- `PATCH /api/billing/:id/payment` - Update payment status (triggers accession generation)
- `GET /api/billing/accession/:accession_number` - Get bill by accession number
- `GET /api/billing/` - List bills with accession number filtering

### **Automatic Triggers**

#### **PID Generation Trigger**
```sql
CREATE TRIGGER trigger_auto_generate_pid
    BEFORE INSERT ON patients
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_pid();
```

#### **Accession Number Generation Trigger**
```sql
CREATE TRIGGER trigger_auto_generate_accession_on_payment
    BEFORE UPDATE ON patient_bills
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_accession_on_payment();
```

## 🌐 Local System Integration

### **API Call Structure**
```javascript
const patientData = {
  patient_id: 123,
  pid: "AR00000001",
  name: "John Doe",
  phone: "+919876543210",
  date_of_birth: "1990-01-01",
  gender: "MALE",
  address: {
    street: "123 Main St",
    city: "Kochi",
    state: "Kerala",
    postal_code: "682024"
  },
  id_proof: {
    type: "AADHAAR",
    number: "123456789012",
    verified: true
  },
  medical_info: {
    blood_group: "O+",
    allergies: "None",
    emergency_contact: {
      name: "Jane Doe",
      phone: "+919876543211"
    }
  },
  center: {
    id: 1,
    name: "Main Diagnostic Center"
  },
  latest_accession_number: "ACC-24-00000001",
  studies: [...],
  billing_info: {
    bill_id: 456,
    bill_number: "BILL-1-20240115-1234",
    total_amount: 1500.00,
    net_amount: 1770.00,
    payment_status: "PAID",
    accession_number: "ACC-24-00000001"
  },
  timestamp: "2024-01-15T10:30:00.000Z"
};
```

### **Configuration**
```sql
INSERT INTO system_config (key, value, description) VALUES
('LOCAL_SYSTEM_API_ENDPOINT', 'http://localhost:8080/api/patient-demographics', 'API endpoint for local system integration'),
('PID_PREFIX', 'AR', 'Prefix for patient ID generation'),
('ACCESSION_PREFIX', 'ACC', 'Prefix for accession number generation'),
('ENABLE_AUTO_PID', 'true', 'Enable automatic PID generation'),
('ENABLE_AUTO_ACCESSION', 'true', 'Enable automatic accession number generation');
```

## 🎨 Frontend Components

### **PIDAccessionManagement Component**
- **Three Tabs**: PID Search, Study Accession, Billing Accession
- **Real-time Search**: Debounced search with loading states
- **Copy Functions**: One-click copy of PIDs and accession numbers
- **Local System Integration**: Send demographics with visual feedback
- **Responsive Design**: Mobile-friendly interface

### **Key Features**
- **PID Search**: Search patients by PID (AR********)
- **Study Search**: Find studies by accession number
- **Billing Search**: Access billing information via accession numbers
- **Send to Local System**: Manual trigger for local system integration
- **Copy to Clipboard**: Easy copying of identifiers

## 📊 Monitoring and Statistics

### **PID and Accession Statistics**
```sql
SELECT * FROM pid_accession_stats;
```

Returns:
- Total patients with PIDs
- Total accession numbers generated
- Highest PID and accession numbers
- Patients with accession numbers
- Last updated timestamp

### **API Call Logs**
```sql
SELECT * FROM api_call_logs 
WHERE patient_id = 123 
ORDER BY created_at DESC;
```

Tracks:
- Patient ID and PID
- API endpoint called
- Request data sent
- Response code
- Success/failure status
- Error messages
- Timestamp

## 🔍 Search Capabilities

### **Enhanced Patient Search**
```javascript
// Search by PID
GET /api/patients/quick-search?search_term=AR00000001

// Search by name, phone, email, or ID proof
GET /api/patients/quick-search?search_term=John

// Search with center filter
GET /api/patients/quick-search?search_term=John&center_id=1
```

### **Study Search by Accession**
```javascript
// Get study by accession number
GET /api/studies/accession/ACC-24-00000001
```

### **Billing Search by Accession**
```javascript
// Get bill by accession number
GET /api/billing/accession/ACC-24-00000001

// List bills with accession filter
GET /api/billing/?accession_number=ACC-24-00000001
```

## 🚀 Implementation Steps

### **1. Database Setup**
```bash
# Run the PID and accession schema
psql -d aris_erp -f database/pid-accession-schema.sql
```

### **2. Backend Setup**
```bash
# Install dependencies
cd backend
npm install axios multer

# Update environment variables
cp .env.example .env
# Configure LOCAL_SYSTEM_API_ENDPOINT
```

### **3. Frontend Setup**
```bash
# Install dependencies
cd frontend
npm install lucide-react react-hook-form @tanstack/react-query
```

### **4. Configuration**
```bash
# Create upload directories
mkdir -p backend/uploads/patients
mkdir -p backend/uploads/id-proofs

# Set up local system endpoint
# Update system_config table with your local system API
```

## 📝 Usage Examples

### **Patient Registration with Automatic PID**
```javascript
// Create patient - PID generated automatically
const patient = await fetch('/api/patients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    phone: '+919876543210',
    // ... other patient details
  })
});

// Response includes PID
{
  "success": true,
  "patient": {
    "id": 123,
    "pid": "AR00000001",
    "name": "John Doe",
    // ... other fields
  }
}
```

### **Bill Payment with Accession Generation**
```javascript
// Create bill with PAID status - accession generated automatically
const bill = await fetch('/api/billing/patient-bill', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    patient_id: 123,
    study_id: 456,
    total_amount: 1500,
    net_amount: 1770,
    payment_status: 'PAID', // This triggers accession generation
    // ... other billing details
  })
});

// Response includes accession number
{
  "success": true,
  "bill": {
    "id": 789,
    "bill_number": "BILL-1-20240115-1234",
    "accession_number": "ACC-24-00000001",
    "accession_generated": true,
    // ... other fields
  }
}
```

### **Send Demographics to Local System**
```javascript
// Manual trigger to send patient demographics
const response = await fetch('/api/patients/123/send-to-local-system', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

// Response
{
  "success": true,
  "message": "Demographics sent successfully to local system",
  "patient_data": { /* complete patient demographics */ },
  "api_endpoint": "http://localhost:8080/api/patient-demographics",
  "response_code": 200
}
```

## � Security Features

### **Token-Based Authentication**
- **Bearer Token Support**: Use JWT or OAuth2 bearer tokens
- **API Key Authentication**: Alternative API key authentication method
- **Automatic Token Management**: Secure storage and retrieval from database
- **Environment Variable Support**: Override tokens via environment variables

### **Request Security**
- **Request Signing**: SHA256 checksum for payload integrity
- **Timestamp Validation**: Prevents replay attacks
- **Unique Request IDs**: Track and audit all API calls
- **Client Identification**: X-Client-ID header for system identification

### **Secure Headers**
```javascript
{
  'Content-Type': 'application/json',
  'User-Agent': 'ARIS-ERP/1.0',
  'X-Client-ID': 'aris-erp',
  'X-Request-ID': 'req_1642742400000_abc123def',
  'X-Timestamp': '2024-01-15T10:30:00.000Z',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  'X-Checksum': 'a1b2c3d4e5f6...'
}
```

### **Secure Payload Structure**
```javascript
{
  "patient_id": 123,
  "pid": "AR00000001",
  "name": "John Doe",
  // ... patient data
  "security": {
    "source": "ARIS-ERP",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "request_id": "req_1642742400000_abc123def",
    "checksum": "sha256_hash_of_payload"
  }
}
```

## 🔧 Security Configuration

### **Environment Variables**
```bash
# Local System API Security
LOCAL_SYSTEM_API_ENDPOINT=https://your-local-system.com/api/demographics
LOCAL_SYSTEM_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
LOCAL_SYSTEM_API_KEY=sk_live_1234567890abcdef
API_REQUEST_TIMEOUT=15000
API_RETRY_ATTEMPTS=3
ENABLE_REQUEST_SIGNING=true
LOCAL_SYSTEM_CLIENT_ID=aris-erp
ENABLE_DEMOGRAPHICS_SYNC=true
```

### **Database Configuration**
```sql
-- Update with your secure tokens
UPDATE system_config 
SET value = 'https://your-local-system.com/api/demographics' 
WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT';

UPDATE system_config 
SET value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' 
WHERE key = 'LOCAL_SYSTEM_API_TOKEN';

UPDATE system_config 
SET value = 'sk_live_1234567890abcdef' 
WHERE key = 'LOCAL_SYSTEM_API_KEY';
```

### **Security Options**
```sql
-- Enable/disable security features
UPDATE system_config SET value = 'true' WHERE key = 'ENABLE_REQUEST_SIGNING';
UPDATE system_config SET value = '3' WHERE key = 'API_RETRY_ATTEMPTS';
UPDATE system_config SET value = '15000' WHERE key = 'API_REQUEST_TIMEOUT';
```

## 🛡️ Authentication Methods

### **Method 1: Bearer Token (Recommended)**
```bash
# Set bearer token
LOCAL_SYSTEM_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Or update in database
UPDATE system_config 
SET value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' 
WHERE key = 'LOCAL_SYSTEM_API_TOKEN';
```

### **Method 2: API Key**
```bash
# Set API key
LOCAL_SYSTEM_API_KEY=sk_live_1234567890abcdef

# Or update in database
UPDATE system_config 
SET value = 'sk_live_1234567890abcdef' 
WHERE key = 'LOCAL_SYSTEM_API_KEY';
```

### **Method 3: Both (Token优先)**
The system will use bearer token if available, otherwise fallback to API key.

## 🔄 Retry and Error Handling

### **Automatic Retry Logic**
- **Retry Attempts**: Configurable (default: 3)
- **Exponential Backoff**: 1s, 2s, 3s delays
- **No Retry on Auth Errors**: 401/403 errors fail immediately
- **Network Error Retry**: Retries on connection timeouts
- **Server Error Retry**: Retries on 5xx errors

### **Error Response Handling**
```javascript
// Success Response
{
  "success": true,
  "message": "Demographics sent successfully to local system",
  "attempt": 1,
  "status": 200
}

// Error Response
{
  "success": false,
  "message": "Authentication failed - Invalid token or API key",
  "status": 401,
  "error": "Unauthorized",
  "attempts": 3
}
```

## 📊 Security Monitoring

### **API Call Logs**
```sql
SELECT 
  patient_id, 
  pid, 
  endpoint, 
  response_code, 
  success, 
  error_message,
  created_at
FROM api_call_logs 
WHERE success = false 
ORDER BY created_at DESC 
LIMIT 10;
```

### **Security Metrics**
- **Failed Authentication Attempts**: Track 401/403 errors
- **Request Volume**: Monitor API call frequency
- **Response Times**: Track performance metrics
- **Error Rates**: Monitor success/failure ratios

## 🔍 Local System API Requirements

### **Expected Endpoint**
```
POST /api/patient-demographics
Content-Type: application/json
Authorization: Bearer <token> OR X-API-Key: <key>
```

### **Security Headers Expected**
- `X-Client-ID`: Client identification
- `X-Request-ID`: Unique request tracking
- `X-Timestamp`: Request timestamp
- `X-Checksum`: Payload integrity check

### **Response Format**
```javascript
// Success Response
{
  "success": true,
  "status": "success",
  "message": "Patient demographics received",
  "patient_id": 123,
  "pid": "AR00000001",
  "processed_at": "2024-01-15T10:30:00.000Z"
}

// Error Response
{
  "success": false,
  "status": "error",
  "message": "Invalid patient data",
  "errors": ["PID format invalid", "Missing required fields"],
  "request_id": "req_1642742400000_abc123def"
}
```

## 🚀 Secure Implementation Steps

### **1. Configure Authentication**
```bash
# Set your secure token
export LOCAL_SYSTEM_API_TOKEN="your_secure_bearer_token"

# Or API key alternative
export LOCAL_SYSTEM_API_KEY="your_secure_api_key"
```

### **2. Update Database Configuration**
```sql
-- Configure secure endpoint
INSERT INTO system_config (key, value, description) VALUES
('LOCAL_SYSTEM_API_ENDPOINT', 'https://your-secure-system.com/api/demographics', 'Secure API endpoint'),
('LOCAL_SYSTEM_API_TOKEN', 'your_bearer_token', 'Bearer token for authentication'),
('ENABLE_REQUEST_SIGNING', 'true', 'Enable payload signing'),
('API_RETRY_ATTEMPTS', '3', 'Number of retry attempts')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### **3. Test Secure Connection**
```javascript
// Test the secure API client
const apiClient = await createSecureClient(pool);
const testResult = await apiClient.testConnection(endpoint);

console.log('Test Result:', testResult);
// Expected: { success: true, status: 200, message: 'Request successful' }
```

### **4. Monitor Security Logs**
```sql
-- Check for authentication failures
SELECT * FROM api_call_logs 
WHERE response_code IN (401, 403) 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## ⚠️ Security Best Practices

### **Token Management**
- **Rotate Tokens Regularly**: Change tokens every 30-90 days
- **Use Environment Variables**: Never commit tokens to code
- **Least Privilege**: Use tokens with minimal required permissions
- **Token Expiration**: Use tokens with reasonable expiration times

### **Network Security**
- **HTTPS Only**: Always use HTTPS endpoints
- **Certificate Validation**: Ensure SSL certificates are valid
- **Firewall Rules**: Restrict API access to specific IPs
- **VPN/Private Networks**: Use private networks when possible

### **Monitoring and Alerting**
- **Failed Auth Alerts**: Monitor for repeated 401/403 errors
- **Unusual Activity**: Alert on abnormal request patterns
- **Performance Monitoring**: Track response times and error rates
- **Audit Trails**: Maintain complete audit logs

### **Data Protection**
- **Data Encryption**: Encrypt sensitive data at rest and in transit
- **Access Controls**: Implement role-based access to API configuration
- **Data Minimization**: Send only necessary patient data
- **Compliance**: Ensure GDPR/HIPAA compliance for patient data

## 🛠 Troubleshooting

### **Common Issues**

#### **PID Not Generated**
- **Cause**: Trigger not working or sequence not created
- **Solution**: Check trigger exists and sequence is working
```sql
SELECT * FROM information_schema.triggers WHERE event_object_table = 'patients';
SELECT nextval('pid_sequence'); -- Test sequence
```

#### **Accession Number Not Generated**
- **Cause**: Payment status not PAID or trigger issue
- **Solution**: Verify payment status and trigger
```sql
SELECT payment_status, accession_generated FROM patient_bills WHERE id = ?;
```

#### **Local System API Failing**
- **Cause**: Endpoint unreachable or authentication issues
- **Solution**: Check API logs and configuration
```sql
SELECT * FROM api_call_logs WHERE success = false ORDER BY created_at DESC LIMIT 10;
```

#### **Search Not Working**
- **Cause**: Functions not created or permissions issue
- **Solution**: Verify functions exist and have proper permissions
```sql
SELECT proname FROM pg_proc WHERE proname LIKE '%patient%';
```

### **Debug Mode**
```bash
# Enable debug logging
DEBUG=aris-erp:* npm run dev

# Check logs
tail -f logs/patients.log
tail -f logs/billing.log
tail -f logs/studies.log
```

## 📈 Benefits

### **For Patients**
- **Unique Identification**: Permanent PID for lifetime tracking
- **Easy Accession**: Simple accession numbers for study reference
- **Data Portability**: Demographics sent to external systems automatically

### **For Staff**
- **Quick Search**: Fast lookup by PID or accession number
- **Automatic Generation**: No manual ID creation required
- **Error Reduction**: System-generated IDs eliminate typos

### **For Management**
- **Audit Trail**: Complete logging of all ID generations
- **Integration**: Seamless local system integration
- **Scalability**: Handles high volume of patients and studies

### **For IT Systems**
- **API Integration**: Standardized data exchange
- **Monitoring**: Comprehensive logging and statistics
- **Configuration**: Flexible system configuration

## 🔐 Security Considerations

### **Data Protection**
- **Access Control**: Role-based access to PID and accession data
- **Audit Logging**: Complete audit trail of all operations
- **API Security**: Authentication for local system integration

### **Privacy Compliance**
- **Consent Management**: Patient consent for data sharing
- **Data Minimization**: Only necessary data sent to local systems
- **Retention Policies**: Configurable data retention

---

## **🎉 Implementation Complete!**

Your ARIS ERP system now features:
- ✅ **Automatic PID Generation** (AR******** format)
- ✅ **Automatic Accession Number Generation** (ACC-YY-******** format)
- ✅ **Local System Integration** with complete demographics
- ✅ **Enhanced Search Capabilities** by PID and accession numbers
- ✅ **Comprehensive Monitoring** and audit logging
- ✅ **Modern Frontend Components** for easy management
- ✅ **Robust Error Handling** and retry logic
- ✅ **Flexible Configuration** options

The system will automatically generate PIDs for new patients and accession numbers when bills are marked as PAID, sending complete patient demographics to your local system for seamless integration!
