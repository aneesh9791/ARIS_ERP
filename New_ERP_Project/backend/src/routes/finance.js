'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorize } = require('../middleware/auth');

const FINANCE_WRITE  = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER', 'ACCOUNTANT'];
const FINANCE_ADMIN  = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER'];

const router = express.Router();
const ok  = (res, data)        => res.json({ success: true, ...data });
const err = (res, msg, status) => res.status(status || 400).json({ success: false, error: msg });

// ── number sequence ───────────────────────────────────────────
// Uses regex '^JE-\d+$' to only count manual JEs (format JE-NNNNNN).
// This intentionally excludes auto-posted JEs from financeService
// which use format JE-YYYY-NNNNN — prevents CAST errors on the year-separator.
async function nextJENumber() {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(entry_number, '^JE-', '') AS INTEGER)), 0) + 1 AS n
       FROM journal_entries WHERE entry_number ~ $1`,
    ['^JE-\\d+$']
  );
  return `JE-${String(rows[0].n).padStart(6, '0')}`;
}

// ════════════════════════════════════════════════════════════════
// CHART OF ACCOUNTS
// ════════════════════════════════════════════════════════════════

// GET /api/finance/accounts
router.get('/accounts', async (req, res) => {
  try {
    const { type, category, search, active = 'true', flat } = req.query;
    const conds = ['1=1'];
    const params = [];
    let i = 1;

    if (active !== 'all') { conds.push(`a.is_active = $${i++}`); params.push(active === 'true'); }
    if (type)     { conds.push(`a.account_type = $${i++}`);     params.push(type); }
    if (category) { conds.push(`a.account_category = $${i++}`); params.push(category); }
    if (search) {
      conds.push(`(a.account_code ILIKE $${i} OR a.account_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const { rows } = await pool.query(
      `SELECT a.*, p.account_name as parent_name,
          -- journal_only: account is linked to at least one non-item-master category
          --               AND linked to NO item-master categories
          CASE
            WHEN EXISTS (
              SELECT 1 FROM item_categories ic
              WHERE (ic.expense_gl_id = a.id OR ic.asset_gl_id = a.id OR ic.ap_account_id = a.id)
                AND ic.show_in_item_master = false AND ic.active = true
            ) AND NOT EXISTS (
              SELECT 1 FROM item_categories ic2
              WHERE (ic2.expense_gl_id = a.id OR ic2.asset_gl_id = a.id OR ic2.ap_account_id = a.id)
                AND ic2.show_in_item_master = true AND ic2.active = true
            ) THEN true
            ELSE false
          END AS journal_only
         FROM chart_of_accounts a
         LEFT JOIN chart_of_accounts p ON p.id = a.parent_account_id
        WHERE ${conds.join(' AND ')}
        ORDER BY a.account_code`,
      params
    );

    if (flat === 'true') return ok(res, { accounts: rows });

    // Build tree
    const byId = {};
    rows.forEach(r => { byId[r.id] = { ...r, children: [] }; });
    const roots = [];
    rows.forEach(r => {
      if (r.parent_account_id && byId[r.parent_account_id]) {
        byId[r.parent_account_id].children.push(byId[r.id]);
      } else {
        roots.push(byId[r.id]);
      }
    });
    ok(res, { accounts: roots, flat: rows });
  } catch (e) { logger.error('Finance accounts GET', e); err(res, 'Server error', 500); }
});

// POST /api/finance/accounts
router.post('/accounts', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const {
      account_code, account_name, account_type, account_category,
      normal_balance, parent_account_id, description, opening_balance = 0,
    } = req.body;
    if (!account_code || !account_name || !account_type || !account_category)
      return err(res, 'account_code, account_name, account_type, account_category required');

    const nature = normal_balance || (
      ['ASSET','COGS','EXPENSE'].includes(account_category) ? 'debit' : 'credit'
    );

    // Compute level
    let level = 1;
    if (parent_account_id) {
      const { rows } = await pool.query('SELECT account_level FROM chart_of_accounts WHERE id=$1', [parent_account_id]);
      if (rows.length) level = rows[0].account_level + 1;
    }

    const { rows } = await pool.query(
      `INSERT INTO chart_of_accounts
        (account_code,account_name,account_type,account_category,nature,normal_balance,
         account_level,parent_account_id,description,opening_balance,current_balance,is_active)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$9,true) RETURNING *`,
      [account_code, account_name, account_type, account_category, nature,
       level, parent_account_id || null, description || null, parseFloat(opening_balance)]
    );
    ok(res, { account: rows[0] });
  } catch (e) {
    if (e.code === '23505') return err(res, 'Account code already exists', 409);
    logger.error('Finance account POST', e); err(res, 'Server error', 500);
  }
});

// PUT /api/finance/accounts/:id
router.put('/accounts/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { account_name, description, opening_balance, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE chart_of_accounts SET
         account_name=$1, description=$2, opening_balance=$3, is_active=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [account_name, description || null, parseFloat(opening_balance || 0), is_active !== false, req.params.id]
    );
    if (!rows.length) return err(res, 'Account not found', 404);
    ok(res, { account: rows[0] });
  } catch (e) { logger.error('Finance account PUT', e); err(res, 'Server error', 500); }
});

// DELETE /api/finance/accounts/:id (soft)
router.delete('/accounts/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE chart_of_accounts SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Account not found', 404);
    ok(res, { id: rows[0].id });
  } catch (e) { logger.error('Finance account DELETE', e); err(res, 'Server error', 500); }
});

// GET /api/finance/accounts/:id/depreciation-config
router.get('/accounts/:id/depreciation-config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         coa.id, coa.account_code, coa.account_name,
         coa.useful_life_years,
         coa.accum_depr_account_id,
         coa.depr_expense_account_id,
         a.account_code  AS accum_depr_code,
         a.account_name  AS accum_depr_name,
         e.account_code  AS depr_expense_code,
         e.account_name  AS depr_expense_name
       FROM chart_of_accounts coa
       LEFT JOIN chart_of_accounts a ON a.id = coa.accum_depr_account_id
       LEFT JOIN chart_of_accounts e ON e.id = coa.depr_expense_account_id
       WHERE coa.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Account not found', 404);
    ok(res, { config: rows[0] });
  } catch (e) { logger.error('Depreciation config GET', e); err(res, 'Server error', 500); }
});

// PUT /api/finance/accounts/:id/depreciation-config
router.put('/accounts/:id/depreciation-config',
  authorize(FINANCE_ADMIN),
  body('useful_life_years').isInt({ min: 1, max: 50 }),
  body('accum_depr_account_id').isInt().optional({ nullable: true }),
  body('depr_expense_account_id').isInt().optional({ nullable: true }),
  async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    try {
      const { useful_life_years, accum_depr_account_id, depr_expense_account_id } = req.body;
      const { rows } = await pool.query(
        `UPDATE chart_of_accounts
         SET useful_life_years       = $1,
             accum_depr_account_id   = $2,
             depr_expense_account_id = $3,
             updated_at              = NOW()
         WHERE id = $4 AND account_category = 'ASSET'
         RETURNING id, account_code, account_name, useful_life_years,
                   accum_depr_account_id, depr_expense_account_id`,
        [useful_life_years, accum_depr_account_id || null, depr_expense_account_id || null, req.params.id]
      );
      if (!rows.length) return err(res, 'Account not found or not an asset account', 404);
      ok(res, { config: rows[0] });
    } catch (e) { logger.error('Depreciation config PUT', e); err(res, 'Server error', 500); }
  }
);

// ════════════════════════════════════════════════════════════════
// JOURNAL ENTRIES
// ════════════════════════════════════════════════════════════════

