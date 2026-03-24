'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('EXPENSE_VIEW'));
const ok  = (res, data) => res.json({ success: true, ...data });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg });

// ── GET /api/expenses ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { from, to, category, category_id, status, search, center_id, page = 1, limit = 50 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (from)        { params.push(from);        conditions.push(`e.expense_date >= $${params.length}`); }
    if (to)          { params.push(to);          conditions.push(`e.expense_date <= $${params.length}`); }
    if (category)    { params.push(category);    conditions.push(`e.category = $${params.length}`); }
    if (category_id) { params.push(parseInt(category_id)); conditions.push(`e.category_id = $${params.length}`); }
    if (status)      { params.push(status);      conditions.push(`e.payment_status = $${params.length}`); }
    if (center_id)   { params.push(center_id);   conditions.push(`e.center_id = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.description ILIKE $${params.length} OR e.vendor_name ILIKE $${params.length} OR e.expense_number ILIKE $${params.length})`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const { rows } = await pool.query(
      `SELECT e.*,
              ic.code  AS category_code,
              ic.name  AS category_label,
              p.name   AS category_group,
              eg.account_code AS expense_gl_code,
              ap.account_code AS ap_account_code,
              c.name   AS center_name,
              u.username AS created_by_name,
              po.po_number AS po_number,
              po.vendor_name AS po_vendor_name
       FROM   expense_records e
       LEFT JOIN item_categories ic  ON ic.id = e.category_id
       LEFT JOIN item_categories p   ON p.id  = ic.parent_id
       LEFT JOIN chart_of_accounts eg ON eg.id = ic.expense_gl_id
       LEFT JOIN chart_of_accounts ap ON ap.id = ic.ap_account_id
       LEFT JOIN centers c ON c.id = e.center_id
       LEFT JOIN users  u ON u.id = e.created_by
       LEFT JOIN procurement_orders po ON po.id = e.po_id
       WHERE  ${conditions.join(' AND ')}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM expense_records e WHERE ${conditions.join(' AND ')}`,
      countParams
    );

    ok(res, { expenses: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { logger.error('List expenses error', e); err(res, 'Server error'); }
});

// ── GET /api/expenses/categories ─────────────────────────────────────────────
// Returns DB-driven expense categories (EXPENSE item_type only, active)
router.get('/categories', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ic.id, ic.code, ic.name, ic.level, ic.parent_id,
              p.code AS parent_code, p.name AS parent_name,
              eg.account_code AS expense_gl_code, eg.account_name AS expense_gl_name,
              ap.account_code AS ap_account_code, ap.account_name AS ap_account_name
         FROM item_categories ic
         LEFT JOIN item_categories p    ON p.id  = ic.parent_id
         LEFT JOIN chart_of_accounts eg ON eg.id = ic.expense_gl_id
         LEFT JOIN chart_of_accounts ap ON ap.id = ic.ap_account_id
         WHERE ic.item_type = 'EXPENSE' AND ic.active = true
         ORDER BY ic.level, ic.sort_order, ic.name`
    );
    ok(res, { categories: rows });
  } catch (e) { logger.error('Expense categories error', e); err(res, 'Server error'); }
});

// ── GET /api/expenses/summary ─────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (from) { params.push(from); conditions.push(`expense_date >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`expense_date <= $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT category,
              COUNT(*)                                                      AS total_count,
              COALESCE(SUM(total_amount),0)                                 AS total_amount,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_status='PAID'),0)    AS paid_amount,
              COALESCE(SUM(total_amount) FILTER (WHERE payment_status='PENDING'),0) AS pending_amount
       FROM expense_records
       WHERE ${conditions.join(' AND ')}
       GROUP BY category ORDER BY total_amount DESC`,
      params
    );
    ok(res, { summary: rows });
  } catch (e) { err(res, 'Server error'); }
});

