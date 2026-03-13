const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/local-api.log' })
  ]
});

// Enhanced CORS for local API
router.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// Rate limiting for local API
const localApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

router.use(localApiLimiter);

// API Key middleware for local API security
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.LOCAL_API_KEY || 'local-api-key-2024';
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ 
      error: 'Invalid API key',
      message: 'Please provide a valid API key in X-API-Key header'
    });
  }
  
  next();
};

// Get patient information by patient ID
router.get('/patient/:patient_id', validateApiKey, async (req, res) => {
  try {
    const { patient_id } = req.params;
    const { include_studies = false, include_images = false } = req.query;
    
    // Get comprehensive patient information
    const patientQuery = `
      SELECT 
        p.id,
        p.name,
        p.dob,
        p.gender,
        p.phone,
        p.email,
        p.address,
        p.city,
        p.state,
        p.postal_code,
        p.country,
        p.emergency_contact,
        p.allergies,
        p.medical_history,
        p.insurance_provider,
        p.policy_number,
        p.center_id,
        c.name as center_name,
        c.address as center_address,
        c.phone as center_phone,
        c.ae_title as center_ae_title,
        p.created_at,
        p.updated_at,
        p.active
      FROM patients p
      LEFT JOIN centers c ON p.center_id = c.id
      WHERE p.id = $1 AND p.active = true
    `;
    
    const patientResult = await pool.query(patientQuery, [patient_id]);
    
    if (patientResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Patient not found',
        patient_id 
      });
    }

    let patientData = patientResult.rows[0];

    // Include recent studies if requested
    if (include_studies === 'true') {
      const studiesQuery = `
        SELECT 
          s.id,
          s.accession_number,
          s.study_instance_uid,
          s.requested_procedure,
          s.actual_procedure,
          s.scanner_type,
          s.status,
          s.appointment_date,
          s.appointment_time,
          s.start_time,
          s.end_time,
          s.duration,
          s.findings,
          s.images_count,
          s.dicom_images_path,
          s.referring_physician,
          s.requesting_physician,
          s.created_at
        FROM studies s
        WHERE s.patient_id = $1 AND s.active = true
        ORDER BY s.appointment_date DESC
        LIMIT 10
      `;
      
      const studiesResult = await pool.query(studiesQuery, [patient_id]);
      patientData.recent_studies = studiesResult.rows;
    }

    // Include image paths if requested
    if (include_images === 'true') {
      const imagesQuery = `
        SELECT 
          s.id as study_id,
          s.dicom_images_path,
          s.images_count,
          s.status
        FROM studies s
        WHERE s.patient_id = $1 AND s.active = true AND s.dicom_images_path IS NOT NULL
        ORDER BY s.appointment_date DESC
        LIMIT 5
      `;
      
      const imagesResult = await pool.query(imagesQuery, [patient_id]);
      patientData.image_studies = imagesResult.rows;
    }

    // Calculate patient age
    const age = patientData.dob ? 
      new Date().getFullYear() - new Date(patientData.dob).getFullYear() : null;

    res.json({
      success: true,
      patient: {
        ...patientData,
        age
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get patient info error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get referring physician information
router.get('/referring-physician/:physician_name', validateApiKey, async (req, res) => {
  try {
    const { physician_name } = req.params;
    const { center_id } = req.query;
    
    let centerFilter = center_id ? `AND s.center_id = ${center_id}` : '';
    
    // Search for referring physician by name
    const physicianQuery = `
      SELECT DISTINCT
        s.referring_physician,
        COUNT(*) as referral_count,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
        COUNT(CASE WHEN s.appointment_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recent_referrals,
        STRING_AGG(DISTINCT p.name) as patient_names,
        STRING_AGG(DISTINCT s.requested_procedure) as procedures_ordered
      FROM studies s
      LEFT JOIN patients p ON s.patient_id = p.id
      WHERE s.referring_physician ILIKE $1 
        AND s.active = true 
        ${centerFilter}
      GROUP BY s.referring_physician
      ORDER BY referral_count DESC
      LIMIT 20
    `;
    
    const physicianResult = await pool.query(physicianQuery, [`%${physician_name}%`]);
    
    if (physicianResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Referring physician not found',
        physician_name 
      });
    }

    res.json({
      success: true,
      physicians: physicianResult.rows,
      search_term: physician_name,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get referring physician error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get center information
router.get('/center/:center_id', validateApiKey, async (req, res) => {
  try {
    const { center_id } = req.params;
    
    const centerQuery = `
      SELECT 
        c.id,
        c.name,
        c.code,
        c.address,
        c.city,
        c.state,
        c.postal_code,
        c.country,
        c.phone,
        c.email,
        c.manager_name,
        c.manager_email,
        c.manager_phone,
        c.operating_hours,
        c.emergency_contact,
        c.capacity_daily,
        c.specialties,
        c.insurance_providers,
        c.ae_title,
        c.timezone,
        COUNT(DISTINCT s.referring_physician) as referring_physicians_count,
        COUNT(DISTINCT p.id) as total_patients,
        COUNT(DISTINCT CASE WHEN p.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN p.id END) as new_patients_30d
      FROM centers c
      LEFT JOIN patients p ON c.id = p.center_id AND p.active = true
      LEFT JOIN studies s ON c.id = s.center_id AND s.active = true
      WHERE c.id = $1 AND c.active = true
      GROUP BY c.id, c.name, c.code, c.address, c.city, c.state, c.postal_code, c.country, c.phone, c.email, c.manager_name, c.manager_email, c.manager_phone, c.operating_hours, c.emergency_contact, c.capacity_daily, c.specialties, c.insurance_providers, c.ae_title, c.timezone
    `;
    
    const centerResult = await pool.query(centerQuery, [center_id]);
    
    if (centerResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Center not found',
        center_id 
      });
    }

    res.json({
      success: true,
      center: centerResult.rows[0],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get center info error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get all centers (for dropdown)
router.get('/centers', validateApiKey, async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    
    let activeFilter = active_only === 'true' ? 'AND c.active = true' : '';
    
    const centersQuery = `
      SELECT 
        c.id,
        c.name,
        c.code,
        c.city,
        c.state,
        c.ae_title
      FROM centers c
      WHERE 1=1 ${activeFilter}
      ORDER BY c.name
    `;
    
    const centersResult = await pool.query(centersQuery);
    
    res.json({
      success: true,
      centers: centersResult.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get centers error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Search patients by demographics
router.post('/search/patients', validateApiKey, [
  body('search_term').trim().isLength({ min: 2, max: 100 }),
  body('search_type').isIn(['name', 'phone', 'email', 'patient_id']),
  body('center_id').optional().isInt(),
  body('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { search_term, search_type, center_id, limit = 20 } = req.body;
    
    let whereClause = '';
    let queryParams = [search_term];
    
    switch (search_type) {
      case 'name':
        whereClause = 'AND p.name ILIKE $1';
        break;
      case 'phone':
        whereClause = 'AND p.phone ILIKE $1';
        break;
      case 'email':
        whereClause = 'AND p.email ILIKE $1';
        break;
      case 'patient_id':
        whereClause = 'AND p.id = $1';
        break;
      default:
        whereClause = 'AND (p.name ILIKE $1 OR p.phone ILIKE $1 OR p.email ILIKE $1)';
        break;
    }
    
    let centerFilter = center_id ? `AND p.center_id = ${center_id}` : '';
    
    const searchQuery = `
      SELECT 
        p.id,
        p.name,
        p.dob,
        p.gender,
        p.phone,
        p.email,
        p.center_id,
        c.name as center_name,
        p.created_at
      FROM patients p
      LEFT JOIN centers c ON p.center_id = c.id
      WHERE p.active = true 
        ${whereClause} 
        ${centerFilter}
      ORDER BY p.name
      LIMIT $${queryParams.length + 1}
    `;
    
    const searchResult = await pool.query(searchQuery, queryParams);
    
    res.json({
      success: true,
      patients: searchResult.rows,
      search_term,
      search_type,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Search patients error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get study details for local PACS
router.get('/study/:study_id', validateApiKey, async (req, res) => {
  try {
    const { study_id } = req.params;
    
    const studyQuery = `
      SELECT 
        s.*,
        p.name as patient_name,
        p.dob as patient_dob,
        p.gender as patient_gender,
        p.phone as patient_phone,
        p.email as patient_email,
        p.address as patient_address,
        c.name as center_name,
        c.ae_title as center_ae_title,
        r.name as radiologist_name,
        ref.name as referring_physician_name
      FROM studies s
      LEFT JOIN patients p ON s.patient_id = p.id
      LEFT JOIN centers c ON s.center_id = c.id
      LEFT JOIN users r ON s.radiologist_id = r.id
      LEFT JOIN users ref ON s.referring_physician_id = ref.id
      WHERE s.id = $1 AND s.active = true
    `;
    
    const studyResult = await pool.query(studyQuery, [study_id]);
    
    if (studyResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Study not found',
        study_id 
      });
    }

    const study = studyResult.rows[0];
    
    // Get DICOM images if available
    let images = [];
    if (study.dicom_images_path) {
      try {
        const fs = require('fs');
        const path = require('path');
        
        if (fs.existsSync(study.dicom_images_path)) {
          const files = fs.readdirSync(study.dicom_images_path);
          images = files.filter(file => 
            file.toLowerCase().endsWith('.dcm') || 
            file.toLowerCase().endsWith('.dicom')
          ).map(file => ({
            filename: file,
            path: path.join(study.dicom_images_path, file),
            size: fs.statSync(path.join(study.dicom_images_path, file)).size
          }));
        }
      } catch (fsError) {
        logger.error('File system error:', fsError);
      }
    }

    res.json({
      success: true,
      study: {
        ...study,
        images
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get study details error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Local API for PACS/RIS Integration',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

module.exports = router;
