'use strict';
const express = require('express');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('VENDOR_VIEW'));

const ok   = (res, data)      => res.json({ success: true, ...data });
const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

const VALID_TYPES = ['VENDOR','RADIOLOGIST','TELERADIOLOGY','LANDLORD','PARTNER','INSURER','OTHER'];

// ── GET /api/parties?party_type=X ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { party_type, active_only = 'true' } = req.query;

    let where = '1=1';
    const params = [];

    if (party_type) {
      params.push(party_type);
      where += ` AND p.party_type = $${params.length}`;
    }
    if (active_only === 'true') {
      where += ' AND p.active = true';
    }

    const { rows } = await pool.query(
      `SELECT
         p.*,
         coa.account_code AS ap_account_code,
         coa.account_name AS ap_account_name
       FROM parties p
       LEFT JOIN chart_of_accounts coa ON p.ap_account_id = coa.id
       WHERE ${where}
       ORDER BY p.party_type, p.party_name`,
      params
    );

    ok(res, { parties: rows });
  } catch (err) {
    logger.error('GET parties error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── GET /api/parties/:id/ledger?from=&to=&center_id= ──────────────────────
router.get('/:id/ledger', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, center_id } = req.query;

    // Verify party exists
    const { rows: pRows } = await pool.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (!pRows[0]) return fail(res, 404, 'Party not found');

    let where = 'pl.party_id = $1';
    const params = [id];

    if (from) {
      params.push(from);
      where += ` AND pl.transaction_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND pl.transaction_date <= $${params.length}`;
    }
    if (center_id) {
      params.push(center_id);
      where += ` AND pl.center_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT
         pl.*,
         c.name AS center_name,
         je.entry_number,
         SUM(pl.credit_amount - pl.debit_amount)
           OVER (ORDER BY pl.transaction_date, pl.id) AS running_balance
       FROM party_ledgers pl
       LEFT JOIN centers c         ON pl.center_id = c.id
       LEFT JOIN journal_entries je ON pl.journal_entry_id = je.id
       WHERE ${where}
       ORDER BY pl.transaction_date, pl.id`,
      params
    );

    // Summary totals
    const totals = rows.reduce(
      (acc, r) => {
        acc.total_debit  += parseFloat(r.debit_amount  || 0);
        acc.total_credit += parseFloat(r.credit_amount || 0);
        return acc;
      },
      { total_debit: 0, total_credit: 0 }
    );
    totals.net_balance = totals.total_credit - totals.total_debit;

    ok(res, { party: pRows[0], entries: rows, totals });
  } catch (err) {
    logger.error('GET parties/:id/ledger error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── POST /api/parties — create ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      party_code, party_name, party_type,
      vendor_id, radiologist_id,
      gstin, pan, email, phone, address,
      ap_account_id, bank_name, bank_account_no, bank_ifsc
    } = req.body;

    if (!party_code || !party_name) {
      return fail(res, 400, 'party_code and party_name are required');
    }
    if (!party_type || !VALID_TYPES.includes(party_type)) {
      return fail(res, 400, `party_type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const { rows } = await pool.query(
      `INSERT INTO parties
         (party_code, party_name, party_type, vendor_id, radiologist_id,
          gstin, pan, email, phone, address,
          ap_account_id, bank_name, bank_account_no, bank_ifsc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        party_code, party_name, party_type,
        vendor_id || null, radiologist_id || null,
        gstin || null, pan || null, email || null, phone || null, address || null,
        ap_account_id || null, bank_name || null, bank_account_no || null, bank_ifsc || null
      ]
    );

    logger.info(`Party created: ${party_code} type=${party_type}`);
    ok(res, { party: rows[0] });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'party_code already exists');
    logger.error('POST parties error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── PUT /api/parties/:id — update ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      party_name, party_type,
      gstin, pan, email, phone, address,
      ap_account_id, bank_name, bank_account_no, bank_ifsc, active
    } = req.body;

    if (party_type && !VALID_TYPES.includes(party_type)) {
      return fail(res, 400, `party_type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const { rows } = await pool.query(
      `UPDATE parties SET
         party_name      = COALESCE($1, party_name),
         party_type      = COALESCE($2, party_type),
         gstin           = COALESCE($3, gstin),
         pan             = COALESCE($4, pan),
         email           = COALESCE($5, email),
         phone           = COALESCE($6, phone),
         address         = COALESCE($7, address),
         ap_account_id   = COALESCE($8, ap_account_id),
         bank_name       = COALESCE($9, bank_name),
         bank_account_no = COALESCE($10, bank_account_no),
         bank_ifsc       = COALESCE($11, bank_ifsc),
         active          = COALESCE($12, active),
         updated_at      = NOW()
       WHERE id = $13
       RETURNING *`,
      [party_name, party_type, gstin, pan, email, phone, address,
       ap_account_id, bank_name, bank_account_no, bank_ifsc, active, id]
    );

    if (!rows[0]) return fail(res, 404, 'Party not found');
    logger.info(`Party updated: id=${id}`);
    ok(res, { party: rows[0] });
  } catch (err) {
    logger.error('PUT parties/:id error:', err);
    fail(res, 500, 'Internal server error');
  }
});

module.exports = router;