// ── GET /api/expenses/pos — open POs for expense linking ─────────────────────
router.get('/pos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, po_number, vendor_name, total_amount, status, center_id
       FROM procurement_orders
       WHERE status IN ('ISSUED','ACKNOWLEDGED','COMPLETED') AND active = true
       ORDER BY created_at DESC
       LIMIT 200`
    );
    ok(res, { pos: rows });
  } catch (e) { err(res, 'Server error'); }
});

// ── GET /api/expenses/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
              ic.code  AS category_code,
              ic.name  AS category_label,
              p.name   AS category_group,
              da.account_code AS debit_code, da.account_name AS debit_name,
              ca.account_code AS credit_code, ca.account_name AS credit_name,
              c.name AS center_name
       FROM   expense_records e
       LEFT JOIN item_categories ic    ON ic.id = e.category_id
       LEFT JOIN item_categories p     ON p.id  = ic.parent_id
       LEFT JOIN chart_of_accounts da  ON da.id = e.debit_account_id
       LEFT JOIN chart_of_accounts ca  ON ca.id = e.credit_account_id
       LEFT JOIN centers c ON c.id = e.center_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Expense not found', 404);
    ok(res, { expense: rows[0] });
  } catch (e) { err(res, 'Server error'); }
});

// ── POST /api/expenses ────────────────────────────────────────────────────────
router.post('/', [
  body('expense_date').isDate(),
  body('category').isLength({ min: 1, max: 50 }),
  body('description').trim().isLength({ min: 3, max: 500 }),
  body('amount').isFloat({ min: 0.01 }),
  body('gst_amount').optional().isFloat({ min: 0 }),
  body('total_amount').optional().isFloat({ min: 0 }),
  body('vendor_name').optional({ nullable: true }).trim().isLength({ max: 200 }),
  body('vendor_gstin').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('payment_method').optional().isIn(['CASH','BANK','UPI','CARD']),
  body('payment_status').optional().isIn(['PENDING','PAID','CANCELLED']),
  body('reference_number').optional({ nullable: true }).trim(),
  body('center_id').optional({ nullable: true }).isInt(),
  body('debit_account_id').optional({ nullable: true }).isInt(),
  body('credit_account_id').optional({ nullable: true }).isInt(),
  body('po_id').optional({ nullable: true }).isInt(),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      expense_date, category, sub_category, description,
      vendor_name, vendor_gstin,
      amount, gst_amount = 0, total_amount,
      payment_method = 'BANK', payment_status = 'PENDING',
      reference_number, center_id,
      debit_account_id, credit_account_id, po_id, notes,
      category_id = null,
    } = req.body;

    const finalTotal = total_amount || (parseFloat(amount) + parseFloat(gst_amount));

    const { rows } = await pool.query(
      `INSERT INTO expense_records
         (expense_date, category, sub_category, description,
          vendor_name, vendor_gstin, amount, gst_amount, total_amount,
          payment_method, payment_status, reference_number, center_id,
          debit_account_id, credit_account_id, po_id, notes, category_id,
          created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
       RETURNING *`,
      [
        expense_date, category, sub_category || null, description,
        vendor_name || null, vendor_gstin || null,
        amount, gst_amount, finalTotal,
        payment_method, payment_status,
        reference_number || null, center_id || null,
        debit_account_id || null, credit_account_id || null,
        po_id || null, notes || null, category_id || null,
        req.user?.id,
      ]
    );
    const expense = rows[0];

    // Auto-post JE for PAID expenses (immediate payment) OR
    // PENDING vendor expenses (accrual — DR Expense / CR AP creates the payable)
    const shouldPostJE = payment_status === 'PAID' ||
      (payment_status === 'PENDING' && (vendor_name || req.body.vendor_code));
    if (shouldPostJE) {
      setImmediate(async () => {
        try {
          const je = await financeService.postExpenseJE(expense, req.user?.id);
          if (je) await pool.query('UPDATE expense_records SET journal_entry_id=$1 WHERE id=$2', [je.id, expense.id]);
        } catch (jeErr) {
          logger.error('Finance JE failed for expense (create):', { expense_id: expense.id, error: jeErr.message });
        }
      });
    }

    logger.info(`Expense created: ${expense.expense_number}`, { id: expense.id, amount: finalTotal });
    ok(res, { expense });
  } catch (e) { logger.error('Create expense error', e); err(res, 'Server error'); }
});

// ── PUT /api/expenses/:id ─────────────────────────────────────────────────────
router.put('/:id', [
  body('expense_date').optional().isDate(),
  body('category').optional().isLength({ min: 1, max: 50 }),
  body('description').optional().trim().isLength({ min: 3, max: 500 }),
  body('amount').optional().isFloat({ min: 0 }),
  body('gst_amount').optional().isFloat({ min: 0 }),
  body('total_amount').optional().isFloat({ min: 0 }),
  body('vendor_name').optional({ nullable: true }).trim(),
  body('payment_status').optional().isIn(['PENDING','PAID','CANCELLED']),
  body('notes').optional({ nullable: true }).trim(),
  body('category_id').optional({ nullable: true }).isInt({ min: 1 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const cur = await pool.query('SELECT * FROM expense_records WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return err(res, 'Expense not found', 404);
    const current = cur.rows[0];

    const {
      expense_date, category, sub_category, description,
      vendor_name, vendor_gstin, amount, gst_amount, total_amount,
      payment_method, payment_status, reference_number,
      center_id, debit_account_id, credit_account_id, po_id, notes,
      category_id,
    } = req.body;

    const newAmount = amount       !== undefined ? parseFloat(amount)      : parseFloat(current.amount);
    const newGst    = gst_amount   !== undefined ? parseFloat(gst_amount)  : parseFloat(current.gst_amount);
    const newTotal  = total_amount !== undefined ? parseFloat(total_amount): (newAmount + newGst);

    const { rows } = await pool.query(
      `UPDATE expense_records SET
         expense_date      = COALESCE($1,  expense_date),
         category          = COALESCE($2,  category),
         sub_category      = COALESCE($3,  sub_category),
         description       = COALESCE($4,  description),
         vendor_name       = COALESCE($5,  vendor_name),
         vendor_gstin      = COALESCE($6,  vendor_gstin),
         amount            = $7,
         gst_amount        = $8,
         total_amount      = $9,
         payment_method    = COALESCE($10, payment_method),
         payment_status    = COALESCE($11, payment_status),
         reference_number  = COALESCE($12, reference_number),
         center_id         = COALESCE($13, center_id),
         debit_account_id  = COALESCE($14, debit_account_id),
         credit_account_id = COALESCE($15, credit_account_id),
         po_id             = COALESCE($16, po_id),
         notes             = COALESCE($17, notes),
         category_id       = COALESCE($18, category_id),
         updated_at        = NOW()
       WHERE id = $19 RETURNING *`,
      [
        expense_date || null, category || null, sub_category || null, description || null,
        vendor_name || null, vendor_gstin || null, newAmount, newGst, newTotal,
        payment_method || null, payment_status || null, reference_number || null,
        center_id || null, debit_account_id || null, credit_account_id || null,
        po_id || null, notes || null, category_id || null,
        req.params.id,
      ]
    );
    const expense = rows[0];

    if (payment_status === 'PAID' && current.payment_status !== 'PAID') {
      setImmediate(async () => {
        try {
          if (!current.journal_entry_id) {
            // No prior accrual JE — post combined expense + payment JE (original behaviour)
            const je = await financeService.postExpenseJE(expense, req.user?.id);
            if (je) await pool.query('UPDATE expense_records SET journal_entry_id=$1 WHERE id=$2', [je.id, expense.id]);
          } else {
            // Accrual JE already posted (vendor credit expense) — post payment JE: DR AP / CR Cash-Bank
            // Resolve the AP account from the original accrual JE credit line
            const { rows: jeLines } = await pool.query(
              `SELECT jel.account_id, coa.account_code
               FROM journal_entry_lines jel
               JOIN chart_of_accounts coa ON coa.id = jel.account_id
               WHERE jel.journal_entry_id = $1 AND jel.credit_amount > 0
                 AND coa.account_code LIKE '2%'
               LIMIT 1`,
              [current.journal_entry_id]
            );
            if (!jeLines.length) return; // can't identify AP account — skip payment JE

            const apAccountId = jeLines[0].account_id;
            const pmeth = expense.payment_method || 'BANK';
            const cashCode = pmeth === 'CASH' ? '1111' : '1114';
            const bankCode = '1112';
            const glCode = pmeth === 'CASH' ? cashCode : bankCode;
            const { rows: bankRows } = await pool.query(
              `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
              [glCode]
            );
            if (!bankRows.length) return;

            const total = parseFloat(expense.total_amount || expense.amount || 0);
            await financeService.createAndPostJE({
              sourceModule: 'EXPENSE',
              sourceId:     expense.id,
              sourceRef:    expense.expense_number || `Exp #${expense.id}`,
              narration:    `Payment of expense ${expense.expense_number} via ${pmeth}`,
              lines: [
                { accountId: apAccountId,    debit: total, credit: 0,
                  description: `AP cleared — ${expense.description}`, centerId: expense.center_id || null },
                { accountId: bankRows[0].id, debit: 0, credit: total,
                  description: `Cash/Bank — ${pmeth}`, centerId: expense.center_id || null },
              ],
              createdBy:  req.user?.id || null,
              postingKey: `EXPENSE-PAY-${expense.id}`,
            });
            // Also mark the payable as PAID
            await pool.query(
              `UPDATE payables SET status='PAID', paid_amount=balance_amount, balance_amount=0, updated_at=NOW()
               WHERE payable_number = $1 AND status = 'PENDING'`,
              [`EXP-PAY-${expense.expense_number || expense.id}`]
            );
          }
        } catch (jeErr) {
          logger.error('Finance JE failed for expense (update):', { expense_id: expense.id, error: jeErr.message });
        }
      });
    }

    ok(res, { expense });
  } catch (e) { logger.error('Update expense error', e); err(res, 'Server error'); }
});

// ── DELETE /api/expenses/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expense_records WHERE id=$1', [req.params.id]);
    if (!rows.length) return err(res, 'Expense not found', 404);
    if (rows[0].payment_status === 'PAID') return err(res, 'Cannot delete a paid expense', 400);
    await pool.query('DELETE FROM expense_records WHERE id=$1', [req.params.id]);
    ok(res, { message: 'Expense deleted' });
  } catch (e) { err(res, 'Server error'); }
});

module.exports = router;
