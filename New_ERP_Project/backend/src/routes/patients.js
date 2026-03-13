const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const { createSecureClient } = require('../middleware/secureAPI');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/patients.log' })
  ]
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/patients/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image files and PDFs are allowed'), false);
    }
  }
});

// Get ID proof types
router.get('/id-proof-types', async (req, res) => {
  try {
    const query = `
      SELECT type_code, type_name, description, is_active
      FROM id_proof_types 
      WHERE is_active = true 
      ORDER BY type_name
    `;
    const result = await pool.query(query);
    
    res.json({
      success: true,
      id_proof_types: result.rows
    });
  } catch (error) {
    logger.error('Get ID proof types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced patient search with ID proof support
router.get('/search', async (req, res) => {
  try {
    const { 
      search_term, 
      center_id, 
      limit = 10,
      id_proof_type 
    } = req.query;

    let query = `
      SELECT p.*, c.name as center_name,
             COUNT(ps.study_id) as total_studies,
             MAX(s.created_at) as last_study_date
      FROM patients p
      LEFT JOIN centers c ON p.center_id = c.id
      LEFT JOIN patient_studies ps ON p.id = ps.patient_id
      LEFT JOIN studies s ON ps.study_id = s.id AND s.active = true
      WHERE p.active = true
    `;

    let queryParams = [];
    let paramIndex = 1;

    if (center_id) {
      query += ` AND p.center_id = $${paramIndex}`;
      queryParams.push(center_id);
      paramIndex++;
    }

    if (id_proof_type) {
      query += ` AND p.id_proof_type = $${paramIndex}`;
      queryParams.push(id_proof_type);
      paramIndex++;
    }

    if (search_term) {
      query += ` AND (
        p.name ILIKE $${paramIndex} OR 
        p.phone ILIKE $${paramIndex} OR 
        p.email ILIKE $${paramIndex} OR 
        p.id_proof_number ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search_term}%`);
      paramIndex++;
    }

    query += `
      GROUP BY p.id, p.name, p.phone, p.email, p.id_proof_type, p.id_proof_number, 
               p.id_proof_verified, p.center_id, c.name
      ORDER BY 
        CASE 
          WHEN p.name ILIKE $${paramIndex} THEN 1
          WHEN p.phone ILIKE $${paramIndex} THEN 2
          ELSE 3
        END,
        p.name
      LIMIT $${paramIndex + 1}
    `;
    queryParams.push(limit);

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      patients: result.rows
    });
  } catch (error) {
    logger.error('Enhanced patient search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient with PID and accession numbers
router.get('/:id/demographics', async (req, res) => {
  try {
    const { id } = req.params;
    const { include_studies = true } = req.query;
    
    const query = `
      SELECT * FROM get_patient_demographics_with_accession($1, $2)
    `;
    const result = await pool.query(query, [id, include_studies]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = result.rows[0];
    
    res.json({
      success: true,
      patient: {
        patient_id: patient.patient_id,
        pid: patient.pid,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        address: patient.address,
        city: patient.city,
        state: patient.state,
        postal_code: patient.postal_code,
        id_proof_type: patient.id_proof_type,
        id_proof_number: patient.id_proof_number,
        id_proof_verified: patient.id_proof_verified,
        blood_group: patient.blood_group,
        allergies: patient.allergies,
        emergency_contact_name: patient.emergency_contact_name,
        emergency_contact_phone: patient.emergency_contact_phone,
        center_id: patient.center_id,
        center_name: patient.center_name,
        total_studies: patient.total_studies,
        last_study_date: patient.last_study_date,
        studies_with_accession: patient.studies_with_accession,
        latest_accession_number: patient.latest_accession_number
      }
    });
  } catch (error) {
    logger.error('Get patient demographics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search patients by PID
router.post('/search-by-pid', [
  body('pid').trim().isLength({ min: 1, max: 20 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { pid } = req.body;

    const query = `
      SELECT * FROM search_patients_by_pid($1)
    `;
    const result = await pool.query(query, [pid]);

    res.json({
      success: true,
      patients: result.rows
    });
  } catch (error) {
    logger.error('Search patients by PID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send demographics to local system
router.post('/:id/send-to-local-system', async (req, res) => {
  try {
    const { id } = req.params;
    const { api_endpoint } = req.body;

    // Get patient demographics
    const demographicsQuery = `
      SELECT * FROM get_patient_demographics_with_accession($1, true)
    `;
    const patientResult = await pool.query(demographicsQuery, [id]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    // Prepare data for local system
    const patientData = {
      patient_id: patient.patient_id,
      pid: patient.pid,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      date_of_birth: patient.date_of_birth,
      gender: patient.gender,
      address: {
        street: patient.address,
        city: patient.city,
        state: patient.state,
        postal_code: patient.postal_code
      },
      id_proof: {
        type: patient.id_proof_type,
        number: patient.id_proof_number,
        verified: patient.id_proof_verified
      },
      medical_info: {
        blood_group: patient.blood_group,
        allergies: patient.allergies,
        emergency_contact: {
          name: patient.emergency_contact_name,
          phone: patient.emergency_contact_phone
        }
      },
      center: {
        id: patient.center_id,
        name: patient.center_name
      },
      latest_accession_number: patient.latest_accession_number,
      studies: patient.studies_with_accession,
      timestamp: new Date().toISOString()
    };

    // Get API endpoint from config
    const configQuery = `
      SELECT value FROM system_config WHERE key = 'LOCAL_SYSTEM_API_ENDPOINT'
    `;
    const configResult = await pool.query(configQuery);
    const targetEndpoint = configResult.rows[0]?.value || process.env.LOCAL_SYSTEM_API_ENDPOINT || 'http://localhost:8080/api/patient-demographics';

    // Create secure API client
    const apiClient = await createSecureClient(pool);

    // Send to local system
    const result = await apiClient.makeRequest(targetEndpoint, patientData);

    // Log the API call
    await pool.query(`
      INSERT INTO api_call_logs (
        patient_id, pid, endpoint, request_data, response_code, success, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      patient.patient_id,
      patient.pid,
      targetEndpoint,
      JSON.stringify(patientData),
      result.status,
      result.success,
      result.success ? null : result.message
    ]);

    logger.info(`Demographics sent to local system for patient ${patient.pid}`, {
      patient_id: patient.patient_id,
      pid: patient.pid,
      endpoint: targetEndpoint,
      response_code: result.status,
      success: result.success,
      message: result.message,
      attempts: result.attempt || result.attempts
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Demographics sent successfully to local system',
        patient_data: patientData,
        api_endpoint: targetEndpoint,
        response_code: result.status,
        attempt: result.attempt
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        api_endpoint: targetEndpoint,
        response_code: result.status,
        error: result.error,
        attempts: result.attempts || result.attempt
      });
    }

    // Log the attempt
    const logQuery = `
      INSERT INTO api_call_logs (
        patient_id, pid, endpoint, request_data, response_code, 
        success, error_message, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
    `;
    await pool.query(logQuery, [
      patient.patient_id,
      patient.pid,
      targetEndpoint,
      JSON.stringify(patientData),
      responseCode,
      success,
      success ? null : responseMessage
    ]);

    res.json({
      success,
      message: responseMessage,
      patient_data: patientData,
      api_endpoint: targetEndpoint,
      response_code: responseCode
    });
    
  } catch (error) {
    logger.error('Send demographics to local system error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate PID manually (if needed)
router.post('/:id/generate-pid', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if patient already has PID
    const checkQuery = `
      SELECT pid FROM patients WHERE id = $1 AND active = true
    `;
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    if (checkResult.rows[0].pid) {
      return res.status(400).json({ 
        error: 'Patient already has PID',
        pid: checkResult.rows[0].pid
      });
    }
    
    // Generate PID
    const updateQuery = `
      UPDATE patients 
      SET pid = generate_pid(), pid_generated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND active = true
      RETURNING pid, pid_generated_at
    `;
    
    const result = await pool.query(updateQuery, [id]);
    
    logger.info(`PID generated manually for patient ${id}: ${result.rows[0].pid}`);
    
    res.json({
      success: true,
      message: 'PID generated successfully',
      patient: {
        id: parseInt(id),
        pid: result.rows[0].pid,
        pid_generated_at: result.rows[0].pid_generated_at
      }
    });
    
  } catch (error) {
    logger.error('Generate PID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get PID and accession statistics
router.get('/stats/pid-accession', async (req, res) => {
  try {
    const query = `SELECT * FROM pid_accession_stats`;
    const result = await pool.query(query);

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    logger.error('Get PID accession stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced quick search to include PID
router.get('/quick-search', async (req, res) => {
  try {
    const { 
      search_term, 
      center_id, 
      limit = 10
    } = req.query;

    const query = `
      SELECT * FROM patient_quick_search($1, $2, $3)
    `;
    const result = await pool.query(query, [search_term, center_id || null, limit]);

    res.json({
      success: true,
      patients: result.rows
    });
  } catch (error) {
    logger.error('Quick patient search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient with all studies
router.get('/:id/with-studies', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT * FROM get_patient_with_studies($1)
    `;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({
      success: true,
      patient: result.rows[0]
    });
  } catch (error) {
    logger.error('Get patient with studies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced create patient with ID proof
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('gender').isIn(['MALE', 'FEMALE', 'OTHER']),
  body('date_of_birth').isISO8601().toDate(),
  body('address').trim().isLength({ min: 5, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 6, max: 10 }),
  body('has_insurance').isBoolean(),
  body('insurance_provider_id').optional().isInt(),
  body('policy_number').optional().trim().isLength({ max: 50 }),
  body('insured_name').optional().trim().isLength({ max: 100 }),
  body('relationship').optional().trim().isLength({ max: 50 }),
  body('referring_physician_code').optional().trim().isLength({ max: 20 }),
  body('center_id').isInt(),
  // ID proof fields
  body('id_proof_type').optional().trim().isLength({ max: 50 }),
  body('id_proof_number').optional().trim().isLength({ max: 100 }),
  body('id_proof_issued_date').optional().isISO8601().toDate(),
  body('id_proof_expiry_date').optional().isISO8601().toDate(),
  // Emergency contact
  body('emergency_contact_name').optional().trim().isLength({ max: 100 }),
  body('emergency_contact_phone').optional().trim().isLength({ max: 20 }),
  body('emergency_contact_relation').optional().trim().isLength({ max: 50 }),
  body('emergency_contact_email').optional().isEmail().normalizeEmail(),
  // Medical information
  body('blood_group').optional().trim().isLength({ max: 10 }),
  body('allergies').optional().trim().isLength({ max: 500 }),
  body('chronic_diseases').optional().trim().isLength({ max: 500 }),
  body('current_medications').optional().trim().isLength({ max: 500 }),
  body('previous_surgeries').optional().trim().isLength({ max: 500 }),
  // Consent fields
  body('consent_for_treatment').optional().isBoolean(),
  body('consent_for_data_sharing').optional().isBoolean(),
  body('privacy_preferences').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, phone, gender, date_of_birth, address, city, state, postal_code,
      has_insurance, insurance_provider_id, policy_number, insured_name, relationship,
      referring_physician_code, center_id,
      // ID proof
      id_proof_type, id_proof_number, id_proof_issued_date, id_proof_expiry_date,
      // Emergency contact
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_contact_email,
      // Medical information
      blood_group, allergies, chronic_diseases, current_medications, previous_surgeries,
      // Consent
      consent_for_treatment, consent_for_data_sharing, privacy_preferences
    } = req.body;

    // Validate ID proof format if provided
    if (id_proof_type && id_proof_number) {
      const validationQuery = `
        SELECT * FROM validate_id_proof_format($1, $2)
      `;
      const validationResult = await pool.query(validationQuery, [id_proof_type, id_proof_number]);
      
      if (!validationResult.rows[0].is_valid) {
        return res.status(400).json({ 
          error: 'Invalid ID proof format',
          details: validationResult.rows[0].error_message
        });
      }
    }

    // Check for duplicate ID proof
    if (id_proof_type && id_proof_number) {
      const duplicateQuery = `
        SELECT id FROM patients 
        WHERE id_proof_type = $1 AND id_proof_number = $2 AND active = true
      `;
      const duplicateResult = await pool.query(duplicateQuery, [id_proof_type, id_proof_number]);
      
      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({ 
          error: 'Patient with this ID proof already exists',
          existing_patient_id: duplicateResult.rows[0].id
        });
      }
    }

    const query = `
      INSERT INTO patients (
        name, email, phone, gender, date_of_birth, address, city, state, postal_code,
        has_insurance, insurance_provider_id, policy_number, insured_name, relationship,
        referring_physician_code, center_id,
        id_proof_type, id_proof_number, id_proof_issued_date, id_proof_expiry_date, id_proof_verified,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_contact_email,
        blood_group, allergies, chronic_diseases, current_medications, previous_surgeries,
        consent_for_treatment, consent_for_data_sharing, privacy_preferences,
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16,
        $17, $18, $19, $20, false,
        $21, $22, $23, $24,
        $25, $26, $27, $28,
        $29, $30, $31,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
      ) RETURNING *
    `;

    const values = [
      name, email, phone, gender, date_of_birth, address, city, state, postal_code,
      has_insurance, insurance_provider_id, policy_number, insured_name, relationship,
      referring_physician_code, center_id,
      id_proof_type, id_proof_number, id_proof_issued_date, id_proof_expiry_date,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_contact_email,
      blood_group, allergies, chronic_diseases, current_medications, previous_surgeries,
      consent_for_treatment, consent_for_data_sharing, privacy_preferences || '{}'
    ];

    const result = await pool.query(query, values);
    const patient = result.rows[0];

    logger.info(`Patient created: ${patient.id} - ${patient.name}`);

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      patient
    });
  } catch (error) {
    logger.error('Create patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload patient photo
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const query = `
      UPDATE patients 
      SET photo_path = $1, photo_uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND active = true
      RETURNING id, name, photo_path, photo_uploaded_at
    `;

    const result = await pool.query(query, [req.file.path, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    logger.info(`Patient photo uploaded: ${id} - ${req.file.filename}`);

    res.json({
      success: true,
      message: 'Photo uploaded successfully',
      patient: result.rows[0]
    });
  } catch (error) {
    logger.error('Upload patient photo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload ID proof document
router.post('/:id/id-proof-document', upload.single('document'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No ID proof document provided' });
    }

    const query = `
      UPDATE patients 
      SET id_proof_document_path = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND active = true
      RETURNING id, name, id_proof_type, id_proof_number, id_proof_document_path
    `;

    const result = await pool.query(query, [req.file.path, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    logger.info(`ID proof document uploaded: ${id} - ${req.file.filename}`);

    res.json({
      success: true,
      message: 'ID proof document uploaded successfully',
      patient: result.rows[0]
    });
  } catch (error) {
    logger.error('Upload ID proof document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify ID proof
router.post('/:id/verify-id-proof', async (req, res) => {
  try {
    const { id } = req.params;
    const { verified_by, verification_notes } = req.body;

    const query = `
      UPDATE patients 
      SET id_proof_verified = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND active = true
      RETURNING id, name, id_proof_type, id_proof_number, id_proof_verified
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    logger.info(`ID proof verified: ${id} by ${verified_by}`);

    res.json({
      success: true,
      message: 'ID proof verified successfully',
      patient: result.rows[0]
    });
  } catch (error) {
    logger.error('Verify ID proof error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add study to existing patient
router.post('/:id/studies', [
  body('study_code').trim().isLength({ min: 1, max: 20 }),
  body('center_id').isInt(),
  body('priority').optional().isIn(['ROUTINE', 'URGENT', 'STAT']),
  body('scheduled_date').isISO8601().toDate(),
  body('scheduled_time').trim().isLength({ min: 1, max: 10 }),
  body('radiologist_code').optional().trim().isLength({ max: 20 }),
  body('notes').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      study_code, center_id, priority = 'ROUTINE', scheduled_date, 
      scheduled_time, radiologist_code, notes
    } = req.body;

    // Check if patient exists
    const patientQuery = `
      SELECT id, name, center_id FROM patients 
      WHERE id = $1 AND active = true
    `;
    const patientResult = await pool.query(patientQuery, [id]);

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];

    // Generate unique study ID
    const study_id = `STY${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create study
    const studyQuery = `
      INSERT INTO studies (
        study_id, patient_id, study_code, center_id, priority,
        scheduled_date, scheduled_time, radiologist_code, notes,
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
      ) RETURNING *
    `;

    const studyValues = [
      study_id, id, study_code, center_id, priority,
      scheduled_date, scheduled_time, radiologist_code, notes
    ];

    const studyResult = await pool.query(studyQuery, studyValues);
    const study = studyResult.rows[0];

    // Link patient and study
    const linkQuery = `
      INSERT INTO patient_studies (patient_id, study_id, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (patient_id, study_id) DO NOTHING
    `;
    await pool.query(linkQuery, [id, study.id]);

    logger.info(`Study created for patient ${id}: ${study_id}`);

    res.status(201).json({
      success: true,
      message: 'Study created successfully',
      study,
      patient
    });
  } catch (error) {
    logger.error('Add study to patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient statistics with ID proof verification
router.get('/stats/id-proof', async (req, res) => {
  try {
    const query = `SELECT * FROM patient_id_proof_stats`;
    const result = await pool.query(query);

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    logger.error('Get patient ID proof stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search patients by ID proof
router.post('/search-by-id-proof', [
  body('id_proof_type').trim().isLength({ min: 1, max: 50 }),
  body('id_proof_number').trim().isLength({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id_proof_type, id_proof_number } = req.body;

    const query = `
      SELECT * FROM search_patients_by_id_proof($1, $2)
    `;
    const result = await pool.query(query, [id_proof_type, id_proof_number]);

    res.json({
      success: true,
      patients: result.rows
    });
  } catch (error) {
    logger.error('Search patients by ID proof error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all patients (original endpoint)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT COUNT(*) FROM patients';
    let countResult = await pool.query(query);

    query = `
      SELECT p.*, c.name as center_name 
      FROM patients p 
      LEFT JOIN centers c ON p.center_id = c.id 
      WHERE p.active = true
    `;

    let queryParams = [];

    if (search) {
      query += ` AND (p.name ILIKE $1 OR p.email ILIKE $1 OR p.phone ILIKE $1 OR p.id_proof_number ILIKE $1)`;
      queryParams.push(`%${search}%`);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    const patients = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      patients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single patient
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT p.*, c.name as center_name 
      FROM patients p 
      LEFT JOIN centers c ON p.center_id = c.id 
      WHERE p.id = $1 AND p.active = true
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Get patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new patient
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('date_of_birth').isISO8601().toDate(),
  body('gender').isIn(['male', 'female', 'other']),
  body('address').trim().isLength({ min: 5, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 3, max: 20 }),
  body('country').trim().isLength({ min: 2, max: 100 }),
  body('emergency_contact').trim().isLength({ min: 10, max: 100 }),
  body('medical_history').optional(),
  body('allergies').optional(),
  body('center_id').isInt(),
  body('insurance_provider').optional(),
  body('policy_number').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      email,
      phone,
      date_of_birth,
      gender,
      address,
      city,
      state,
      postal_code,
      country,
      emergency_contact,
      medical_history,
      allergies,
      center_id,
      insurance_provider,
      policy_number
    } = req.body;

    // Generate patient ID
    const patientId = 'PAT' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO patients (
        id, name, email, phone, date_of_birth, gender, address, city, 
        state, postal_code, country, emergency_contact, medical_history, 
        allergies, center_id, insurance_provider, policy_number, 
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      patientId, name, email, phone, date_of_birth, gender, address, city,
      state, postal_code, country, emergency_contact, medical_history,
      allergies, center_id, insurance_provider, policy_number
    ]);

    logger.info(`Patient created: ${name} (${patientId})`);

    res.status(201).json({
      message: 'Patient created successfully',
      patient: {
        id: patientId,
        name,
        email,
        phone,
        date_of_birth,
        gender,
        address,
        city,
        state,
        postal_code,
        country,
        emergency_contact,
        medical_history,
        allergies,
        center_id,
        insurance_provider,
        policy_number
      }
    });

  } catch (error) {
    logger.error('Create patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient
router.put('/:id', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('date_of_birth').isISO8601().toDate(),
  body('gender').isIn(['male', 'female', 'other']),
  body('address').trim().isLength({ min: 5, max: 500 }),
  body('city').trim().isLength({ min: 2, max: 100 }),
  body('state').trim().isLength({ min: 2, max: 100 }),
  body('postal_code').trim().isLength({ min: 3, max: 20 }),
  body('country').trim().isLength({ min: 2, max: 100 }),
  body('emergency_contact').trim().isLength({ min: 10, max: 100 }),
  body('medical_history').optional(),
  body('allergies').optional(),
  body('center_id').isInt(),
  body('insurance_provider').optional(),
  body('policy_number').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name,
      email,
      phone,
      date_of_birth,
      gender,
      address,
      city,
      state,
      postal_code,
      country,
      emergency_contact,
      medical_history,
      allergies,
      center_id,
      insurance_provider,
      policy_number
    } = req.body;

    const query = `
      UPDATE patients SET 
        name = $2, email = $3, phone = $4, date_of_birth = $5, 
        gender = $6, address = $7, city = $8, state = $9, 
        postal_code = $10, country = $11, emergency_contact = $12, 
        medical_history = $13, allergies = $14, center_id = $15, 
        insurance_provider = $16, policy_number = $17, updated_at = NOW() 
      WHERE id = $1 AND active = true
    `;

    await pool.query(query, [
      name, email, phone, date_of_birth, gender, address, city,
      state, postal_code, country, emergency_contact, medical_history,
      allergies, center_id, insurance_provider, policy_number, id
    ]);

    logger.info(`Patient updated: ${name} (${id})`);

    res.json({
      message: 'Patient updated successfully',
      patient: {
        id,
        name,
        email,
        phone,
        date_of_birth,
        gender,
        address,
        city,
        state,
        postal_code,
        country,
        emergency_contact,
        medical_history,
        allergies,
        center_id,
        insurance_provider,
        policy_number
      }
    });

  } catch (error) {
    logger.error('Update patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patient (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'UPDATE patients SET active = false, updated_at = NOW() WHERE id = $1';
    await pool.query(query, [id]);

    logger.info(`Patient deleted: ${id}`);

    res.json({ message: 'Patient deleted successfully' });

  } catch (error) {
    logger.error('Delete patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient appointments
router.get('/:id/appointments', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT a.*, p.name as patient_name 
      FROM appointments a 
      LEFT JOIN patients p ON a.patient_id = p.id 
      WHERE a.patient_id = $1 AND a.active = true
      ORDER BY a.appointment_date DESC
    `;
    
    const result = await pool.query(query, [id]);
    
    res.json(result.rows);

  } catch (error) {
    logger.error('Get appointments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create appointment
router.post('/:id/appointments', [
  body('appointment_date').isISO8601().toDate(),
  body('appointment_time').isLength({ min: 5, max: 5 }),
  body('doctor_name').trim().isLength({ min: 2, max: 100 }),
  body('purpose').trim().isLength({ min: 5, max: 500 }),
  body('notes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      appointment_date,
      appointment_time,
      doctor_name,
      purpose,
      notes
    } = req.body;

    const appointmentId = 'APT' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO appointments (
        id, patient_id, appointment_date, appointment_time, doctor_name, 
        purpose, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      appointmentId, id, appointment_date, appointment_time, doctor_name, purpose, notes
    ]);

    logger.info(`Appointment created: ${appointmentId} for patient ${id}`);

    res.status(201).json({
      message: 'Appointment created successfully',
      appointment: {
        id: appointmentId,
        patient_id: id,
        appointment_date,
        appointment_time,
        doctor_name,
        purpose,
        notes
      }
    });

  } catch (error) {
    logger.error('Create appointment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
