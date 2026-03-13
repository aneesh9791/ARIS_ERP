const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/billing.log' })
  ]
});

// BILLING MODULE - Indian Currency with GST and Accession Number Support

// Generate invoice/bill number
const generateInvoiceNumber = (centerId, type = 'INV') => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${type}-${centerId}-${year}${month}${day}-${random}`;
};

// Enhanced create patient bill/invoice with accession number support
router.post('/patient-bill', [
  body('patient_id').trim().isLength({ min: 1, max: 50 }),
  body('center_id').isInt(),
  body('study_codes').isArray(),
  body('payment_mode').isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE', 'COMBINED']),
  body('gst_applicable').isBoolean(),
  body('gst_rate').optional().isDecimal({ min: 0, max: 0.18 }),
  body('discount_amount').optional().isDecimal({ min: 0 }),
  body('discount_reason').optional().trim().isLength({ min: 2, max: 100 }),
  body('payment_details').optional(),
  body('notes').optional().trim().isLength({ min: 2, max: 500 }),
  body('payment_status').optional().isIn(['BILLED', 'PAID', 'CANCELLED', 'REFUNDED']),
  body('study_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      patient_id,
      center_id,
      study_codes,
      payment_mode,
      gst_applicable,
      gst_rate = 0.18,
      discount_amount = 0,
      discount_reason,
      payment_details,
      notes,
      payment_status = 'BILLED', // Default to BILLED
      study_id
    } = req.body;

    // Get patient information including PID
    const patientQuery = `
      SELECT id, pid, name, phone FROM patients WHERE id = $1 AND active = true
    `;
    const patientResult = await pool.query(patientQuery, [patient_id]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    // Calculate bill amounts
    let total_amount = 0;
    let study_details = [];

    if (study_codes && study_codes.length > 0) {
      for (const study_code of study_codes) {
        const studyMasterQuery = `
          SELECT study_code, study_name, base_rate FROM study_master WHERE study_code = $1
        `;
        const studyMasterResult = await pool.query(studyMasterQuery, [study_code]);
        
        if (studyMasterResult.rows.length > 0) {
          const study_master = studyMasterResult.rows[0];
          total_amount += parseFloat(study_master.base_rate);
          study_details.push({
            study_code: study_master.study_code,
            study_name: study_master.study_name,
            rate: study_master.base_rate
          });
        }
      }
    }

    // Apply discount
    const discounted_amount = total_amount - discount_amount;

    // Calculate GST
    const gst_amount = gst_applicable ? discounted_amount * gst_rate : 0;

    // Calculate net amount
    const net_amount = discounted_amount + gst_amount;

    // Generate bill number
    const bill_number = generateInvoiceNumber(center_id);

    let accessionNumber = null;
    let accessionGenerated = false;

    // Generate accession number if payment is PAID
    if (payment_status === 'PAID') {
      const accessionResult = await pool.query('SELECT generate_accession_number()');
      accessionNumber = accessionResult.rows[0].generate_accession_number;
      accessionGenerated = true;

      // Update study with accession number if study_id is provided
      if (study_id) {
        await pool.query(
          'UPDATE studies SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [accessionNumber, study_id]
        );
      }

      logger.info(`Accession number generated for paid bill: ${accessionNumber}`, {
        patient_id,
        pid: patient.pid,
        bill_amount: net_amount,
        study_id
      });
    }

    // Create bill record with API tracking fields
    const insertQuery = `
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
      bill_number, patient_id, study_id || null, total_amount, discount_amount,
      gst_amount, net_amount, payment_status, payment_mode, center_id,
      gst_applicable, gst_rate, discount_reason, 
      JSON.stringify(payment_details), notes,
      accessionNumber, accessionGenerated, 
      accessionGenerated ? new Date() : null,
      false, null, null, false, null, 0, null
    ];

    const result = await pool.query(insertQuery, values);
    const bill = result.rows[0];

    // If accession number was generated, send demographics to local system
    if (accessionGenerated && accessionNumber) {
      try {
        // Get patient demographics with studies
        const demographicsQuery = `
          SELECT * FROM get_patient_demographics_with_accession($1, true)
        `;
        const patientDemoResult = await pool.query(demographicsQuery, [patient_id]);

        if (patientDemoResult.rows.length > 0) {
          const patientDemo = patientDemoResult.rows[0];

          // Prepare data for local system
          const patientData = {
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
              study_details: study_details
            },
            timestamp: new Date().toISOString()
          };

          // Get API endpoint and authentication from config
          const configQuery = `
            SELECT value FROM system_config WHERE key IN ('LOCAL_SYSTEM_API_ENDPOINT', 'LOCAL_SYSTEM_API_TOKEN', 'LOCAL_SYSTEM_API_KEY')
          `;
          const configResult = await pool.query(configQuery);
          
          const targetEndpoint = configResult.rows.find(r => r.key === 'LOCAL_SYSTEM_API_ENDPOINT')?.value || process.env.LOCAL_SYSTEM_API_ENDPOINT || 'http://localhost:8080/api/patient-demographics';
          const apiToken = configResult.rows.find(r => r.key === 'LOCAL_SYSTEM_API_TOKEN')?.value || process.env.LOCAL_SYSTEM_API_TOKEN;
          const apiKey = configResult.rows.find(r => r.key === 'LOCAL_SYSTEM_API_KEY')?.value || process.env.LOCAL_SYSTEM_API_KEY;

          // Prepare secure headers
          const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'ARIS-ERP/1.0',
            'X-Client-ID': 'aris-erp',
            'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };

          // Add authentication based on available credentials
          if (apiToken) {
            headers['Authorization'] = `Bearer ${apiToken}`;
          } else if (apiKey) {
            headers['X-API-Key'] = apiKey;
          }

          // Add request timestamp for security
          const timestamp = new Date().toISOString();
          headers['X-Timestamp'] = timestamp;

          // Create payload with security metadata
          const securePayload = {
            ...patientData,
            security: {
              source: 'ARIS-ERP',
              timestamp: timestamp,
              request_id: headers['X-Request-ID'],
              checksum: require('crypto').createHash('sha256').update(JSON.stringify(patientData) + timestamp).digest('hex')
            }
          };

          // Update bill with API attempt tracking
          await pool.query(`
            UPDATE patient_bills 
            SET api_sent = true, 
                api_sent_at = CURRENT_TIMESTAMP,
                api_retry_count = api_retry_count + 1,
                last_api_attempt = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [bill.id]);

          // Send to local system
          setTimeout(async () => {
            try {
              const axios = require('axios');
              const response = await axios.post(targetEndpoint, securePayload, {
                headers: headers,
                timeout: 15000,
                validateStatus: (status) => status < 500 // Don't throw for 4xx errors
              });

              // Check response for security validation
              let apiSuccess = true;
              let apiMessage = 'Demographics sent successfully to local system';
              let apiResponseCode = response.status;
              
              if (response.status === 200 && response.data) {
                if (response.data.status !== 'success' && response.data.success !== true) {
                  apiSuccess = false;
                  apiMessage = response.data.message || 'Local system rejected the data';
                }
              } else if (response.status === 401) {
                apiSuccess = false;
                apiMessage = 'Authentication failed - Invalid token or API key';
              } else if (response.status === 403) {
                apiSuccess = false;
                apiMessage = 'Access forbidden - Insufficient permissions';
              } else if (response.status >= 400) {
                apiSuccess = false;
                apiMessage = `HTTP ${response.status}: ${response.data?.message || 'Unknown error'}`;
              }

              // Update bill with API result
              await pool.query(`
                UPDATE patient_bills 
                SET api_response_code = $1, 
                    api_success = $2, 
                    api_error_message = $3,
                    api_sent_at = CURRENT_TIMESTAMP
                WHERE id = $4
              `, [apiResponseCode, apiSuccess, apiSuccess ? null : apiMessage, bill.id]);

              logger.info(`Demographics sent to local system for patient ${patientDemo.pid}`, {
                patient_id: patientDemo.patient_id,
                pid: patientDemo.pid,
                accession_number: accessionNumber,
                endpoint: targetEndpoint,
                bill_id: bill.id,
                response_code: apiResponseCode,
                success: apiSuccess,
                message: apiMessage
              });

            } catch (apiError) {
              // Update bill with API error
              await pool.query(`
                UPDATE patient_bills 
                SET api_response_code = $1, 
                    api_success = $2, 
                    api_error_message = $3,
                    api_sent_at = CURRENT_TIMESTAMP
                WHERE id = $4
              `, [apiError.response?.status || 500, false, apiError.message, bill.id]);

              logger.error('Failed to send demographics to local system:', {
                patient_id: patientDemo.patient_id,
                pid: patientDemo.pid,
                accession_number: accessionNumber,
                endpoint: targetEndpoint,
                bill_id: bill.id,
                error: apiError.message,
                error_code: apiError.code || 'UNKNOWN'
              });
            }
          }, 100);
        }
      } catch (demographicsError) {
        logger.error('Error preparing demographics for local system:', {
          patient_id,
          accession_number: accessionNumber,
          bill_id: bill.id,
          error: demographicsError.message
        });
      }
    }

    logger.info(`Patient bill created: ${bill.id}`, {
      bill_id: bill.id,
      bill_number: bill.bill_number,
      patient_id,
      pid: patient.pid,
      accession_number: accessionNumber,
      payment_status,
      net_amount
    });

    res.status(201).json({
      success: true,
      message: 'Patient bill created successfully',
      bill: {
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
        study_details: study_details,
        created_at: bill.created_at
      }
    });
  } catch (error) {
    logger.error('Create patient bill error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bill payment status with accession number generation
router.patch('/:id/payment', [
  body('payment_status').isIn(['BILLED', 'PAID', 'CANCELLED', 'REFUNDED']),
  body('payment_mode').optional().isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE']),
  body('payment_amount').optional().isDecimal({ min: 0 }),
  body('payment_notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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
      return res.status(404).json({ error: 'Bill not found' });
    }

    const currentBill = currentResult.rows[0];

    // Check if payment status is changing to PAID and accession number not yet generated
    let accessionNumber = currentBill.accession_number;
    let accessionGenerated = currentBill.accession_generated;

    if (payment_status === 'PAID' && !currentBill.accession_generated) {
      const accessionResult = await pool.query('SELECT generate_accession_number()');
      accessionNumber = accessionResult.rows[0].generate_accession_number;
      accessionGenerated = true;

      // Update study with accession number if study_id exists
      if (currentBill.study_id) {
        await pool.query(
          'UPDATE studies SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [accessionNumber, currentBill.study_id]
        );
      }

      logger.info(`Accession number generated on payment update: ${accessionNumber}`, {
        bill_id: id,
        study_id: currentBill.study_id,
        patient_id: currentBill.patient_id,
        pid: currentBill.pid
      });

      // Trigger API call for new accession number
      setTimeout(async () => {
        try {
          // Get patient demographics
          const demographicsQuery = `
            SELECT * FROM get_patient_demographics_with_accession($1, true)
          `;
          const patientDemoResult = await pool.query(demographicsQuery, [currentBill.patient_id]);

          if (patientDemoResult.rows.length > 0) {
            const patientDemo = patientDemoResult.rows[0];

            // Prepare data for local system
            const patientData = {
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
                bill_id: currentBill.id,
                bill_number: currentBill.bill_number,
                total_amount: currentBill.total_amount,
                discount_amount: currentBill.discount_amount,
                gst_amount: currentBill.gst_amount,
                net_amount: currentBill.net_amount,
                payment_status: payment_status,
                payment_mode: payment_mode,
                accession_number: accessionNumber
              },
              timestamp: new Date().toISOString()
            };

            // Get API endpoint
            const configQuery = `
              SELECT value FROM system_config WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT'
            `;
            const configResult = await pool.query(configQuery);
            const targetEndpoint = configResult.rows[0]?.value || process.env.LOCAL_SYSTEM_API_ENDPOINT || 'http://localhost:8080/api/patient-demographics';

            // Update bill with API attempt tracking
            await pool.query(`
              UPDATE patient_bills 
              SET api_sent = true, 
                  api_sent_at = CURRENT_TIMESTAMP,
                  api_retry_count = api_retry_count + 1,
                  last_api_attempt = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [id]);

            // Send to local system
            const axios = require('axios');
            const response = await axios.post(targetEndpoint, patientData, {
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.LOCAL_SYSTEM_API_KEY || 'default-key'
              },
              timeout: 15000
            });

            // Update bill with API result
            await pool.query(`
              UPDATE patient_bills 
              SET api_response_code = $1, 
                  api_success = $2, 
                  api_error_message = $3,
                  api_sent_at = CURRENT_TIMESTAMP
              WHERE id = $4
            `, [response.status, response.status === 200, null, id]);

            logger.info(`Demographics sent to local system for patient ${patientDemo.pid}`, {
              patient_id: patientDemo.patient_id,
              pid: patientDemo.pid,
              accession_number: accessionNumber,
              endpoint: targetEndpoint,
              bill_id: id,
              response_code: response.status
            });

          }
        } catch (apiError) {
          // Update bill with API error
          await pool.query(`
            UPDATE patient_bills 
            SET api_response_code = $1, 
                api_success = $2, 
                api_error_message = $3,
                api_sent_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [apiError.response?.status || 500, false, apiError.message, id]);

          logger.error('Failed to send demographics to local system:', {
            bill_id: id,
            patient_id: currentBill.patient_id,
            accession_number: accessionNumber,
            error: apiError.message
          });
        }
      }, 100);
    }

    // Update bill
    const updateQuery = `
      UPDATE patient_bills 
      SET payment_status = $1, payment_mode = $2, payment_amount = $3, payment_notes = $4,
          accession_number = $5, accession_generated = $6, accession_generated_at = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND active = true
      RETURNING *
    `;

    const values = [
      payment_status, payment_mode, payment_amount, payment_notes,
      accessionNumber, accessionGenerated, 
      accessionGenerated ? new Date() : currentBill.accession_generated_at,
      id
    ];

    const result = await pool.query(updateQuery, values);
    const updatedBill = result.rows[0];

    logger.info(`Bill payment updated: ${id}`, {
      bill_id: id,
      old_status: currentBill.payment_status,
      new_status: payment_status,
      accession_number: accessionNumber,
      accession_generated: accessionGenerated,
      pid: currentBill.pid
    });

    res.json({
      success: true,
      message: 'Bill payment updated successfully',
      bill: {
        id: updatedBill.id,
        bill_number: updatedBill.bill_number,
        payment_status: updatedBill.payment_status,
        payment_mode: updatedBill.payment_mode,
        payment_amount: updatedBill.payment_amount,
        payment_notes: updatedBill.payment_notes,
        accession_number: updatedBill.accession_number,
        accession_generated: updatedBill.accession_generated,
        accession_generated_at: updatedBill.accession_generated_at,
        api_sent: updatedBill.api_sent,
        api_success: updatedBill.api_success,
        api_response_code: updatedBill.api_response_code,
        api_error_message: updatedBill.api_error_message,
        api_retry_count: updatedBill.api_retry_count,
        updated_at: updatedBill.updated_at
      }
    });
  } catch (error) {
    logger.error('Update bill payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bills with accession numbers and PID support
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      payment_status, 
      center_id,
      accession_number,
      patient_pid,
      start_date,
      end_date 
    } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = ['pb.active = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        pb.bill_number ILIKE $${paramIndex} OR 
        p.name ILIKE $${paramIndex} OR 
        p.phone ILIKE $${paramIndex} OR 
        p.pid ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (payment_status) {
      whereConditions.push(`pb.payment_status = $${paramIndex}`);
      queryParams.push(payment_status);
      paramIndex++;
    }

    if (center_id) {
      whereConditions.push(`pb.center_id = $${paramIndex}`);
      queryParams.push(center_id);
      paramIndex++;
    }

    if (accession_number) {
      whereConditions.push(`pb.accession_number ILIKE $${paramIndex}`);
      queryParams.push(`%${accession_number}%`);
      paramIndex++;
    }

    if (patient_pid) {
      whereConditions.push(`p.pid ILIKE $${paramIndex}`);
      queryParams.push(`%${patient_pid}%`);
      paramIndex++;
    }

    if (start_date) {
      whereConditions.push(`pb.created_at >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`pb.created_at <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const query = `
      SELECT 
        pb.*,
        p.pid as patient_pid,
        p.name as patient_name,
        p.phone as patient_phone,
        s.study_code,
        s.accession_number as study_accession_number,
        sm.study_name,
        c.name as center_name
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      LEFT JOIN studies s ON pb.study_id = s.id
      LEFT JOIN study_master sm ON s.study_code = sm.study_code
      LEFT JOIN centers c ON pb.center_id = c.id
      WHERE ${whereClause}
      ORDER BY pb.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const result = await pool.query(query, queryParams);

    const bills = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      bills,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get bills error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bill by accession number
router.get('/accession/:accession_number', async (req, res) => {
  try {
    const { accession_number } = req.params;

    const query = `
      SELECT 
        pb.*,
        p.pid as patient_pid,
        p.name as patient_name,
        p.phone as patient_phone,
        p.email as patient_email,
        p.date_of_birth,
        p.gender,
        p.address,
        p.city,
        p.state,
        p.postal_code,
        s.study_code,
        s.accession_number as study_accession_number,
        s.scheduled_date,
        s.completion_date,
        sm.study_name,
        sm.modality,
        c.name as center_name
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      LEFT JOIN studies s ON pb.study_id = s.id
      LEFT JOIN study_master sm ON s.study_code = sm.study_code
      LEFT JOIN centers c ON pb.center_id = c.id
      WHERE pb.accession_number = $1 AND pb.active = true
    `;

    const result = await pool.query(query, [accession_number]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({
      success: true,
      bill: result.rows[0]
    });
  } catch (error) {
    logger.error('Get bill by accession number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;