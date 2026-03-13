# Bill Printing and PDF Generation Documentation

## Overview
This module provides comprehensive bill printing and PDF generation capabilities for your Kerala diagnostic centers, with customizable templates, logo management, and site-specific configurations.

## Key Features

### 🎨 Customizable Bill Templates
- **Multiple Templates**: Create unlimited bill templates per center
- **HTML/CSS Control**: Full control over bill appearance
- **Dynamic Content**: Variable substitution in templates
- **Print Optimization**: Optimized for both screen and print

### 🖼️ Logo Management
- **Upload Logos**: Support for JPG, PNG, GIF formats
- **Position Control**: Left, Center, Right positioning
- **Multiple Logos**: Header, Footer, Watermark logos
- **File Management**: Automatic file organization

### 📄 PDF Generation
- **High-Quality PDF**: Professional PDF generation
- **Custom Sizes**: A4, A5, Letter paper sizes
- **Orientation**: Portrait and Landscape support
- **Margins**: Customizable margins for printing

### 🖨️ Direct Printing
- **Print Jobs**: Track print job status
- **Multiple Copies**: Print multiple copies
- **Printer Selection**: Choose specific printers
- **Print History**: Track all print activities

## API Endpoints

### Bill Configuration Management

#### Create Bill Configuration
```http
POST /api/bill-printing/bill-configuration
```

**Request Body:**
```json
{
  "center_id": 1,
  "template_name": "Standard Template",
  "header_text": "MEDICAL IMAGING CENTER",
  "footer_text": "Thank you for choosing our services",
  "terms_conditions": "1. Payment due within 30 days\n2. Late payment charges applicable",
  "show_logo": true,
  "show_center_details": true,
  "show_patient_details": true,
  "show_breakdown": true,
  "show_gst_breakdown": true,
  "show_payment_details": true,
  "show_terms": true,
  "show_signature": true,
  "logo_position": "CENTER",
  "font_size": 12,
  "paper_size": "A4",
  "orientation": "PORTRAIT",
  "margin_top": 1.0,
  "margin_bottom": 1.0,
  "margin_left": 1.0,
  "margin_right": 1.0
}
```

**Response:**
```json
{
  "message": "Bill configuration created successfully",
  "configuration": {
    "id": 1,
    "center_id": 1,
    "template_name": "Standard Template",
    "header_text": "MEDICAL IMAGING CENTER",
    "footer_text": "Thank you for choosing our services",
    "terms_conditions": "1. Payment due within 30 days\n2. Late payment charges applicable",
    "show_logo": true,
    "show_center_details": true,
    "show_patient_details": true,
    "show_breakdown": true,
    "show_gst_breakdown": true,
    "show_payment_details": true,
    "show_terms": true,
    "show_signature": true,
    "logo_position": "CENTER",
    "font_size": 12,
    "paper_size": "A4",
    "orientation": "PORTRAIT",
    "margin_top": 1.0,
    "margin_bottom": 1.0,
    "margin_left": 1.0,
    "margin_right": 1.0
  }
}
```

#### Get Bill Configurations
```http
GET /api/bill-printing/bill-configuration?center_id=1&is_default=true
```

**Response:**
```json
{
  "success": true,
  "configurations": [
    {
      "id": 1,
      "center_id": 1,
      "template_name": "Standard Template",
      "header_text": "MEDICAL IMAGING CENTER",
      "footer_text": "Thank you for choosing our services",
      "terms_conditions": "1. Payment due within 30 days\n2. Late payment charges applicable",
      "show_logo": true,
      "show_center_details": true,
      "show_patient_details": true,
      "show_breakdown": true,
      "show_gst_breakdown": true,
      "show_payment_details": true,
      "show_terms": true,
      "show_signature": true,
      "logo_position": "CENTER",
      "font_size": 12,
      "paper_size": "A4",
      "orientation": "PORTRAIT",
      "margin_top": 1.0,
      "margin_bottom": 1.0,
      "margin_left": 1.0,
      "margin_right": 1.0,
      "is_default": true,
      "center_name": "Main Hospital",
      "center_logo_path": "/uploads/logos/logo_1_1234567890.jpg"
    }
  ]
}
```

### Logo Management

#### Upload Logo
```http
POST /api/bill-printing/upload-logo
```

**Form Data (multipart/form-data):**
- `center_id`: Center ID
- `logo_name`: Logo name
- `logo_type`: HEADER, FOOTER, or WATERMARK
- `position`: LEFT, CENTER, or RIGHT
- `logo`: File (JPG, PNG, GIF)

**Response:**
```json
{
  "message": "Logo uploaded successfully",
  "logo": {
    "id": 1,
    "center_id": 1,
    "logo_name": "Main Logo",
    "logo_path": "/uploads/logos/logo_1_1234567890.jpg",
    "logo_type": "HEADER",
    "position": "CENTER",
    "file_size": 150000,
    "file_extension": ".jpg"
  }
}
```

