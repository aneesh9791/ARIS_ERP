# Comprehensive Billing Module for Kerala, India

## Overview
This billing module is specifically designed for diagnostic centers in Kerala, India, with full GST compliance, Indian currency support, and local payment methods.

## Key Features

### 🇮🇳 Indian Currency & GST Support
- **Indian Rupee (₹)**: All amounts in INR
- **GST Compliance**: CGST, SGST, IGST calculations
- **GST Numbers**: Vendor and center GST tracking
- **HSN Codes**: Product/service HSN code management
- **Tax Rates**: Configurable GST rates (18%, 12%, 5%, 0%)

### 💳 Kerala Payment Methods
- **Cash**: Physical cash payments
- **UPI**: Unified Payments Interface (PhonePe, GPay, Paytm)
- **Bank Transfer**: NEFT, RTGS, IMPS
- **Card**: Debit/Credit card payments
- **Insurance**: Insurance company payments
- **Combined**: Multiple payment modes for single bill

### 🏪 Vendor Management
- **Vendor Master**: Complete vendor information
- **GST Registration**: Vendor GST number tracking
- **PAN Numbers**: PAN card details
- **Bank Details**: Vendor bank account information
- **Payment Terms**: Flexible payment terms
- **Location Tracking**: Kerala-specific vendor locations

### 📦 Consumables Management
- **Inventory Tracking**: Real-time stock monitoring
- **Purchase Management**: Vendor purchase tracking
- **Usage Tracking**: Study-wise consumable usage
- **Reorder Alerts**: Low stock notifications
- **GST on Purchases**: GST calculation on consumable purchases

### 💰 Financial Tracking
- **Bank Accounts**: Multiple bank account management
- **Payables**: Vendor payment tracking
- **Receivables**: Patient payment tracking
- **Expenses**: Complete expense management
- **Revenue Tracking**: Income and expense analysis

## API Endpoints

### Patient Billing
```http
POST /api/billing/patient-bill
```

**Request Body:**
```json
{
  "patient_id": "PAT123456",
  "center_id": 1,
  "study_codes": ["MRI_BRAIN", "CT_CHEST"],
  "payment_mode": "COMBINED",
  "gst_applicable": true,
  "gst_rate": 0.18,
  "discount_amount": 100.00,
  "discount_reason": "Senior citizen discount",
  "payment_details": {
    "cash": 500.00,
    "upi": 1000.00,
    "card": 0.00
  },
  "notes": "Patient requested detailed scan"
}
```

**Response:**
```json
{
  "message": "Bill created successfully",
  "bill": {
    "id": 1,
    "invoice_number": "INV-1-20240313-0001",
    "patient_name": "John Doe",
    "center_name": "Main Hospital",
    "center_gst_number": "29AAACM1234C1ZV",
    "bill_date": "2024-03-13",
    "subtotal": 1500.00,
    "discount_amount": 100.00,
    "taxable_amount": 1400.00,
    "cgst_rate": 0.09,
    "cgst_amount": 126.00,
    "sgst_rate": 0.09,
    "sgst_amount": 126.00,
    "igst_rate": 0,
    "igst_amount": 0,
    "total_gst": 252.00,
    "total_amount": 1652.00,
    "payment_mode": "COMBINED",
    "payment_status": "PENDING",
    "gst_applicable": true,
    "items": [
      {
        "study_code": "MRI_BRAIN",
        "study_name": "MRI Brain",
        "modality": "MRI",
        "rate": 800.00,
        "quantity": 1,
        "amount": 800.00,
        "gst_applicable": true,
        "hsn_code": "70551"
      },
      {
        "study_code": "CT_CHEST",
        "study_name": "CT Chest",
        "modality": "CT",
        "rate": 700.00,
        "quantity": 1,
        "amount": 700.00,
        "gst_applicable": true,
        "hsn_code": "71250"
      }
    ]
  }
}
```

### Process Patient Payment
```http
POST /api/billing/patient-bill-payment
```

**Request Body:**
```json
{
  "bill_id": 1,
  "payment_mode": "UPI",
  "amount_paid": 1652.00,
  "payment_details": {
    "upi_id": "john.doe@ybl",
    "transaction_id": "TXN123456789",
    "app": "PhonePe"
  },
  "transaction_reference": "UPI123456789",
  "bank_account_id": 1,
  "notes": "Full payment via UPI"
}
```

### Vendor Management

#### Create Vendor
```http
POST /api/billing/vendor-master
```