// GET /api/finance/journals
router.get('/journals', async (req, res) => {
  try {
    const { status, from, to, search, page = 1, limit = 30 } = req.query;
    const conds = ['1=1'];
    const params = [];
    let i = 1;

    const { source_module, center_id } = req.query;
    if (status)        { conds.push(`je.status = $${i++}`);             params.push(status); }
    if (from)          { conds.push(`je.entry_date >= $${i++}`);        params.push(from); }
    if (to)            { conds.push(`je.entry_date <= $${i++}`);        params.push(to); }
    if (source_module) { conds.push(`je.source_module = $${i++}`);      params.push(source_module); }
    if (center_id)     { conds.push(`je.center_id = $${i++}`);          params.push(parseInt(center_id)); }
    if (search) {
      conds.push(`(je.entry_number ILIKE $${i} OR je.description ILIKE $${i} OR je.source_ref ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await pool.query(
      `SELECT je.*, u.name as created_by_name, c.name as center_name
         FROM journal_entries je
         LEFT JOIN users u ON u.id = je.created_by
         LEFT JOIN centers c ON c.id = je.center_id
        WHERE ${conds.join(' AND ')}
        ORDER BY je.entry_date DESC, je.id DESC
        LIMIT $${i} OFFSET $${i+1}`,
      [...params, parseInt(limit), offset]
    );
    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM journal_entries je WHERE ${conds.join(' AND ')}`, params
    );
    ok(res, { journals: rows, total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { logger.error('Finance journals GET', e); err(res, 'Server error', 500); }
});

// GET /api/finance/journals/:id
router.get('/journals/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT je.*, u.name as created_by_name, c.name as center_name
         FROM journal_entries je
         LEFT JOIN users u ON u.id = je.created_by
         LEFT JOIN centers c ON c.id = je.center_id
        WHERE je.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Journal entry not found', 404);
    const { rows: lines } = await pool.query(
      `SELECT jel.*, a.account_code, a.account_name, a.account_category, a.normal_balance
         FROM journal_entry_lines jel
         JOIN chart_of_accounts a ON a.id = jel.account_id
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.id`,
      [req.params.id]
    );
    ok(res, { journal: rows[0], lines });
  } catch (e) { logger.error('Finance journal GET/:id', e); err(res, 'Server error', 500); }
});

// POST /api/finance/journals  — create with lines
router.post('/journals', authorize(FINANCE_WRITE), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      entry_date, description, reference_type, reference_id,
      center_id, notes, lines = [],
    } = req.body;

    if (!lines.length) throw new Error('At least one line item required');

    const totalDebit  = lines.reduce((s, l) => s + parseFloat(l.debit_amount  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      throw new Error(`Journal does not balance — Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`);

    const entryNumber = await nextJENumber();
    const { rows } = await client.query(
      `INSERT INTO journal_entries
        (entry_number,entry_date,description,reference_type,reference_id,
         total_debit,total_credit,center_id,created_by,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10) RETURNING *`,
      [entryNumber, entry_date || new Date().toLocaleDateString('en-CA'),
       description, reference_type || null, reference_id || null,
       totalDebit, totalCredit,
       center_id || null, req.user?.id || null, notes || null]
    );
    const je = rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines
          (journal_entry_id,account_id,debit_amount,credit_amount,description)
         VALUES ($1,$2,$3,$4,$5)`,
        [je.id, l.account_id, parseFloat(l.debit_amount || 0), parseFloat(l.credit_amount || 0), l.description || null]
      );
    }

    await client.query('COMMIT');
    logger.info('Journal entry created', { entry_number: entryNumber });
    ok(res, { journal: je });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Finance journal POST', e);
    err(res, e.message || 'Server error', 400);
  } finally { client.release(); }
});

// PUT /api/finance/journals/:id  — update DRAFT
router.put('/journals/:id', authorize(FINANCE_WRITE), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query(
      'SELECT * FROM journal_entries WHERE id=$1', [req.params.id]
    );
    if (!existing.length) return err(res, 'Not found', 404);
    if (existing[0].status !== 'DRAFT') return err(res, 'Only DRAFT entries can be edited');

    const { entry_date, description, center_id, notes, lines = [] } = req.body;
    const totalDebit  = lines.reduce((s, l) => s + parseFloat(l.debit_amount  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      throw new Error('Journal does not balance');

    await client.query(
      `UPDATE journal_entries SET entry_date=$1,description=$2,center_id=$3,
         total_debit=$4,total_credit=$5,notes=$6,updated_at=NOW() WHERE id=$7`,
      [entry_date, description, center_id || null, totalDebit, totalCredit, notes || null, req.params.id]
    );
    await client.query('DELETE FROM journal_entry_lines WHERE journal_entry_id=$1', [req.params.id]);
    for (const l of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines
          (journal_entry_id,account_id,debit_amount,credit_amount,description)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, l.account_id, parseFloat(l.debit_amount || 0), parseFloat(l.credit_amount || 0), l.description || null]
      );
    }
    await client.query('COMMIT');
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Finance journal PUT', e);
    err(res, e.message || 'Server error', 400);
  } finally { client.release(); }
});

// POST /api/finance/journals/:id/post
router.post('/journals/:id/post', authorize(FINANCE_ADMIN), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM journal_entries WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    if (rows[0].status !== 'DRAFT') return err(res, 'Only DRAFT entries can be posted');

    await client.query(
      `UPDATE journal_entries SET status='POSTED', posted_by=$1, posted_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [req.user?.id || null, req.params.id]
    );

    // Update account current_balance — direction depends on normal_balance
    // DEBIT-normal accounts: balance += debit - credit
    // CREDIT-normal accounts: balance += credit - debit
    const { rows: lines } = await client.query(
      'SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1', [req.params.id]
    );
    for (const l of lines) {
      await client.query(
        `UPDATE chart_of_accounts SET
           current_balance = current_balance +
             CASE WHEN normal_balance = 'DEBIT' THEN $1 - $2
                  ELSE $2 - $1 END,
           updated_at = NOW()
         WHERE id=$3`,
        [parseFloat(l.debit_amount), parseFloat(l.credit_amount), l.account_id]
      );
    }

    await client.query('COMMIT');
    logger.info('Journal posted', { id: req.params.id });
    ok(res, { id: parseInt(req.params.id), status: 'POSTED' });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Finance journal post', e); err(res, 'Server error', 500);
  } finally { client.release(); }
});