#### Get Logos
```http
GET /api/bill-printing/logos?center_id=1&logo_type=HEADER
```

**Response:**
```json
{
  "success": true,
  "logos": [
    {
      "id": 1,
      "center_id": 1,
      "logo_name": "Main Logo",
      "logo_path": "/uploads/logos/logo_1_1234567890.jpg",
      "logo_type": "HEADER",
      "position": "CENTER",
      "file_size": 150000,
      "file_extension": ".jpg",
      "center_name": "Main Hospital",
      "created_at": "2024-03-13T10:30:00.000Z"
    }
  ]
}
```

### PDF Generation

#### Generate Bill PDF
```http
POST /api/bill-printing/generate-bill-pdf
```

**Request Body:**
```json
{
  "bill_id": 1,
  "configuration_id": 1,
  "output_format": "PDF",
  "print_options": {
    "show_watermark": true,
    "watermark_text": "DRAFT"
  }
}
```

**Response (PDF):**
- **Content-Type**: application/pdf
- **Content-Disposition**: attachment; filename="bill_INV-1-20240313-0001_2024-03-13.pdf"
- **Body**: PDF file content

#### Generate Bill HTML
```http
POST /api/bill-printing/generate-bill-pdf
```

**Request Body:**
```json
{
  "bill_id": 1,
  "configuration_id": 1,
  "output_format": "HTML"
}
```

**Response (HTML):**
- **Content-Type**: text/html
- **Body**: HTML bill content

### Direct Printing

#### Print Bill
```http
POST /api/bill-printing/print-bill
```

**Request Body:**
```json
{
  "bill_id": 1,
  "configuration_id": 1,
  "printer_name": "HP LaserJet",
  "copies": 2
}
```

**Response:**
- **Content-Type**: application/pdf
- **Content-Disposition**: inline; filename="bill_print_1_1234567890.pdf"
- **Body**: PDF file content

## Bill Template Variables

### Available Variables
- `{{logo}}`: Center logo
- `{{center_name}}`: Center name
- `{{center_address}}`: Center address
- `{{center_city}}`: Center city
- `{{center_state}}`: Center state
- `{{center_postal_code}}`: Center postal code
- `{{center_phone}}`: Center phone
- `{{center_email}}`: Center email
- `{{center_gst_number}}`: Center GST number
- `{{patient_name}}`: Patient name
- `{{patient_address}}`: Patient address
- `{{patient_city}}`: Patient city
- `{{patient_state}}`: Patient state
- `{{patient_postal_code}}`: Patient postal code
- `{{patient_phone}}`: Patient phone
- `{{patient_email}}`: Patient email
- `{{bill_number}}`: Bill invoice number
- `{{bill_date}}`: Bill date
- `{{subtotal}}`: Bill subtotal
- `{{discount_amount}}`: Discount amount
- `{{taxable_amount}}`: Taxable amount
- `{{cgst_amount}}`: CGST amount
- `{{sgst_amount}}`: SGST amount
- `{{igst_amount}}`: IGST amount
- `{{total_gst}}`: Total GST
- `{{total_amount}}`: Total amount
- `{{payment_mode}}`: Payment mode
- `{{payment_status}}`: Payment status
- `{{current_date}}`: Current date
- `{{current_time}}`: Current time

