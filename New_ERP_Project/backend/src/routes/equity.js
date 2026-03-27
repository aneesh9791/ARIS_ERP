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
// Reads live GL balances from journal_entry_lines (posted JEs only)
// so it shows all capital even when entered via direct JEs (not equity module)
// ════════════════════════════════════════════════════════════════════════════
router.get('/summary', async (_req, res) => {
  try {
    // Helper: compute live GL balance for a set of account codes
    // normal_balance='credit' → balance = credits − debits
    const { rows: glRows } = await pool.query(`
      SELECT
        a.account_code,
        a.account_name,
        a.normal_balance,
        a.opening_balance,
        COALESCE(SUM(jel.debit_amount),  0) AS total_debit,
        COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
        CASE WHEN a.normal_balance = 'debit'
             THEN a.opening_balance + COALESCE(SUM(jel.debit_amount),0) - COALESCE(SUM(jel.credit_amount),0)
             ELSE a.opening_balance + COALESCE(SUM(jel.credit_amount),0) - COALESCE(SUM(jel.debit_amount),0)
        END AS balance
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id
        AND je.status = 'POSTED'
      WHERE a.is_active = true
        AND a.account_code IN ('3100','3101','3102','3103','3111','3112','3113',
                               '3200','3300','3400','3500','2230')
      GROUP BY a.id, a.account_code, a.account_name, a.normal_balance, a.opening_balance
    `);

    const glByCode = Object.fromEntries(glRows.map(r => [r.account_code, parseFloat(r.balance || 0)]));

    // Overall totals from GL
    // 3100 direct balance catches any entries posted to the parent account (e.g., before director-specific
    // accounts existed). Individual sub-accounts (3101-3113) are the preferred target for new entries.
    const totalCapital  = (glByCode['3100'] || 0)
                        + (glByCode['3101'] || 0) + (glByCode['3102'] || 0) + (glByCode['3103'] || 0)
                        + (glByCode['3111'] || 0) + (glByCode['3112'] || 0) + (glByCode['3113'] || 0)
                        + (glByCode['3200'] || 0)   // Retained Earnings
                        + (glByCode['3400'] || 0);
    const totalDrawings = glByCode['3500'] || 0;   // drawings is debit-normal so positive = amount drawn
    const netEquity     = totalCapital - totalDrawings;
    const loanBalance   = glByCode['2230'] || 0;

    // Per-director: match COA accounts by director first name in account_name
    const { rows: directors } = await pool.query(`
      SELECT id, director_name, designation FROM company_directors WHERE active = true ORDER BY sort_order
    `);

    const partnersWithStake = directors.map(cd => {
      const firstName = cd.director_name.split(' ')[0].toLowerCase();
      // Find this director's equity accounts (Capital + Current)
      const dirAccounts = glRows.filter(r =>
        r.account_name.toLowerCase().includes(firstName) &&
        ['3101','3102','3103','3111','3112','3113'].includes(r.account_code)
      );
      // Find this director's drawings account (3500 sub-accounts by name)
      const dirDrawings = glRows.filter(r =>
        r.account_name.toLowerCase().includes(firstName) &&
        r.account_code.startsWith('35')
      );
      const partnerCapital  = dirAccounts.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
      const partnerDrawings = dirDrawings.reduce((s, r) => s + parseFloat(r.balance || 0), 0);
      return {
        director_id:   cd.id,
        director_name: cd.director_name,
        designation:   cd.designation,
        total_capital:  partnerCapital,
        total_drawings: partnerDrawings,
        net_equity:     partnerCapital - partnerDrawings,
        net_loan_owed:  glByCode['2230'] || 0,
        last_txn_date:  null,
      };
    }).sort((a, b) => b.total_capital - a.total_capital);

    const grandCapital = totalCapital || 1;
    const partnersOut = partnersWithStake.map(p => ({
      ...p,
      stake_pct: grandCapital > 0
        ? ((p.total_capital / grandCapital) * 100).toFixed(2)
        : '0.00',
    }));

    ok(res, {
      summary: {
        total_capital:     totalCapital,
        total_drawings:    totalDrawings,
        net_equity:        netEquity,
        total_loan_in:     loanBalance,
        total_loan_repaid: 0,
        net_loan_owed:     loanBalance,
      },
      partners: partnersOut,
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

    // Resolve equity account: for CAPITAL_CONTRIBUTION, prefer the director's
    // specific Current Account (311x / 310x) matched by first name in account_name.
    // Fall back to the generic equityCode (3100) if no specific account found.
    let equity_account_id;
    if (transaction_type === 'CAPITAL_CONTRIBUTION') {
      const { rows: dNameRows } = await client.query(
        `SELECT director_name FROM company_directors WHERE id=$1 AND active=true LIMIT 1`,
        [director_id]
      );
      const firstName = dNameRows[0]?.director_name?.split(' ')[0] || '';
      const { rows: specificRows } = await client.query(
        `SELECT id FROM chart_of_accounts
          WHERE is_active = true
            AND account_code LIKE '31%'
            AND account_name ILIKE $1
          ORDER BY account_code
          LIMIT 1`,
        [`%${firstName}%`]
      );
      if (specificRows.length) {
        equity_account_id = specificRows[0].id;
      } else {
        const { rows: fallback } = await client.query(
          `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
          [cfg.equityCode]
        );
        if (!fallback.length) throw new Error(`Equity COA account ${cfg.equityCode} not found`);
        equity_account_id = fallback[0].id;
      }
    } else {
      const { rows: eqRows } = await client.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
        [cfg.equityCode]
      );
      if (!eqRows.length) throw new Error(`Equity COA account ${cfg.equityCode} not found — run migrations`);
      equity_account_id = eqRows[0].id;
    }

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
