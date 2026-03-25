'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// GL account codes (must match migration 036 COA)
const GL = {
  PETTY_CASH:   '1114',   // Petty Cash – Centre Operations
  CASH_IN_HAND: '1111',   // Cash in Hand
  ITC:          '1134',   // GST Input Credit (ITC)
};

// ── Helper: resolve account id by code ──────────────────────
async function glId(client, code) {
  const { rows } = await client.query(
    `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true`,
    [code]
  );
  if (!rows.length) throw new Error(`GL account ${code} not found in chart_of_accounts`);
  return rows[0].id;
}

// ── Helper: next JE number ───────────────────────────────────
async function nextJENumber(client) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(entry_number,'[^0-9]','','g') AS INTEGER)),0)+1
       FROM journal_entries WHERE entry_number LIKE 'JE-%'`
  );
  return 'JE-' + String(rows[0].coalesce).padStart(6, '0');
}

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash
// Query: status, center_id, from, to, created_by, page, limit
// ═══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { status, center_id, from, to, created_by, page = 1, limit = 50 } = req.query;
    const conds = ['1=1'];
    const params = [];

    if (status)     { conds.push(`er.status = $${params.length+1}`);                  params.push(status); }
    if (center_id)  { conds.push(`er.center_id = $${params.length+1}`);               params.push(center_id); }
    if (from)       { conds.push(`er.expense_date >= $${params.length+1}`);            params.push(from); }
    if (to)         { conds.push(`er.expense_date <= $${params.length+1}`);            params.push(to); }
    if (created_by) { conds.push(`er.created_by = $${params.length+1}`);              params.push(created_by); }

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
             ca.account_name  AS credit_gl_name
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
// Returns count of SUBMITTED vouchers (for badge)
// ═══════════════════════════════════════════════════════════════
router.get('/pending-count', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM expense_records WHERE status = 'SUBMITTED'`
    );
    res.json({ success: true, count: parseInt(rows[0].count) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/summary
// Monthly summary by category for a center/date range
// ═══════════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const { center_id, from, to } = req.query;
    const conds = [`er.status = 'APPROVED'`];
    const params = [];

    if (center_id) { conds.push(`er.center_id = $${params.length+1}`);    params.push(center_id); }
    if (from)      { conds.push(`er.expense_date >= $${params.length+1}`); params.push(from); }
    if (to)        { conds.push(`er.expense_date <= $${params.length+1}`); params.push(to); }

    const { rows } = await pool.query(`
      SELECT er.category,
             da.account_name  AS gl_name,
             COUNT(*)         AS voucher_count,
             SUM(er.amount)   AS net_total,
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
        FROM expense_records er
       WHERE ${conds.join(' AND ')}
    `, params);

    res.json({ success: true, summary: rows, totals: tot[0] });
  } catch (e) {
    logger.error('Petty cash summary:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/petty-cash/gl-accounts
// Returns COA expense accounts (5xxx) + petty cash accounts
// ═══════════════════════════════════════════════════════════════
router.get('/gl-accounts', async (_req, res) => {
  try {
    const { rows: expense } = await pool.query(`
      SELECT id, account_code, account_name, account_category
        FROM chart_of_accounts
       WHERE account_code LIKE '5%' AND is_active = true
         AND account_level >= 3
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
// POST /api/petty-cash
// Submit a new petty cash voucher
// ═══════════════════════════════════════════════════════════════
const voucherValidators = [
  body('expense_date').isISO8601().withMessage('Valid date required'),
  body('center_id').isInt({ min: 1 }).withMessage('Center required').toInt(),
  body('debit_account_id').isInt({ min: 1 }).withMessage('Expense GL account required').toInt(),
  body('credit_account_id').isInt({ min: 1 }).withMessage('Payment account required').toInt(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be > 0').toFloat(),
  body('gst_rate').isFloat({ min: 0, max: 28 }).withMessage('GST rate 0-28').toFloat(),
  body('description').trim().isLength({ min: 3 }).withMessage('Description required'),
];

router.post('/', authorizePermission('PETTY_CASH_WRITE'), voucherValidators, async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const {
      expense_date, center_id, debit_account_id, credit_account_id,
      amount, gst_rate = 0, cgst_amount = 0, sgst_amount = 0,
      itc_claimable = true,
      description, paid_to, receipt_number, notes,
    } = req.body;

    const gst_amount = parseFloat(cgst_amount) + parseFloat(sgst_amount);
    const total_amount = parseFloat(amount) + gst_amount;

    const { rows } = await pool.query(`
      INSERT INTO expense_records
        (expense_date, center_id, category, description,
         vendor_name, amount, gst_rate, gst_amount, cgst_amount, sgst_amount,
         total_amount, itc_claimable, paid_to, receipt_number,
         debit_account_id, credit_account_id,
         payment_method, payment_status, status, notes,
         submitted_at, created_by)
      VALUES
        ($1,$2,'PETTY_CASH',$3,
         $4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,
         'PETTY_CASH','PENDING','SUBMITTED',$16,
         NOW(),$17)
      RETURNING *
    `, [
      expense_date, center_id, description,
      paid_to || null, amount, gst_rate, gst_amount, cgst_amount, sgst_amount,
      total_amount, itc_claimable, paid_to || null, receipt_number || null,
      debit_account_id, credit_account_id,
      notes || null, req.user?.id || null,
    ]);

    logger.info('Petty cash voucher submitted', { id: rows[0].id, amount: total_amount });
    res.status(201).json({ success: true, voucher: rows[0] });
  } catch (e) {
    logger.error('Petty cash POST:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/petty-cash/:id/approve
// Finance role approves → posts journal entry automatically
// ═══════════════════════════════════════════════════════════════
router.put('/:id/approve', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch voucher
    const { rows } = await client.query(
      `SELECT * FROM expense_records WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Voucher not found' }); }
    const v = rows[0];
    if (v.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot approve voucher with status: ${v.status}` });
    }

    // Build journal entry lines
    //   DR expense GL  (net amount)
    //   DR ITC / or add to expense  (gst amount if applicable)
    //   CR petty cash GL  (total amount)
    const lines = [];
    const netAmount   = parseFloat(v.amount);
    const gstAmount   = parseFloat(v.gst_amount);
    const totalAmount = parseFloat(v.total_amount);

    if (gstAmount > 0 && v.itc_claimable) {
      // GST split: DR expense (net) + DR ITC (gst) = CR petty cash (total)
      const itcId = await glId(client, GL.ITC);
      lines.push({ account_id: v.debit_account_id, debit_amount: netAmount,  credit_amount: 0, description: v.description });
      lines.push({ account_id: itcId,               debit_amount: gstAmount, credit_amount: 0, description: `ITC on: ${v.description}` });
      lines.push({ account_id: v.credit_account_id, debit_amount: 0, credit_amount: totalAmount, description: v.expense_number });
    } else {
      // No GST or non-claimable: DR expense (total) = CR petty cash (total)
      lines.push({ account_id: v.debit_account_id,  debit_amount: totalAmount, credit_amount: 0, description: v.description });
      lines.push({ account_id: v.credit_account_id, debit_amount: 0, credit_amount: totalAmount, description: v.expense_number });
    }

    // Verify balance
    const totalDr = lines.reduce((s, l) => s + l.debit_amount,  0);
    const totalCr = lines.reduce((s, l) => s + l.credit_amount, 0);
    if (Math.abs(totalDr - totalCr) > 0.01) throw new Error('Journal does not balance');

    // Idempotency: skip if JE already posted for this voucher
    const postingKey = `PETTY-CASH-${v.id}`;
    const { rows: existJE } = await client.query(
      `SELECT id, entry_number FROM journal_entries WHERE posting_key = $1 LIMIT 1`,
      [postingKey]
    );
    if (existJE.length) {
      // JE already exists — just mark approved if not already
      await client.query(`
        UPDATE expense_records
           SET status='APPROVED', approved_by=$1, approved_at=COALESCE(approved_at,NOW()),
               payment_status='PAID', journal_entry_id=$2, updated_at=NOW()
         WHERE id=$3
      `, [req.user?.id || null, existJE[0].id, v.id]);
      await client.query('COMMIT');
      return res.json({ success: true, journal_entry: existJE[0].entry_number, journal_id: existJE[0].id });
    }

    // Insert journal entry
    const jeNum = await nextJENumber(client);
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
      v.center_id, req.user?.id || null,
      v.id, v.expense_number, postingKey,
    ]);
    const je = jeRows[0];

    for (const l of lines) {
      await client.query(`
        INSERT INTO journal_entry_lines
          (journal_entry_id, account_id, debit_amount, credit_amount, description, center_id)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [je.id, l.account_id, l.debit_amount, l.credit_amount, l.description, v.center_id]);
    }

    // Update voucher
    await client.query(`
      UPDATE expense_records
         SET status='APPROVED', approved_by=$1, approved_at=NOW(),
             payment_status='PAID', journal_entry_id=$2, updated_at=NOW()
       WHERE id=$3
    `, [req.user?.id || null, je.id, v.id]);

    await client.query('COMMIT');
    logger.info('Petty cash approved + JE posted', { voucher_id: v.id, je: jeNum });
    res.json({ success: true, journal_entry: jeNum, journal_id: je.id });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Petty cash approve:', e);
    res.status(500).json({ error: e.message || 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/petty-cash/:id/reject
// Finance role rejects with reason
// ═══════════════════════════════════════════════════════════════
router.put('/:id/reject', authorizePermission('PETTY_CASH_APPROVE'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });

    const { rows } = await pool.query(
      `SELECT status FROM expense_records WHERE id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Voucher not found' });
    if (rows[0].status !== 'SUBMITTED') return res.status(400).json({ error: `Cannot reject voucher with status: ${rows[0].status}` });

    await pool.query(`
      UPDATE expense_records
         SET status='REJECTED', rejection_reason=$1,
             rejected_by=$2, rejected_at=NOW(), updated_at=NOW()
       WHERE id=$3
    `, [reason.trim(), req.user?.id || null, req.params.id]);

    logger.info('Petty cash rejected', { id: req.params.id, reason });
    res.json({ success: true });
  } catch (e) {
    logger.error('Petty cash reject:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/petty-cash/:id
// Creator can delete their own SUBMITTED voucher
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', authorizePermission('PETTY_CASH_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM expense_records WHERE id=$1 AND status='SUBMITTED' AND created_by=$2 RETURNING id`,
      [req.params.id, req.user?.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Voucher not found or cannot be deleted' });
    res.json({ success: true });
  } catch (e) {
    logger.error('Petty cash DELETE:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