// POST /api/finance/journals/:id/reverse
router.post('/journals/:id/reverse', authorize(FINANCE_ADMIN), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT je.*, json_agg(jel ORDER BY jel.id) as lines
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.id=$1 GROUP BY je.id`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    const orig = rows[0];
    if (orig.status !== 'POSTED') return err(res, 'Only POSTED entries can be reversed');

    const entryNumber = await nextJENumber();
    const { rows: rev } = await client.query(
      `INSERT INTO journal_entries
        (entry_number,entry_date,description,reference_type,reference_id,
         total_debit,total_credit,center_id,created_by,status,notes,reversal_entry_id)
       VALUES ($1,NOW(),$2,$3,$4,$5,$6,$7,$8,'POSTED',$9,$10) RETURNING *`,
      [entryNumber, `REVERSAL of ${orig.entry_number}`,
       orig.reference_type, orig.reference_id,
       orig.total_credit, orig.total_debit,
       orig.center_id, req.user?.id || null,
       req.body.reason || null, orig.id]
    );
    const revJE = rev[0];

    for (const l of orig.lines) {
      await client.query(
        `INSERT INTO journal_entry_lines
          (journal_entry_id,account_id,debit_amount,credit_amount,description)
         VALUES ($1,$2,$3,$4,$5)`,
        [revJE.id, l.account_id, l.credit_amount, l.debit_amount, `Reversal: ${l.description || ''}`]
      );
      // Undo balance impact — mirror of post logic but with debit/credit swapped
      // DEBIT-normal: balance += original_credit - original_debit
      // CREDIT-normal: balance += original_debit - original_credit
      await client.query(
        `UPDATE chart_of_accounts SET
           current_balance = current_balance +
             CASE WHEN normal_balance = 'DEBIT' THEN $1 - $2
                  ELSE $2 - $1 END,
           updated_at = NOW()
         WHERE id=$3`,
        [parseFloat(l.credit_amount), parseFloat(l.debit_amount), l.account_id]
      );
    }

    await client.query(
      `UPDATE journal_entries SET status='REVERSED', reversed_by=$1, reversed_at=NOW() WHERE id=$2`,
      [req.user?.id || null, req.params.id]
    );

    await client.query('COMMIT');
    logger.info('Journal reversed', { original: req.params.id, reversal: revJE.id });
    ok(res, { journal: revJE });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Finance journal reverse', e); err(res, 'Server error', 500);
  } finally { client.release(); }
});

// ════════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════════

// GET /api/finance/reports/trial-balance?from=&to=&center_id=
router.get('/reports/trial-balance', async (req, res) => {
  try {
    const from     = req.query.from || new Date(new Date().getFullYear(), 3, 1).toLocaleDateString('en-CA');
    const to       = req.query.to   || new Date().toLocaleDateString('en-CA');
    const centerId = req.query.center_id ? parseInt(req.query.center_id) : null;
    const { rows } = await pool.query(
      `SELECT
          a.account_code, a.account_name, a.account_category, a.account_level,
          a.normal_balance, a.parent_account_id,
          a.opening_balance,
          COALESCE(SUM(jel.debit_amount), 0)  AS period_debit,
          COALESCE(SUM(jel.credit_amount), 0) AS period_credit,
          CASE WHEN a.normal_balance = 'debit'
               THEN a.opening_balance + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)
               ELSE a.opening_balance + COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
          END AS closing_balance
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
         AND ($3::int IS NULL OR jel.center_id = $3::int)
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.status = 'POSTED' AND je.entry_date BETWEEN $1 AND $2
       WHERE a.is_active = true
       GROUP BY a.id, a.account_code, a.account_name, a.account_category,
                a.account_level, a.normal_balance, a.parent_account_id, a.opening_balance
       HAVING a.opening_balance <> 0
           OR COALESCE(SUM(jel.debit_amount),0) <> 0
           OR COALESCE(SUM(jel.credit_amount),0) <> 0
       ORDER BY a.account_code`,
      [from, to, centerId]
    );
    ok(res, { rows, from, to, center_id: centerId });
  } catch (e) { logger.error('Trial balance', e); err(res, 'Server error', 500); }
});

// GET /api/finance/reports/profit-loss?from=&to=&center_id=
router.get('/reports/profit-loss', async (req, res) => {
  try {
    const from      = req.query.from || new Date(new Date().getFullYear(), 3, 1).toLocaleDateString('en-CA');
    const to        = req.query.to   || new Date().toLocaleDateString('en-CA');
    const centerId  = req.query.center_id ? parseInt(req.query.center_id) : null;
    const { rows } = await pool.query(
      `SELECT
          a.account_code, a.account_name, a.account_category,
          a.account_level, a.parent_account_id, a.normal_balance,
          COALESCE(SUM(jel.debit_amount),0)  AS total_debit,
          COALESCE(SUM(jel.credit_amount),0) AS total_credit,
          CASE WHEN a.normal_balance = 'credit'
               THEN COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
               ELSE COALESCE(SUM(jel.debit_amount),0)  - COALESCE(SUM(jel.credit_amount),0)
          END AS net_amount
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
         AND ($3::int IS NULL OR jel.center_id = $3::int)
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.status = 'POSTED' AND je.entry_date BETWEEN $1 AND $2
       WHERE a.is_active = true AND a.account_type = 'INCOME_STATEMENT'
       GROUP BY a.id, a.account_code, a.account_name, a.account_category,
                a.account_level, a.parent_account_id, a.normal_balance
       ORDER BY a.account_code`,
      [from, to, centerId]
    );
    ok(res, { rows, from, to, center_id: centerId });
  } catch (e) { logger.error('P&L report', e); err(res, 'Server error', 500); }
});

// GET /api/finance/reports/balance-sheet?as_of=
router.get('/reports/balance-sheet', async (req, res) => {
  try {
    const asOf     = req.query.as_of || new Date().toLocaleDateString('en-CA');
    const centerId = req.query.center_id ? parseInt(req.query.center_id) : null;
    // Note: opening_balance on chart_of_accounts is entity-level.
    // When filtering by center, movements are center-scoped but opening balances remain consolidated.
    const { rows } = await pool.query(
      `SELECT
          a.account_code, a.account_name, a.account_category,
          a.account_level, a.parent_account_id, a.normal_balance,
          a.opening_balance,
          COALESCE(SUM(jel.debit_amount),0)  AS total_debit,
          COALESCE(SUM(jel.credit_amount),0) AS total_credit,
          CASE WHEN a.normal_balance = 'debit'
               THEN a.opening_balance + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)
               ELSE a.opening_balance + COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
          END AS balance
       FROM chart_of_accounts a
       LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
         AND ($2::int IS NULL OR jel.center_id = $2::int)
       LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
         AND je.status = 'POSTED' AND je.entry_date <= $1
       WHERE a.is_active = true AND a.account_type = 'BALANCE_SHEET'
       GROUP BY a.id, a.account_code, a.account_name, a.account_category,
                a.account_level, a.parent_account_id, a.normal_balance, a.opening_balance
       ORDER BY a.account_code`,
      [asOf, centerId]
    );
    ok(res, { rows, as_of: asOf, center_id: centerId });
  } catch (e) { logger.error('Balance sheet', e); err(res, 'Server error', 500); }
});

// GET /api/finance/summary  — dashboard KPIs
router.get('/summary', async (req, res) => {
  try {
    const from     = req.query.from || new Date(new Date().getFullYear(), 3, 1).toLocaleDateString('en-CA');
    const to       = req.query.to   || new Date().toLocaleDateString('en-CA');
    const centerId = req.query.center_id ? parseInt(req.query.center_id) : null;

    const { rows } = await pool.query(
      `SELECT
        SUM(CASE WHEN a.account_category = 'REVENUE' AND a.normal_balance='credit'
                 THEN jel.credit_amount - jel.debit_amount ELSE 0 END) AS total_revenue,
        SUM(CASE WHEN a.account_category IN ('COGS','EXPENSE') AND a.normal_balance='debit'
                 THEN jel.debit_amount - jel.credit_amount ELSE 0 END) AS total_expense,
        SUM(CASE WHEN a.account_category = 'ASSET' AND a.account_code LIKE '112%'
                 THEN CASE WHEN a.normal_balance='debit'
                           THEN jel.debit_amount - jel.credit_amount
                           ELSE jel.credit_amount - jel.debit_amount END
                 ELSE 0 END) AS ar_balance,
        SUM(CASE WHEN a.account_category = 'LIABILITY' AND a.account_code LIKE '211%'
                 THEN CASE WHEN a.normal_balance='credit'
                           THEN jel.credit_amount - jel.debit_amount
                           ELSE jel.debit_amount - jel.credit_amount END
                 ELSE 0 END) AS ap_balance
       FROM journal_entry_lines jel
       JOIN chart_of_accounts a ON a.id = jel.account_id
       JOIN journal_entries je ON je.id = jel.journal_entry_id
        AND je.status = 'POSTED' AND je.entry_date BETWEEN $1 AND $2
        AND ($3::int IS NULL OR jel.center_id = $3::int OR je.center_id = $3::int)`,
      [from, to, centerId]
    );

    // Cash balance is entity-wide (chart_of_accounts has no center dimension)
    const { rows: cash } = await pool.query(
      `SELECT COALESCE(SUM(current_balance),0) AS cash_balance
         FROM chart_of_accounts WHERE account_code LIKE '111%' AND is_active=true`
    );

    const { rows: jeCounts } = await pool.query(
      `SELECT je.status, COUNT(*) as cnt FROM journal_entries je
        WHERE je.entry_date BETWEEN $1 AND $2
          AND ($3::int IS NULL OR je.center_id = $3::int
               OR EXISTS (SELECT 1 FROM journal_entry_lines jel2
                          WHERE jel2.journal_entry_id = je.id AND jel2.center_id = $3::int))
        GROUP BY je.status`, [from, to, centerId]
    );

    const kpi = rows[0] || {};
    const jeByStatus = {};
    jeCounts.forEach(r => { jeByStatus[r.status] = parseInt(r.cnt); });

    ok(res, {
      total_revenue: parseFloat(kpi.total_revenue || 0),
      total_expense: parseFloat(kpi.total_expense || 0),
      net_profit:    parseFloat(kpi.total_revenue || 0) - parseFloat(kpi.total_expense || 0),
      ar_balance:    parseFloat(kpi.ar_balance || 0),
      ap_balance:    parseFloat(kpi.ap_balance || 0),
      cash_balance:  parseFloat(cash[0]?.cash_balance || 0),
      journals:      jeByStatus,
      period:        { from, to },
      center_id:     centerId,
    });
  } catch (e) { logger.error('Finance summary', e); err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// ACCOUNT MAPPINGS (Finance Integration Rules Engine)
// ════════════════════════════════════════════════════════════════

// GET /api/finance/mappings
router.get('/mappings', async (req, res) => {
  try {
    const mappings = await financeService.getMappings();
    ok(res, { mappings });
  } catch (e) { logger.error('GET mappings', e); err(res, 'Server error', 500); }
});

// PUT /api/finance/mappings/:id
router.put('/mappings/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { debit_account_id, credit_account_id, description, is_active } = req.body;
    const updated = await financeService.updateMapping(req.params.id, {
      debitAccountId:  debit_account_id,
      creditAccountId: credit_account_id,
      description,
      isActive: is_active,
    });
    if (!updated) return err(res, 'Mapping not found', 404);
    ok(res, { mapping: updated });
  } catch (e) { logger.error('PUT mapping', e); err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// EXPENSES (proxy to expense_records for Finance module view)
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// AP AGING
// ════════════════════════════════════════════════════════════════

// GET /api/finance/reports/ap-aging
router.get('/reports/ap-aging', async (req, res) => {
  try {
    const asOf = req.query.as_of || new Date().toLocaleDateString('en-CA');

    // AP Aging: vendor bills + radiologist/teleradiology payables
    const { rows } = await pool.query(
      `SELECT vendor_name, vendor_code, vendor_type,
              COUNT(*)          AS bill_count,
              SUM(balance)      AS total_outstanding,
              SUM(CASE WHEN age_days <= 30              THEN balance ELSE 0 END) AS bucket_0_30,
              SUM(CASE WHEN age_days BETWEEN 31 AND 60  THEN balance ELSE 0 END) AS bucket_31_60,
              SUM(CASE WHEN age_days BETWEEN 61 AND 90  THEN balance ELSE 0 END) AS bucket_61_90,
              SUM(CASE WHEN age_days > 90               THEN balance ELSE 0 END) AS bucket_over_90,
              MIN(doc_date)     AS oldest_bill_date
       FROM (
         -- Vendor bills
         SELECT
           COALESCE(vm.vendor_name, vb.vendor_name_text, vb.vendor_code) AS vendor_name,
           COALESCE(vm.vendor_code, vb.vendor_code, vb.vendor_name_text) AS vendor_code,
           COALESCE(vm.vendor_type, 'SUPPLIER')                          AS vendor_type,
           vb.bill_date                                                   AS doc_date,
           ($1::date - vb.bill_date)                                      AS age_days,
           vb.total_amount - COALESCE(
             (SELECT SUM(p.amount_paid) FROM vendor_payments p
              WHERE p.bill_id = vb.id AND p.active = true), 0)            AS balance
         FROM vendor_bills vb
         LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code
         WHERE vb.active = true
           AND vb.payment_status IN ('PENDING','PARTIAL')
           AND vb.bill_status = 'APPROVED'
           AND vb.bill_date <= $1::date

         UNION ALL

         -- Radiologist / Teleradiology payables (aged from due date = created_at + credit_days)
         SELECT
           rm.radiologist_name                                                      AS vendor_name,
           rm.radiologist_code                                                      AS vendor_code,
           rm.reporter_type                                                         AS vendor_type,
           (p.created_at::date + COALESCE(rm.credit_days, 30))                     AS doc_date,
           ($1::date - (p.created_at::date + COALESCE(rm.credit_days, 30)))        AS age_days,
           p.balance_amount                                                         AS balance
         FROM payables p
         JOIN radiologist_master rm ON rm.id = p.reporter_id
         WHERE p.active = true
           AND p.status IN ('PENDING','PARTIAL')
           AND p.created_at::date <= $1::date
           AND p.balance_amount > 0
       ) src
       GROUP BY vendor_name, vendor_code, vendor_type
       HAVING SUM(balance) > 0
       ORDER BY total_outstanding DESC`,
      [asOf]
    );

    const mapped = rows.map(r => ({
      ...r,
      current:           parseFloat(r.bucket_0_30    || 0),
      days_31_60:        parseFloat(r.bucket_31_60   || 0),
      days_61_90:        parseFloat(r.bucket_61_90   || 0),
      days_90_plus:      parseFloat(r.bucket_over_90 || 0),
      total_outstanding: parseFloat(r.total_outstanding || 0),
    }));
    const ZERO = { current: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total_outstanding: 0 };
    const total = mapped.reduce((acc, r) => ({
      current:           acc.current           + r.current,
      days_31_60:        acc.days_31_60        + r.days_31_60,
      days_61_90:        acc.days_61_90        + r.days_61_90,
      days_90_plus:      acc.days_90_plus      + r.days_90_plus,
      total_outstanding: acc.total_outstanding + r.total_outstanding,
    }), ZERO);
    ok(res, { rows: mapped, total, as_of: asOf });
  } catch (e) { logger.error('AP Aging', e); err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// GST RECONCILIATION
// ════════════════════════════════════════════════════════════════

// GET /api/finance/reports/gst-reconciliation?from=&to=&center_id=
router.get('/reports/gst-reconciliation', async (req, res) => {
  try {
    const from      = req.query.from || new Date(new Date().getFullYear(), 3, 1).toLocaleDateString('en-CA');
    const to        = req.query.to   || new Date().toLocaleDateString('en-CA');
    const centerId  = req.query.center_id ? parseInt(req.query.center_id) : null;
    const cFilterPB = centerId ? `AND pb.center_id = ${centerId}` : '';

    // ── 1. Output Tax Summary (from patient_bills) ────────────────────────
    // Note: Healthcare services are largely GST-exempt in India (SAC 999311).
    // We report all invoices showing taxable vs exempt split.
    const { rows: outRows } = await pool.query(
      `SELECT
         COUNT(*)                                                                            AS invoice_count,
         COALESCE(SUM(pb.subtotal),       0)                                                AS gross_value,
         COALESCE(SUM(CASE WHEN pb.gst_applicable THEN pb.taxable_amount ELSE 0 END), 0)   AS taxable_amount,
         COALESCE(SUM(CASE WHEN NOT pb.gst_applicable THEN pb.subtotal ELSE 0 END), 0)     AS exempt_amount,
         COALESCE(SUM(pb.cgst_amount),    0)                                                AS cgst_amount,
         COALESCE(SUM(pb.sgst_amount),    0)                                                AS sgst_amount,
         COALESCE(SUM(pb.igst_amount),    0)                                                AS igst_amount,
         COALESCE(SUM(pb.total_gst),      0)                                                AS total_output_gst,
         0                                                                                   AS cess_amount,
         0                                                                                   AS zero_rated_amount
       FROM patient_bills pb
       WHERE pb.active = true
         AND pb.payment_status NOT IN ('CANCELLED')
         AND pb.bill_date BETWEEN $1 AND $2
         ${cFilterPB}`,
      [from, to]
    );
    const output = outRows[0] || {};

    // ── 2. Rate-wise breakup (grouped by effective GST rate) ─────────────
    const { rows: rateBreakup } = await pool.query(
      `SELECT
         CASE
           WHEN (pb.cgst_rate + pb.sgst_rate + pb.igst_rate) = 0      THEN 'Exempt / Nil (0%)'
           WHEN (pb.cgst_rate + pb.sgst_rate + pb.igst_rate) <= 5.01   THEN '5% (CGST 2.5% + SGST 2.5%)'
           WHEN (pb.cgst_rate + pb.sgst_rate + pb.igst_rate) <= 12.01  THEN '12% (CGST 6% + SGST 6%)'
           WHEN (pb.cgst_rate + pb.sgst_rate + pb.igst_rate) <= 18.01  THEN '18% (CGST 9% + SGST 9%)'
           WHEN (pb.cgst_rate + pb.sgst_rate + pb.igst_rate) <= 28.01  THEN '28% (CGST 14% + SGST 14%)'
           ELSE CONCAT(ROUND((pb.cgst_rate + pb.sgst_rate + pb.igst_rate)::numeric, 0)::text, '%')
         END                                                               AS gst_slab,
         (pb.cgst_rate + pb.sgst_rate + pb.igst_rate)                    AS rate_pct,
         COUNT(*)                                                          AS invoice_count,
         COALESCE(SUM(pb.taxable_amount), 0)                              AS taxable_amount,
         COALESCE(SUM(pb.cgst_amount),    0)                              AS cgst_amount,
         COALESCE(SUM(pb.sgst_amount),    0)                              AS sgst_amount,
         COALESCE(SUM(pb.igst_amount),    0)                              AS igst_amount,
         COALESCE(SUM(pb.total_gst),      0)                              AS total_gst
       FROM patient_bills pb
       WHERE pb.active = true
         AND pb.payment_status NOT IN ('CANCELLED')
         AND pb.bill_date BETWEEN $1 AND $2
         ${cFilterPB}
       GROUP BY (pb.cgst_rate + pb.sgst_rate + pb.igst_rate)
       ORDER BY rate_pct`,
      [from, to]
    );

    // ── 3. Input Tax Credit (ITC) from vendor bills ───────────────────────
    const vcFilter = centerId ? `AND center_id = ${centerId}` : '';
    const { rows: itcRows } = await pool.query(
      `SELECT
         COUNT(*)                                                          AS bill_count,
         COALESCE(SUM(cgst_amount), 0)                                    AS cgst_itc,
         COALESCE(SUM(sgst_amount), 0)                                    AS sgst_itc,
         COALESCE(SUM(igst_amount), 0)                                    AS igst_itc,
         COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)        AS total_itc,
         COALESCE(SUM(subtotal),    0)                                    AS purchase_value
       FROM vendor_bills
       WHERE active = true
         AND bill_status IN ('APPROVED', 'SUBMITTED')
         AND bill_date BETWEEN $1 AND $2
         ${vcFilter}`,
      [from, to]
    );
    const itc = itcRows[0] || {};

    // ── 4. Monthly output GST trend ───────────────────────────────────────
    const { rows: monthly } = await pool.query(
      `SELECT
         TO_CHAR(pb.bill_date, 'Mon YYYY')                                AS month,
         DATE_TRUNC('month', pb.bill_date)                                AS month_date,
         COUNT(*)                                                          AS invoices,
         COALESCE(SUM(pb.taxable_amount), 0)                              AS taxable,
         COALESCE(SUM(pb.cgst_amount),    0)                              AS cgst,
         COALESCE(SUM(pb.sgst_amount),    0)                              AS sgst,
         COALESCE(SUM(pb.igst_amount),    0)                              AS igst,
         COALESCE(SUM(pb.total_gst),      0)                              AS total_gst
       FROM patient_bills pb
       WHERE pb.active = true
         AND pb.payment_status NOT IN ('CANCELLED')
         AND pb.bill_date BETWEEN $1 AND $2
         ${cFilterPB}
       GROUP BY DATE_TRUNC('month', pb.bill_date), TO_CHAR(pb.bill_date, 'Mon YYYY')
       ORDER BY month_date`,
      [from, to]
    );

    // ── 5. Vendor-wise ITC breakdown ──────────────────────────────────────
    const { rows: itcByVendor } = await pool.query(
      `SELECT
         COALESCE(vendor_name_text, vendor_code)                           AS vendor_name,
         COUNT(*)                                                          AS bill_count,
         COALESCE(SUM(subtotal),    0)                                    AS purchase_value,
         COALESCE(SUM(cgst_amount), 0)                                    AS cgst_itc,
         COALESCE(SUM(sgst_amount), 0)                                    AS sgst_itc,
         COALESCE(SUM(igst_amount), 0)                                    AS igst_itc,
         COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)        AS total_itc
       FROM vendor_bills
       WHERE active = true
         AND bill_status IN ('APPROVED', 'SUBMITTED')
         AND bill_date BETWEEN $1 AND $2
         ${vcFilter}
       GROUP BY vendor_name_text, vendor_code
       ORDER BY total_itc DESC`,
      [from, to]
    );

    // ── 6. Net GST payable (head-wise) ────────────────────────────────────
    const netCGST = parseFloat(output.cgst_amount || 0) - parseFloat(itc.cgst_itc || 0);
    const netSGST = parseFloat(output.sgst_amount || 0) - parseFloat(itc.sgst_itc || 0);
    const netIGST = parseFloat(output.igst_amount || 0) - parseFloat(itc.igst_itc || 0);

    ok(res, {
      period: { from, to },
      output,
      itc,
      itc_by_vendor: itcByVendor,
      rate_breakup: rateBreakup,
      monthly,
      net: {
        cgst: netCGST,
        sgst: netSGST,
        igst: netIGST,
        total: netCGST + netSGST + netIGST,
      },
    });
  } catch (e) { logger.error('GST reconciliation', e); err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// BANK RECONCILIATION
// ════════════════════════════════════════════════════════════════

// GET /api/finance/bank-accounts
router.get('/bank-accounts', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const { rows } = await pool.query(
      `SELECT ba.*, c.name AS center_name
         FROM bank_accounts ba
         LEFT JOIN centers c ON c.id = ba.center_id
        WHERE ${all ? '1=1' : 'ba.active = true'}
        ORDER BY ba.account_name`
    );
    ok(res, { accounts: rows });
  } catch (e) { err(res, 'Server error', 500); }
});

// POST /api/finance/bank-accounts
router.post('/bank-accounts', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { account_name, account_number, bank_name, branch_name, ifsc_code,
            account_type = 'CURRENT', center_id, opening_balance = 0, notes } = req.body;
    if (!account_name || !account_number || !bank_name || !branch_name || !ifsc_code)
      return err(res, 'account_name, account_number, bank_name, branch_name, ifsc_code required');
    const { rows } = await pool.query(
      `INSERT INTO bank_accounts (account_name, account_number, bank_name, branch_name, ifsc_code,
         account_type, center_id, opening_balance, current_balance, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`,
      [account_name, account_number, bank_name, branch_name, ifsc_code,
       account_type, center_id || null, parseFloat(opening_balance), notes || null]
    );
    ok(res, { account: rows[0] });
  } catch (e) {
    if (e.code === '23505') return err(res, 'Account number already exists', 409);
    err(res, 'Server error', 500);
  }
});

// PUT /api/finance/bank-accounts/:id
router.put('/bank-accounts/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { account_name, bank_name, branch_name, ifsc_code,
            account_type, center_id, notes, active, gl_account_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE bank_accounts
          SET account_name=$1, bank_name=$2, branch_name=$3, ifsc_code=$4,
              account_type=$5, center_id=$6, notes=$7,
              active=COALESCE($8, active), gl_account_id=$9, updated_at=NOW()
        WHERE id=$10 RETURNING *`,
      [account_name, bank_name, branch_name, ifsc_code,
       account_type, center_id || null, notes || null,
       active !== undefined ? active : null,
       gl_account_id || null, req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { account: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// DELETE /api/finance/bank-accounts/:id  (soft delete)
router.delete('/bank-accounts/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE bank_accounts SET active=false, updated_at=NOW() WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) { err(res, 'Server error', 500); }
});

// ── Company Cards ────────────────────────────────────────────────────────────

// GET /api/finance/company-cards
router.get('/company-cards', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const { rows } = await pool.query(
      `SELECT cc.*, c.name AS center_name
         FROM company_cards cc
         LEFT JOIN centers c ON c.id = cc.center_id
        WHERE ${all ? '1=1' : 'cc.active = true'}
        ORDER BY cc.card_name`
    );
    ok(res, { cards: rows });
  } catch (e) { err(res, 'Server error', 500); }
});

