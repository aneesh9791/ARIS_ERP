# Financial Reconciliation Masters Documentation

## Overview
This document describes the master data management system for financial reconciliation in your diagnostic center ERP system. The masters provide the foundation for accurate financial tracking, billing, and revenue analysis.

## Master Data Tables

### 1. Study Master (Payment Configuration)

#### Purpose
Defines payment configurations for each study type and modality across all centers.

#### Key Features
- **Modality-specific pricing**: Different rates for MRI, CT, X-Ray, Ultrasound, etc.
- **Payment method rates**: Insurance, self-pay, corporate rates
- **Special conditions**: Contrast, emergency, weekend rates
- **Financial categories**: Revenue and cost categorization
- **Tax configuration**: Tax rates per study type

#### Sample Data Structure
```json
{
  "study_code": "MRI_BRAIN",
  "study_name": "MRI Brain",
  "modality": "MRI",
  "base_rate": 800.00,
  "insurance_rate": 1200.00,
  "self_pay_rate": 600.00,
  "contrast_rate": 200.00,
  "emergency_rate": 300.00,
  "weekend_rate": 100.00,
  "tax_rate": 0.08,
  "billing_code": "MRI001",
  "cpt_code": "70551",
  "revenue_category": "MRI_REVENUE",
  "cost_category": "MRI_COST"
}
```

#### API Endpoints
- `GET /api/masters/study-master` - Retrieve study configurations
- `POST /api/masters/study-master` - Create new study configuration

### 2. Asset Master

#### Purpose
Comprehensive asset tracking for depreciation, maintenance, and cost allocation.

#### Key Features
- **Asset categorization**: Scanners, computers, workstations, etc.
- **Depreciation tracking**: Automatic depreciation calculation
- **Maintenance scheduling**: Preventive maintenance tracking
- **Warranty management**: Expiry date monitoring
- **Location tracking**: Physical asset location
- **Cost allocation**: Asset-based cost distribution

#### Sample Data Structure
```json
{
  "asset_code": "MRI001",
  "asset_name": "Siemens MRI Scanner",
  "asset_type": "SCANNER",
  "purchase_cost": 2500000.00,
  "current_value": 2000000.00,
  "depreciation_rate": 0.10,
  "warranty_expiry": "2025-01-15",
  "location": "MRI Suite 1",
  "status": "ACTIVE"
}
```

#### API Endpoints
- `GET /api/masters/asset-master` - Retrieve asset information
- `POST /api/masters/asset-master` - Create new asset record

### 3. Referring Physician Master

#### Purpose
Manage referring physician information for commission calculations and referral tracking.

#### Key Features
- **Physician demographics**: Contact information, specialties
- **Commission configuration**: Percentage-based commission rates
- **Contract management**: Contract types and periods
- **Financial tracking**: Referral volume and earnings
- **Tax information**: Tax ID and banking details

#### Sample Data Structure
```json
{
  "physician_code": "DR001",
  "physician_name": "Dr. John Smith",
  "specialty": "Neurology",
  "commission_rate": 0.10,
  "contract_type": "PER_STUDY",
  "referral_count": 45,
  "total_revenue": 54000.00,
  "commission_amount": 5400.00
}
```

#### API Endpoints
- `GET /api/masters/referring-physician-master` - Retrieve physician information
- `POST /api/masters/referring-physician-master` - Create new physician record

### 4. Radiologist Master

#### Purpose
Manage radiologist information for cost calculation and performance tracking.

#### Key Features
- **Radiologist demographics**: Contact information, specialties
- **Rate configuration**: Hourly and per-study rates
- **Contract management**: Different contract types
- **Performance tracking**: Study volume and earnings
- **Certification tracking**: Professional certifications

#### Sample Data Structure
```json
{
  "radiologist_code": "RAD001",
  "radiologist_name": "Dr. Michael Wilson",
  "specialty": "Neuroradiology",
  "hourly_rate": 150.00,
  "per_study_rate": 50.00,
  "contract_type": "PER_STUDY",
  "study_count": 120,
  "total_earnings": 6000.00
}
```

#### API Endpoints
- `GET /api/masters/radiologist-master` - Retrieve radiologist information
- `POST /api/masters/radiologist-master` - Create new radiologist record

## Financial Reconciliation Process

### 1. Study Revenue Calculation
The system calculates revenue based on study master configuration:

```javascript
// Base rate calculation
let appliedRate = study.base_rate;

// Add contrast charge
if (study.contrast_used) {
  appliedRate += study.contrast_rate;
}

// Add emergency charge
if (study.emergency_study) {
  appliedRate += study.emergency_rate;
}

// Add weekend charge
if (isWeekend(study.appointment_date)) {
  appliedRate += study.weekend_rate;
}

// Apply payment method rate
let paymentRate = appliedRate;
switch (study.payment_type) {
  case 'insurance': paymentRate = study.insurance_rate; break;
  case 'self_pay': paymentRate = study.self_pay_rate; break;
  default: paymentRate = appliedRate; break;
}

// Calculate gross amount with tax
let grossAmount = paymentRate * (1 + study.tax_rate);
```

### 2. Commission Calculation
Commission is calculated based on referring physician configuration:

```javascript
// Commission calculation
let commissionAmount = grossAmount * physician.commission_rate;
```

### 3. Radiologist Cost Calculation
Cost is calculated based on radiologist contract type:

