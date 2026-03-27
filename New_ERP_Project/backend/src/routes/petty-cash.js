'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// GL account codes
const GL = {
  STAFF_ADVANCES: '1132',  // Staff Advances & Loans  (knock-off credit)
  BANK:           '1112',  // Bank – Primary Current Account (reimbursement credit)
  PETTY_CASH:     '1114',  // Petty Cash – Centre Operations
  CASH_IN_HAND:   '1111',  // Cash in Hand
  ITC:            '1134',  // GST Input Credit
};

async function glId(client, code) {
  const { rows } = await client.query(
    `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true`, [code]
  );
  if (!rows.length) throw new Error(`GL account ${code} not found`);
  return rows[0].id;
}

async function nextJENumber(client) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(entry_number,'[^0-9]','','g') AS INTEGER)),0)+1 AS n
       FROM journal_entries WHERE entry_number LIKE 'JE-%'`
  );
  return 'JE-' + String(rows[0].n).padStart(6, '0');
}

// ── helper: get custodian record for a user (by employee record) ──────────
async function getCustodian(client, userId) {
  const { rows } = await client.query(`
    SELECT pcc.*, e.name AS employee_name, p.id AS party_id
      FROM petty_cash_custodians pcc
      JOIN employees e ON e.id = pcc.employee_id
      JOIN users     u ON u.id = $1
      JOIN parties   p ON p.id = pcc.party_id
     WHERE e.email = u.email AND pcc.is_active = true
     LIMIT 1
  `, [userId]);
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/custodians  — Finance: list all custodians
// ═══════════════════════════════════════════════════════════════
router.get('/custodians', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pcc.id, pcc.center_id, pcc.is_active, pcc.credit_limit, pcc.notes,
             c.name   AS center_name,
             e.id     AS employee_id,
             e.name   AS employee_name,
             e.position,
             p.party_code,
             -- active advance
             adv.id            AS advance_id,
             adv.advance_number,
             adv.issued_date,
             adv.amount        AS advance_amount,
             adv.amount_utilised,
             adv.amount - adv.amount_utilised AS balance_remaining,
             adv.status        AS advance_status
        FROM petty_cash_custodians pcc
        JOIN centers   c ON c.id = pcc.center_id
        JOIN employees e ON e.id = pcc.employee_id
        JOIN parties   p ON p.id = pcc.party_id
        LEFT JOIN LATERAL (
          SELECT * FROM petty_cash_advances
           WHERE custodian_id = pcc.id AND status = 'ACTIVE'
           ORDER BY issued_date DESC LIMIT 1
        ) adv ON true
       ORDER BY c.name, e.name
    `);
    res.json({ success: true, custodians: rows });
  } catch (e) {
    logger.error('Custodians GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/petty-cash/custodians  — Finance: assign custodian
// ═══════════════════════════════════════════════════════════════
router.post('/custodians', authorizePermission('PETTY_CASH_APPROVE'), [
  body('center_id').isInt({ min: 1 }).toInt(),
  body('employee_id').isInt({ min: 1 }).toInt(),
  body('credit_limit').isFloat({ min: 0 }).toFloat(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  const { center_id, employee_id, credit_limit = 10000, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify employee exists and get name
    const { rows: emp } = await client.query(
      `SELECT id, name, email FROM employees WHERE id = $1`, [employee_id]
    );
    if (!emp.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Employee not found' }); }

    // Create party if not exists
    const code = `EMP-${emp[0].name.split(' ').map(w => w[0]).join('').toUpperCase()}-${employee_id}`;
    const { rows: party } = await client.query(`
      INSERT INTO parties (party_code, party_name, party_type, active)
      VALUES ($1, $2, 'OTHER', true)
      ON CONFLICT (party_code) DO UPDATE SET party_name = EXCLUDED.party_name
      RETURNING id
    `, [code, emp[0].name]);

    const { rows } = await client.query(`
      INSERT INTO petty_cash_custodians (center_id, employee_id, party_id, is_active, credit_limit, notes)
      VALUES ($1, $2, $3, true, $4, $5)
      ON CONFLICT (center_id, employee_id) DO UPDATE
        SET is_active = true, credit_limit = $4, notes = $5, updated_at = NOW()
      RETURNING *
    `, [center_id, employee_id, party.id, credit_limit, notes || null]);

    await client.query('COMMIT');
    res.status(201).json({ success: true, custodian: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Custodian assign:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/petty-cash/custodians/:id  — Finance: update custodian
// ═══════════════════════════════════════════════════════════════
router.put('/custodians/:id', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  const { credit_limit, is_active, notes } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE petty_cash_custodians
         SET credit_limit = COALESCE($1, credit_limit),
             is_active    = COALESCE($2, is_active),
             notes        = COALESCE($3, notes),
             updated_at   = NOW()
       WHERE id = $4
      RETURNING *
    `, [credit_limit ?? null, is_active ?? null, notes ?? null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Custodian not found' });
    res.json({ success: true, custodian: rows[0] });
  } catch (e) {
    logger.error('Custodian update:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/my-status  — Employee: own advance & voucher summary
// ═══════════════════════════════════════════════════════════════
router.get('/my-status', async (req, res) => {
  const client = await pool.connect();
  try {
    const custodian = await getCustodian(client, req.user.id);

    // Voucher stats for this user
    const { rows: stats } = await client.query(`
      SELECT
        COUNT(*)                                          AS total_vouchers,
        COUNT(*) FILTER (WHERE status='SUBMITTED')        AS pending,
        COUNT(*) FILTER (WHERE status='APPROVED')         AS approved,
        COALESCE(SUM(total_amount) FILTER (WHERE status='APPROVED'), 0) AS total_approved
      FROM expense_records
      WHERE created_by = $1
    `, [req.user.id]);

    res.json({
      success: true,
      is_custodian: !!custodian,
      custodian: custodian || null,
      stats: stats[0],
    });
  } catch (e) {
    logger.error('my-status:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/petty-cash/advances  — Finance: issue advance to custodian
// ═══════════════════════════════════════════════════════════════
router.post('/advances', authorizePermission('PETTY_CASH_APPROVE'), [
  body('custodian_id').isInt({ min: 1 }).toInt(),
  body('amount').isFloat({ min: 1 }).toFloat(),
  body('issued_date').isISO8601(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { custodian_id, amount, issued_date, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get custodian details
    const { rows: cust } = await client.query(`
      SELECT pcc.*, e.name AS employee_name, c.name AS center_name, p.id AS party_id
        FROM petty_cash_custodians pcc
        JOIN employees e ON e.id = pcc.employee_id
        JOIN centers   c ON c.id = pcc.center_id
        JOIN parties   p ON p.id = pcc.party_id
       WHERE pcc.id = $1
    `, [custodian_id]);
    if (!cust.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Custodian not found' }); }
    const c = cust[0];

    // JE: DR Staff Advances, CR Bank
    const advAccId  = await glId(client, GL.STAFF_ADVANCES);
    const bankAccId = await glId(client, GL.BANK);
    const jeNum     = await nextJENumber(client);

    const { rows: jeRows } = await client.query(`
      INSERT INTO journal_entries
        (entry_number, entry_date, description, total_debit, total_credit,
         center_id, created_by, status, source_module, posting_key, is_auto_posted)
      VALUES ($1,$2,$3,$4,$4,$5,$6,'POSTED','PETTY_CASH_ADV',$7,true)
      RETURNING *
    `, [
      jeNum, issued_date,
      `Petty Cash Advance – ${c.employee_name} (${c.center_name})`,
      amount, c.center_id, req.user.id,
      `PCA-ADV-${custodian_id}-${issued_date}`,
    ]);
    const je = jeRows[0];

    await client.query(`
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description, center_id)
      VALUES ($1,1,$2,$3,0,$4,$5), ($1,2,$6,0,$3,$4,$5)
    `, [je.id, advAccId, amount, `Advance to ${c.employee_name}`, c.center_id, bankAccId]);

    // Party ledger: debit against custodian
    const { rows: plRows } = await client.query(`
      INSERT INTO party_ledgers
        (party_id, journal_entry_id, center_id, transaction_date, document_number,
         narration, debit_amount, credit_amount, source_module, source_ref)
      VALUES ($1,$2,$3,$4,$5,$6,$7,0,'PETTY_CASH_ADV',$5)
      RETURNING id
    `, [
      c.party_id, je.id, c.center_id, issued_date, jeNum,
      `Advance issued – ${c.center_name}`, amount,
    ]);

    // Create advance record
    const { rows: advRows } = await client.query(`
      INSERT INTO petty_cash_advances
        (custodian_id, employee_id, center_id, issued_date, amount,
         journal_entry_id, party_ledger_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      custodian_id, c.employee_id, c.center_id, issued_date, amount,
      je.id, plRows[0].id, notes || null, req.user.id,
    ]);

    await client.query('COMMIT');
    logger.info('Petty cash advance issued', { advance: advRows[0].advance_number, amount });
    res.status(201).json({ success: true, advance: advRows[0], journal_entry: jeNum });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Advance issue:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/advances  — list advances (Finance or own)
// ═══════════════════════════════════════════════════════════════
router.get('/advances', async (req, res) => {
  try {
    const { custodian_id, status } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (custodian_id) { conds.push(`pca.custodian_id = $${params.length+1}`); params.push(custodian_id); }
    if (status)       { conds.push(`pca.status = $${params.length+1}`);       params.push(status); }

    const { rows } = await pool.query(`
      SELECT pca.*,
             e.name   AS employee_name,
             c.name   AS center_name,
             pca.amount - pca.amount_utilised AS balance_remaining
        FROM petty_cash_advances pca
        JOIN employees e ON e.id = pca.employee_id
        JOIN centers   c ON c.id = pca.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY pca.issued_date DESC, pca.id DESC
    `, params);
    res.json({ success: true, advances: rows });
  } catch (e) {
    logger.error('Advances GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash
// Query: status, center_id, from, to, created_by, page, limit
// ═══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { status, center_id, from, to, created_by, page = 1, limit = 50 } = req.query;
    const conds = ['1=1'];
    const params = [];

    if (status)     { conds.push(`er.status = $${params.length+1}`);       params.push(status); }
    if (center_id)  { conds.push(`er.center_id = $${params.length+1}`);    params.push(center_id); }
    if (from)       { conds.push(`er.expense_date >= $${params.length+1}`); params.push(from); }
    if (to)         { conds.push(`er.expense_date <= $${params.length+1}`); params.push(to); }
    if (created_by) { conds.push(`er.created_by = $${params.length+1}`);   params.push(created_by); }
    if (!req.user?.is_corporate_role && req.user?.center_id) {
      conds.push(`er.center_id = $${params.length+1}`);
      params.push(req.user.center_id);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await pool.query(`
      SELECT er.*,
             c.name           AS center_name,
             u.name           AS created_by_name,
             a.name           AS approved_by_name,
             rj.name          AS rejected_by_name,
             da.account_code  AS debit_gl_code,
             da.account_name  AS debit_gl_name,
             ca.account_code  AS credit_gl_code,
             ca.account_name  AS credit_gl_name,
             er.is_advance_knockoff
        FROM expense_records er
        LEFT JOIN centers c            ON c.id  = er.center_id
        LEFT JOIN users   u            ON u.id  = er.created_by
        LEFT JOIN users   a            ON a.id  = er.approved_by
        LEFT JOIN users   rj           ON rj.id = er.rejected_by
        LEFT JOIN chart_of_accounts da ON da.id = er.debit_account_id
        LEFT JOIN chart_of_accounts ca ON ca.id = er.credit_account_id
       WHERE ${conds.join(' AND ')}
       ORDER BY er.expense_date DESC, er.id DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}
    `, [...params, parseInt(limit), offset]);

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM expense_records er WHERE ${conds.join(' AND ')}`, params
    );
    res.json({ success: true, vouchers: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('Petty cash GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/pending-count
// ═══════════════════════════════════════════════════════════════
router.get('/pending-count', async (req, res) => {
  try {
    const params = [];
    let where = `status = 'SUBMITTED'`;
    if (!req.user?.is_corporate_role && req.user?.center_id) {
      params.push(req.user.center_id);
      where += ` AND center_id = $1`;
    }
    const { rows } = await pool.query(`SELECT COUNT(*) FROM expense_records WHERE ${where}`, params);
    res.json({ success: true, count: parseInt(rows[0].count) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/summary
// ═══════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const { center_id, from, to } = req.query;
    const conds = [`er.status = 'APPROVED'`];
    const params = [];
    if (center_id) { conds.push(`er.center_id = $${params.length+1}`);    params.push(center_id); }
    if (from)      { conds.push(`er.expense_date >= $${params.length+1}`); params.push(from); }
    if (to)        { conds.push(`er.expense_date <= $${params.length+1}`); params.push(to); }
    if (!req.user?.is_corporate_role && req.user?.center_id) {
      conds.push(`er.center_id = $${params.length+1}`);
      params.push(req.user.center_id);
    }
    const { rows } = await pool.query(`
      SELECT er.category, da.account_name AS gl_name,
             COUNT(*) AS voucher_count,
             SUM(er.amount) AS net_total,
             SUM(er.gst_amount) AS gst_total,
             SUM(er.total_amount) AS grand_total
        FROM expense_records er
        LEFT JOIN chart_of_accounts da ON da.id = er.debit_account_id
       WHERE ${conds.join(' AND ')}
       GROUP BY er.category, da.account_name
       ORDER BY grand_total DESC
    `, params);
    const { rows: tot } = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS net, COALESCE(SUM(gst_amount),0) AS gst,
             COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS cnt
        FROM expense_records er WHERE ${conds.join(' AND ')}
    `, params);
    res.json({ success: true, summary: rows, totals: tot[0] });
  } catch (e) {
    logger.error('Petty cash summary:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/gl-accounts
// ═══════════════════════════════════════════════════════════════
router.get('/gl-accounts', async (_req, res) => {
  try {
    const { rows: expense } = await pool.query(`
      SELECT id, account_code, account_name, account_category
        FROM chart_of_accounts
       WHERE account_code LIKE '5%' AND is_active = true AND account_level >= 3
       ORDER BY account_code
    `);
    const { rows: cash } = await pool.query(`
      SELECT id, account_code, account_name
        FROM chart_of_accounts
       WHERE account_code IN ('1111','1114') AND is_active = true
    `);
    res.json({ success: true, expense_accounts: expense, cash_accounts: cash });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/petty-cash  — Submit voucher (anyone)
// ═══════════════════════════════════════════════════════════════
const voucherValidators = [
  body('expense_date').isISO8601(),
  body('center_id').isInt({ min: 1 }).toInt(),
  body('debit_account_id').isInt({ min: 1 }).toInt(),
  body('amount').isFloat({ min: 0.01 }).toFloat(),
  body('gst_rate').isFloat({ min: 0, max: 28 }).toFloat(),
  body('description').trim().isLength({ min: 3 }),
];

router.post('/', authorizePermission('PETTY_CASH_WRITE'), voucherValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    const {
      expense_date, center_id, debit_account_id,
      amount, gst_rate = 0, cgst_amount = 0, sgst_amount = 0,
      itc_claimable = true, description, paid_to, receipt_number, notes,
    } = req.body;

    if (!req.user?.is_corporate_role && req.user?.center_id) {
      if (parseInt(center_id) !== parseInt(req.user.center_id))
        return res.status(403).json({ error: 'You can only submit for your assigned center' });
    }

    const gst_amount   = parseFloat(cgst_amount) + parseFloat(sgst_amount);
    const total_amount = parseFloat(amount) + gst_amount;

    // Check if submitter has active advance for this center
    const custodian = await getCustodian(client, req.user.id);
    const hasAdvance = custodian && custodian.center_id === parseInt(center_id);
    let advance_id = null;

    if (hasAdvance) {
      const { rows: adv } = await client.query(`
        SELECT id FROM petty_cash_advances
         WHERE custodian_id = $1 AND status = 'ACTIVE'
         ORDER BY issued_date DESC LIMIT 1
      `, [custodian.id]);
      if (adv.length) advance_id = adv[0].id;
    }

    // Credit account: if custodian with advance → Staff Advances; else → user-specified or Bank
    let credit_account_id = req.body.credit_account_id;
    if (hasAdvance && advance_id) {
      const { rows: acc } = await client.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = $1`, [GL.STAFF_ADVANCES]
      );
      if (acc.length) credit_account_id = acc[0].id;
    }

    const { rows } = await client.query(`
      INSERT INTO expense_records
        (expense_date, center_id, category, description,
         vendor_name, amount, gst_rate, gst_amount, cgst_amount, sgst_amount,
         total_amount, itc_claimable, paid_to, receipt_number,
         debit_account_id, credit_account_id,
         payment_method, payment_status, status, notes,
         submitted_at, created_by, advance_id, is_advance_knockoff)
      VALUES
        ($1,$2,'PETTY_CASH',$3,
         $4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,
         'PETTY_CASH','PENDING','SUBMITTED',$16,
         NOW(),$17,$18,$19)
      RETURNING *
    `, [
      expense_date, center_id, description,
      paid_to || null, amount, gst_rate, gst_amount, cgst_amount, sgst_amount,
      total_amount, itc_claimable, paid_to || null, receipt_number || null,
      debit_account_id, credit_account_id,
      notes || null, req.user?.id || null,
      advance_id, hasAdvance && !!advance_id,
    ]);

    logger.info('Petty cash voucher submitted', { id: rows[0].id, knockoff: rows[0].is_advance_knockoff });
    res.status(201).json({ success: true, voucher: rows[0] });
  } catch (e) {
    logger.error('Petty cash POST:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/petty-cash/:id/approve  — Finance approves + posts JE
// Custodian with advance → knock-off (Cr Staff Advances)
// No advance / non-custodian → reimbursement (Cr Bank)
// ═══════════════════════════════════════════════════════════════
router.put('/:id/approve', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM expense_records WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Voucher not found' }); }
    const v = rows[0];
    if (v.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot approve: status is ${v.status}` });
    }
    if (!req.user?.is_corporate_role && req.user?.center_id && parseInt(v.center_id) !== parseInt(req.user.center_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only approve vouchers for your center' });
    }

    const netAmount   = parseFloat(v.amount);
    const gstAmount   = parseFloat(v.gst_amount);
    const totalAmount = parseFloat(v.total_amount);

    // Determine credit account
    // If voucher has advance linked → Cr Staff Advances (knock-off)
    // Otherwise → Cr as stored in credit_account_id (Bank or Petty Cash)
    let creditAccountId = v.credit_account_id;
    if (v.is_advance_knockoff && v.advance_id) {
      creditAccountId = await glId(client, GL.STAFF_ADVANCES);
    }

    // Build JE lines
    const lines = [];
    if (gstAmount > 0 && v.itc_claimable) {
      const itcId = await glId(client, GL.ITC);
      lines.push({ account_id: v.debit_account_id, debit: netAmount,   credit: 0,           desc: v.description });
      lines.push({ account_id: itcId,              debit: gstAmount,   credit: 0,           desc: `ITC: ${v.description}` });
      lines.push({ account_id: creditAccountId,    debit: 0,           credit: totalAmount, desc: v.expense_number });
    } else {
      lines.push({ account_id: v.debit_account_id, debit: totalAmount, credit: 0,           desc: v.description });
      lines.push({ account_id: creditAccountId,    debit: 0,           credit: totalAmount, desc: v.expense_number });
    }

    // Idempotency
    const postingKey = `PETTY-CASH-${v.id}`;
    const { rows: existJE } = await client.query(
      `SELECT id, entry_number FROM journal_entries WHERE posting_key = $1 LIMIT 1`, [postingKey]
    );
    if (existJE.length) {
      await client.query(`UPDATE expense_records SET status='APPROVED', approved_by=$1,
        approved_at=COALESCE(approved_at,NOW()), payment_status='PAID', journal_entry_id=$2, updated_at=NOW()
        WHERE id=$3`, [req.user.id, existJE[0].id, v.id]);
      await client.query('COMMIT');
      return res.json({ success: true, journal_entry: existJE[0].entry_number });
    }

    const jeNum = await nextJENumber(client);
    const totalDr = lines.reduce((s, l) => s + l.debit, 0);
    const totalCr = lines.reduce((s, l) => s + l.credit, 0);

    const { rows: jeRows } = await client.query(`
      INSERT INTO journal_entries
        (entry_number, entry_date, description, reference_type, reference_id,
         total_debit, total_credit, center_id, created_by, status,
         source_module, source_id, source_ref, posting_key, is_auto_posted)
      VALUES ($1,$2,$3,'PETTY_CASH',$4,$5,$6,$7,$8,'POSTED','EXPENSE',$9,$10,$11,true)
      RETURNING *
    `, [
      jeNum, v.expense_date,
      `Petty Cash: ${v.description}${v.paid_to ? ' – ' + v.paid_to : ''}`,
      v.id, totalDr, totalCr,
      v.center_id, req.user.id, v.id, v.expense_number, postingKey,
    ]);
    const je = jeRows[0];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await client.query(`
        INSERT INTO journal_entry_lines
          (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description, center_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [je.id, i + 1, l.account_id, l.debit, l.credit, l.desc, v.center_id]);
    }

    // If knock-off: update advance utilised amount + party ledger
    if (v.is_advance_knockoff && v.advance_id) {
      await client.query(`
        UPDATE petty_cash_advances
           SET amount_utilised = amount_utilised + $1, updated_at = NOW()
         WHERE id = $2
      `, [totalAmount, v.advance_id]);

      // Check if fully settled
      await client.query(`
        UPDATE petty_cash_advances SET status = 'SETTLED', updated_at = NOW()
         WHERE id = $1 AND amount_utilised >= amount
      `, [v.advance_id]);

      // Party ledger: credit (knock-off)
      const { rows: custRows } = await client.query(`
        SELECT pcc.party_id FROM petty_cash_advances pca
          JOIN petty_cash_custodians pcc ON pcc.id = pca.custodian_id
         WHERE pca.id = $1
      `, [v.advance_id]);
      if (custRows.length) {
        await client.query(`
          INSERT INTO party_ledgers
            (party_id, journal_entry_id, center_id, transaction_date, document_number,
             narration, debit_amount, credit_amount, source_module, source_ref)
          VALUES ($1,$2,$3,$4,$5,$6,0,$7,'PETTY_CASH',$5)
        `, [
          custRows[0].party_id, je.id, v.center_id,
          v.expense_date, v.expense_number,
          `Voucher settled: ${v.description}`, totalAmount,
        ]);
      }
    }

    await client.query(`
      UPDATE expense_records
         SET status='APPROVED', approved_by=$1, approved_at=NOW(),
             payment_status='PAID', journal_entry_id=$2, updated_at=NOW()
       WHERE id=$3
    `, [req.user.id, je.id, v.id]);

    await client.query('COMMIT');
    logger.info('Petty cash approved', { voucher_id: v.id, je: jeNum, knockoff: v.is_advance_knockoff });
    res.json({ success: true, journal_entry: jeNum, journal_id: je.id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Petty cash approve:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/petty-cash/:id/reject
// ═══════════════════════════════════════════════════════════════
router.put('/:id/reject', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT status, center_id FROM expense_records WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (rows[0].status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot reject: status is ${rows[0].status}` });
    }
    if (!req.user?.is_corporate_role && req.user?.center_id &&
        parseInt(rows[0].center_id) !== parseInt(req.user.center_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only reject vouchers for your center' });
    }
    await client.query(`
      UPDATE expense_records
         SET status='REJECTED', rejection_reason=$1, rejected_by=$2, rejected_at=NOW(), updated_at=NOW()
       WHERE id=$3
    `, [reason.trim(), req.user.id, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Petty cash reject:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/petty-cash/:id  — creator deletes own SUBMITTED voucher
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', authorizePermission('PETTY_CASH_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM expense_records WHERE id=$1 AND status='SUBMITTED' AND created_by=$2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or cannot delete' });
    res.json({ success: true });
  } catch (e) {
    logger.error('Petty cash DELETE:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
