const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const crypto = require('crypto');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('GST_VIEW'));

// GST Configuration Class
class GSTConfiguration {
  static async getServiceGSTConfig(serviceCode) {
    const query = `
      SELECT 
        sm.study_code,
        sm.study_name,
        sm.gst_rate,
        sm.is_taxable,
        sm.cess_rate,
        sm.hsn_code,
        sm.sac_code,
        sm.category,
        sm.gst_applicable,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.study_code = $1 AND sm.active = true
    `;
    
    const result = await pool.query(query, [serviceCode]);
    return result.rows[0] || null;
  }

  static async updateServiceGSTConfig(serviceCode, gstConfig) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update study master GST configuration
      const updateStudyQuery = `
        UPDATE study_master 
        SET 
          gst_rate = $1,
          is_taxable = $2,
          cess_rate = $3,
          hsn_code = $4,
          sac_code = $5,
          gst_applicable = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE study_code = $7
        RETURNING *
      `;
      
      const studyValues = [
        gstConfig.gst_rate,
        gstConfig.is_taxable,
        gstConfig.cess_rate || 0,
        gstConfig.hsn_code,
        gstConfig.sac_code,
        gstConfig.gst_applicable,
        serviceCode
      ];
      
      const updatedStudy = await client.query(updateStudyQuery, studyValues);
      