```javascript
// Radiologist cost calculation
let radiologistCost = 0;
switch (radiologist.contract_type) {
  case 'PER_HOUR': radiologistCost = radiologist.hourly_rate; break;
  case 'PER_STUDY': radiologistCost = radiologist.per_study_rate; break;
  default: radiologistCost = 0; break;
}
```

### 4. Net Revenue Calculation
Final net revenue calculation:

```javascript
// Net revenue calculation
let netRevenue = grossAmount - commissionAmount - radiologistCost;
```

## Financial Reconciliation API

### Endpoint
```http
GET /api/masters/financial-reconciliation
```

### Parameters
- `center_id` (optional): Filter by specific center
- `start_date` (optional): Start date for reconciliation
- `end_date` (optional): End date for reconciliation
- `modality` (optional): Filter by modality type

### Response Structure
```json
{
  "success": true,
  "reconciliation_data": [
    {
      "study_id": "STY123",
      "accession_number": "ACC20240313001",
      "patient_name": "John Doe",
      "study_name": "MRI Brain",
      "modality": "MRI",
      "applied_rate": 1000.00,
      "payment_rate": 1200.00,
      "gross_amount": 1296.00,
      "commission_amount": 129.60,
      "radiologist_earning": 50.00,
      "net_profit": 1116.40
    }
  ],
  "summary": {
    "total_studies": 25,
    "total_revenue": 32400.00,
    "total_commission": 3240.00,
    "total_radiologist_cost": 1250.00,
    "net_profit": 27910.00
  }
}
```

## Database Schema

### Key Tables

#### study_master
- `study_code`: Unique study identifier
- `modality`: Imaging modality (MRI, CT, etc.)
- `base_rate`: Standard rate
- `insurance_rate`: Insurance billing rate
- `self_pay_rate`: Self-pay rate
- `contrast_rate`: Additional charge for contrast
- `emergency_rate`: Emergency study surcharge
- `weekend_rate`: Weekend study surcharge
- `tax_rate`: Applicable tax rate

#### asset_master
- `asset_code`: Unique asset identifier
- `asset_type`: Asset category
- `purchase_cost`: Original purchase price
- `current_value`: Current depreciated value
- `depreciation_rate`: Annual depreciation rate
- `warranty_expiry`: Warranty end date

#### referring_physician_master
- `physician_code`: Unique physician identifier
- `commission_rate`: Commission percentage
- `contract_type`: Contract type (PER_STUDY, PER_MONTH, etc.)
- `bank_account`: Bank account for payments
- `tax_id`: Tax identification number

#### radiologist_master
- `radiologist_code`: Unique radiologist identifier
- `hourly_rate`: Hourly compensation rate
- `per_study_rate`: Per-study compensation rate
- `contract_type`: Contract type (PER_HOUR, PER_STUDY, SALARY)
- `certifications`: Professional certifications

## Integration Points

### 1. Study Integration
- Study creation uses study master for pricing
- Study completion triggers financial calculations
- Revenue allocation based on study configuration

### 2. Asset Integration
- Asset depreciation affects cost calculations
- Maintenance costs allocated to asset categories
- Asset utilization impacts revenue analysis

### 3. Physician Integration
- Referral volume affects commission calculations
- Physician performance tracked through studies
- Contract management integrated with HR system

### 4. Radiologist Integration
- Study completion triggers radiologist payment
- Performance metrics based on study volume
- Contract type determines payment calculation

## Reporting and Analytics

### 1. Revenue Analysis
- Revenue by modality
- Revenue by center
- Revenue by payment method
- Revenue trends over time

### 2. Cost Analysis
- Asset depreciation costs
- Maintenance costs by asset type
- Radiologist costs by contract type
- Total cost of ownership

### 3. Commission Analysis
- Commission by referring physician
- Commission by specialty
- Commission trends over time
- Commission vs revenue ratios

### 4. Profitability Analysis
- Net profit by study type
- Profitability by center
- Profitability by modality
- ROI analysis by asset

## Data Validation

### 1. Study Master Validation
- Unique study codes within center
- Valid modality values
- Positive rate values
- Valid tax rate ranges (0-1)

### 2. Asset Master Validation
- Unique asset codes
- Valid asset types
- Positive purchase costs
- Valid depreciation rates

### 3. Physician Master Validation
- Unique physician codes
- Valid commission rates (0-1)
- Valid contract types
- Valid email formats

### 4. Radiologist Master Validation
- Unique radiologist codes
- Valid contract types
- Positive rate values
- Valid license numbers

## Security and Access Control

### 1. Role-Based Access
- **Administrators**: Full access to all masters
- **Finance**: Read access to financial data
- **Radiology**: Limited access to study and radiologist data
- **Billing**: Access to study and payment configurations

### 2. Data Protection
- Audit logging for all changes
- Data encryption for sensitive information
- Backup and recovery procedures
- Data retention policies

## Performance Optimization

### 1. Database Indexing
- Composite indexes on frequently queried fields
- Partitioning for large tables
- Query optimization for reconciliation reports

### 2. Caching
- Study master data caching
- Asset master data caching
- Physician master data caching

### 3. Batch Processing
- Bulk financial reconciliation
- Scheduled depreciation calculations
- Automated commission processing

## Maintenance and Updates

### 1. Regular Updates
- Study rate updates
- Asset depreciation adjustments
- Physician contract renewals
- Tax rate changes

### 2. Data Quality
- Regular data validation
- Duplicate detection
- Consistency checks
- Data cleansing procedures

This comprehensive master data system provides the foundation for accurate financial reconciliation and business intelligence in your diagnostic center ERP system.
