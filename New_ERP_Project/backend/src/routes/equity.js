'use strict';
const express = require('express');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('EQUITY_VIEW'));

const ok  = (res, data)        => res.json({ success: true, ...data });
const err = (res, msg, status) => res.status(status || 400).json({ success: false, error: msg });

// ── Sequential transaction number ────────────────────────────────────────────
async function nextEqNumber(client) {
  const { rows } = await (client || pool).query(
    `SELECT NEXTVAL('equity_txn_seq') AS n`
  );
  return `EQ-${String(rows[0].n).padStart(6, '0')}`;
}

// ── JE number (mirrors finance.js pattern) ───────────────────────────────────
async function nextJENumber(client) {
  const { rows } = await (client || pool).query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(entry_number, '^JE-', '') AS INTEGER)), 0) + 1 AS n
       FROM journal_entries WHERE entry_number ~ $1`,
    ['^JE-\\d+$']
  );
  return `JE-${String(rows[0].n).padStart(6, '0')}`;
}

// ────────────────────────────────────────────────────────────────────────────
// TYPE CONFIG — DR/CR sides and default equity account code
// ────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  CAPITAL_CONTRIBUTION:   { equityCode: '3100', drBank: true,  label: 'Capital Contribution' },
  CAPITAL_RESERVE:        { equityCode: '3400', drBank: true,  label: 'Capital Reserve' },
  DRAWING:                { equityCode: '3500', drBank: false, label: 'Drawing / Distribution' },
  DIRECTOR_LOAN_IN:       { equityCode: '2230', drBank: true,  label: 'Director Loan In' },
  DIRECTOR_LOAN_REPAYMENT:{ equityCode: '2230', drBank: false, label: 'Director Loan Repayment' },
};

// ════════════════════════════════════════════════════════════════════════════
// GET /api/equity/directors  —  list of directors/partners for dropdown
// ════════════════════════════════════════════════════════════════════════════
router.get('/directors', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, director_name, designation, din, email, phone
         FROM company_directors
        WHERE active = true
        ORDER BY sort_order, director_name`
    );
    ok(res, { directors: rows });
  } catch (e) {
    logger.error('equity directors error', e);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/equity/summary  —  per-director totals + overall equity position
// ════════════════════════════════════════════════════════════════════════════
router.get('/summary', async (_req, res) => {
  try {
    // Per-director breakdown
    const { rows: partners } = await pool.query(`
      SELECT
        cd.id                                                   AS director_id,
        cd.director_name,
        cd.designation,
        COALESCE(SUM(CASE WHEN et.transaction_type IN ('CAPITAL_CONTRIBUTION','CAPITAL_RESERVE')
                         THEN et.amount ELSE 0 END), 0)        AS total_capital,
        COALESCE(SUM(CASE WHEN et.transaction_type = 'DRAWING'
                         THEN et.amount ELSE 0 END), 0)        AS total_drawings,
        COALESCE(SUM(CASE WHEN et.transaction_type = 'DIRECTOR_LOAN_IN'
                         THEN et.amount ELSE 0 END), 0)        AS director_loan_in,
        COALESCE(SUM(CASE WHEN et.transaction_type = 'DIRECTOR_LOAN_REPAYMENT'
                         THEN et.amount ELSE 0 END), 0)        AS director_loan_repaid,
        COUNT(et.id)                                            AS txn_count,
        MAX(et.transaction_date)                                AS last_txn_date
      FROM company_directors cd
      LEFT JOIN equity_transactions et ON et.director_id = cd.id
      WHERE cd.active = true
      GROUP BY cd.id, cd.director_name, cd.designation
      ORDER BY total_capital DESC
    `);

    // Overall totals
    const { rows: totals } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type IN ('CAPITAL_CONTRIBUTION','CAPITAL_RESERVE')
                         THEN amount ELSE 0 END), 0) AS total_capital,
        COALESCE(SUM(CASE WHEN transaction_type = 'DRAWING'
                         THEN amount ELSE 0 END), 0) AS total_drawings,
        COALESCE(SUM(CASE WHEN transaction_type = 'DIRECTOR_LOAN_IN'
                         THEN amount ELSE 0 END), 0) AS total_loan_in,
        COALESCE(SUM(CASE WHEN transaction_type = 'DIRECTOR_LOAN_REPAYMENT'
                         THEN amount ELSE 0 END), 0) AS total_loan_repaid
      FROM equity_transactions
    `);

    const t = totals[0];
    const netEquity    = parseFloat(t.total_capital)  - parseFloat(t.total_drawings);
    const netLoanOwed  = parseFloat(t.total_loan_in)  - parseFloat(t.total_loan_repaid);

    // Compute % stake per partner
    const grandCapital = parseFloat(t.total_capital) || 1;
    const partnersWithStake = partners.map(p => ({
      ...p,
      net_equity:   parseFloat(p.total_capital) - parseFloat(p.total_drawings),
      net_loan_owed: parseFloat(p.director_loan_in) - parseFloat(p.director_loan_repaid),
      stake_pct:    grandCapital > 0
        ? ((parseFloat(p.total_capital) / grandCapital) * 100).toFixed(2)
        : '0.00',
    }));

    ok(res, {
      summary: {
        total_capital:    parseFloat(t.total_capital),
        total_drawings:   parseFloat(t.total_drawings),
        net_equity:       netEquity,
        total_loan_in:    parseFloat(t.total_loan_in),
        total_loan_repaid:parseFloat(t.total_loan_repaid),
        net_loan_owed:    netLoanOwed,
      },
      partners: partnersWithStake,
    });
  } catch (e) {
    logger.error('equity summary error', e);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/equity/transactions  —  paginated history
// ════════════════════════════════════════════════════════════════════════════
router.get('/transactions', async (req, res) => {
  try {
    const { director_id, type, from, to, page = 1, limit = 50 } = req.query;
    const conds  = ['1=1'];
    const params = [];
    let   i      = 1;

    if (director_id) { conds.push(`et.director_id = $${i++}`); params.push(director_id); }
    if (type)        { conds.push(`et.transaction_type = $${i++}`); params.push(type); }
    if (from)        { conds.push(`et.transaction_date >= $${i++}`); params.push(from); }
    if (to)          { conds.push(`et.transaction_date <= $${i++}`); params.push(to); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await pool.query(`
      SELECT
        et.*,
        cd.director_name, cd.designation,
        ba.account_code  AS bank_account_code,
        ba.account_name  AS bank_account_name,
        ea.account_code  AS equity_account_code,
        ea.account_name  AS equity_account_name,
        je.entry_number  AS je_number
      FROM equity_transactions et
      LEFT JOIN company_directors  cd ON cd.id = et.director_id
      LEFT JOIN chart_of_accounts  ba ON ba.id = et.bank_account_id
      LEFT JOIN chart_of_accounts  ea ON ea.id = et.equity_account_id
      LEFT JOIN journal_entries    je ON je.id = et.journal_entry_id
      WHERE ${conds.join(' AND ')}
      ORDER BY et.transaction_date DESC, et.id DESC
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, parseInt(limit), offset]);

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM equity_transactions et WHERE ${conds.join(' AND ')}`,
      params
    );

    ok(res, { transactions: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('equity list error', e);
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/equity/transactions  —  create + auto-post JE
// ════════════════════════════════════════════════════════════════════════════
router.post('/transactions', authorizePermission('EQUITY_WRITE'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      director_id,
      transaction_type,
      amount,
      transaction_date,
      payment_mode,
      bank_reference,
      bank_account_id,
      notes,
      center_id,
    } = req.body;

    if (!director_id)       throw new Error('Director/Partner is required');
    if (!transaction_type)  throw new Error('Transaction type is required');
    if (!amount || amount <= 0) throw new Error('Amount must be positive');
    if (!bank_account_id)   throw new Error('Bank/Cash account is required');

    const cfg = TYPE_CONFIG[transaction_type];
    if (!cfg) throw new Error('Invalid transaction type');

    // Resolve equity account automatically from the transaction type
    const { rows: eqRows } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
      [cfg.equityCode]
    );
    if (!eqRows.length) throw new Error(`Equity COA account ${cfg.equityCode} not found — run migrations`);
    const equity_account_id = eqRows[0].id;

    const txnDate = transaction_date || new Date().toLocaleDateString('en-CA');

    // ── Verify director exists ────────────────────────────────────────────
    const { rows: dRows } = await client.query(
      `SELECT director_name FROM company_directors WHERE id=$1 AND active=true`,
      [director_id]
    );
    if (!dRows.length) throw new Error('Director not found');
    const directorName = dRows[0].director_name;

    // ── Build JE lines ────────────────────────────────────────────────────
    // drBank=true  → DR bank, CR equity
    // drBank=false → DR equity, CR bank
    const lines = cfg.drBank
      ? [
          { account_id: bank_account_id,   debit_amount: amount, credit_amount: 0,      description: `${cfg.label} — ${directorName}` },
          { account_id: equity_account_id, debit_amount: 0,      credit_amount: amount, description: `${cfg.label} — ${directorName}` },
        ]
      : [
          { account_id: equity_account_id, debit_amount: amount, credit_amount: 0,      description: `${cfg.label} — ${directorName}` },
          { account_id: bank_account_id,   debit_amount: 0,      credit_amount: amount, description: `${cfg.label} — ${directorName}` },
        ];

    // ── Create equity transaction first (gets its ID for JE traceability) ─
    const txnNo = await nextEqNumber(client);
    const { rows: txnRows } = await client.query(
      `INSERT INTO equity_transactions
         (transaction_no, director_id, transaction_type, amount, transaction_date,
          payment_mode, bank_reference, bank_account_id, equity_account_id,
          notes, center_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [txnNo, director_id, transaction_type, parseFloat(amount), txnDate,
       payment_mode || null, bank_reference || null,
       bank_account_id, equity_account_id,
       notes || null, center_id || null, req.user?.id || null]
    );
    const equityTxnId = txnRows[0].id;

    // ── Create JE header with full traceability ───────────────────────────
    const jeNumber = await nextJENumber(client);
    const jeDesc   = `${cfg.label} — ${directorName}${bank_reference ? ` [Ref: ${bank_reference}]` : ''}`;

    const { rows: jeRows } = await client.query(
      `INSERT INTO journal_entries
         (entry_number, entry_date, description, reference_type, reference_id,
          total_debit, total_credit, center_id, created_by,
          status, is_auto_posted, posted_by, posted_at,
          source_module, source_id, notes)
       VALUES ($1,$2,$3,'EQUITY_TXN',$4,$5,$5,$6,$7,'POSTED',true,$7,NOW(),'EQUITY',$4,$8)
       RETURNING id`,
      [jeNumber, txnDate, jeDesc, equityTxnId,
       parseFloat(amount), center_id || null, req.user?.id || null, notes || null]
    );
    const jeId = jeRows[0].id;

    // ── Insert JE lines ───────────────────────────────────────────────────
    for (const l of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines
           (journal_entry_id, account_id, debit_amount, credit_amount, description)
         VALUES ($1,$2,$3,$4,$5)`,
        [jeId, l.account_id, l.debit_amount, l.credit_amount, l.description]
      );
    }

    // ── Link JE back to equity transaction ───────────────────────────────
    await client.query(
      `UPDATE equity_transactions SET journal_entry_id = $1, updated_at = NOW() WHERE id = $2`,
      [jeId, equityTxnId]
    );

    await client.query('COMMIT');

    logger.info('Equity transaction created', { txnNo, jeNumber, director: directorName, type: transaction_type, amount });
    ok(res, { transaction: txnRows[0], je_number: jeNumber });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('equity create error', e);
    err(res, e.message, 400);
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/equity/transactions/:id  —  single record
// ════════════════════════════════════════════════════════════════════════════
router.get('/transactions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT et.*,
        cd.director_name, cd.designation,
        ba.account_code AS bank_account_code, ba.account_name AS bank_account_name,
        ea.account_code AS equity_account_code, ea.account_name AS equity_account_name,
        je.entry_number AS je_number
      FROM equity_transactions et
      LEFT JOIN company_directors cd ON cd.id = et.director_id
      LEFT JOIN chart_of_accounts ba ON ba.id = et.bank_account_id
      LEFT JOIN chart_of_accounts ea ON ea.id = et.equity_account_id
      LEFT JOIN journal_entries   je ON je.id = et.journal_entry_id
      WHERE et.id = $1`, [req.params.id]);
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { transaction: rows[0] });
  } catch (e) {
    err(res, e.message, 500);
  }
});

module.exports = router;