### Sample Template HTML
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Bill - {{bill_number}}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
        }
        .logo {
            max-width: 200px;
            max-height: 100px;
        }
        .center-details {
            margin-bottom: 20px;
        }
        .patient-details {
            margin-bottom: 20px;
        }
        .bill-details {
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f2f2f2;
            font-weight: bold;
        }
        .text-right {
            text-align: right;
        }
        .bold {
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="{{logo}}" alt="Logo" class="logo">
        <h2>{{center_name}}</h2>
    </div>

    <div class="center-details">
        <h3>{{center_name}}</h3>
        <p>{{center_address}}</p>
        <p>{{center_city}}, {{center_state}} - {{center_postal_code}}</p>
        <p>Phone: {{center_phone}}</p>
        <p>Email: {{center_email}}</p>
        <p>GST No: {{center_gst_number}}</p>
    </div>

    <div class="patient-details">
        <h3>Patient Details</h3>
        <p><strong>Name:</strong> {{patient_name}}</p>
        <p><strong>Address:</strong> {{patient_address}}, {{patient_city}}, {{patient_state}} - {{patient_postal_code}}</p>
        <p><strong>Phone:</strong> {{patient_phone}}</p>
        <p><strong>Email:</strong> {{patient_email}}</p>
    </div>

    <div class="bill-details">
        <h3>Bill Details</h3>
        <p><strong>Invoice No:</strong> {{bill_number}}</p>
        <p><strong>Bill Date:</strong> {{bill_date}}</p>
        <p><strong>Payment Mode:</strong> {{payment_mode}}</p>
        <p><strong>Status:</strong> {{payment_status}}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Study</th>
                <th>Modality</th>
                <th>Rate</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            <!-- Bill items will be populated here -->
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" class="bold">Subtotal</td>
                <td class="text-right bold">₹{{subtotal}}</td>
            </tr>
            <tr>
                <td colspan="3" class="bold">Taxable Amount</td>
                <td class="text-right bold">₹{{taxable_amount}}</td>
            </tr>
            <tr>
                <td colspan="2" class="bold">Total GST</td>
                <td class="text-right bold">₹{{total_gst}}</td>
            </tr>
            <tr>
                <td colspan="2" class="bold">Total Amount</td>
                <td class="text-right bold">₹{{total_amount}}</td>
            </tr>
        </tfoot>
    </table>

    <div class="footer">
        <p>Thank you for choosing our services</p>
    </div>
</body>
</html>
```

## Print Configuration Options

### Paper Sizes
- **A4**: Standard A4 (210 × 297 mm)
- **A5**: A5 (148 × 210 mm)
- **Letter**: US Letter (216 × 279 mm)

### Orientation
- **Portrait**: Vertical layout
- **Landscape**: Horizontal layout

### Logo Position
- **LEFT**: Left-aligned logo
- **CENTER**: Center-aligned logo
- **RIGHT**: Right-aligned logo

### Display Options
- **show_logo**: Display center logo
- **show_center_details**: Show center information
- **show_patient_details**: Show patient information
- **show_breakdown**: Show item breakdown
- **show_gst_breakdown**: Show GST breakdown
- **show_payment_details**: Show payment information
- **show_terms**: Show terms and conditions
- **show_signature**: Show signature area

## Kerala-Specific Features

### Logo Management
- **Multiple Centers**: Different logos per center
- **Position Control**: Flexible logo positioning
- **File Types**: Support for JPG, PNG, GIF
- **File Size**: Automatic file size tracking

### Template Customization
- **Center-Specific**: Different templates per center
- **GST Compliance**: Kerala GST compliance
- **Local Language**: Support for Malayalam text
- **Regional Address**: Kerala address formatting

### Print Optimization
- **Local Printers**: Support for local Kerala printers
- **Print Quality**: High-quality PDF generation
- **Batch Printing**: Multiple copy printing
- **Print History**: Track all printing activities

## Implementation Benefits

### 🎨 Professional Appearance
- **Custom Templates**: Professional bill appearance
- **Brand Consistency**: Consistent branding across centers
- **Logo Integration**: Professional logo placement
- **GST Compliance**: Professional GST-compliant bills

### 📄 PDF Generation
- **High Quality**: Professional PDF output
- **Customizable**: Flexible PDF configuration
- **Download Option**: Direct PDF download
- **Print Ready**: Optimized for printing

### 🖨️ Direct Printing
- **Print Jobs**: Track print job status
- **Multiple Copies**: Print multiple copies
- **Printer Selection**: Choose specific printers
- **Print History**: Complete print tracking

### 🏢 Multi-Center Support
- **Center-Specific**: Different templates per center
- **Shared GST**: Same GST number across centers
- **Different Addresses**: Center-specific addresses
- **Local Customization**: Kerala-specific customization

## Usage Examples

### Create Custom Template for Kochi Center
```javascript
const kochiTemplate = {
  center_id: 1,
  template_name: "Kochi Standard",
  header_text: "KOCHI MEDICAL IMAGING CENTER",
  footer_text: "Serving Kochi with advanced medical imaging",
  terms_conditions: "1. Payment due within 30 days\n2. Kerala jurisdiction applies",
  show_logo: true,
  show_center_details: true,
  logo_position: "CENTER",
  font_size: 12,
  paper_size: "A4",
  orientation: "PORTRAIT"
};
```

### Upload Logo for Trivandrum Center
```javascript
const logoUpload = {
  center_id: 2,
  logo_name: "Trivandrum Main Logo",
  logo_type: "HEADER",
  position: "CENTER"
};
```

### Generate Bill with Custom Template
```javascript
const billGeneration = {
  bill_id: 1,
  configuration_id: 1,
  output_format: "PDF"
};
```

### Print Bill Directly
```javascript
const printBill = {
  bill_id: 1,
  configuration_id: 1,
  printer_name: "HP LaserJet Pro",
  copies: 2
};
```

## Technical Implementation

### PDF Generation
- **Puppeteer**: Headless Chrome for PDF generation
- **HTML Templates**: HTML-based bill templates
- **CSS Styling**: Professional CSS styling
- **Print Optimization**: Print-optimized output

### File Management
- **Upload Directory**: Organized file storage
- **File Validation**: File type and size validation
- **Path Management**: Secure file path handling
- **Cleanup**: Automatic cleanup of old files

### Print Tracking
- **Print Jobs**: Track print job status
- **Error Handling**: Comprehensive error tracking
- **History**: Complete print history
- **Performance**: Optimized print performance

This bill printing module provides comprehensive bill generation and printing capabilities specifically designed for Kerala diagnostic centers, with full customization options and professional output quality.