      // Update or insert tax configuration
      const upsertTaxQuery = `
        INSERT INTO tax_configuration (
          hsn_code, sac_code, gst_percentage, cess_percentage, 
          is_reverse_charge_applicable, gst_type, description, 
          effective_from, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (hsn_code, sac_code) 
        DO UPDATE SET 
          gst_percentage = EXCLUDED.gst_percentage,
          cess_percentage = EXCLUDED.cess_percentage,
          is_reverse_charge_applicable = EXCLUDED.is_reverse_charge_applicable,
          gst_type = EXCLUDED.gst_type,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const taxValues = [
        gstConfig.hsn_code,
        gstConfig.sac_code,
        gstConfig.gst_rate,
        gstConfig.cess_rate || 0,
        gstConfig.is_reverse_charge_applicable || false,
        gstConfig.gst_type || 'GOODS',
        gstConfig.description || ''
      ];
      
      const updatedTax = await client.query(upsertTaxQuery, taxValues);
      
      await client.query('COMMIT');
      
      return {
        study: updatedStudy.rows[0],
        tax: updatedTax.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAllTaxableServices() {
    const query = `
      SELECT 
        sm.study_code,
        sm.study_name,
        sm.gst_rate,
        sm.is_taxable,
        sm.cess_rate,
        sm.hsn_code,
        sm.sac_code,
        sm.category,
        sm.gst_applicable,
        sm.base_rate,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.active = true
      ORDER BY sm.study_name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getGSTRatesByCategory() {
    const query = `
      SELECT 
        sm.category,
        COUNT(*) as service_count,
        SUM(CASE WHEN sm.is_taxable = true THEN 1 ELSE 0 END) as taxable_count,
        SUM(CASE WHEN sm.is_taxable = false THEN 1 ELSE 0 END) as exempt_count,
        AVG(sm.gst_rate) as avg_gst_rate,
        MAX(sm.gst_rate) as max_gst_rate,
        MIN(sm.gst_rate) as min_gst_rate
      FROM study_master sm
      WHERE sm.active = true
      GROUP BY sm.category
      ORDER BY sm.category
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }
}

// GST Reporting Class
class GSTReporting {
  static async getGSTReportByDateRange(startDate, endDate, reportType = 'all') {
    let whereClause = 'WHERE ab.bill_date BETWEEN $1 AND $2';
    let queryParams = [startDate, endDate];
    
    if (reportType === 'paid') {
      whereClause += ' AND ab.billing_status IN ($3, $4, $5)';
      queryParams.push('FULLY_PAID', 'PARTIALLY_PAID', 'OVERPAID');
    } else if (reportType === 'aris_paid') {
      whereClause += ' AND ab.payment_source = $3';
      queryParams.push('ARIS');
    }
    
    const query = `
      SELECT 
        ab.id as bill_id,
        ab.invoice_number,
        ab.bill_date,
        ab.patient_name,
        ab.patient_pid,
        ab.billing_status,
        ab.payment_status,
        ab.payment_source,
        ab.subtotal,
        ab.discount_amount,
        ab.taxable_amount,
        ab.cgst_amount,
        ab.sgst_amount,
        ab.igst_amount,
        ab.cess_amount,
        ab.total_amount,
        ab.amount_paid,
        ab.balance_amount,
        ab.payment_terms,
        ab.due_date,
        ab.overdue_days,
        -- Bill items with GST details
        (
          SELECT json_agg(
            json_build_object(
              'item_code', bi.item_code,
              'item_name', bi.item_name,
              'item_type', bi.item_type,
              'quantity', bi.quantity,
              'unit_price', bi.unit_price,
              'total_price', bi.total_price,
              'discount_percentage', bi.discount_percentage,
              'discount_amount', bi.discount_amount,
              'taxable_amount', bi.taxable_amount,
              'gst_rate', bi.gst_rate,
              'cgst_amount', bi.cgst_amount,
              'sgst_amount', bi.sgst_amount,
              'igst_amount', bi.igst_amount,
              'cess_amount', bi.cess_amount,
              'total_amount', bi.total_amount,
              'hsn_code', bi.hsn_code,
              'sac_code', bi.sac_code,
              'is_taxable', bi.is_taxable
            )
          )
          FROM accounting_bill_items bi
          WHERE bi.bill_id = ab.id AND bi.active = true
        ) as bill_items,
        -- Payment details
        (
          SELECT json_agg(
            json_build_object(
              'receipt_number', ap.receipt_number,
              'payment_date', ap.payment_date,
              'payment_method', ap.payment_method,
              'payment_type', ap.payment_type,
              'amount', ap.amount,
              'payment_status', ap.payment_status,
              'reference_number', ap.reference_number
            )
          )
          FROM accounting_payments ap
          WHERE ap.bill_id = ab.id AND ap.active = true
        ) as payments
      FROM accounting_bills ab
      ${whereClause}
      ORDER BY ab.bill_date DESC, ab.invoice_number
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async getGSTSummaryByDateRange(startDate, endDate, reportType = 'all') {
    let whereClause = 'WHERE bill_date BETWEEN $1 AND $2';
    let queryParams = [startDate, endDate];
    
    if (reportType === 'paid') {
      whereClause += ' AND billing_status IN ($3, $4, $5)';
      queryParams.push('FULLY_PAID', 'PARTIALLY_PAID', 'OVERPAID');
    } else if (reportType === 'aris_paid') {
      whereClause += ' AND payment_source = $3';
      queryParams.push('ARIS');
    }
    
    const query = `
      SELECT 
        -- Overall summary
        COUNT(*) as total_bills,
        SUM(subtotal) as total_subtotal,
        SUM(discount_amount) as total_discount,
        SUM(taxable_amount) as total_taxable_amount,
        SUM(cgst_amount) as total_cgst,
        SUM(sgst_amount) as total_sgst,
        SUM(igst_amount) as total_igst,
        SUM(cess_amount) as total_cess,
        SUM(total_amount) as total_amount,
        SUM(amount_paid) as total_paid,
        SUM(balance_amount) as total_balance,
        
        -- GST rate breakdown
        SUM(CASE WHEN gst_rate = 0 THEN taxable_amount ELSE 0 END) as gst_exempt_amount,
        SUM(CASE WHEN gst_rate = 0.05 THEN taxable_amount ELSE 0 END) as gst_5_percent_amount,
        SUM(CASE WHEN gst_rate = 0.12 THEN taxable_amount ELSE 0 END) as gst_12_percent_amount,
        SUM(CASE WHEN gst_rate = 0.18 THEN taxable_amount ELSE 0 END) as gst_18_percent_amount,
        SUM(CASE WHEN gst_rate = 0.28 THEN taxable_amount ELSE 0 END) as gst_28_percent_amount,
        
        -- Payment source breakdown
        SUM(CASE WHEN payment_source = 'PATIENT' THEN total_amount ELSE 0 END) as patient_paid_amount,
        SUM(CASE WHEN payment_source = 'ARIS' THEN total_amount ELSE 0 END) as aris_paid_amount,
        SUM(CASE WHEN payment_source = 'INSURANCE' THEN total_amount ELSE 0 END) as insurance_paid_amount,
        SUM(CASE WHEN payment_source = 'CORPORATE' THEN total_amount ELSE 0 END) as corporate_paid_amount,
        
        -- Status breakdown
        SUM(CASE WHEN billing_status = 'DRAFT' THEN total_amount ELSE 0 END) as draft_amount,
        SUM(CASE WHEN billing_status = 'PENDING' THEN total_amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN billing_status = 'POSTED' THEN total_amount ELSE 0 END) as posted_amount,
        SUM(CASE WHEN billing_status = 'PARTIALLY_PAID' THEN total_amount ELSE 0 END) as partially_paid_amount,
        SUM(CASE WHEN billing_status = 'FULLY_PAID' THEN total_amount ELSE 0 END) as fully_paid_amount,
        SUM(CASE WHEN billing_status = 'VOIDED' THEN total_amount ELSE 0 END) as voided_amount,
        SUM(CASE WHEN billing_status = 'WRITTEN_OFF' THEN total_amount ELSE 0 END) as written_off_amount
        
      FROM accounting_bills
      ${whereClause}
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows[0];
  }

  static async getGSTByServiceType(startDate, endDate, reportType = 'all') {
    let whereClause = 'WHERE ab.bill_date BETWEEN $1 AND $2';
    let queryParams = [startDate, endDate];
    
    if (reportType === 'paid') {
      whereClause += ' AND ab.billing_status IN ($3, $4, $5)';
      queryParams.push('FULLY_PAID', 'PARTIALLY_PAID', 'OVERPAID');
    } else if (reportType === 'aris_paid') {
      whereClause += ' AND ab.payment_source = $3';
      queryParams.push('ARIS');
    }
    
    const query = `
      SELECT 
        bi.item_code,
        bi.item_name,
        bi.item_type,
        bi.hsn_code,
        bi.sac_code,
        bi.gst_rate,
        bi.is_taxable,
        COUNT(DISTINCT bi.bill_id) as bill_count,
        SUM(bi.quantity) as total_quantity,
        SUM(bi.total_price) as total_revenue,
        SUM(bi.taxable_amount) as total_taxable_amount,
        SUM(bi.cgst_amount) as total_cgst,
        SUM(bi.sgst_amount) as total_sgst,
        SUM(bi.igst_amount) as total_igst,
        SUM(bi.cess_amount) as total_cess,
        SUM(bi.total_amount) as total_amount_with_gst,
        AVG(bi.unit_price) as avg_unit_price,
        MAX(bi.unit_price) as max_unit_price,
        MIN(bi.unit_price) as min_unit_price
      FROM accounting_bill_items bi
      INNER JOIN accounting_bills ab ON bi.bill_id = ab.id
      ${whereClause}
      AND bi.active = true
      GROUP BY bi.item_code, bi.item_name, bi.item_type, bi.hsn_code, bi.sac_code, bi.gst_rate, bi.is_taxable
      ORDER BY total_revenue DESC
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async getGSTByPaymentMethod(startDate, endDate, reportType = 'all') {
    let whereClause = 'WHERE ap.payment_date BETWEEN $1 AND $2';
    let queryParams = [startDate, endDate];
    
    if (reportType === 'paid') {
      whereClause += ' AND ab.billing_status IN ($3, $4, $5)';
      queryParams.push('FULLY_PAID', 'PARTIALLY_PAID', 'OVERPAID');
    } else if (reportType === 'aris_paid') {
      whereClause += ' AND ab.payment_source = $3';
      queryParams.push('ARIS');
    }
    
    const query = `
      SELECT 
        ap.payment_method,
        COUNT(*) as transaction_count,
        SUM(ap.amount) as total_amount,
        SUM(CASE WHEN ab.payment_source = 'PATIENT' THEN ap.amount ELSE 0 END) as patient_amount,
        SUM(CASE WHEN ab.payment_source = 'ARIS' THEN ap.amount ELSE 0 END) as aris_amount,
        SUM(CASE WHEN ab.payment_source = 'INSURANCE' THEN ap.amount ELSE 0 END) as insurance_amount,
        SUM(CASE WHEN ab.payment_source = 'CORPORATE' THEN ap.amount ELSE 0 END) as corporate_amount,
        AVG(ap.amount) as avg_transaction_amount,
        MAX(ap.amount) as max_transaction_amount,
        MIN(ap.amount) as min_transaction_amount
      FROM accounting_payments ap
      INNER JOIN accounting_bills ab ON ap.bill_id = ab.id
      ${whereClause}
      AND ap.active = true
      GROUP BY ap.payment_method
      ORDER BY total_amount DESC
    `;
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  }

  static async getGSTR1Report(startDate, endDate) {
    const query = `
      SELECT 
        ab.invoice_number,
        ab.bill_date as invoice_date,
        ab.customer_gstin,
        ab.customer_name,
        ab.customer_state,
        ab.place_of_supply,
        ab.reverse_charge,
        ab.invoice_type,
        ab.e_commerce_gstin,
        -- Taxable values
        SUM(CASE WHEN bi.gst_rate = 0 THEN bi.taxable_amount ELSE 0 END) as taxable_0_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.taxable_amount ELSE 0 END) as taxable_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.taxable_amount ELSE 0 END) as taxable_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.taxable_amount ELSE 0 END) as taxable_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.taxable_amount ELSE 0 END) as taxable_28_percent,
        -- Cess amounts
        SUM(CASE WHEN bi.cess_amount > 0 THEN bi.cess_amount ELSE 0 END) as cess_amount,
        -- Tax amounts
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.cgst_amount ELSE 0 END) as cgst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.sgst_amount ELSE 0 END) as sgst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.igst_amount ELSE 0 END) as igst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.cgst_amount ELSE 0 END) as cgst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.sgst_amount ELSE 0 END) as sgst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.igst_amount ELSE 0 END) as igst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.cgst_amount ELSE 0 END) as cgst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.sgst_amount ELSE 0 END) as sgst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.igst_amount ELSE 0 END) as igst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.cgst_amount ELSE 0 END) as cgst_28_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.sgst_amount ELSE 0 END) as sgst_28_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.igst_amount ELSE 0 END) as igst_28_percent,
        -- Total invoice value
        SUM(ab.total_amount) as total_invoice_value
      FROM accounting_bills ab
      LEFT JOIN accounting_bill_items bi ON ab.id = bi.bill_id AND bi.active = true
      WHERE ab.bill_date BETWEEN $1 AND $2
      AND ab.billing_status NOT IN ('DRAFT', 'VOIDED')
      AND ab.active = true
      GROUP BY 
        ab.id, ab.invoice_number, ab.bill_date, ab.customer_gstin, 
        ab.customer_name, ab.customer_state, ab.place_of_supply, 
        ab.reverse_charge, ab.invoice_type, ab.e_commerce_gstin
      ORDER BY ab.bill_date
    `;
    
    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  static async getGSTR3BReport(startDate, endDate) {
    const query = `
      SELECT 
        -- Outward supplies
        SUM(CASE WHEN bi.gst_rate = 0 THEN bi.taxable_amount ELSE 0 END) as outward_taxable_0_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.taxable_amount ELSE 0 END) as outward_taxable_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.taxable_amount ELSE 0 END) as outward_taxable_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.taxable_amount ELSE 0 END) as outward_taxable_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.taxable_amount ELSE 0 END) as outward_taxable_28_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.cgst_amount ELSE 0 END) as outward_cgst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.sgst_amount ELSE 0 END) as outward_sgst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.05 THEN bi.igst_amount ELSE 0 END) as outward_igst_5_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.cgst_amount ELSE 0 END) as outward_cgst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.sgst_amount ELSE 0 END) as outward_sgst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.12 THEN bi.igst_amount ELSE 0 END) as outward_igst_12_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.cgst_amount ELSE 0 END) as outward_cgst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.sgst_amount ELSE 0 END) as outward_sgst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.18 THEN bi.igst_amount ELSE 0 END) as outward_igst_18_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.cgst_amount ELSE 0 END) as outward_cgst_28_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.sgst_amount ELSE 0 END) as outward_sgst_28_percent,
        SUM(CASE WHEN bi.gst_rate = 0.28 THEN bi.igst_amount ELSE 0 END) as outward_igst_28_percent,
        -- Total tax
        SUM(bi.cgst_amount) as total_outward_cgst,
        SUM(bi.sgst_amount) as total_outward_sgst,
        SUM(bi.igst_amount) as total_outward_igst,
        SUM(bi.cess_amount) as total_outward_cess
      FROM accounting_bills ab
      LEFT JOIN accounting_bill_items bi ON ab.id = bi.bill_id AND bi.active = true
      WHERE ab.bill_date BETWEEN $1 AND $2
      AND ab.billing_status NOT IN ('DRAFT', 'VOIDED')
      AND ab.active = true
    `;
    
    const result = await pool.query(query, [startDate, endDate]);
    return result.rows[0];
  }
}

// Service Management Class
class ServiceManagement {
  static async addCDPrintingService(serviceData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Add CD printing service to study_master
      const insertServiceQuery = `
        INSERT INTO study_master (
          study_code, study_name, study_type, base_rate, gst_rate, 
          is_taxable, cess_rate, hsn_code, sac_code, category, 
          gst_applicable, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const serviceValues = [
        serviceData.study_code || 'CD_PRINT',
        serviceData.study_name || 'CD Printing',
        'SERVICE',
        serviceData.base_rate || 50.00,
        serviceData.gst_rate || 0.18,
        serviceData.is_taxable !== false,
        serviceData.cess_rate || 0,
        serviceData.hsn_code || '8523',
        serviceData.sac_code || '998313',
        serviceData.category || 'MEDIA',
        serviceData.gst_applicable !== false
      ];
      
      const serviceResult = await client.query(insertServiceQuery, serviceValues);
      
      // Add tax configuration
      const insertTaxQuery = `
        INSERT INTO tax_configuration (
          hsn_code, sac_code, gst_percentage, cess_percentage,
          is_reverse_charge_applicable, gst_type, description,
          effective_from, active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const taxValues = [
        serviceData.hsn_code || '8523',
        serviceData.sac_code || '998313',
        serviceData.gst_rate || 0.18,
        serviceData.cess_rate || 0,
        serviceData.is_reverse_charge_applicable || false,
        serviceData.gst_type || 'SERVICES',
        serviceData.description || 'CD/DVD Printing Services'
      ];
      
      const taxResult = await client.query(insertTaxQuery, taxValues);
      
      await client.query('COMMIT');
      
      return {
        service: serviceResult.rows[0],
        tax_config: taxResult.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateServiceGSTSettings(serviceCode, gstSettings) {
    return await GSTConfiguration.updateServiceGSTConfig(serviceCode, gstSettings);
  }

  static async getServiceListWithGST() {
    return await GSTConfiguration.getAllTaxableServices();
  }

  static async getServiceCategoriesWithGST() {
    return await GSTConfiguration.getGSTRatesByCategory();
  }
}

// API Routes

// Get all services with GST configuration
router.get('/services/gst-config', async (req, res) => {
  try {
    const services = await ServiceManagement.getServiceListWithGST();
    
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    logger.error('Error fetching services with GST config:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update service GST configuration
router.put('/services/:serviceCode/gst-config',
  [
    body('gst_rate').isDecimal({ min: 0, max: 0.28 }).withMessage('GST rate must be between 0 and 28%'),
    body('is_taxable').isBoolean().withMessage('Taxable status must be boolean'),
    body('cess_rate').optional().isDecimal({ min: 0 }).withMessage('CESS rate must be non-negative'),
    body('hsn_code').optional().trim().isLength({ min: 4, max: 8 }),
    body('sac_code').optional().trim().isLength({ min: 4, max: 8 }),
    body('gst_applicable').isBoolean().withMessage('GST applicable must be boolean'),
    body('is_reverse_charge_applicable').optional().isBoolean(),
    body('gst_type').optional().isIn(['GOODS', 'SERVICES']),
    body('description').optional().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { serviceCode } = req.params;
      const gstConfig = req.body;

      const result = await ServiceManagement.updateServiceGSTSettings(serviceCode, gstConfig);

      logger.info(`GST configuration updated for service ${serviceCode}`, {
        service_code: serviceCode,
        gst_rate: gstConfig.gst_rate,
        is_taxable: gstConfig.is_taxable
      });

      res.json({
        success: true,
        message: 'GST configuration updated successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error updating service GST configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Add CD printing service
router.post('/services/cd-printing',
  [
    body('study_code').optional().trim().isLength({ min: 2, max: 20 }),
    body('study_name').optional().trim().isLength({ min: 2, max: 100 }),
    body('base_rate').isDecimal({ min: 0 }).withMessage('Base rate must be non-negative'),
    body('gst_rate').optional().isDecimal({ min: 0, max: 0.28 }).withMessage('GST rate must be between 0 and 28%'),
    body('is_taxable').optional().isBoolean(),
    body('cess_rate').optional().isDecimal({ min: 0 }).withMessage('CESS rate must be non-negative'),
    body('hsn_code').optional().trim().isLength({ min: 4, max: 8 }),
    body('sac_code').optional().trim().isLength({ min: 4, max: 8 }),
    body('description').optional().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const serviceData = req.body;
      const result = await ServiceManagement.addCDPrintingService(serviceData);

      logger.info('CD printing service added', {
        service_code: result.service.study_code,
        base_rate: result.service.base_rate,
        gst_rate: result.service.gst_rate
      });

      res.json({
        success: true,
        message: 'CD printing service added successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error adding CD printing service:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// GST Reports

// Get GST report by date range
router.get('/reports/gst',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date'),
    body('report_type').optional().isIn(['all', 'paid', 'aris_paid'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { start_date, end_date, report_type = 'all' } = req.query;

      const reportData = await GSTReporting.getGSTReportByDateRange(start_date, end_date, report_type);
      const summaryData = await GSTReporting.getGSTSummaryByDateRange(start_date, end_date, report_type);

      res.json({
        success: true,
        data: {
          summary: summaryData,
          details: reportData
        }
      });
    } catch (error) {
      logger.error('Error generating GST report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get GST by service type
router.get('/reports/gst/by-service',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date'),
    body('report_type').optional().isIn(['all', 'paid', 'aris_paid'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { start_date, end_date, report_type = 'all' } = req.query;

      const serviceData = await GSTReporting.getGSTByServiceType(start_date, end_date, report_type);

      res.json({
        success: true,
        data: serviceData
      });
    } catch (error) {
      logger.error('Error generating GST by service report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get GST by payment method
router.get('/reports/gst/by-payment',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date'),
    body('report_type').optional().isIn(['all', 'paid', 'aris_paid'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { start_date, end_date, report_type = 'all' } = req.query;

      const paymentData = await GSTReporting.getGSTByPaymentMethod(start_date, end_date, report_type);

      res.json({
        success: true,
        data: paymentData
      });
    } catch (error) {
      logger.error('Error generating GST by payment report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// GSTR-1 Report
router.get('/reports/gstr1',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { start_date, end_date } = req.query;

      const gstr1Data = await GSTReporting.getGSTR1Report(start_date, end_date);

      res.json({
        success: true,
        data: gstr1Data
      });
    } catch (error) {
      logger.error('Error generating GSTR-1 report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// GSTR-3B Report
router.get('/reports/gstr3b',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { start_date, end_date } = req.query;

      const gstr3bData = await GSTReporting.getGSTR3BReport(start_date, end_date);

      res.json({
        success: true,
        data: gstr3bData
      });
    } catch (error) {
      logger.error('Error generating GSTR-3B report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get service categories with GST
router.get('/services/categories/gst', async (req, res) => {
  try {
    const categories = await ServiceManagement.getServiceCategoriesWithGST();

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching service categories with GST:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in GST management:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

module.exports = router;
