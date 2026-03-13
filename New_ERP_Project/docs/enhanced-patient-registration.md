# Enhanced Patient Registration & Study Management

## 📋 Overview

The enhanced patient registration and study management system provides comprehensive functionality for managing patient information with ID proof support and efficient study creation workflows.

## 🆔 ID Proof Support

### Supported ID Proof Types
- **Aadhaar Card** - 12 digits format: `123456789012`
- **PAN Card** - Format: `ABCDE1234F`
- **Passport** - Format: `A1234567`
- **Voter ID** - Format: `ABC1234567`
- **Driving License** - State code + RTO code + Year + Series
- **Ration Card** - Various formats
- **Employee ID** - Organization-specific
- **Student ID** - Educational institution-specific
- **Other ID** - Government-issued IDs

### ID Proof Features
- **Format Validation**: Real-time validation of ID proof formats
- **Duplicate Prevention**: Automatic detection of duplicate ID proofs
- **Document Upload**: Support for ID proof document uploads (PDF/Image)
- **Verification Status**: Track verification status of ID proofs
- **Audit Trail**: Complete audit log of ID proof changes

## 👥 Patient Registration

### Registration Fields

#### Basic Information
- Full Name (required)
- Email (optional)
- Phone Number (required)
- Gender (required)
- Date of Birth (required)
- Complete Address (required)
- Center Assignment (required)

#### ID Proof Information
- ID Proof Type (optional but recommended)
- ID Proof Number (optional but recommended)
- Issued Date (optional)
- Expiry Date (optional)
- ID Proof Document Upload

#### Emergency Contact
- Contact Name
- Contact Phone
- Relationship
- Contact Email

#### Medical Information
- Blood Group
- Allergies
- Chronic Diseases
- Current Medications
- Previous Surgeries

#### Insurance Information
- Insurance Provider
- Policy Number
- Insured Name
- Relationship to Patient

#### Consent & Privacy
- Treatment Consent (required)
- Data Sharing Consent (required)
- Privacy Preferences

### Registration Process

1. **Basic Information Entry**
   - Fill in required patient details
   - Select center for patient registration

2. **ID Proof Collection**
   - Select appropriate ID proof type
   - Enter ID proof number
   - System validates format automatically
   - Upload ID proof document (optional)

3. **Medical Information**
   - Add relevant medical history
   - Include allergies and medications
   - Emergency contact details

4. **Insurance Details**
   - Add insurance information if applicable
   - Include policy details and insured person

5. **Consent Management**
   - Obtain treatment consent
   - Configure data sharing preferences
   - Complete registration

## 🏥 Study Management

### Study Creation Workflow

#### Patient Search & Selection
1. **Quick Search**: Search by name, phone, email, or ID proof number
2. **Smart Matching**: System shows match type (NAME, PHONE, EMAIL, ID_PROOF)
3. **Patient Details**: View complete patient information including ID verification status
4. **Study History**: See previous studies and visit history

#### Study Configuration
1. **Study Type Selection**: Choose from available study types
2. **Center Assignment**: Select diagnostic center
3. **Priority Setting**: Routine, Urgent, or Stat priority
4. **Scheduling**: Date and time slot selection
5. **Radiologist Assignment**: Optional radiologist selection
6. **Cost Estimation**: Automatic cost calculation

#### Study Details Display
- **Study Information**: Type, modality, description
- **Cost Breakdown**: Base rate + radiologist fees
- **Scheduling**: Date, time, priority level
- **Assigned Staff**: Radiologist and center details

### Cost Estimation

#### Base Rate Calculation
- Study type base rate from study master
- Modality-specific pricing
- Center-specific variations

#### Radiologist Fees
- Modality-specific reporting rates
- Radiologist experience level
- Specialized study premiums

#### Total Cost
```
Total Cost = Base Rate + Radiologist Fees + Additional Charges
```

## 🔧 API Endpoints

### Patient Registration

#### Create Patient
```http
POST /api/patients
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+919876543210",
  "email": "john@example.com",
  "gender": "MALE",
  "date_of_birth": "1990-01-01",
  "address": "123 Main St",
  "city": "Kochi",
  "state": "Kerala",
  "postal_code": "682024",
  "center_id": 1,
  "id_proof_type": "AADHAAR",
  "id_proof_number": "123456789012",
  "consent_for_treatment": true,
  "consent_for_data_sharing": true
}
```

#### Upload ID Proof Document
```http
POST /api/patients/:id/id-proof-document
Content-Type: multipart/form-data

document: [file]
```

#### Verify ID Proof
```http
POST /api/patients/:id/verify-id-proof
Content-Type: application/json

{
  "verified_by": "admin_user",
  "verification_notes": "ID proof verified successfully"
}
```

### Patient Search

#### Quick Search
```http
GET /api/patients/quick-search?search_term=john&limit=10
```

#### Enhanced Search
```http
GET /api/patients/search?search_term=john&id_proof_type=AADHAAR&center_id=1
```

#### Search by ID Proof
```http
POST /api/patients/search-by-id-proof
Content-Type: application/json

{
  "id_proof_type": "AADHAAR",
  "id_proof_number": "123456789012"
}
```

### Study Management

#### Create Study for Patient
```http
POST /api/patients/:patientId/studies
Content-Type: application/json

{
  "study_code": "XRAY_CHEST",
  "center_id": 1,
  "priority": "ROUTINE",
  "scheduled_date": "2024-01-15",
  "scheduled_time": "09:00",
  "radiologist_code": "RAD001",
  "notes": "Routine chest X-ray"
}
```

#### Get Patient with Studies
```http
GET /api/patients/:id/with-studies
```

### ID Proof Management

#### Get ID Proof Types
```http
GET /api/patients/id-proof-types
```