**Request Body:**
```json
{
  "vendor_code": "VENDOR001",
  "vendor_name": "Medtronic Healthcare Pvt Ltd",
  "vendor_type": "CONSUMABLES",
  "gst_number": "29AAAPM1234C1ZV",
  "pan_number": "AAAPM1234C",
  "phone": "+91-484-1234567",
  "email": "kerala@medtronic.com",
  "address": "123 Industrial Area, Kakkanad",
  "city": "Kochi",
  "state": "Kerala",
  "postal_code": "682030",
  "contact_person": "Rahul Sharma",
  "payment_terms": "30 DAYS",
  "bank_account_number": "1234567890123456",
  "bank_name": "HDFC Bank",
  "ifsc_code": "HDFC0000001",
  "notes": "Primary consumable supplier"
}
```

#### Create Vendor Bill
```http
POST /api/billing/vendor-bill
```

**Request Body:**
```json
{
  "vendor_code": "VENDOR001",
  "center_id": 1,
  "bill_number": "VENDOR-2024-001",
  "bill_date": "2024-03-13",
  "due_date": "2024-04-12",
  "items": [
    {
      "item_name": "Omnipaque 300mg I/ml",
      "description": "Contrast media for MRI",
      "quantity": 100,
      "rate": 1500.00,
      "amount": 150000.00,
      "gst_rate": 0.18,
      "gst_amount": 27000.00,
      "hsn_code": "30049010"
    }
  ],
  "subtotal": 150000.00,
  "cgst_amount": 13500.00,
  "sgst_amount": 13500.00,
  "igst_amount": 0,
  "total_amount": 177000.00,
  "notes": "Monthly consumable supply"
}
```

#### Process Vendor Payment
```http
POST /api/billing/vendor-payment
```

**Request Body:**
```json
{
  "bill_id": 1,
  "payment_mode": "BANK_TRANSFER",
  "amount_paid": 88500.00,
  "payment_date": "2024-03-20",
  "bank_account_id": 1,
  "transaction_reference": "NEFT123456789",
  "notes": "50% advance payment"
}
```

### Consumables Management

#### Create Consumable
```http
POST /api/billing/consumable-master
```

**Request Body:**
```json
{
  "item_code": "CONTRAST001",
  "item_name": "Omnipaque 300mg I/ml",
  "category": "CONTRAST_MEDIA",
  "unit": "ml",
  "reorder_level": 50,
  "gst_rate": 0.18,
  "hsn_code": "30049010",
  "notes": "Iodine-based contrast media"
}
```

#### Get Consumables with Stock
```http
GET /api/billing/consumable-master?center_id=1&low_stock_only=true
```

**Response:**
```json
{
  "success": true,
  "consumables": [
    {
      "item_code": "CONTRAST001",
      "item_name": "Omnipaque 300mg I/ml",
      "category": "CONTRAST_MEDIA",
      "unit": "ml",
      "reorder_level": 50,
      "gst_rate": 0.18,
      "hsn_code": "30049010",
      "current_stock": 25,
      "last_stock_update": "2024-03-13T10:30:00.000Z",
      "stock_status": "LOW_STOCK"
    }
  ]
}
```

### Bank Accounts Management

#### Create Bank Account
```http
POST /api/billing/bank-accounts
```

**Request Body:**
```json
{
  "account_name": "Main Operating Account",
  "account_number": "1234567890123456",
  "bank_name": "State Bank of India",
  "branch_name": "Kochi Main Branch",
  "ifsc_code": "SBIN0000001",
  "account_type": "CURRENT",
  "center_id": 1,
  "opening_balance": 1000000.00,
  "notes": "Primary operating account"
}
```

#### Get Bank Accounts
```http
GET /api/billing/bank-accounts?center_id=1
```

**Response:**
```json
{
  "success": true,
  "bank_accounts": [
    {
      "id": 1,
      "account_name": "Main Operating Account",
      "account_number": "1234567890123456",
      "bank_name": "State Bank of India",
      "branch_name": "Kochi Main Branch",
      "ifsc_code": "SBIN0000001",
      "account_type": "CURRENT",
      "center_id": 1,
      "opening_balance": 1000000.00,
      "current_balance": 1250000.00,
      "payment_transactions_count": 45,
      "vendor_payment_transactions_count": 23
    }
  ]
}
```

### Financial Dashboard
```http
GET /api/billing/financial-dashboard?center_id=1&start_date=2024-03-01&end_date=2024-03-31
```

