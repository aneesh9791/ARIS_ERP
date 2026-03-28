const express = require('express');
const { authorizePermission } = require('../middleware/auth');
const pool = require('../config/db');
const { logger } = require('../config/logger');

const router = express.Router();
router.use(authorizePermission('REPORTS_VIEW'));

// ── GET /api/reports/worklist ─────────────────────────────────────────────────
// All patients with study & report completed, filtered by date range.
// Accessible to any role with REPORTS_VIEW (including TECHNICIAN).
router.get('/worklist', async (req, res) => {
  const { date_from, date_to, center_id } = req.query;
  const from = date_from || new Date().toISOString().split('T')[0];
  const to   = date_to   || new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(`
      SELECT
        COALESCE(s.study_date::date, s.completion_date::date, s.created_at::date) AS study_date,
        p.name          AS patient_name,
        p.pid,
        p.date_of_birth,
        CASE
          WHEN p.date_of_birth IS NOT NULL
          THEN EXTRACT(YEAR FROM AGE(p.date_of_birth))::int
          ELSE NULL
        END             AS age,
        COALESCE(bi.study_name, s.requested_procedure, s.study_code) AS study_name,
        bi.amount       AS study_amount,
        pb.total_amount AS bill_amount,
        pb.payment_status,
        pb.invoice_number
      FROM studies s
      JOIN patients p ON p.id = s.patient_id
      LEFT JOIN bill_items bi ON bi.id = s.bill_item_id
      LEFT JOIN patient_bills pb ON pb.id = bi.bill_id
      WHERE s.report_status = 'COMPLETED'
        AND COALESCE(s.study_date::date, s.completion_date::date, s.created_at::date) BETWEEN $1 AND $2
        AND ($3::int IS NULL OR s.center_id = $3::int)
      ORDER BY COALESCE(s.study_date::date, s.completion_date::date, s.created_at::date) DESC, s.created_at DESC
    `, [from, to, center_id || null]);

    res.json({
      rows: result.rows,
      date_from: from,
      date_to: to,
      total_studies: result.rows.length,
      total_amount: result.rows.reduce((sum, r) => sum + parseFloat(r.bill_amount || 0), 0),
    });
  } catch (error) {
    logger.error('Worklist report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
