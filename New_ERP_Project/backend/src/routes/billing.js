const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

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
router.post('/patient-bill', authorizePermission('BILLING_WRITE'), [
  body('patient_id').trim().isLength({ min: 1, max: 50 }),
  body('center_id').isInt(),
  body('study_codes').isArray(),
  body('payment_mode').isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE', 'COMBINED']),
  body('gst_applicable').isBoolean(),
  body('gst_rate').optional().isFloat({ min: 0, max: 0.18 }),
  body('discount_amount').optional().isFloat({ min: 0 }),
  body('discount_reason').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('payment_details').optional(),
  body('payment_reference').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
  body('notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }),
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
      payment_reference,
      notes,
      payment_status = 'BILLED',
      study_id,
      addon_contrast_lines = [],   // [{ id, name, price, qty }]
      addon_dicom = null,          // { id, name, price, qty }
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

    const contrastStudyDefinitionIds = [];  // track for auto-consumable issue
    if (study_codes && study_codes.length > 0) {
      for (const study_code of study_codes) {
        // Look up from study_definitions + center pricing first, fall back to study_master
        const { rows: defRows } = await pool.query(`
          SELECT sd.id AS study_definition_id, sd.study_code, sd.study_name, sd.modality,
                 sd.is_contrast_study,
                 COALESCE(scp.base_rate, 0) AS base_rate
          FROM study_definitions sd
          LEFT JOIN study_center_pricing scp ON scp.study_definition_id = sd.id AND scp.center_id = $2
          WHERE sd.study_code = $1 AND sd.active = true
          LIMIT 1
        `, [study_code, center_id]);

        const row = defRows[0];

        if (row) {
          total_amount += parseFloat(row.base_rate);
          study_details.push({ study_code: row.study_code, study_name: row.study_name, modality: row.modality, rate: row.base_rate, item_type: 'STUDY' });
          if (row.is_contrast_study && row.study_definition_id) {
            contrastStudyDefinitionIds.push(row.study_definition_id);
          }
        }
      }
    }

    // Add add-on line items
    const addonLines = [
      ...(addon_contrast_lines || []).map(a => ({ ...a, item_type: 'CONTRAST' })),
      ...(addon_dicom ? [{ ...addon_dicom, item_type: 'DICOM_CD' }] : []),
    ];
    for (const addon of addonLines) {
      const lineAmt = parseFloat(addon.price) * (addon.qty || 1);
      total_amount += lineAmt;
      study_details.push({ study_code: null, study_name: addon.name, modality: null, rate: lineAmt, qty: addon.qty || 1, item_type: addon.item_type });
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

    // Wrap accession generation + bill insert + bill items in a single transaction
    // so a mid-operation failure doesn't leave the study table with an orphaned accession.
    const cgst = gst_applicable ? (discounted_amount * 0.09) : 0;
    const sgst = gst_applicable ? (discounted_amount * 0.09) : 0;
    const total_gst_val = cgst + sgst;
    const final_total = discounted_amount + total_gst_val;

    const client = await pool.connect();
    let bill;
    try {
      await client.query('BEGIN');

      // Generate accession number if payment is PAID
      if (payment_status === 'PAID') {
        const accessionResult = await client.query('SELECT generate_accession_number()');
        accessionNumber = accessionResult.rows[0].generate_accession_number;
        accessionGenerated = true;

        // Update study with accession number if study_id is provided
        if (study_id) {
          await client.query(
            'UPDATE studies SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [accessionNumber, study_id]
          );
        }

        logger.info(`Accession number generated for paid bill: ${accessionNumber}`, {
          patient_id, pid: patient.pid, bill_amount: net_amount, study_id
        });
      }

      // Create bill record — columns match actual patient_bills table
      // GST is split 9% CGST + 9% SGST on the taxable (post-discount) amount
      const insertQuery = `
        INSERT INTO patient_bills (
          invoice_number, patient_id, study_id, center_id, bill_date,
          subtotal, discount_amount, discount_reason,
          taxable_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
          igst_rate, igst_amount, total_gst, total_amount,
          payment_mode, payment_status, gst_applicable,
          payment_details, payment_reference, notes,
          accession_number, accession_generated, accession_generated_at,
          api_sent, api_success, api_retry_count, active
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE,
          $5, $6, $7,
          $8, $9, $10, $11, $12,
          0, 0, $13, $14,
          $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23,
          false, false, 0, true
        ) RETURNING *
      `;

      const values = [
        bill_number, patient_id, study_id || null, center_id,
        discounted_amount, discount_amount, discount_reason || null,
        discounted_amount,
        gst_applicable ? 0.09 : 0, cgst,
        gst_applicable ? 0.09 : 0, sgst,
        total_gst_val, final_total,
        payment_mode, payment_status, gst_applicable,
        payment_details ? JSON.stringify(payment_details) : null,
        payment_reference || null, notes || null,
        accessionNumber, accessionGenerated,
        accessionGenerated ? new Date() : null,
      ];

      const result = await client.query(insertQuery, values);
      bill = result.rows[0];

      // Insert line items into bill_items
      if (study_details.length > 0) {
        for (const sd of study_details) {
          const qty = sd.qty || 1;
          const amount = parseFloat(sd.rate);
          await client.query(
            `INSERT INTO bill_items (bill_id, study_code, study_name, modality, rate, quantity, amount, item_type, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
            [bill.id, sd.study_code || null, sd.study_name, sd.modality || null,
             parseFloat(sd.rate) / qty, qty, amount, sd.item_type || 'STUDY']
          );
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
    client.release();

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
              bill_number: bill.invoice_number,
              total_amount: bill.total_amount,
              discount_amount: bill.discount_amount,
              gst_amount: bill.total_gst,
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
      bill_number: bill.invoice_number,
      patient_id,
      pid: patient.pid,
      accession_number: accessionNumber,
      payment_status,
      net_amount
    });

    // Auto-post finance JE when bill is created as PAID
    if (payment_status === 'PAID') {
      setImmediate(async () => {
        try {
          // One JE per bill — separate credit lines per service type
          await financeService.postBillingJEWithLines(
            bill,
            study_details,   // includes STUDY, CONTRAST, DICOM_CD item_type lines
            payment_mode,
            req.user?.id
          );
        } catch (jeErr) {
          logger.error('Finance JE failed for billing (create):', { bill_id: bill.id, error: jeErr.message });
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Patient bill created successfully',
      bill: {
        id: bill.id,
        bill_number: bill.invoice_number,
        invoice_number: bill.invoice_number,
        patient_id: bill.patient_id,
        patient_pid: patient.pid,
        study_id: bill.study_id,
        subtotal: bill.subtotal,
        discount_amount: bill.discount_amount,
        taxable_amount: bill.taxable_amount,
        gst_amount: bill.total_gst,
        total_gst: bill.total_gst,
        total_amount: bill.total_amount,
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
router.patch('/:id/payment', authorizePermission('BILLING_WRITE'), [
  body('payment_status').isIn(['BILLED', 'PAID', 'CANCELLED', 'REFUNDED']),
  body('payment_mode').optional().isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE', 'COMBINED']),
  body('payment_reference').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { payment_status, payment_mode, payment_reference } = req.body;

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

    // ── State machine: enforce valid transitions ───────────────────────────
    const VALID_TRANSITIONS = {
      BILLED:    ['PAID', 'CANCELLED'],
      PAID:      ['REFUNDED'],
      CANCELLED: [],  // terminal
      REFUNDED:  [],  // terminal
    };
    const from = currentBill.payment_status;
    const to   = payment_status;
    if (from !== to) {
      const allowed = VALID_TRANSITIONS[from] || [];
      if (!allowed.includes(to)) {
        return res.status(400).json({
          error: `Invalid status transition: ${from} → ${to}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`
        });
      }
    }

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
      SET payment_status = $1, payment_mode = $2, payment_reference = $3,
          accession_number = $4, accession_generated = $5, accession_generated_at = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7 AND active = true
      RETURNING *
    `;

    const values = [
      payment_status, payment_mode || currentBill.payment_mode, payment_reference || currentBill.payment_reference,
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

    // Auto-post finance JE when bill status changes to PAID
    if (payment_status === 'PAID' && currentBill.payment_status !== 'PAID') {
      setImmediate(async () => {
        try {
          await financeService.postBillingJE(
            { ...updatedBill, bill_number: updatedBill.bill_number || updatedBill.invoice_number },
            payment_mode || updatedBill.payment_mode,
            req.user?.id
          );
        } catch (jeErr) {
          logger.error('Finance JE failed for billing (payment):', { bill_id: id, error: jeErr.message });
        }
      });

      // Move study into reporting workflow queue
      if (currentBill.study_id) {
        pool.query(
          `UPDATE studies SET exam_workflow_status = 'EXAM_SCHEDULED', updated_at = NOW()
           WHERE id = $1 AND (exam_workflow_status IS NULL) AND active = true`,
          [currentBill.study_id]
        ).catch(e => logger.error('Failed to set exam_workflow_status:', e));
      }
    }

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

// Cancel or Refund a bill — clears ACC# (cancel only), writes audit trail, soft-deletes
router.post('/:id/void', authorizePermission('BILLING_REFUND'), [
  body('action').isIn(['CANCELLED', 'REFUNDED']),
  body('reason').trim().isLength({ min: 3, max: 200 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { action, reason } = req.body;
    const userId = req.user?.id || null;

    // Fetch current bill
    const { rows } = await pool.query(
      `SELECT pb.*, p.pid FROM patient_bills pb
       LEFT JOIN patients p ON p.id = pb.patient_id
       WHERE pb.id = $1 AND pb.active = true`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bill not found or already voided' });

    const bill = rows[0];

    // Prevent voiding an already voided bill
    if (['CANCELLED', 'REFUNDED'].includes(bill.payment_status)) {
      return res.status(400).json({ error: `Bill is already ${bill.payment_status.toLowerCase()}` });
    }

    // On CANCEL: clear accession number (study not done)
    // On REFUND: keep accession number (study was done, money returned)
    const clearAccession = action === 'CANCELLED';

    // Update the bill
    const updated = await pool.query(
      `UPDATE patient_bills
       SET payment_status    = $1,
           accession_number  = $2,
           accession_generated = $3,
           active            = false,
           updated_at        = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [action, clearAccession ? null : bill.accession_number,
       clearAccession ? false : bill.accession_generated, id]
    );

    // If accession was cleared, also clear it from studies table
    if (clearAccession && bill.accession_number && bill.study_id) {
      await pool.query(
        `UPDATE studies SET accession_number = NULL, accession_generated_at = NULL WHERE id = $1`,
        [bill.study_id]
      );
    }

    // Write audit trail
    await pool.query(
      `INSERT INTO bill_history (bill_id, action_type, action_details, user_id)
       VALUES ($1, $2, $3, $4)`,
      [id, action,
       JSON.stringify({
         reason,
         prev_status: bill.payment_status,
         accession_cleared: clearAccession,
         accession_number: bill.accession_number || null,
         invoice_number: bill.invoice_number,
         total_amount: bill.total_amount,
         pid: bill.pid,
       }),
       userId]
    );

    logger.info(`Bill ${action}: ${bill.invoice_number}`, {
      bill_id: id, action, reason,
      accession_cleared: clearAccession,
      accession_number: bill.accession_number,
      pid: bill.pid,
    });

    // Post reversal JE if the bill had been paid (GL entries exist)
    if (bill.payment_status === 'PAID') {
      setImmediate(async () => {
        try {
          // Find the original billing JE
          const { rows: jeRows } = await pool.query(
            `SELECT id FROM journal_entries
             WHERE source_module = 'BILLING' AND source_id = $1
               AND status = 'POSTED'
             ORDER BY created_at DESC LIMIT 1`,
            [id]
          );
          if (jeRows.length) {
            await financeService.postReversalJE(
              jeRows[0].id,
              `${action} — ${bill.invoice_number}: ${reason}`,
              userId
            );
          }
        } catch (jeErr) {
          logger.error('Reversal JE failed for void bill:', { bill_id: id, error: jeErr.message });
        }
      });
    }

    res.json({
      success: true,
      message: `Bill ${action.toLowerCase()} successfully`,
      bill: { ...updated.rows[0], patient_pid: bill.pid },
    });
  } catch (error) {
    logger.error('Bill void error:', error);
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
        pb.invoice_number ILIKE $${paramIndex} OR
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
        sd.study_name,
        c.name as center_name
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      LEFT JOIN studies s ON pb.study_id = s.id
      LEFT JOIN study_definitions sd ON s.study_code = sd.study_code
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

// Get bill items by bill id
router.get('/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT bi.*, pb.invoice_number, pb.patient_id, pb.payment_status, pb.payment_mode,
              pb.payment_reference, pb.subtotal, pb.discount_amount, pb.total_gst,
              pb.total_amount, pb.bill_date, pb.notes, pb.accession_number,
              p.name as patient_name, p.pid, p.phone, p.gender, p.date_of_birth,
              c.name as center_name
       FROM bill_items bi
       JOIN patient_bills pb ON pb.id = bi.bill_id
       JOIN patients p ON p.id = pb.patient_id
       LEFT JOIN centers c ON c.id = pb.center_id
       WHERE bi.bill_id = $1 AND bi.active = true`,
      [id]
    );
    res.json({ success: true, items: result.rows });
  } catch (error) {
    logger.error('Get bill items error:', error);
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
        sd.study_name,
        sd.modality,
        c.name as center_name
      FROM patient_bills pb
      LEFT JOIN patients p ON pb.patient_id = p.id
      LEFT JOIN studies s ON pb.study_id = s.id
      LEFT JOIN study_definitions sd ON s.study_code = sd.study_code
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

// ─── Quick Bill (simple form → patient_bills) ──────────────────────────────────
// Used by the Billing page quick-create modal.
// Requires patient_id (looked up from patient search), uses authenticated user's center.
router.post('/', authorizePermission('BILLING_WRITE'), [
  body('patient_id').isInt({ min: 1 }),
  body('amount').isFloat({ min: 0 }),
  body('service').optional().trim().isLength({ max: 200 }),
  body('payment_mode').optional().isIn(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'INSURANCE', 'COMBINED']),
  body('status').optional().isIn(['pending', 'paid', 'overdue', 'draft', 'BILLED', 'PAID']),
  body('notes').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { patient_id, service, amount, payment_mode, status, notes } = req.body;
    const centerId = req.user.center_id;
    if (!centerId) return res.status(400).json({ error: 'User has no center assigned. Contact admin.' });

    // Verify patient exists
    const { rows: patRows } = await pool.query(
      `SELECT id, name, pid FROM patients WHERE id = $1 AND active = true`, [patient_id]
    );
    if (!patRows.length) return res.status(404).json({ error: 'Patient not found' });
    const patient = patRows[0];

    const amt = parseFloat(amount) || 0;
    const payStatus = (status === 'paid' || status === 'PAID') ? 'PAID' : 'BILLED';
    const payMode = payment_mode || 'CASH';
    const billNumber = generateInvoiceNumber(centerId);

    const { rows } = await pool.query(
      `INSERT INTO patient_bills (
         invoice_number, patient_id, center_id, bill_date,
         subtotal, discount_amount, taxable_amount,
         cgst_rate, cgst_amount, sgst_rate, sgst_amount,
         igst_rate, igst_amount, total_gst, total_amount,
         payment_mode, payment_status, gst_applicable,
         notes, api_sent, api_success, api_retry_count, active
       ) VALUES (
         $1, $2, $3, CURRENT_DATE,
         $4, 0, $4,
         0, 0, 0, 0,
         0, 0, 0, $4,
         $5, $6, false,
         $7, false, false, 0, true
       ) RETURNING id, invoice_number, total_amount, payment_status, center_id`,
      [billNumber, patient_id, centerId, amt, payMode, payStatus, service ? (notes ? `${service} — ${notes}` : service) : (notes || null)]
    );

    const bill = rows[0];
    logger.info(`Quick bill created: ${bill.id}`, { bill_id: bill.id, patient_id, center_id: centerId });

    // Auto-post finance JE (same pattern as full bill)
    if (payStatus === 'PAID') {
      setImmediate(async () => {
        try {
          await financeService.postBillingJE(
            { ...bill, bill_number: bill.invoice_number },
            payMode,
            req.user?.id
          );
        } catch (jeErr) {
          logger.error('Finance JE failed for quick bill:', { bill_id: bill.id, error: jeErr.message });
        }
      });
    }

    res.status(201).json({
      success: true,
      bill: {
        id: bill.id,
        bill_number: bill.invoice_number,
        invoice_number: bill.invoice_number,
        patient_name: patient.name,
        patient_pid: patient.pid,
        patient_id: parseInt(patient_id, 10),
        service: service || '',
        amount: amt,
        status: bill.payment_status.toLowerCase(),
        center_id: bill.center_id,
        created_at: new Date().toISOString(),
      }
    });
  } catch (e) {
    logger.error('Quick bill create error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /study-addons?study_code=XXX ────────────────────────────────────────
// Returns contrast and DICOM add-on prices for a given study code.
router.get('/study-addons', authorizePermission('BILLING_VIEW'), async (req, res) => {
  try {
    const { study_code } = req.query;
    if (!study_code) {
      return res.status(400).json({ success: false, message: 'study_code is required' });
    }

    // 1. Get study info from study_definitions
    const studyResult = await pool.query(
      `SELECT study_code, modality, is_contrast_study AS is_contrast FROM study_definitions WHERE study_code = $1 AND active = true LIMIT 1`,
      [study_code]
    );
    if (studyResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Study not found' });
    }
    const study = studyResult.rows[0];

    // 2. If is_contrast, get matching contrast service
    let contrast = null;
    if (study.is_contrast && study.modality) {
      const contrastResult = await pool.query(
        `SELECT id, name, price, gst_rate, gst_applicable
         FROM services
         WHERE item_type = 'CONTRAST' AND modality = $1 AND is_active = true
         ORDER BY id
         LIMIT 1`,
        [study.modality]
      );
      if (contrastResult.rows.length > 0) {
        const r = contrastResult.rows[0];
        contrast = {
          id:              r.id,
          name:            r.name,
          price:           Number(r.price),
          gst_rate:        Number(r.gst_rate || 0),
          gst_applicable:  r.gst_applicable,
        };
      }
    }

    // 3. Get DICOM_CD service
    let dicom_cd = null;
    const dicomResult = await pool.query(
      `SELECT id, name, price, gst_rate, gst_applicable
       FROM services
       WHERE item_type = 'DICOM_CD' AND is_active = true
       ORDER BY id
       LIMIT 1`
    );
    if (dicomResult.rows.length > 0) {
      const r = dicomResult.rows[0];
      dicom_cd = {
        id:             r.id,
        name:           r.name,
        price:          Number(r.price),
        gst_rate:       Number(r.gst_rate || 0),
        gst_applicable: r.gst_applicable,
      };
    }

    res.json({
      study_code:   study.study_code,
      modality:     study.modality,
      is_contrast:  study.is_contrast,
      contrast,
      dicom_cd,
    });
  } catch (error) {
    logger.error('Error fetching study addons:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;