const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('BILL_PRINT_VIEW'));

// BILL CONFIGURATION MANAGEMENT

// Create bill configuration
router.post('/bill-configuration', [
  body('center_id').isInt(),
  body('template_name').trim().isLength({ min: 2, max: 100 }),
  body('header_text').trim().isLength({ min: 2, max: 500 }),
  body('footer_text').trim().isLength({ min: 2, max: 500 }),
  body('terms_conditions').trim().isLength({ min: 10, max: 2000 }),
  body('show_logo').isBoolean(),
  body('show_center_details').isBoolean(),
  body('show_patient_details').isBoolean(),
  body('show_breakdown').isBoolean(),
  body('show_gst_breakdown').isBoolean(),
  body('show_payment_details').isBoolean(),
  body('show_terms').isBoolean(),
  body('show_signature').isBoolean(),
  body('logo_position').isIn(['LEFT', 'CENTER', 'RIGHT']),
  body('font_size').isInt({ min: 8, max: 20 }),
  body('paper_size').isIn(['A4', 'A5', 'LETTER']),
  body('orientation').isIn(['PORTRAIT', 'LANDSCAPE']),
  body('margin_top').isDecimal({ min: 0, max: 5 }),
  body('margin_bottom').isDecimal({ min: 0, max: 5 }),
  body('margin_left').isDecimal({ min: 0, max: 5 }),
  body('margin_right').isDecimal({ min: 0, max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      center_id,
      template_name,
      header_text,
      footer_text,
      terms_conditions,
      show_logo,
      show_center_details,
      show_patient_details,
      show_breakdown,
      show_gst_breakdown,
      show_payment_details,
      show_terms,
      show_signature,
      logo_position,
      font_size,
      paper_size,
      orientation,
      margin_top,
      margin_bottom,
      margin_left,
      margin_right
    } = req.body;

    const query = `
      INSERT INTO bill_configuration (
        center_id, template_name, header_text, footer_text, terms_conditions,
        show_logo, show_center_details, show_patient_details, show_breakdown,
        show_gst_breakdown, show_payment_details, show_terms, show_signature,
        logo_position, font_size, paper_size, orientation, margin_top,
        margin_bottom, margin_left, margin_right, is_default,
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, false,
        NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [
      center_id, template_name, header_text, footer_text, terms_conditions,
      show_logo, show_center_details, show_patient_details, show_breakdown,
      show_gst_breakdown, show_payment_details, show_terms, show_signature,
      logo_position, font_size, paper_size, orientation, margin_top,
      margin_bottom, margin_left, margin_right
    ]);

    logger.info(`Bill configuration created: ${template_name} for center ${center_id}`);

    res.status(201).json({
      message: 'Bill configuration created successfully',
      configuration: {
        id: result.rows[0].id,
        center_id,
        template_name,
        header_text,
        footer_text,
        terms_conditions,
        show_logo,
        show_center_details,
        show_patient_details,
        show_breakdown,
        show_gst_breakdown,
        show_payment_details,
        show_terms,
        show_signature,
        logo_position,
        font_size,
        paper_size,
        orientation,
        margin_top,
        margin_bottom,
        margin_left,
        margin_right
      }
    });

  } catch (error) {
    logger.error('Create bill configuration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bill configurations
router.get('/bill-configuration', async (req, res) => {
  try {
    const { center_id, is_default } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND bc.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (is_default) {
      whereClause += ' AND bc.is_default = $' + (queryParams.length + 1);
      queryParams.push(is_default === 'true');
    }

    const query = `
      SELECT 
        bc.*,
        c.name as center_name,
        c.logo_path as center_logo_path
      FROM bill_configuration bc
      LEFT JOIN centers c ON bc.center_id = c.id
      WHERE ${whereClause} AND bc.active = true
      ORDER BY bc.is_default DESC, bc.template_name
    `;

    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      configurations: result.rows,
      filters: {
        center_id,
        is_default
      }
    });

  } catch (error) {
    logger.error('Get bill configurations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bill configuration
router.put('/bill-configuration/:id', [
  body('template_name').trim().isLength({ min: 2, max: 100 }),
  body('header_text').trim().isLength({ min: 2, max: 500 }),
  body('footer_text').trim().isLength({ min: 2, max: 500 }),
  body('terms_conditions').trim().isLength({ min: 10, max: 2000 }),
  body('show_logo').isBoolean(),
  body('show_center_details').isBoolean(),
  body('show_patient_details').isBoolean(),
  body('show_breakdown').isBoolean(),
  body('show_gst_breakdown').isBoolean(),
  body('show_payment_details').isBoolean(),
  body('show_terms').isBoolean(),
  body('show_signature').isBoolean(),
  body('logo_position').isIn(['LEFT', 'CENTER', 'RIGHT']),
  body('font_size').isInt({ min: 8, max: 20 }),
  body('paper_size').isIn(['A4', 'A5', 'LETTER']),
  body('orientation').isIn(['PORTRAIT', 'LANDSCAPE']),
  body('margin_top').isDecimal({ min: 0, max: 5 }),
  body('margin_bottom').isDecimal({ min: 0, max: 5 }),
  body('margin_left').isDecimal({ min: 0, max: 5 }),
  body('margin_right').isDecimal({ min: 0, max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      template_name,
      header_text,
      footer_text,
      terms_conditions,
      show_logo,
      show_center_details,
      show_patient_details,
      show_breakdown,
      show_gst_breakdown,
      show_payment_details,
      show_terms,
      show_signature,
      logo_position,
      font_size,
      paper_size,
      orientation,
      margin_top,
      margin_bottom,
      margin_left,
      margin_right
    } = req.body;

    const query = `
      UPDATE bill_configuration SET 
        template_name = $2, header_text = $3, footer_text = $4, terms_conditions = $5,
        show_logo = $6, show_center_details = $7, show_patient_details = $8, 
        show_breakdown = $9, show_gst_breakdown = $10, show_payment_details = $11,
        show_terms = $12, show_signature = $13, logo_position = $14, font_size = $15,
        paper_size = $16, orientation = $17, margin_top = $18, margin_bottom = $19,
        margin_left = $20, margin_right = $21, updated_at = NOW() 
      WHERE id = $1 AND active = true
    `;

    await pool.query(query, [
      id, template_name, header_text, footer_text, terms_conditions,
      show_logo, show_center_details, show_patient_details, show_breakdown,
      show_gst_breakdown, show_payment_details, show_terms, show_signature,
      logo_position, font_size, paper_size, orientation, margin_top,
      margin_bottom, margin_left, margin_right
    ]);

    logger.info(`Bill configuration updated: ${template_name} (ID: ${id})`);

    res.json({
      message: 'Bill configuration updated successfully',
      configuration: {
        id,
        template_name,
        header_text,
        footer_text,
        terms_conditions,
        show_logo,
        show_center_details,
        show_patient_details,
        show_breakdown,
        show_gst_breakdown,
        show_payment_details,
        show_terms,
        show_signature,
        logo_position,
        font_size,
        paper_size,
        orientation,
        margin_top,
        margin_bottom,
        margin_left,
        margin_right
      }
    });

  } catch (error) {
    logger.error('Update bill configuration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGO MANAGEMENT

// Upload logo
router.post('/upload-logo', [
  body('center_id').isInt(),
  body('logo_name').trim().isLength({ min: 2, max: 100 }),
  body('logo_type').isIn(['HEADER', 'FOOTER', 'WATERMARK']),
  body('position').isIn(['LEFT', 'CENTER', 'RIGHT'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { center_id, logo_name, logo_type, position } = req.body;

    // Handle file upload (assuming multipart/form-data)
    if (!req.files || !req.files.logo) {
      return res.status(400).json({ error: 'Logo file is required' });
    }

    const logoFile = req.files.logo;
    const logoExtension = path.extname(logoFile.name);
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];

    if (!allowedExtensions.includes(logoExtension.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid file type. Only JPG, PNG, and GIF are allowed' });
    }

    // Generate unique filename
    const logoFilename = `logo_${center_id}_${Date.now()}${logoExtension}`;
    const logoPath = path.join(__dirname, '../../uploads/logos', logoFilename);

    // Create directory if it doesn't exist
    const logoDir = path.dirname(logoPath);
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }

    // Save file
    await logoFile.mv(logoPath);

    // Save to database
    const query = `
      INSERT INTO center_logos (
        center_id, logo_name, logo_path, logo_type, position,
        file_size, file_extension, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [
      center_id, logo_name, logoPath, logo_type, position,
      logoFile.size, logoExtension
    ]);

    // Update center logo path if it's a header logo
    if (logo_type === 'HEADER') {
      await pool.query(
        'UPDATE centers SET logo_path = $1, updated_at = NOW() WHERE id = $2',
        [logoPath, center_id]
      );
    }

    logger.info(`Logo uploaded: ${logo_name} for center ${center_id}`);

    res.status(201).json({
      message: 'Logo uploaded successfully',
      logo: {
        id: result.rows[0].id,
        center_id,
        logo_name,
        logo_path: logoPath,
        logo_type,
        position,
        file_size: logoFile.size,
        file_extension: logoExtension
      }
    });

  } catch (error) {
    logger.error('Upload logo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get logos
router.get('/logos', async (req, res) => {
  try {
    const { center_id, logo_type } = req.query;
    
    let whereClause = '1=1';
    let queryParams = [];
    
    if (center_id) {
      whereClause += ' AND cl.center_id = $1';
      queryParams.push(center_id);
    }
    
    if (logo_type) {
      whereClause += ' AND cl.logo_type = $' + (queryParams.length + 1);
      queryParams.push(logo_type);
    }

    const query = `
      SELECT 
        cl.*,
        c.name as center_name
      FROM center_logos cl
      LEFT JOIN centers c ON cl.center_id = c.id
      WHERE ${whereClause} AND cl.active = true
      ORDER BY cl.logo_type, cl.created_at DESC
    `;

    const result = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      logos: result.rows,
      filters: {
        center_id,
        logo_type
      }
    });

  } catch (error) {
    logger.error('Get logos error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BILL GENERATION AND PRINTING

// Generate bill PDF
router.post('/generate-bill-pdf', [
  body('bill_id').isInt(),
  body('configuration_id').optional().isInt(),
  body('output_format').isIn(['PDF', 'HTML']),
  body('print_options').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bill_id, configuration_id, output_format = 'PDF', print_options } = req.body;

    // Get bill details
    const billQuery = `
      SELECT 
        pb.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email,
        p.address as patient_address, p.city as patient_city, p.state as patient_state,
        p.postal_code as patient_postal_code, c.name as center_name, c.address as center_address,
        c.city as center_city, c.state as center_state, c.postal_code as center_postal_code,
        c.phone as center_phone, c.email as center_email, c.gst_number as center_gst_number,
        c.logo_path as center_logo_path
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      LEFT JOIN centers c ON pb.center_id = c.id
      WHERE pb.id = $1 AND pb.active = true
    `;

    const billResult = await pool.query(billQuery, [bill_id]);
    
    if (billResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    // Get bill items
    const itemsQuery = `
      SELECT * FROM bill_items WHERE bill_id = $1 AND active = true
    `;

    const itemsResult = await pool.query(itemsQuery, [bill_id]);
    bill.items = itemsResult.rows;

    // Get bill payments
    const paymentsQuery = `
      SELECT * FROM bill_payments WHERE bill_id = $1 AND active = true
    `;

    const paymentsResult = await pool.query(paymentsQuery, [bill_id]);
    bill.payments = paymentsResult.rows;

    // Get bill configuration
    let configuration = null;
    if (configuration_id) {
      const configQuery = `
        SELECT * FROM bill_configuration WHERE id = $1 AND active = true
      `;
      const configResult = await pool.query(configQuery, [configuration_id]);
      configuration = configResult.rows[0];
    } else {
      // Get default configuration for center
      const defaultConfigQuery = `
        SELECT * FROM bill_configuration WHERE center_id = $1 AND is_default = true AND active = true
      `;
      const defaultConfigResult = await pool.query(defaultConfigQuery, [bill.center_id]);
      configuration = defaultConfigResult.rows[0];
    }

    // If no configuration found, use default
    if (!configuration) {
      configuration = {
        template_name: 'Default',
        header_text: 'MEDICAL IMAGING CENTER',
        footer_text: 'Thank you for choosing our services',
        terms_conditions: '1. Payment due within 30 days\n2. Late payment charges applicable\n3. Goods once sold cannot be returned',
        show_logo: true,
        show_center_details: true,
        show_patient_details: true,
        show_breakdown: true,
        show_gst_breakdown: true,
        show_payment_details: true,
        show_terms: true,
        show_signature: true,
        logo_position: 'CENTER',
        font_size: 12,
        paper_size: 'A4',
        orientation: 'PORTRAIT',
        margin_top: 1,
        margin_bottom: 1,
        margin_left: 1,
        margin_right: 1
      };
    }

    // Generate HTML content
    const htmlContent = generateBillHTML(bill, configuration);

    if (output_format === 'HTML') {
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } else {
      // Generate PDF using puppeteer-core
      try {
        const browser = await puppeteer.launch({
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
          format: configuration.paper_size.toLowerCase(),
          landscape: configuration.orientation === 'LANDSCAPE',
          margin: {
            top: `${configuration.margin_top}in`,
            bottom: `${configuration.margin_bottom}in`,
            left: `${configuration.margin_left}in`,
            right: `${configuration.margin_right}in`
          },
          printBackground: true
        });
        
        await browser.close();

        // Generate filename
        const filename = `bill_${bill.invoice_number}_${new Date().toLocaleDateString('en-CA')}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);

        logger.info(`Bill PDF generated: ${bill.invoice_number}`);

      } catch (pdfError) {
        logger.error('PDF generation error:', pdfError);
        res.status(500).json({ error: 'PDF generation failed' });
      }
    }

  } catch (error) {
    logger.error('Generate bill PDF error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Print bill directly
router.post('/print-bill', [
  body('bill_id').isInt(),
  body('configuration_id').optional().isInt(),
  body('printer_name').optional().trim().isLength({ min: 2, max: 100 }),
  body('copies').isInt({ min: 1, max: 10 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bill_id, configuration_id, printer_name, copies = 1 } = req.body;

    // Generate PDF first
    const pdfResponse = await fetch(`${req.protocol}://${req.get('host')}/api/billing/generate-bill-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization
      },
      body: JSON.stringify({
        bill_id,
        configuration_id,
        output_format: 'PDF'
      })
    });

    if (!pdfResponse.ok) {
      throw new Error('Failed to generate PDF');
    }

    const pdfBuffer = await pdfResponse.buffer();

    // For now, return the PDF for printing
    // In a real implementation, you would send this to the actual printer
    const filename = `bill_print_${bill_id}_${Date.now()}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);

    logger.info(`Bill printed: Bill ID ${bill_id}, Printer: ${printer_name}, Copies: ${copies}`);

    // In a real implementation, you would use a printing library like:
    // - node-printer for Windows
    // - cups for Linux/macOS
    // - or send to a network printer

  } catch (error) {
    logger.error('Print bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to generate HTML
function generateBillHTML(bill, config) {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Bill - ${bill.invoice_number}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: ${config.font_size}px;
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }
        .header {
            text-align: ${config.logo_position.toLowerCase()};
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
        .text-center {
            text-align: center;
        }
        .bold {
            font-weight: bold;
        }
        .footer {
            margin-top: 30px;
            border-top: 1px solid #ddd;
            padding-top: 10px;
            text-align: center;
        }
        .terms {
            margin-top: 20px;
            font-size: ${config.font_size - 2}px;
            white-space: pre-wrap;
        }
        .signature {
            margin-top: 30px;
            text-align: right;
        }
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    ${config.show_logo && bill.center_logo_path ? `
    <div class="header">
        <img src="${bill.center_logo_path}" alt="Logo" class="logo">
    </div>
    ` : ''}
    
    <div class="header">
        <h2>${config.header_text}</h2>
    </div>

    ${config.show_center_details ? `
    <div class="center-details">
        <h3>${bill.center_name}</h3>
        <p>${bill.center_address}</p>
        <p>${bill.center_city}, ${bill.center_state} - ${bill.center_postal_code}</p>
        <p>Phone: ${bill.center_phone}</p>
        <p>Email: ${bill.center_email}</p>
        <p>GST No: ${bill.center_gst_number}</p>
    </div>
    ` : ''}

    ${config.show_patient_details ? `
    <div class="patient-details">
        <h3>Patient Details</h3>
        <p><strong>Name:</strong> ${bill.patient_name}</p>
        <p><strong>Address:</strong> ${bill.patient_address}, ${bill.patient_city}, ${bill.patient_state} - ${bill.patient_postal_code}</p>
        <p><strong>Phone:</strong> ${bill.patient_phone}</p>
        <p><strong>Email:</strong> ${bill.patient_email}</p>
    </div>
    ` : ''}

    <div class="bill-details">
        <h3>Bill Details</h3>
        <p><strong>Invoice No:</strong> ${bill.invoice_number}</p>
        <p><strong>Bill Date:</strong> ${bill.bill_date}</p>
        <p><strong>Payment Mode:</strong> ${bill.payment_mode}</p>
        <p><strong>Status:</strong> ${bill.payment_status}</p>
    </div>

    ${config.show_breakdown ? `
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
            ${bill.items.map(item => `
            <tr>
                <td>${item.study_name}</td>
                <td>${item.modality}</td>
                <td class="text-right">₹${item.rate.toFixed(2)}</td>
                <td class="text-right">₹${item.amount.toFixed(2)}</td>
            </tr>
            `).join('')}
            <tr>
                <td colspan="3" class="bold">Subtotal</td>
                <td class="text-right bold">₹${bill.subtotal.toFixed(2)}</td>
            </tr>
            ${bill.discount_amount > 0 ? `
            <tr>
                <td colspan="3">Discount (${bill.discount_reason})</td>
                <td class="text-right">-₹${bill.discount_amount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
                <td colspan="3">Taxable Amount</td>
                <td class="text-right">₹${bill.taxable_amount.toFixed(2)}</td>
            </tr>
        </tbody>
    </table>
    ` : ''}

    ${config.show_gst_breakdown ? `
    <table>
        <thead>
            <tr>
                <th>Tax Type</th>
                <th>Rate</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>CGST</td>
                <td>${(bill.cgst_rate * 100).toFixed(2)}%</td>
                <td class="text-right">₹${bill.cgst_amount.toFixed(2)}</td>
            </tr>
            <tr>
                <td>SGST</td>
                <td>${(bill.sgst_rate * 100).toFixed(2)}%</td>
                <td class="text-right">₹${bill.sgst_amount.toFixed(2)}</td>
            </tr>
            <tr>
                <td colspan="2" class="bold">Total GST</td>
                <td class="text-right bold">₹${bill.total_gst.toFixed(2)}</td>
            </tr>
            <tr>
                <td colspan="2" class="bold">Total Amount</td>
                <td class="text-right bold">₹${bill.total_amount.toFixed(2)}</td>
            </tr>
        </tbody>
    </table>
    ` : ''}

    ${config.show_payment_details && bill.payments.length > 0 ? `
    <div class="payment-details">
        <h3>Payment Details</h3>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Mode</th>
                    <th>Amount</th>
                    <th>Reference</th>
                </tr>
            </thead>
            <tbody>
                ${bill.payments.map(payment => `
                <tr>
                    <td>${payment.payment_date}</td>
                    <td>${payment.payment_mode}</td>
                    <td class="text-right">₹${payment.amount_paid.toFixed(2)}</td>
                    <td>${payment.transaction_reference || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    ` : ''}

    ${config.show_terms ? `
    <div class="terms">
        <h3>Terms & Conditions</h3>
        <p>${config.terms_conditions}</p>
    </div>
    ` : ''}

    <div class="footer">
        <p>${config.footer_text}</p>
    </div>

    ${config.show_signature ? `
    <div class="signature">
        <p>Authorized Signature</p>
        <p>_________________________</p>
        <p>Date: ${new Date().toLocaleDateString()}</p>
    </div>
    ` : ''}
</body>
</html>
  `;
}

module.exports = router;