#### Validate ID Proof Format
```http
POST /api/patients/validate-id-proof
Content-Type: application/json

{
  "id_proof_type": "AADHAAR",
  "id_proof_number": "123456789012"
}
```

## 📊 Database Schema

### Enhanced Patients Table
```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_type VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_number VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_issued_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_expiry_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_verified BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS id_proof_document_path VARCHAR(500);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo_path VARCHAR(500);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS chronic_diseases TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS current_medications TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consent_for_treatment BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS consent_for_data_sharing BOOLEAN DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS privacy_preferences JSONB DEFAULT '{}';
```

### ID Proof Types Table
```sql
CREATE TABLE id_proof_types (
  id SERIAL PRIMARY KEY,
  type_code VARCHAR(20) UNIQUE NOT NULL,
  type_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Patient Studies Relationship
```sql
CREATE TABLE patient_studies (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  study_id INTEGER REFERENCES studies(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(patient_id, study_id)
);
```

## 🎯 Frontend Components

### EnhancedPatientRegistration Component
```typescript
interface PatientFormData {
  name: string;
  email: string;
  phone: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  date_of_birth: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_issued_date?: string;
  id_proof_expiry_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_group?: string;
  allergies?: string;
  chronic_diseases?: string;
  consent_for_treatment: boolean;
  consent_for_data_sharing: boolean;
}
```

### PatientStudyManagement Component
```typescript
interface Patient {
  id: number;
  name: string;
  phone: string;
  email?: string;
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_verified: boolean;
  center_name: string;
  total_studies: number;
  last_study_date?: string;
  match_type: string;
}

interface StudyFormData {
  study_code: string;
  center_id: number;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  scheduled_date: string;
  scheduled_time: string;
  radiologist_code?: string;
  notes?: string;
}
```

## 🔐 Security Features

### ID Proof Security
- **Format Validation**: Server-side validation of ID proof formats
- **Duplicate Detection**: Prevent duplicate ID proof registrations
- **Audit Logging**: Complete audit trail of ID proof operations
- **Access Control**: Role-based access to ID proof verification

### Data Protection
- **Encryption**: Sensitive data encryption at rest
- **Access Logs**: Complete access logging
- **Privacy Controls**: Patient consent management
- **Data Retention**: Configurable data retention policies

## 📈 Benefits

### For Patients
- **Easy Registration**: Streamlined registration with ID proof support
- **Data Accuracy**: Reduced errors with ID proof validation
- **Privacy Control**: Granular consent management
- **Quick Access**: Fast study creation for existing patients

### For Staff
- **Efficient Workflow**: Quick patient search and study creation
- **Data Quality**: Validated patient information
- **Reduced Errors**: Automated validation and duplicate prevention
- **Better Service**: Faster patient processing

### For Management
- **Compliance**: GDPR-like compliance with consent management
- **Audit Trail**: Complete audit logging
- **Data Analytics**: Enhanced reporting capabilities
- **Cost Control**: Accurate cost estimation and billing

## 🚀 Implementation Steps

### 1. Database Setup
```bash
# Run the enhancement schema
psql -d aris_erp -f database/patient-enhancement-schema.sql
```

### 2. Backend Setup
```bash
# Install dependencies
cd backend
npm install

# Add multer for file uploads
npm install multer

# Run migrations
npm run migrate
```

### 3. Frontend Setup
```bash
# Install dependencies
cd frontend
npm install

# Add new dependencies
npm install react-hook-form lucide-react @tanstack/react-query
```

### 4. Configuration
```bash
# Update environment variables
cp backend/.env.example backend/.env

# Configure file upload paths
mkdir -p backend/uploads/patients
mkdir -p backend/uploads/id-proofs
```

### 5. Testing
```bash
# Run backend tests
cd backend
npm test

# Run frontend tests
cd frontend
npm test
```

## 📚 Usage Examples

### Patient Registration with ID Proof
```javascript
// Register new patient with Aadhaar
const patientData = {
  name: "Rajesh Kumar",
  phone: "+919876543210",
  id_proof_type: "AADHAAR",
  id_proof_number: "123456789012",
  consent_for_treatment: true,
  consent_for_data_sharing: true
};

// Create patient
const response = await fetch('/api/patients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(patientData)
});
```

### Quick Study Creation
```javascript
// Search patient
const patients = await fetch('/api/patients/quick-search?search_term=123456789012');

// Create study
const studyData = {
  study_code: "XRAY_CHEST",
  center_id: 1,
  priority: "ROUTINE",
  scheduled_date: "2024-01-15",
  scheduled_time: "09:00"
};

const study = await fetch(`/api/patients/${patient.id}/studies`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(studyData)
});
```

## 🔧 Troubleshooting

### Common Issues

#### ID Proof Validation Errors
- **Problem**: Invalid ID proof format
- **Solution**: Check format requirements and correct the input

#### Duplicate Patient Detection
- **Problem**: Patient with same ID proof already exists
- **Solution**: Search for existing patient and update if needed

#### File Upload Issues
- **Problem**: File upload failed
- **Solution**: Check file size (max 5MB) and format (image/PDF)

#### Study Creation Errors
- **Problem**: Cannot create study for patient
- **Solution**: Verify patient exists and has required permissions

### Debug Mode
```bash
# Enable debug logging
DEBUG=aris-erp:* npm run dev

# Check logs
tail -f logs/patients.log
```

## 📞 Support

For technical support and questions:
- **Documentation**: Check API documentation at `/api-docs`
- **Logs**: Review application logs in `logs/` directory
- **Database**: Check database connection and schema
- **Configuration**: Verify environment variables

---

**Enhanced Patient Registration & Study Management** - Comprehensive patient management with ID proof support and efficient study creation workflows.
