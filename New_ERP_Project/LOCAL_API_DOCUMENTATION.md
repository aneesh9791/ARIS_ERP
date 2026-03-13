# Local API for PACS/RIS Integration

## Overview
This API provides endpoints for local PACS/RIS systems to communicate with your ERP system. It allows external applications to retrieve patient information, referring physician details, center information, and study data.

## Base URL
```
http://your-server:3000/local-api
```

## Authentication
All endpoints require an API key in the `X-API-Key` header.

### Default API Key
```
local-api-key-2024
```

### Setting Custom API Key
Set the `LOCAL_API_KEY` environment variable in your `.env` file:
```env
LOCAL_API_KEY=your-custom-api-key-here
```

## Endpoints

### 1. Get Patient Information
```http
GET /local-api/patient/:patient_id
```

Retrieves comprehensive patient information including demographics, studies, and images.

**Parameters:**
- `patient_id` (path): Patient ID from ERP system

**Query Parameters:**
- `include_studies` (optional, boolean): Include recent studies (default: false)
- `include_images` (optional, boolean): Include image paths (default: false)

**Response:**
```json
{
  "success": true,
  "patient": {
    "id": "PAT123456",
    "name": "John Doe",
    "dob": "1980-05-15",
    "gender": "male",
    "age": 44,
    "phone": "+1-555-123-4567",
    "email": "john.doe@email.com",
    "address": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "postal_code": "12345",
    "country": "USA",
    "emergency_contact": "+1-555-987-6543",
    "allergies": "Penicillin",
    "medical_history": "Hypertension",
    "insurance_provider": "Blue Cross",
    "policy_number": "BC123456",
    "center_id": 1,
    "center_name": "Main Hospital",
    "center_ae_title": "MAIN_HOSPITAL",
    "recent_studies": [...],
    "image_studies": [...]
  },
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 2. Get Referring Physician Information
```http
GET /local-api/referring-physician/:physician_name
```

Searches for referring physicians by name and returns their referral statistics.

**Parameters:**
- `physician_name` (path): Physician name to search

**Query Parameters:**
- `center_id` (optional, integer): Filter by specific center

**Response:**
```json
{
  "success": true,
  "physicians": [
    {
      "referring_physician": "Dr. Smith",
      "referral_count": 45,
      "completed_studies": 42,
      "recent_referrals": 8,
      "patient_names": ["John Doe", "Jane Smith", "Bob Johnson"],
      "procedures_ordered": ["MRI Brain", "CT Chest", "X-Ray Knee"]
    }
  ],
  "search_term": "Smith",
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 3. Get Center Information
```http
GET /local-api/center/:center_id
```

Retrieves detailed information about a specific diagnostic center.

**Parameters:**
- `center_id` (path): Center ID

**Response:**
```json
{
  "success": true,
  "center": {
    "id": 1,
    "name": "Main Hospital",
    "code": "MH001",
    "address": "123 Medical Center Dr",
    "city": "Anytown",
    "state": "CA",
    "postal_code": "12345",
    "country": "USA",
    "phone": "+1-555-123-4567",
    "email": "info@mainhospital.com",
    "manager_name": "Dr. Johnson",
    "manager_email": "manager@mainhospital.com",
    "manager_phone": "+1-555-123-4568",
    "operating_hours": "8:00 AM - 8:00 PM",
    "emergency_contact": "+1-555-999-0000",
    "capacity_daily": 100,
    "specialties": "MRI, CT, X-Ray, Ultrasound",
    "insurance_providers": "Blue Cross, Aetna, Medicare",
    "ae_title": "MAIN_HOSPITAL",
    "timezone": "America/Los_Angeles",
    "referring_physicians_count": 25,
    "total_patients": 1500,
    "new_patients_30d": 45
  },
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 4. Get All Centers
```http
GET /local-api/centers
```

Returns list of all centers for dropdown selection.

**Query Parameters:**
- `active_only` (optional, boolean): Filter active centers only (default: true)

**Response:**
```json
{
  "success": true,
  "centers": [
    {
      "id": 1,
      "name": "Main Hospital",
      "code": "MH001",
      "city": "Anytown",
      "state": "CA",
      "ae_title": "MAIN_HOSPITAL"
    },
    {
      "id": 2,
      "name": "Downtown Clinic",
      "code": "DC001",
      "city": "Anytown",
      "state": "CA",
      "ae_title": "DOWNTOWN_CLINIC"
    }
  ],
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 5. Search Patients
```http
POST /local-api/search/patients
```

Advanced patient search with multiple search types.

**Request Body:**
```json
{
  "search_term": "john",
  "search_type": "name",
  "center_id": 1,
  "limit": 20
}
```

**Search Types:**
- `name`: Search by patient name
- `phone`: Search by phone number
- `email`: Search by email address
- `patient_id`: Search by patient ID

**Response:**
```json
{
  "success": true,
  "patients": [
    {
      "id": "PAT123456",
      "name": "John Doe",
      "dob": "1980-05-15",
      "gender": "male",
      "phone": "+1-555-123-4567",
      "email": "john.doe@email.com",
      "center_id": 1,
      "center_name": "Main Hospital",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "search_term": "john",
  "search_type": "name",
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 6. Get Study Details
```http
GET /local-api/study/:study_id
```

Retrieves complete study information for PACS integration.

**Parameters:**
- `study_id` (path): Study ID

**Response:**
```json
{
  "success": true,
  "study": {
    "id": "STY789",
    "patient_id": "PAT123456",
    "patient_name": "John Doe",
    "patient_dob": "1980-05-15",
    "patient_gender": "male",
    "patient_phone": "+1-555-123-4567",
    "patient_email": "john.doe@email.com",
    "patient_address": "123 Main St",
    "center_name": "Main Hospital",
    "center_ae_title": "MAIN_HOSPITAL",
    "accession_number": "ACC20240313001",
    "study_instance_uid": "1.2.840.113619.2.5.1.3.1.4.1",
    "requested_procedure": "MRI Brain with Contrast",
    "actual_procedure": "MRI Brain with Contrast",
    "scanner_type": "MRI",
    "status": "completed",
    "appointment_date": "2024-03-13",
    "appointment_time": "10:30",
    "start_time": "2024-03-13T10:35:00.000Z",
    "end_time": "2024-03-13T11:45:00.000Z",
    "duration": 70,
    "findings": "Normal brain anatomy, no acute abnormalities detected",
    "images_count": 150,
    "dicom_images_path": "/dicom/studies/STY789/",
    "referring_physician_name": "Dr. Smith",
    "radiologist_name": "Dr. Johnson",
    "images": [
      {
        "filename": "IMG001.dcm",
        "path": "/dicom/studies/STY789/IMG001.dcm",
        "size": 2048576
      }
    ]
  },
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

### 7. Health Check
```http
GET /local-api/health
```

Check API health and connectivity.

**Response:**
```json
{
  "status": "healthy",
  "service": "Local API for PACS/RIS Integration",
  "version": "1.0.0",
  "timestamp": "2024-03-13T10:30:00.000Z",
  "database": "connected"
}
```

## Error Handling

All endpoints return consistent error responses:

**Success Response:**
```json
{
  "success": true,
  "data": {...},
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message",
  "timestamp": "2024-03-13T10:30:00.000Z"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid API key)
- `404`: Not Found
- `500`: Internal Server Error

## Security Features

### API Key Authentication
- Required header: `X-API-Key`
- Default key: `local-api-key-2024`
- Configurable via environment variable

### Rate Limiting
- 1000 requests per 15 minutes per IP
- Prevents abuse and ensures system stability

### CORS Configuration
- Allows requests from localhost and 127.0.0.1
- Supports ports 3000 and 8080
- Enables credentials for authentication

### Data Validation
- Input sanitization on all endpoints
- SQL injection prevention
- Type validation for all parameters

## Integration Examples

### Python Example
```python
import requests
import json

# Configuration
API_BASE_URL = "http://your-server:3000/local-api"
API_KEY = "local-api-key-2024"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Get patient information
def get_patient(patient_id):
    url = f"{API_BASE_URL}/patient/{patient_id}"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        return response.json()
    else:
        return {"error": f"HTTP {response.status_code}: {response.text}"}

# Example usage
patient_data = get_patient("PAT123456")
print(json.dumps(patient_data, indent=2))
```

### JavaScript Example
```javascript
// Configuration
const API_BASE_URL = "http://your-server:3000/local-api";
const API_KEY = "local-api-key-2024";

const headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
};

// Get patient information
async function getPatient(patientId) {
    const response = await fetch(`${API_BASE_URL}/patient/${patientId}`, {
        headers
    });
    
    if (response.ok) {
        return await response.json();
    } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
}

// Example usage
getPatient("PAT123456")
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(error => console.error('Error:', error));
```

### C# Example
```csharp
using System;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json;

class LocalApiClient
{
    private const string API_BASE_URL = "http://your-server:3000/local-api";
    private const string API_KEY = "local-api-key-2024";
    
    public async Task<dynamic> GetPatientAsync(string patientId)
    {
        using (var client = new HttpClient())
        {
            client.DefaultRequestHeaders.Add("X-API-Key", API_KEY);
            client.DefaultRequestHeaders.Add("Content-Type", "application/json");
            
            var response = await client.GetAsync($"{API_BASE_URL}/patient/{patientId}");
            
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                return JsonConvert.DeserializeObject<dynamic>(json);
            }
            else
            {
                throw new Exception($"HTTP {(int)response.StatusCode}: {response.ReasonPhrase}");
            }
        }
    }
}

// Example usage
var client = new LocalApiClient();
var patientData = await client.GetPatientAsync("PAT123456");
Console.WriteLine(JsonConvert.SerializeObject(patientData, Formatting.Indented));
```

## Deployment

### Environment Setup
1. Set the `LOCAL_API_KEY` environment variable
2. Ensure the ERP system is running on port 3000
3. Configure firewall to allow local API access
4. Test endpoints using the examples above

### Monitoring
- All API calls are logged to `logs/local-api.log`
- Health check endpoint available for monitoring
- Rate limiting prevents abuse

## Support

For technical support or issues with the local API:
- Check application logs: `logs/local-api.log`
- Verify database connectivity
- Test API key authentication
- Check network connectivity between PACS and ERP server

This API provides secure, reliable access to your ERP system for local PACS/RIS integration.
