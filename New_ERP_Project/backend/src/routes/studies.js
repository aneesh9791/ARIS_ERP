const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('STUDY_VIEW'));

// Get study by accession number
router.get('/accession/:accession_number', async (req, res) => {
  try {
    const { accession_number } = req.params;
    
    const query = `
      SELECT * FROM get_study_by_accession_number($1)
    `;
    const result = await pool.query(query, [accession_number]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = result.rows[0];
    
    res.json({
      success: true,
      study: {
        study_id: study.study_id,
        accession_number: study.accession_number,
        patient_id: study.patient_id,
        patient_pid: study.patient_pid,
        patient_name: study.patient_name,
        patient_phone: study.patient_phone,
        study_code: study.study_code,
        study_name: study.study_name,
        modality: study.modality,
        status: study.status,
        scheduled_date: study.scheduled_date,
        scheduled_time: study.scheduled_time,
        completion_date: study.completion_date,
        report_date: study.report_date,
        radiologist_name: study.radiologist_name,
        center_name: study.center_name,
        bill_id: study.bill_id,
        bill_amount: study.bill_amount,
        payment_status: study.payment_status,
        created_at: study.created_at
      }
    });
  } catch (error) {
    logger.error('Get study by accession number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate accession number manually
router.post('/:id/generate-accession', authorizePermission('STUDY_WRITE'), [
  body('reason').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { reason } = req.body;

    // Check if study exists
    const checkQuery = `
      SELECT id, accession_number, patient_id FROM studies 
      WHERE id = $1 AND active = true
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = checkResult.rows[0];

    if (study.accession_number) {
      return res.status(400).json({ 
        error: 'Study already has accession number',
        accession_number: study.accession_number
      });
    }

    // Generate accession number
    const accessionNumber = await pool.query('SELECT generate_accession_number()');
    const accessionNum = accessionNumber.rows[0].generate_accession_number;

    // Update study
    const updateQuery = `
      UPDATE studies 
      SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND active = true
      RETURNING accession_number, accession_generated_at
    `;
    
    const result = await pool.query(updateQuery, [accessionNum, id]);

    // Log the manual generation
    logger.info(`Accession number generated manually for study ${id}: ${accessionNum}`, {
      study_id: id,
      accession_number: accessionNum,
      patient_id: study.patient_id,
      reason: reason || 'Manual generation'
    });

    res.json({
      success: true,
      message: 'Accession number generated successfully',
      study: {
        id: parseInt(id),
        accession_number: result.rows[0].accession_number,
        accession_generated_at: result.rows[0].accession_generated_at
      }
    });
    
  } catch (error) {
    logger.error('Generate accession number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update study to include accession number in response
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        s.*, 
        p.pid as patient_pid,
        p.name as patient_name,
        p.phone as patient_phone,
        sd.study_name,
        sd.modality,
        rm.radiologist_name,
        c.name as center_name,
        pb.id as bill_id,
        pb.total_amount as bill_amount,
        pb.payment_status,
        pb.accession_number as bill_accession_number
      FROM studies s
      LEFT JOIN patients p ON s.patient_id = p.id
      LEFT JOIN study_definitions sd ON s.study_code = sd.study_code
      LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
      LEFT JOIN centers c ON s.center_id = c.id
      LEFT JOIN patient_bills pb ON s.id = pb.study_id
      WHERE s.id = $1 AND s.active = true

    `;
    
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const study = result.rows[0];

    res.json({
      success: true,
      study: {
        id: study.id,
        study_id: study.study_id,
        accession_number: study.accession_number,
        patient_id: study.patient_id,
        patient_pid: study.patient_pid,
        patient_name: study.patient_name,
        patient_phone: study.patient_phone,
        study_code: study.study_code,
        study_name: study.study_name,
        modality: study.modality,
        center_id: study.center_id,
        center_name: study.center_name,
        radiologist_code: study.radiologist_code,
        radiologist_name: study.radiologist_name,
        priority: study.priority,
        status: study.status,
        scheduled_date: study.scheduled_date,
        scheduled_time: study.scheduled_time,
        completion_date: study.completion_date,
        report_date: study.report_date,
        notes: study.notes,
        bill_id: study.bill_id,
        bill_amount: study.bill_amount,
        payment_status: study.payment_status,
        bill_accession_number: study.bill_accession_number,
        created_at: study.created_at,
        updated_at: study.updated_at
      }
    });
  } catch (error) {
    logger.error('Get study error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced study list with accession numbers
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status, 
      center_id,
      accession_number,
      patient_pid 
    } = req.query;
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) FROM studies s WHERE s.active = true';
    let queryParams = [];
    let paramIndex = 1;

    // Build WHERE conditions
    let whereConditions = ['s.active = true'];

    if (search) {
      whereConditions.push(`(
        s.study_id ILIKE $${paramIndex} OR 
        p.name ILIKE $${paramIndex} OR 
        p.phone ILIKE $${paramIndex} OR 
        p.pid ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`s.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (center_id) {
      whereConditions.push(`s.center_id = $${paramIndex}`);
      queryParams.push(center_id);
      paramIndex++;
    }

    if (accession_number) {
      whereConditions.push(`s.accession_number ILIKE $${paramIndex}`);
      queryParams.push(`%${accession_number}%`);
      paramIndex++;
    }

    if (patient_pid) {
      whereConditions.push(`p.pid ILIKE $${paramIndex}`);
      queryParams.push(`%${patient_pid}%`);
      paramIndex++;
    }

    countQuery = `SELECT COUNT(*) FROM studies s 
                  LEFT JOIN patients p ON s.patient_id = p.id 
                  WHERE ${whereConditions.join(' AND ')}`;
    
    const countResult = await pool.query(countQuery, queryParams);

    const query = `
      SELECT 
        s.*, 
        p.pid as patient_pid,
        p.name as patient_name,
        p.phone as patient_phone,
        sd.study_name,
        sd.modality,
        rm.radiologist_name,
        c.name as center_name,
        pb.id as bill_id,
        pb.total_amount as bill_amount,
        pb.payment_status
      FROM studies s
      LEFT JOIN patients p ON s.patient_id = p.id
      LEFT JOIN study_definitions sd ON s.study_code = sd.study_code
      LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
      LEFT JOIN centers c ON s.center_id = c.id
      LEFT JOIN patient_bills pb ON s.id = pb.study_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    const studies = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      studies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get studies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get API call logs for monitoring
router.get('/api-logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      patient_id, 
      pid, 
      success,
      start_date,
      end_date 
    } = req.query;
    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (patient_id) {
      whereConditions.push(`patient_id = $${paramIndex}`);
      queryParams.push(patient_id);
      paramIndex++;
    }

    if (pid) {
      whereConditions.push(`pid ILIKE $${paramIndex}`);
      queryParams.push(`%${pid}%`);
      paramIndex++;
    }

    if (success !== undefined) {
      whereConditions.push(`success = $${paramIndex}`);
      queryParams.push(success === 'true');
      paramIndex++;
    }

    if (start_date) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM api_call_logs ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);

    const query = `
      SELECT * FROM api_call_logs 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const result = await pool.query(query, queryParams);

    const logs = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get API logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
