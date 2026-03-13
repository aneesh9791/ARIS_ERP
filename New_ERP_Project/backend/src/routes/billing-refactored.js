const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

// Configuration and Constants
const CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  DEFAULT_GST_RATE: 0.18,
  API_TIMEOUT: 15000,
  MAX_RETRY_ATTEMPTS: 3,
  LOG_FILE: 'logs/billing.log'
};

// Database connection pool
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: CONFIG.LOG_FILE }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Utility Functions
class BillingUtils {
  static generateInvoiceNumber(centerId, type = 'INV') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${type}-${centerId}-${year}${month}${day}-${random}`;
  }

  static generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createChecksum(data, timestamp) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data) + timestamp)
      .digest('hex');
  }

  static formatCurrency(amount) {
    return parseFloat(amount).toFixed(2);
  }

  static validateStudyCodes(studyCodes) {
    return Array.isArray(studyCodes) && studyCodes.length > 0;
  }
}

// Database Service Class
class BillingService {
  static async getPatient(patientId) {
    const query = `
      SELECT id, pid, name, phone, email, date_of_birth, gender, address,
             city, state, postal_code, id_proof_type, id_proof_number, id_proof_verified,
             blood_group, allergies, emergency_contact_name, emergency_contact_phone
      FROM patients 
      WHERE id = $1 AND active = true
    `;
    const result = await pool.query(query, [patientId]);
    
    if (result.rows.length === 0) {
      throw new Error('Patient not found');
    }
    
    return result.rows[0];
  }

  static async getStudyDetails(studyCodes) {
    if (!BillingUtils.validateStudyCodes(studyCodes)) {
      return [];
    }

    const query = `
      SELECT study_code, study_name, base_rate 
      FROM study_master 
      WHERE study_code = ANY($1)
    `;
    const result = await pool.query(query, [studyCodes]);
    return result.rows;
  }

  static async generateAccessionNumber() {
    const result = await pool.query('SELECT generate_accession_number()');
    return result.rows[0].generate_accession_number;
  }

  static async updateStudyAccession(studyId, accessionNumber) {
    if (!studyId) return;
    
    const query = `
      UPDATE studies 
      SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `;
    await pool.query(query, [accessionNumber, studyId]);
  }

  static async createBill(billData) {
    const query = `
      INSERT INTO patient_bills (
        bill_number, patient_id, study_id, total_amount, discount_amount, 
        gst_amount, net_amount, payment_status, payment_mode, center_id,
        gst_applicable, gst_rate, discount_reason, payment_details, notes,
        accession_number, accession_generated, accession_generated_at,
        api_sent, api_sent_at, api_response_code, api_success, api_error_message,
        api_retry_count, last_api_attempt, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, true
      ) RETURNING *
    `;

    const values = [
      billData.billNumber,
      billData.patientId,
      billData.studyId || null,
      billData.totalAmount,
      billData.discountAmount,
      billData.gstAmount,
      billData.netAmount,
      billData.paymentStatus,
      billData.paymentMode,
      billData.centerId,
      billData.gstApplicable,
      billData.gstRate,
      billData.discountReason,
      JSON.stringify(billData.paymentDetails),
      billData.notes,
      billData.accessionNumber,
      billData.accessionGenerated,
      billData.accessionGenerated ? new Date() : null,
      false, null, null, false, null, 0, null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updateBillApiStatus(billId, apiData) {
    const query = `
      UPDATE patient_bills 
      SET api_sent = $1, 
          api_sent_at = $2,
          api_response_code = $3,
          api_success = $4,
          api_error_message = $5,
          api_retry_count = $6,
          last_api_attempt = $7
      WHERE id = $8
    `;
    
    const values = [
      apiData.apiSent,
      apiData.apiSentAt,
      apiData.responseCode,
      apiData.success,
      apiData.errorMessage,
      apiData.retryCount,
      apiData.lastAttempt,
      billId
    ];

    await pool.query(query, values);
  }

  static async getPatientDemographics(patientId) {
    const query = `
      SELECT * FROM get_patient_demographics_with_accession($1, true)
    `;
    const result = await pool.query(query, [patientId]);
    return result.rows[0] || null;
  }

  static async getSystemConfig() {
    const query = `
      SELECT key, value 
      FROM system_config 
      WHERE key IN ('LOCAL_SYSTEM_API_ENDPOINT', 'LOCAL_SYSTEM_API_TOKEN', 'LOCAL_SYSTEM_API_KEY')
    `;
    const result = await pool.query(query);
    
    const config = {};
    result.rows.forEach(row => {
      config[row.key] = row.value;
    });

    return {
      endpoint: config.LOCAL_SYSTEM_API_ENDPOINT || process.env.LOCAL_SYSTEM_API_ENDPOINT || 'http://localhost:8080/api/patient-demographics',
      token: config.LOCAL_SYSTEM_API_TOKEN || process.env.LOCAL_SYSTEM_API_TOKEN,
      apiKey: config.LOCAL_SYSTEM_API_KEY || process.env.LOCAL_SYSTEM_API_KEY
    };
  }
}

// API Service Class
class ExternalAPIService {
  static async sendPatientDemographics(patientData, config) {
    const timestamp = new Date().toISOString();
    const requestId = BillingUtils.generateRequestId();
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ARIS-ERP/1.0',
      'X-Client-ID': 'aris-erp',
      'X-Request-ID': requestId,
      'X-Timestamp': timestamp
    };

    // Add authentication
    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    } else if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }

    const securePayload = {
      ...patientData,
      security: {
        source: 'ARIS-ERP',
        timestamp: timestamp,
        request_id: requestId,
        checksum: BillingUtils.createChecksum(patientData, timestamp)
      }
    };

    try {
      const response = await axios.post(config.endpoint, securePayload, {
        headers,
        timeout: CONFIG.API_TIMEOUT,
        validateStatus: (status) => status < 500
      });

      return {
        success: this.validateResponse(response),
        responseCode: response.status,
        message: this.getResponseMessage(response),
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        responseCode: error.response?.status || 500,
        message: error.message,
        error: error
      };
    }
  }

  static validateResponse(response) {
    if (response.status === 200) {
      const data = response.data;
      return data?.status === 'success' || data?.success === true;
    }
    return false;
  }

  static getResponseMessage(response) {
    if (response.status === 200) {
      return response.data?.message || 'Demographics sent successfully';
    } else if (response.status === 401) {
      return 'Authentication failed - Invalid token or API key';
    } else if (response.status === 403) {
      return 'Access forbidden - Insufficient permissions';
    } else if (response.status >= 400) {
      return `HTTP ${response.status}: ${response.data?.message || 'Unknown error'}`;
    }
    return 'Unknown error occurred';
  }
}

// Business Logic Class
class BillingBusinessLogic {
  static calculateBillAmounts(studyDetails, discountAmount = 0, gstApplicable = false, gstRate = CONFIG.DEFAULT_GST_RATE) {
    const totalAmount = studyDetails.reduce((sum, study) => sum + parseFloat(study.base_rate), 0);
    const discountedAmount = totalAmount - discountAmount;
    const gstAmount = gstApplicable ? discountedAmount * gstRate : 0;
    const netAmount = discountedAmount + gstAmount;

    return {
      totalAmount: BillingUtils.formatCurrency(totalAmount),
      discountedAmount: BillingUtils.formatCurrency(discountedAmount),
      gstAmount: BillingUtils.formatCurrency(gstAmount),
      netAmount: BillingUtils.formatCurrency(netAmount)
    };
  }

  static preparePatientData(patientDemo, accessionNumber, bill, studyDetails) {
    return {
      patient_id: patientDemo.patient_id,
      pid: patientDemo.pid,
      name: patientDemo.name,
      phone: patientDemo.phone,
      email: patientDemo.email,
      date_of_birth: patientDemo.date_of_birth,
      gender: patientDemo.gender,
      address: {
        street: patientDemo.address,
        city: patientDemo.city,
        state: patientDemo.state,
        postal_code: patientDemo.postal_code
      },
      id_proof: {
        type: patientDemo.id_proof_type,
        number: patientDemo.id_proof_number,
        verified: patientDemo.id_proof_verified
      },
      medical_info: {
        blood_group: patientDemo.blood_group,
        allergies: patientDemo.allergies,
        emergency_contact: {
          name: patientDemo.emergency_contact_name,
          phone: patientDemo.emergency_contact_phone
        }
      },
      center: {
        id: patientDemo.center_id,
        name: patientDemo.center_name
      },
      latest_accession_number: accessionNumber,
      studies: patientDemo.studies_with_accession,
      billing_info: {
        bill_id: bill.id,
        bill_number: bill.bill_number,
        total_amount: bill.total_amount,
        discount_amount: bill.discount_amount,
        gst_amount: bill.gst_amount,
        net_amount: bill.net_amount,
        payment_status: bill.payment_status,
        payment_mode: bill.payment_mode,
        accession_number: accessionNumber,
        study_details: studyDetails
      },
      timestamp: new Date().toISOString()
    };
  }

  static async processAPICall(billId, patientId, accessionNumber, studyDetails) {
    try {
      // Mark API attempt
      await BillingService.updateBillApiStatus(billId, {
        apiSent: true,
        apiSentAt: new Date(),
        responseCode: null,
        success: false,
        errorMessage: null,
        retryCount: 1,
        lastAttempt: new Date()
      });

      const patientDemo = await BillingService.getPatientDemographics(patientId);
      if (!patientDemo) {
        throw new Error('Patient demographics not found');
      }

      const bill = await pool.query('SELECT * FROM patient_bills WHERE id = $1', [billId]);
      const config = await BillingService.getSystemConfig();
      
      const patientData = this.preparePatientData(patientDemo, accessionNumber, bill.rows[0], studyDetails);
      const apiResult = await ExternalAPIService.sendPatientDemographics(patientData, config);

      // Update with result
      await BillingService.updateBillApiStatus(billId, {
        apiSent: true,
        apiSentAt: new Date(),
        responseCode: apiResult.responseCode,
        success: apiResult.success,
        errorMessage: apiResult.success ? null : apiResult.message,
        retryCount: 1,
        lastAttempt: new Date()
      });

      logger.info(`API call completed for patient ${patientDemo.pid}`, {
        patient_id: patientId,
        pid: patientDemo.pid,
        accession_number: accessionNumber,
        bill_id: billId,
        success: apiResult.success,
        response_code: apiResult.responseCode
      });

      return apiResult;
    } catch (error) {
      await BillingService.updateBillApiStatus(billId, {
        apiSent: true,
        apiSentAt: new Date(),
        responseCode: 500,
        success: false,
        errorMessage: error.message,
        retryCount: 1,
        lastAttempt: new Date()
      });

      logger.error('API call failed:', {
        bill_id: billId,
        patient_id: patientId,
        accession_number: accessionNumber,
        error: error.message
      });

      throw error;
    }
  }
}

// Input Validation Rules
const createBillValidation = [
  body('patient_id').trim().isLength({ min: 1, max: 50 }).withMessage('Patient ID is required'),
  body('center_id').isInt().withMessage('Center ID must be an integer'),
  body('study_codes').isArray().withMessage('Study codes must be an array'),
  body('payment_mode').isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE', 'COMBINED']).withMessage('Invalid payment mode'),
  body('gst_applicable').isBoolean().withMessage('GST applicable must be boolean'),
  body('gst_rate').optional().isDecimal({ min: 0, max: 0.18 }).withMessage('GST rate must be between 0 and 0.18'),
  body('discount_amount').optional().isDecimal({ min: 0 }).withMessage('Discount amount must be non-negative'),
  body('discount_reason').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Discount reason must be 2-100 characters'),
  body('payment_details').optional(),
  body('notes').optional().trim().isLength({ min: 2, max: 500 }).withMessage('Notes must be 2-500 characters'),
  body('payment_status').optional().isIn(['BILLED', 'PAID', 'CANCELLED', 'REFUNDED']).withMessage('Invalid payment status'),
  body('study_id').optional().isInt().withMessage('Study ID must be an integer')
];

const updatePaymentValidation = [
  body('payment_status').isIn(['BILLED', 'PAID', 'CANCELLED', 'REFUNDED']).withMessage('Invalid payment status'),
  body('payment_mode').optional().isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE']).withMessage('Invalid payment mode'),
  body('payment_amount').optional().isDecimal({ min: 0 }).withMessage('Payment amount must be non-negative'),
  body('payment_notes').optional().trim().isLength({ max: 500 }).withMessage('Payment notes must be max 500 characters')
];

// Error Handling Middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

const handleAsyncErrors = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Response Helper
const createSuccessResponse = (message, data = null, statusCode = 200) => ({
  success: true,
  message,
  data,
  timestamp: new Date().toISOString()
});

const createErrorResponse = (message, statusCode = 500) => ({
  success: false,
  message,
  timestamp: new Date().toISOString()
});

// Routes
router.post('/patient-bill', 
  createBillValidation,
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const {
      patient_id,
      center_id,
      study_codes,
      payment_mode,
      gst_applicable,
      gst_rate = CONFIG.DEFAULT_GST_RATE,
      discount_amount = 0,
      discount_reason,
      payment_details,
      notes,
      payment_status = 'BILLED',
      study_id
    } = req.body;

    // Get patient information
    const patient = await BillingService.getPatient(patient_id);
    
    // Get study details
    const studyDetails = await BillingService.getStudyDetails(study_codes);
    
    // Calculate amounts
    const amounts = BillingBusinessLogic.calculateBillAmounts(
      studyDetails, 
      discount_amount, 
      gst_applicable, 
      gst_rate
    );

    // Generate bill number
    const bill_number = BillingUtils.generateInvoiceNumber(center_id);

    // Handle accession number generation
    let accessionNumber = null;
    let accessionGenerated = false;

    if (payment_status === 'PAID') {
      accessionNumber = await BillingService.generateAccessionNumber();
      accessionGenerated = true;
      
      await BillingService.updateStudyAccession(study_id, accessionNumber);
      
      logger.info(`Accession number generated for paid bill: ${accessionNumber}`, {
        patient_id,
        pid: patient.pid,
        bill_amount: amounts.netAmount,
        study_id
      });
    }

    // Create bill record
    const billData = {
      billNumber: bill_number,
      patientId,
      studyId: study_id,
      totalAmount: amounts.totalAmount,
      discountAmount: amounts.discountAmount,
      gstAmount: amounts.gstAmount,
      netAmount: amounts.netAmount,
      paymentStatus: payment_status,
      paymentMode: payment_mode,
      centerId: center_id,
      gstApplicable: gst_applicable,
      gstRate: gst_rate,
      discountReason: discount_reason,
      paymentDetails: payment_details,
      notes: notes,
      accessionNumber,
      accessionGenerated
    };

    const bill = await BillingService.createBill(billData);

    // Trigger API call if accession number was generated
    if (accessionGenerated && accessionNumber) {
      setTimeout(async () => {
        try {
          await BillingBusinessLogic.processAPICall(
            bill.id, 
            patient_id, 
            accessionNumber, 
            studyDetails
          );
        } catch (error) {
          logger.error('Failed to process API call:', error);
        }
      }, 100);
    }

    logger.info(`Patient bill created: ${bill.id}`, {
      bill_id: bill.id,
      bill_number: bill.bill_number,
      patient_id,
      pid: patient.pid,
      accession_number: accessionNumber,
      payment_status,
      net_amount: amounts.netAmount
    });

    const responseData = {
      id: bill.id,
      bill_number: bill.bill_number,
      patient_id: bill.patient_id,
      patient_pid: patient.pid,
      study_id: bill.study_id,
      total_amount: bill.total_amount,
      discount_amount: bill.discount_amount,
      gst_amount: bill.gst_amount,
      net_amount: bill.net_amount,
      payment_status: bill.payment_status,
      payment_mode: bill.payment_mode,
      center_id: bill.center_id,
      accession_number: bill.accession_number,
      accession_generated: bill.accession_generated,
      api_sent: bill.api_sent,
      api_success: bill.api_success,
      api_response_code: bill.api_response_code,
      api_error_message: bill.api_error_message,
      api_retry_count: bill.api_retry_count,
      study_details: studyDetails.map(study => ({
        study_code: study.study_code,
        study_name: study.study_name,
        rate: study.base_rate
      })),
      created_at: bill.created_at
    };

    res.status(201).json(
      createSuccessResponse('Patient bill created successfully', responseData)
    );
  })
);

router.patch('/:id/payment',
  updatePaymentValidation,
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const { id } = req.params;
    const { payment_status, payment_mode, payment_amount, payment_notes } = req.body;

    // Get current bill details
    const currentBillQuery = `
      SELECT pb.*, p.pid 
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      WHERE pb.id = $1 AND pb.active = true
    `;
    const currentResult = await pool.query(currentBillQuery, [id]);

    if (currentResult.rows.length === 0) {
      return res.status(404).json(createErrorResponse('Bill not found'));
    }

    const currentBill = currentResult.rows[0];

    // Update payment status
    const updateQuery = `
      UPDATE patient_bills 
      SET payment_status = $1, 
          payment_mode = $2, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    await pool.query(updateQuery, [payment_status, payment_mode, id]);