// POST /api/finance/company-cards
router.post('/company-cards', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { card_name, last_four, card_type = 'CREDIT', network = 'VISA',
            bank_name, expiry_month, expiry_year, credit_limit = 0,
            center_id, cardholder_name, notes } = req.body;
    if (!card_name || !last_four || !bank_name || !expiry_month || !expiry_year)
      return err(res, 'card_name, last_four, bank_name, expiry_month, expiry_year required');
    if (!/^\d{4}$/.test(last_four)) return err(res, 'last_four must be exactly 4 digits');
    const { rows } = await pool.query(
      `INSERT INTO company_cards
         (card_name, last_four, card_type, network, bank_name, expiry_month, expiry_year,
          credit_limit, center_id, cardholder_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [card_name, last_four, card_type, network, bank_name,
       parseInt(expiry_month), parseInt(expiry_year), parseFloat(credit_limit),
       center_id || null, cardholder_name || null, notes || null]
    );
    ok(res, { card: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// PUT /api/finance/company-cards/:id
router.put('/company-cards/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { card_name, card_type, network, bank_name, expiry_month, expiry_year,
            credit_limit, center_id, cardholder_name, notes, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE company_cards
          SET card_name=$1, card_type=$2, network=$3, bank_name=$4,
              expiry_month=$5, expiry_year=$6, credit_limit=$7, center_id=$8,
              cardholder_name=$9, notes=$10,
              active=COALESCE($11, active), updated_at=NOW()
        WHERE id=$12 RETURNING *`,
      [card_name, card_type, network, bank_name,
       parseInt(expiry_month), parseInt(expiry_year), parseFloat(credit_limit || 0),
       center_id || null, cardholder_name || null, notes || null,
       active !== undefined ? active : null, req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { card: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// DELETE /api/finance/company-cards/:id  (soft delete)
router.delete('/company-cards/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE company_cards SET active=false, updated_at=NOW() WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) { err(res, 'Server error', 500); }
});

// GET /api/finance/bank-statement?bank_account_id=&from=&to=
router.get('/bank-statement', async (req, res) => {
  try {
    const { bank_account_id, from, to } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (bank_account_id) { conds.push(`bsl.bank_account_id = $${params.length+1}`); params.push(bank_account_id); }
    if (from) { conds.push(`bsl.transaction_date >= $${params.length+1}`); params.push(from); }
    if (to)   { conds.push(`bsl.transaction_date <= $${params.length+1}`); params.push(to); }

    const { rows } = await pool.query(
      `SELECT bsl.*, ba.account_name AS bank_account_name, ba.bank_name,
              je.entry_number AS matched_je_number
         FROM bank_statement_lines bsl
         JOIN bank_accounts ba ON ba.id = bsl.bank_account_id
         LEFT JOIN journal_entries je ON je.id = bsl.je_id
        WHERE ${conds.join(' AND ')}
        ORDER BY bsl.transaction_date DESC, bsl.id DESC`,
      params
    );
    ok(res, { lines: rows });
  } catch (e) { err(res, 'Server error', 500); }
});

// POST /api/finance/bank-statement  — add statement line
router.post('/bank-statement', authorize(FINANCE_WRITE), async (req, res) => {
  try {
    const { bank_account_id, transaction_date, value_date, description,
            cheque_number, debit_amount = 0, credit_amount = 0, notes } = req.body;
    if (!bank_account_id || !transaction_date) return err(res, 'bank_account_id and transaction_date required');

    const { rows } = await pool.query(
      `INSERT INTO bank_statement_lines
         (bank_account_id, transaction_date, value_date, description, cheque_number,
          debit_amount, credit_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [bank_account_id, transaction_date, value_date || null, description, cheque_number || null,
       parseFloat(debit_amount), parseFloat(credit_amount), notes || null, req.user?.id]
    );
    ok(res, { line: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// PUT /api/finance/bank-statement/:id/reconcile  — match to JE
router.put('/bank-statement/:id/reconcile', authorize(FINANCE_WRITE), async (req, res) => {
  try {
    const { je_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE bank_statement_lines
          SET is_reconciled=true, je_id=$1, reconciled_by=$2, reconciled_at=NOW(), updated_at=NOW()
        WHERE id=$3 RETURNING *`,
      [je_id || null, req.user?.id, req.params.id]
    );
    if (!rows.length) return err(res, 'Line not found', 404);
    ok(res, { line: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// PUT /api/finance/bank-statement/:id/unmatch
router.put('/bank-statement/:id/unmatch', authorize(FINANCE_WRITE), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE bank_statement_lines
          SET is_reconciled=false, je_id=NULL, reconciled_by=NULL, reconciled_at=NULL, updated_at=NOW()
        WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'Line not found', 404);
    ok(res, { line: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

// DELETE /api/finance/bank-statement/:id
router.delete('/bank-statement/:id', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    await pool.query('DELETE FROM bank_statement_lines WHERE id=$1 AND is_reconciled=false', [req.params.id]);
    ok(res, { id: parseInt(req.params.id) });
  } catch (e) { err(res, 'Server error', 500); }
});

// GET /api/finance/bank-reconciliation-summary?bank_account_id=X&as_of=YYYY-MM-DD
router.get('/bank-reconciliation-summary', async (req, res) => {
  try {
    const { bank_account_id, as_of } = req.query;
    if (!bank_account_id) return err(res, 'bank_account_id required');
    const asOf = as_of || new Date().toLocaleDateString('en-CA');

    const { rows: [ba] } = await pool.query(
      `SELECT ba.*, c.name AS center_name, coa.account_name AS gl_account_name
         FROM bank_accounts ba
         LEFT JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         LEFT JOIN centers c ON c.id = ba.center_id
        WHERE ba.id = $1`, [bank_account_id]
    );
    if (!ba) return err(res, 'Bank account not found', 404);

    // Statement totals up to as_of
    const { rows: [stmt] } = await pool.query(
      `SELECT
         COALESCE(SUM(credit_amount), 0)                                             AS total_credits,
         COALESCE(SUM(debit_amount),  0)                                             AS total_debits,
         COUNT(*)                                                                     AS total_lines,
         COALESCE(SUM(CASE WHEN NOT is_reconciled THEN credit_amount ELSE 0 END), 0) AS unrecon_credits,
         COALESCE(SUM(CASE WHEN NOT is_reconciled THEN debit_amount  ELSE 0 END), 0) AS unrecon_debits,
         COUNT(CASE WHEN NOT is_reconciled THEN 1 END)                               AS unrecon_count
       FROM bank_statement_lines
       WHERE bank_account_id = $1 AND transaction_date <= $2`,
      [bank_account_id, asOf]
    );

    const statementBalance = parseFloat(ba.opening_balance || 0)
      + parseFloat(stmt.total_credits)
      - parseFloat(stmt.total_debits);

    // GL book balance (asset account: debits increase, credits decrease)
    let glBalance = null;
    if (ba.gl_account_id) {
      const { rows: [gl] } = await pool.query(
        `SELECT
           COALESCE(SUM(jel.debit_amount),  0) AS total_debits,
           COALESCE(SUM(jel.credit_amount), 0) AS total_credits
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         WHERE jel.account_id = $1
           AND je.entry_date  <= $2
           AND je.status IN ('POSTED','APPROVED')`,
        [ba.gl_account_id, asOf]
      );
      glBalance = parseFloat(gl.total_debits) - parseFloat(gl.total_credits);
    }

    ok(res, {
      bank_account_id:   parseInt(ba.id),
      bank_account_name: ba.account_name,
      bank_name:         ba.bank_name,
      gl_account_id:     ba.gl_account_id,
      gl_account_name:   ba.gl_account_name || null,
      as_of:             asOf,
      opening_balance:   parseFloat(ba.opening_balance || 0),
      statement_credits: parseFloat(stmt.total_credits),
      statement_debits:  parseFloat(stmt.total_debits),
      statement_balance: statementBalance,
      gl_balance:        glBalance,
      difference:        glBalance !== null ? parseFloat((glBalance - statementBalance).toFixed(2)) : null,
      unreconciled_credits: parseFloat(stmt.unrecon_credits),
      unreconciled_debits:  parseFloat(stmt.unrecon_debits),
      unreconciled_count:   parseInt(stmt.unrecon_count),
      total_lines:          parseInt(stmt.total_lines),
    });
  } catch (e) { console.error(e); err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// ASSET DEPRECIATION
// ════════════════════════════════════════════════════════════════

// GET /api/finance/depreciation/assets  — assets with depreciation info
router.get('/depreciation/assets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         am.*,
         v.vendor_name,
         COALESCE(am.accumulated_depreciation, 0) AS accumulated_depreciation,
         am.purchase_cost - COALESCE(am.accumulated_depreciation, 0) AS net_book_value,
         CASE WHEN am.depreciation_rate > 0
              THEN ROUND((am.purchase_cost * am.depreciation_rate / 12), 2)
              ELSE 0
         END AS monthly_depreciation,
         (SELECT COUNT(*) FROM asset_depreciation_runs WHERE asset_id = am.id) AS runs_count,
         (SELECT MAX(period_year * 100 + period_month) FROM asset_depreciation_runs WHERE asset_id = am.id) AS last_run_period
       FROM asset_master am
       LEFT JOIN asset_vendors v ON v.id = am.vendor_id
       WHERE am.active = true AND am.status = 'ACTIVE'
         AND am.depreciation_rate > 0
       ORDER BY am.asset_code`,
      []
    );
    ok(res, { assets: rows });
  } catch (e) { logger.error('Depreciation assets', e); err(res, 'Server error', 500); }
});

// POST /api/finance/depreciation/run  — run depreciation for a month
router.post('/depreciation/run', authorize(FINANCE_ADMIN), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { period_year, period_month, asset_ids } = req.body;
    if (!period_year || !period_month) return err(res, 'period_year and period_month required');

    // Get assets to depreciate
    let assetQuery = `SELECT * FROM asset_master WHERE active=true AND status='ACTIVE' AND depreciation_rate > 0`;
    const params = [];
    if (asset_ids?.length) {
      params.push(asset_ids);
      assetQuery += ` AND id = ANY($1)`;
    }
    const { rows: assets } = await client.query(assetQuery, params);

    // Filter out already-run assets
    const { rows: alreadyRun } = await client.query(
      `SELECT asset_id FROM asset_depreciation_runs WHERE period_year=$1 AND period_month=$2`,
      [period_year, period_month]
    );
    const runSet = new Set(alreadyRun.map(r => r.asset_id));
    const toProcess = assets.filter(a => !runSet.has(a.id));

    if (!toProcess.length) {
      await client.query('ROLLBACK');
      return ok(res, { posted: 0, message: 'All assets already depreciated for this period' });
    }

    // Get depreciation expense account (5xxx series or use default)
    const { rows: deprExpAcc } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '5200' AND is_active=true LIMIT 1`
    );
    const { rows: accumDeprAcc } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1291' AND is_active=true LIMIT 1`
    );

    // Get or find expense account
    const { rows: expAccounts } = await client.query(
      `SELECT id, account_code, account_name FROM chart_of_accounts
        WHERE account_category = 'EXPENSE' AND is_active=true AND account_level >= 3
        ORDER BY account_code LIMIT 10`
    );
    const deprExpId  = deprExpAcc[0]?.id || expAccounts.find(a => a.account_name.toLowerCase().includes('depreciation'))?.id || expAccounts[0]?.id;
    const accumDeprId = accumDeprAcc[0]?.id;

    if (!deprExpId || !accumDeprId) {
      await client.query('ROLLBACK');
      return err(res, 'Depreciation expense or accumulated depreciation account not found in Chart of Accounts');
    }

    let posted = 0;
    const results = [];

    for (const asset of toProcess) {
      const monthlyDepr = Math.round(parseFloat(asset.purchase_cost) * parseFloat(asset.depreciation_rate) / 12 * 100) / 100;
      if (monthlyDepr <= 0) continue;

      // Post JE — reuse nextJENumber() to avoid the year-format CAST error
      const entryNumber = await nextJENumber();
      const periodLabel = `${period_year}-${String(period_month).padStart(2,'0')}`;

      const { rows: jeRows } = await client.query(
        `INSERT INTO journal_entries
           (entry_number, entry_date, description, total_debit, total_credit,
            status, source_module, source_ref, is_auto_posted, created_by)
         VALUES ($1, $2, $3, $4, $4, 'POSTED', 'DEPRECIATION', $5, true, $6) RETURNING id`,
        [entryNumber,
         new Date(period_year, period_month - 1, 1).toLocaleDateString('en-CA'),
         `Depreciation – ${asset.asset_name} (${asset.asset_code}) ${periodLabel}`,
         monthlyDepr,
         `${asset.asset_code}/${periodLabel}`,
         req.user?.id]
      );
      const jeId = jeRows[0].id;

      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
         VALUES ($1,$2,$3,0,$4), ($1,$5,0,$3,$4)`,
        [jeId, deprExpId, monthlyDepr,
         `Depreciation ${asset.asset_name} ${periodLabel}`, accumDeprId]
      );

      // Update account balances
      await client.query(`UPDATE chart_of_accounts SET current_balance = current_balance + $1 WHERE id=$2`, [monthlyDepr, deprExpId]);
      await client.query(`UPDATE chart_of_accounts SET current_balance = current_balance + $1 WHERE id=$2`, [monthlyDepr, accumDeprId]);

      // Update asset accumulated_depreciation
      await client.query(
        `UPDATE asset_master SET accumulated_depreciation = COALESCE(accumulated_depreciation,0) + $1 WHERE id=$2`,
        [monthlyDepr, asset.id]
      );

      // Record the run
      await client.query(
        `INSERT INTO asset_depreciation_runs (asset_id, period_year, period_month, depreciation_amount, journal_entry_id, run_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [asset.id, period_year, period_month, monthlyDepr, jeId, req.user?.id]
      );

      results.push({ asset_id: asset.id, asset_name: asset.asset_name, amount: monthlyDepr, je: entryNumber });
      posted++;
    }

    await client.query('COMMIT');
    logger.info(`Depreciation run: ${posted} assets for ${period_year}-${period_month}`);
    ok(res, { posted, results, period: `${period_year}-${String(period_month).padStart(2,'0')}` });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Depreciation run', e); err(res, e.message || 'Server error', 500);
  } finally { client.release(); }
});

// GET /api/finance/depreciation/history?asset_id=
router.get('/depreciation/history', async (req, res) => {
  try {
    const { asset_id } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (asset_id) { conds.push(`dr.asset_id = $${params.length+1}`); params.push(asset_id); }

    const { rows } = await pool.query(
      `SELECT dr.*, am.asset_name, am.asset_code, je.entry_number AS je_number,
              u.name AS run_by_name
         FROM asset_depreciation_runs dr
         JOIN asset_master am ON am.id = dr.asset_id
         LEFT JOIN journal_entries je ON je.id = dr.journal_entry_id
         LEFT JOIN users u ON u.id = dr.run_by
        WHERE ${conds.join(' AND ')}
        ORDER BY dr.period_year DESC, dr.period_month DESC`,
      params
    );
    ok(res, { history: rows });
  } catch (e) { err(res, 'Server error', 500); }
});

// ════════════════════════════════════════════════════════════════
// EXPENSES (proxy to expense_records for Finance module view)
// ════════════════════════════════════════════════════════════════

// GET /api/finance/expenses/summary
router.get('/expenses/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const conds = ['1=1'];
    const params = [];
    if (from) { conds.push(`expense_date >= $${params.length+1}`); params.push(from); }
    if (to)   { conds.push(`expense_date <= $${params.length+1}`); params.push(to); }

    const { rows } = await pool.query(
      `SELECT category,
              COALESCE(SUM(total_amount),0) AS total,
              COUNT(*) AS count
       FROM expense_records
       WHERE ${conds.join(' AND ')}
       GROUP BY category ORDER BY total DESC`,
      params
    );
    ok(res, { expenses: rows });
  } catch (e) { err(res, 'Server error', 500); }
});

// ── POST /api/finance/center-settlement ───────────────────────────────────────
// Trigger center contract settlement for a period
router.post('/center-settlement', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { center_id, period_start, period_end } = req.body;
    if (!center_id || !period_start || !period_end)
      return err(res, 'center_id, period_start, period_end are required', 400);

    const je = await financeService.postCenterContractSettlement(
      parseInt(center_id, 10), period_start, period_end, req.user?.id
    );
    ok(res, { journal_entry_id: je?.id || null, message: 'Settlement posted' });
  } catch (e) {
    if (e.message?.includes('No active contract rule'))
      return err(res, e.message, 404);
    logger.error('Center settlement error:', e);
    err(res, e.message || 'Server error', 500);
  }
});

// ── GET /api/finance/center-settlement/history?center_id= ─────────────────────
router.get('/center-settlement/history', async (req, res) => {
  try {
    const { center_id } = req.query;
    const conds = [`je.source_module = 'CENTER_SETTLEMENT'`];
    const params = [];
    if (center_id) { params.push(center_id); conds.push(`je.center_id = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT je.id, je.entry_number, je.entry_date, je.description,
              je.total_debit, je.status, je.source_ref, je.center_id,
              c.name AS center_name
       FROM journal_entries je
       LEFT JOIN centers c ON c.id = je.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY je.entry_date DESC LIMIT 50`,
      params
    );
    ok(res, { history: rows });
  } catch (e) {
    err(res, 'Server error', 500);
  }
});

// ── POST /api/finance/opening-balances ───────────────────────────────────────
// Save opening balances for a go-live date and post a single balanced JE.
// Body: { balance_date, center_id (optional), entries: [{ account_id, debit, credit, notes }] }
// Idempotent per account+center+date: re-posting the same account just updates the row.
router.post('/opening-balances', authorize(FINANCE_ADMIN), async (req, res) => {
  try {
    const { balance_date, center_id, entries } = req.body;
    if (!balance_date || !Array.isArray(entries) || !entries.length)
      return err(res, 'balance_date and entries[] are required', 400);

    const totalDr = entries.reduce((s, e) => s + Number(e.debit  || 0), 0);
    const totalCr = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.01)
      return err(res, `Opening balances imbalanced: DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)}`, 400);

    const cid = center_id ? parseInt(center_id) : null;

    // Upsert each opening_balances row
    for (const entry of entries) {
      await pool.query(
        `INSERT INTO opening_balances
           (account_id, center_id, balance_date, debit_amount, credit_amount, notes, posted_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (account_id, center_id, balance_date) DO UPDATE
           SET debit_amount  = EXCLUDED.debit_amount,
               credit_amount = EXCLUDED.credit_amount,
               notes         = EXCLUDED.notes,
               updated_at    = NOW()`,
        [entry.account_id, cid, balance_date,
         Number(entry.debit || 0), Number(entry.credit || 0),
         entry.notes || null, req.user?.id]
      );
    }

    // Post or replace the JE
    const postingKey = `OB:${cid ?? 'ALL'}:${balance_date}`;

    // Delete existing JE for this key so we can re-post with updated amounts
    const { rows: existing } = await pool.query(
      `SELECT id FROM journal_entries WHERE posting_key = $1`, [postingKey]
    );
    if (existing.length) {
      await pool.query(
        `UPDATE journal_entries SET status='VOIDED', updated_at=NOW() WHERE posting_key=$1`, [postingKey]
      );
      await pool.query(
        `UPDATE opening_balances SET journal_entry_id=NULL WHERE account_id=ANY($1::int[]) AND balance_date=$2`,
        [entries.map(e => e.account_id), balance_date]
      );
    }

    // Build JE lines
    const lines = entries
      .filter(e => Number(e.debit || 0) > 0 || Number(e.credit || 0) > 0)
      .map(e => ({
        accountId: e.account_id,
        debit:     Number(e.debit  || 0),
        credit:    Number(e.credit || 0),
        description: e.notes || 'Opening balance',
        centerId:  cid,
      }));

    const je = await financeService.createAndPostJE({
      sourceModule: 'OPENING_BALANCE',
      sourceId:     null,
      sourceRef:    `Opening Balance ${balance_date}${cid ? ` (Center ${cid})` : ''}`,
      narration:    `Opening balances as at ${balance_date}`,
      lines,
      createdBy:    req.user?.id,
      centerId:     cid,
      postingKey,
      entryDate:    new Date(balance_date),
    });

    // Link JE back to opening_balances rows
    if (je) {
      await pool.query(
        `UPDATE opening_balances SET journal_entry_id=$1
         WHERE account_id = ANY($2::int[]) AND balance_date = $3`,
        [je.id, entries.map(e => e.account_id), balance_date]
      );
    }

    ok(res, { journal_entry_id: je?.id, entry_number: je?.entry_number, entries_saved: entries.length });
  } catch (e) {
    logger.error('Opening balance error:', e);
    err(res, e.message || 'Server error', 500);
  }
});

// ── GET /api/finance/opening-balances ────────────────────────────────────────
router.get('/opening-balances', async (req, res) => {
  try {
    const { center_id, balance_date } = req.query;
    const conds = [], params = [];
    if (center_id)   { params.push(center_id);   conds.push(`ob.center_id = $${params.length}`); }
    if (balance_date){ params.push(balance_date); conds.push(`ob.balance_date = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT ob.*, coa.account_code, coa.account_name, coa.account_type,
              je.entry_number
       FROM opening_balances ob
       JOIN chart_of_accounts coa ON coa.id = ob.account_id
       LEFT JOIN journal_entries je ON je.id = ob.journal_entry_id
       ${where}
       ORDER BY ob.balance_date DESC, coa.account_code`,
      params
    );
    ok(res, { balances: rows });
  } catch (e) {
    err(res, 'Server error', 500);
  }
});

// ── GET /api/finance/rcm-liability ───────────────────────────────────────────
// Returns cumulative IGST Payable (2123) balance, per-month accruals,
// per-vendor breakdown, and payment history.
router.get('/rcm-liability', async (req, res) => {
  try {
    // 1. Total outstanding balance of 2123 (all time, net of payments)
    const { rows: [balRow] } = await pool.query(`
      SELECT
        COALESCE(SUM(jel.credit_amount), 0) AS total_accrued,
        COALESCE(SUM(jel.debit_amount),  0) AS total_paid_gl,
        COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) AS outstanding
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'POSTED'
      JOIN chart_of_accounts coa ON coa.id = jel.account_id AND coa.account_code = '2123'
    `);

    // 2. Monthly breakdown of accruals (CR side only = liabilities added each month)
    const { rows: monthly } = await pool.query(`
      SELECT
        TO_CHAR(je.entry_date, 'Mon YYYY')          AS month_label,
        DATE_TRUNC('month', je.entry_date)           AS month_date,
        COALESCE(SUM(jel.credit_amount), 0)          AS accrued,
        COALESCE(SUM(jel.debit_amount), 0)           AS paid,
        COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) AS net
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'POSTED'
      JOIN chart_of_accounts coa ON coa.id = jel.account_id AND coa.account_code = '2123'
      GROUP BY DATE_TRUNC('month', je.entry_date), TO_CHAR(je.entry_date, 'Mon YYYY')
      ORDER BY month_date DESC
    `);

    // 3. Per tele-radiology vendor breakdown
    // Join via studies (source_ref = study_id) → radiologist_master
    const { rows: vendors } = await pool.query(`
      SELECT
        COALESCE(rm.radiologist_name, 'Unknown') AS vendor_name,
        rm.id                                     AS reporter_id,
        COALESCE(SUM(jel.credit_amount), 0)       AS total_accrued,
        COALESCE(SUM(jel.debit_amount), 0)        AS total_paid,
        COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) AS outstanding
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
        AND je.status = 'POSTED' AND je.source_module = 'REPORTING'
      JOIN chart_of_accounts coa ON coa.id = jel.account_id AND coa.account_code = '2123'
      LEFT JOIN studies s ON je.source_ref IS NOT NULL
        AND je.source_ref ~ '^[0-9]+$'
        AND s.id = je.source_ref::integer
      LEFT JOIN radiologist_master rm ON rm.id = s.reporter_radiologist_id
      GROUP BY rm.id, rm.radiologist_name
      ORDER BY outstanding DESC
    `);

    // 4. Payment history (DR 2123 entries = payments made to govt)
    const { rows: payments } = await pool.query(`
      SELECT
        je.entry_date                  AS payment_date,
        je.entry_number,
        jel.debit_amount               AS amount,
        je.narration                   AS notes,
        je.source_ref                  AS reference
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'POSTED'
      JOIN chart_of_accounts coa ON coa.id = jel.account_id AND coa.account_code = '2123'
      WHERE jel.debit_amount > 0
        AND je.source_module = 'RCM_PAYMENT'
      ORDER BY je.entry_date DESC
      LIMIT 24
    `);

    // 5. Bank accounts for the pay modal
    const { rows: banks } = await pool.query(`
      SELECT ba.id, ba.account_name, ba.account_number, ba.bank_name, ba.gl_account_id,
             coa.account_code AS gl_code
      FROM bank_accounts ba
      LEFT JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
      WHERE ba.active = true
      ORDER BY ba.account_name
    `);

    ok(res, {
      balance: balRow,
      monthly,
      vendors,
      payments,
      banks,
    });
  } catch (e) {
    logger.error('RCM liability error:', e);
    err(res, 'Server error', 500);
  }
});

// ── POST /api/finance/rcm-liability/pay ──────────────────────────────────────
// Record RCM GST payment to government: DR IGST Payable (2123) / CR Bank
router.post('/rcm-liability/pay', authorize(FINANCE_WRITE), [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount required'),
  body('payment_date').isDate().withMessage('Valid date required'),
  body('bank_account_id').isInt({ min: 1 }).withMessage('Bank account required'),
  body('reference_number').trim().notEmpty().withMessage('Challan/reference required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  try {
    const { amount, payment_date, bank_account_id, reference_number, notes } = req.body;
    const amt = parseFloat(parseFloat(amount).toFixed(2));

    // Resolve accounts
    const { rows: [igstAcc] } = await pool.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '2123' AND is_active = true LIMIT 1`
    );
    if (!igstAcc) return err(res, 'IGST Payable account (2123) not found in COA', 500);

    const { rows: [ba] } = await pool.query(
      `SELECT ba.gl_account_id, coa.account_code, ba.account_name
       FROM bank_accounts ba
       LEFT JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
       WHERE ba.id = $1 AND ba.active = true`,
      [bank_account_id]
    );
    if (!ba?.gl_account_id) return err(res, 'Bank account GL not configured', 400);

    const postingKey = `RCM-PAY-${payment_date}-${reference_number}`;

    const je = await financeService.createAndPostJE({
      sourceModule: 'RCM_PAYMENT',
      sourceId:     null,
      sourceRef:    reference_number,
      narration:    `RCM GST Payment to Govt | Challan ${reference_number}${notes ? ' | ' + notes : ''}`,
      lines: [
        {
          accountId:   igstAcc.id,
          debit:       amt,
          credit:      0,
          description: `IGST Payable cleared — RCM | ${reference_number}`,
        },
        {
          accountId:   ba.gl_account_id,
          debit:       0,
          credit:      amt,
          description: `Payment via ${ba.account_name} — RCM GST to Govt`,
        },
      ],
      createdBy:  req.user?.id,
      postingKey,
      entryDate:  new Date(payment_date),
    });

    ok(res, {
      journal_entry_id: je?.id,
      entry_number:     je?.entry_number,
      amount:           amt,
      reference:        reference_number,
    });
  } catch (e) {
    logger.error('RCM payment error:', e);
    err(res, e.message || 'Server error', 500);
  }
});

// ── GET /api/finance/gstr1 ─────────────────────────────────────────────────
// GSTR-1 outward supplies summary for a given period (month/quarter).
// Groups patient bills by HSN/SAC code and GST rate for filing.
//
// Query params: from=YYYY-MM-DD  to=YYYY-MM-DD  center_id (optional)
router.get('/gstr1', async (req, res) => {
  try {
    const { from, to, center_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const conds = ['pb.payment_status NOT IN (\'CANCELLED\')', 'pb.bill_date BETWEEN $1 AND $2'];
    const params = [from, to];
    if (center_id) { params.push(parseInt(center_id)); conds.push(`pb.center_id = $${params.length}`); }

    // B2C (all diagnostic center patients are direct consumers — no GSTIN)
    const { rows: b2c } = await pool.query(
      `SELECT
         COALESCE(sm.hsn_sac_code, '998313') AS hsn_sac,
         sm.study_name                        AS description,
         COALESCE(sm.gst_rate, 0)             AS gst_rate,
         SUM(bi.amount)                       AS taxable_value,
         SUM(pb.cgst_amount)                  AS cgst,
         SUM(pb.sgst_amount)                  AS sgst,
         SUM(pb.cgst_amount + pb.sgst_amount) AS total_gst,
         SUM(pb.total_amount)                 AS total_value,
         COUNT(*)                             AS invoice_count
       FROM patient_bills pb
       LEFT JOIN bill_items bi   ON bi.bill_id = pb.id AND bi.active = true
       LEFT JOIN study_master sm ON sm.study_code = bi.study_code
       WHERE ${conds.join(' AND ')}
         AND pb.active = true
       GROUP BY sm.hsn_sac_code, sm.study_name, sm.gst_rate
       ORDER BY taxable_value DESC`,
      params
    );

    // Totals
    const totals = b2c.reduce((acc, row) => ({
      taxable_value: parseFloat((acc.taxable_value + parseFloat(row.taxable_value || 0)).toFixed(2)),
      total_cgst:    parseFloat((acc.total_cgst    + parseFloat(row.cgst          || 0)).toFixed(2)),
      total_sgst:    parseFloat((acc.total_sgst    + parseFloat(row.sgst          || 0)).toFixed(2)),
      total_gst:     parseFloat((acc.total_gst     + parseFloat(row.total_gst     || 0)).toFixed(2)),
      total_value:   parseFloat((acc.total_value   + parseFloat(row.total_value   || 0)).toFixed(2)),
      invoice_count: acc.invoice_count + parseInt(row.invoice_count || 0),
    }), { taxable_value: 0, total_cgst: 0, total_sgst: 0, total_gst: 0, total_value: 0, invoice_count: 0 });

    res.json({
      success: true,
      period:  { from, to },
      type:    'B2C_LARGE',
      supplies: b2c,
      totals,
    });
  } catch (e) {
    logger.error('GSTR-1 error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/finance/gstr3b ────────────────────────────────────────────────
// GSTR-3B summary: output tax liability vs input tax credit for the period.
// Used for monthly return filing.
//
// Query params: from=YYYY-MM-DD  to=YYYY-MM-DD
router.get('/gstr3b', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    // 3.1 Output Tax Liability (from patient bills — CGST + SGST + IGST)
    const { rows: [output] } = await pool.query(
      `SELECT
         COALESCE(SUM(pb.subtotal),       0)                              AS taxable_turnover,
         COALESCE(SUM(pb.cgst_amount),    0)                              AS cgst_liability,
         COALESCE(SUM(pb.sgst_amount),    0)                              AS sgst_liability,
         COALESCE(SUM(pb.igst_amount),    0)                              AS igst_liability,
         COALESCE(SUM(pb.total_gst),      0)                              AS total_output_gst,
         COUNT(*) AS invoice_count
       FROM patient_bills pb
       WHERE pb.payment_status NOT IN ('CANCELLED')
         AND pb.bill_date BETWEEN $1 AND $2
         AND pb.active = true`,
      [from, to]
    );

    // 4. Eligible Input Tax Credit
    // ITC from vendor bills (GRN receipts)
    const { rows: [itcGrn] } = await pool.query(
      `SELECT COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS itc_on_purchases
       FROM vendor_bills
       WHERE bill_status IN ('APPROVED', 'SUBMITTED')
         AND bill_date BETWEEN $1 AND $2
         AND active = true`,
      [from, to]
    );

    // ITC from RCM (teleradiology IGST)
    const { rows: [itcRcm] } = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount), 0) AS rcm_itc
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jel.account_id
       WHERE coa.account_code = '1134'
         AND je.source_module  = 'REPORTING'
         AND je.entry_date BETWEEN $1 AND $2
         AND je.status = 'POSTED'`,
      [from, to]
    );

    // ITC from expense records
    const { rows: [itcExp] } = await pool.query(
      `SELECT COALESCE(SUM(jel.debit_amount), 0) AS expense_itc
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jel.account_id
       WHERE coa.account_code = '1134'
         AND je.source_module  = 'EXPENSE'
         AND je.entry_date BETWEEN $1 AND $2
         AND je.status = 'POSTED'`,
      [from, to]
    );

    const totalItc = parseFloat((
      parseFloat(itcGrn.itc_on_purchases || 0) +
      parseFloat(itcRcm.rcm_itc          || 0) +
      parseFloat(itcExp.expense_itc       || 0)
    ).toFixed(2));

    const outputCgst  = parseFloat(output.cgst_liability || 0);
    const outputSgst  = parseFloat(output.sgst_liability || 0);
    const outputTotal = parseFloat(output.total_output_gst || 0);
    const netPayable  = parseFloat((outputTotal - totalItc).toFixed(2));

    res.json({
      success: true,
      period:  { from, to },
      section_3_1: {
        taxable_turnover: parseFloat(output.taxable_turnover || 0),
        cgst:             outputCgst,
        sgst:             outputSgst,
        total_output_gst: outputTotal,
        invoice_count:    parseInt(output.invoice_count || 0),
      },
      section_4: {
        vendor_bill_gst: parseFloat(itcGrn.itc_on_purchases || 0),
        rcm_igst:        parseFloat(itcRcm.rcm_itc          || 0),
        expense_itc:     parseFloat(itcExp.expense_itc       || 0),
        total_itc:       totalItc,
      },
      net_tax_payable:    parseFloat(Math.max(0, netPayable).toFixed(2)),
      itc_carry_forward:  parseFloat(Math.max(0, -netPayable).toFixed(2)),
    });
  } catch (e) {
    logger.error('GSTR-3B error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