**Response:**
```json
{
  "success": true,
  "dashboard": {
    "revenue": {
      "total_bills": 150,
      "total_revenue": 2500000.00,
      "paid_revenue": 2200000.00,
      "pending_revenue": 300000.00,
      "total_gst_collected": 378000.00
    },
    "expenses": {
      "total_vendor_bills": 25,
      "total_expenses": 800000.00,
      "paid_expenses": 650000.00,
      "pending_expenses": 150000.00
    },
    "bank_accounts": {
      "total_accounts": 3,
      "total_balance": 1250000.00
    },
    "payment_modes": [
      {
        "payment_mode": "UPI",
        "transaction_count": 85,
        "total_amount": 1500000.00
      },
      {
        "payment_mode": "CASH",
        "transaction_count": 35,
        "total_amount": 500000.00
      },
      {
        "payment_mode": "BANK_TRANSFER",
        "transaction_count": 20,
        "total_amount": 300000.00
      },
      {
        "payment_mode": "CARD",
        "transaction_count": 10,
        "total_amount": 200000.00
      }
    ],
    "top_payables": [
      {
        "vendor_name": "Medtronic Healthcare Pvt Ltd",
        "vendor_type": "CONSUMABLES",
        "total_billed": 177000.00,
        "total_paid": 88500.00,
        "outstanding": 88500.00
      }
    ],
    "net_profit": 1550000.00
  }
}
```

## GST Calculation Logic

### Intra-State (Kerala) Transactions
```javascript
// For intra-state transactions (within Kerala)
const gst_rate = 0.18; // 18% GST
const cgst_rate = gst_rate / 2; // 9% CGST
const sgst_rate = gst_rate / 2; // 9% SGST
const igst_rate = 0; // No IGST for intra-state

const cgst_amount = taxable_amount * cgst_rate;
const sgst_amount = taxable_amount * sgst_rate;
const total_gst = cgst_amount + sgst_amount;
```

### Inter-State Transactions
```javascript
// For inter-state transactions
const gst_rate = 0.18; // 18% GST
const igst_rate = gst_rate; // 18% IGST
const cgst_rate = 0; // No CGST for inter-state
const sgst_rate = 0; // No SGST for inter-state

const igst_amount = taxable_amount * igst_rate;
const total_gst = igst_amount;
```

## Payment Mode Details

### UPI Payments
- **Supported Apps**: PhonePe, Google Pay, Paytm, BHIM
- **Transaction ID**: UPI transaction reference
- **UPI ID**: Customer UPI ID
- **Status Tracking**: Real-time payment status

### Bank Transfers
- **NEFT**: National Electronic Funds Transfer
- **RTGS**: Real Time Gross Settlement
- **IMPS**: Immediate Payment Service
- **IFSC Code**: Indian Financial System Code

### Card Payments
- **Debit Cards**: Bank debit cards
- **Credit Cards**: Credit card payments
- **Transaction ID**: Card transaction reference
- **Bank**: Issuing bank details

## Kerala-Specific Features

### Local Vendor Integration
- **Kerala Medical Suppliers**: Local consumable suppliers
- **Kochi, Trivandrum, Thrissur**: Major city coverage
- **Malayalam Support**: Local language support
- **Regional Taxes**: Kerala-specific tax considerations

### Banking Integration
- **Major Banks**: SBI, HDFC, ICICI, Federal, Axis
- **Local Banks**: Kerala Gramin Bank, Catholic Syrian Bank
- **Branch Networks**: Kerala-wide branch coverage
- **IFSC Codes**: Kerala bank IFSC codes

### Regulatory Compliance
- **GST Act**: Full GST compliance
- **Medical Council**: Medical billing standards
- **Insurance Regulations**: Insurance claim compliance
- **Data Protection**: Patient data privacy

## Sample Data

### Kerala Cities
- **Kochi (Ernakulam)**: Major commercial hub
- **Trivandrum**: State capital
- **Thrissur**: Cultural capital
- **Kozhikode**: Malabar region
- **Kollam**: Coastal district

### Indian Banks
- **State Bank of India**: National bank
- **HDFC Bank**: Private sector bank
- **ICICI Bank**: Private sector bank
- **Federal Bank**: Kerala-based bank
- **Axis Bank**: Private sector bank

### GST Rates
- **18%**: Standard rate for most services
- **12%**: Reduced rate for specific items
- **5%**: Essential items
- **0%**: Exempted items

## Implementation Benefits

### 🇮🇳 Indian Compliance
- **GST Ready**: Full GST compliance
- **Tax Reporting**: Comprehensive tax reports
- **Audit Trail**: Complete transaction history
- **Regulatory**: Medical billing standards

### 💰 Financial Management
- **Multi-Currency**: INR support
- **Bank Integration**: Multiple bank accounts
- **Payment Tracking**: Complete payment lifecycle
- **Revenue Analysis**: Detailed financial reports

### 📦 Inventory Management
- **Real-time Stock**: Live inventory tracking
- **Reorder Alerts**: Automatic stock alerts
- **Purchase Tracking**: Vendor purchase management
- **Usage Analysis**: Consumption patterns

### 🏥 Diagnostic Center Focus
- **Study Billing**: Medical procedure billing
- **Insurance Claims**: Insurance integration
- **Patient Management**: Complete patient billing
- **Revenue Tracking**: Center-wise revenue

This billing module provides comprehensive financial management specifically designed for diagnostic centers in Kerala, India, with full GST compliance and local payment method support.