    // Handle accession number generation for PAID status
    let accessionNumber = currentBill.accession_number;
    let accessionGenerated = currentBill.accession_generated;

    if (payment_status === 'PAID' && !currentBill.accession_generated) {
      accessionNumber = await BillingService.generateAccessionNumber();
      accessionGenerated = true;

      await BillingService.updateStudyAccession(currentBill.study_id, accessionNumber);

      logger.info(`Accession number generated on payment update: ${accessionNumber}`, {
        bill_id: id,
        study_id: currentBill.study_id,
        patient_id: currentBill.patient_id,
        pid: currentBill.pid
      });

      // Trigger API call
      setTimeout(async () => {
        try {
          const studyDetails = await BillingService.getStudyDetails([]);
          await BillingBusinessLogic.processAPICall(
            id,
            currentBill.patient_id,
            accessionNumber,
            studyDetails
          );
        } catch (error) {
          logger.error('Failed to process API call on payment update:', error);
        }
      }, 100);
    }

    res.json(
      createSuccessResponse('Payment status updated successfully', {
        bill_id: id,
        payment_status,
        accession_number: accessionNumber,
        accession_generated: accessionGenerated
      })
    );
  })
);

// Get bill by ID
router.get('/:id', handleAsyncErrors(async (req, res) => {
  const { id } = req.params;
  
  const query = `
    SELECT pb.*, p.pid as patient_pid, p.name as patient_name,
           c.name as center_name, sm.study_name
    FROM patient_bills pb
    LEFT JOIN patients p ON pb.patient_id = p.id
    LEFT JOIN centers c ON pb.center_id = c.id
    LEFT JOIN studies s ON pb.study_id = s.id
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    WHERE pb.id = $1 AND pb.active = true
  `;
  
  const result = await pool.query(query, [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json(createErrorResponse('Bill not found'));
  }
  
  res.json(createSuccessResponse('Bill retrieved successfully', result.rows[0]));
}));

// Get bills by accession number
router.get('/accession/:accessionNumber', handleAsyncErrors(async (req, res) => {
  const { accessionNumber } = req.params;
  
  const query = `
    SELECT pb.*, p.pid as patient_pid, p.name as patient_name,
           c.name as center_name
    FROM patient_bills pb
    LEFT JOIN patients p ON pb.patient_id = p.id
    LEFT JOIN centers c ON pb.center_id = c.id
    WHERE pb.accession_number = $1 AND pb.active = true
  `;
  
  const result = await pool.query(query, [accessionNumber]);
  
  if (result.rows.length === 0) {
    return res.status(404).json(createErrorResponse('Bill not found'));
  }
  
  res.json(createSuccessResponse('Bill retrieved successfully', result.rows[0]));
}));

// Global error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json(createErrorResponse('Internal server error'));
});

module.exports = router;
