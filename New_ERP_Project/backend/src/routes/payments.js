'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool   = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorize } = require('../middleware/auth');

const router = express.Router();

const AP_WRITE  = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER', 'ACCOUNTANT'];
const AP_ADMIN  = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER'];
const PROC_WRITE = ['SUPER_ADMIN', 'CENTER_MANAGER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'PROCUREMENT_MANAGER'];

// ── GET /api/payments/bank-options ────────────────────────────────────────────
// Returns active bank accounts with their linked COA GL account id/code/name
router.get('/bank-options', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ba.id,
        ba.account_name,
        ba.bank_name,
        ba.account_number,
        ba.account_type,
        ba.gl_account_id,
        coa.account_code  AS gl_account_code,
        coa.account_name  AS gl_account_name
      FROM bank_accounts ba
      LEFT JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
      WHERE ba.active = true
      ORDER BY ba.id
    `);
    res.json({ success: true, accounts: rows });
  } catch (e) {
    logger.error('bank-options GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/payments/outstanding ─────────────────────────────────────────────
// Unified list of all pending payables:
//   1. vendor_bills (payment_status PENDING | PARTIAL)
//   2. payables table (status PENDING | PARTIAL) — reporters & services
router.get('/outstanding', async (req, res) => {
  try {
    const { center_id, type } = req.query;
    const centerParam = center_id ? parseInt(center_id) : null;

    // ── Vendor bills ──────────────────────────────────────────────────────────
    const vendorBills = type && type !== 'VENDOR' ? [] : (await pool.query(
      `SELECT
        vb.id,
        'vendor_bill'               AS source_type,
        'VENDOR'                    AS payee_type,
        COALESCE(vm.vendor_name, vb.vendor_name_text, vb.vendor_code) AS payee_name,
        COALESCE(vb.vendor_code, vb.vendor_name_text) AS payee_code,
        vb.bill_number              AS reference,
        vb.bill_date                AS doc_date,
        vb.due_date,
        vb.total_amount             AS amount,
        COALESCE((
          SELECT SUM(vp.amount_paid) FROM vendor_payments vp
          WHERE vp.bill_id = vb.id AND vp.active = true
        ), 0)                       AS paid_amount,
        vb.total_amount - COALESCE((
          SELECT SUM(vp.amount_paid) FROM vendor_payments vp
          WHERE vp.bill_id = vb.id AND vp.active = true
        ), 0)                       AS balance_amount,
        vb.payment_status           AS status,
        vb.center_id,
        c.name                      AS center_name,
        CURRENT_DATE - vb.due_date  AS days_overdue
      FROM vendor_bills vb
      LEFT JOIN vendor_master vm  ON vm.vendor_code = vb.vendor_code
      LEFT JOIN centers c         ON c.id = vb.center_id
      WHERE vb.active = true
        AND vb.payment_status IN ('PENDING','PARTIAL')
        AND vb.bill_status = 'APPROVED'
        ${centerParam !== null ? 'AND vb.center_id = $1' : ''}
      ORDER BY vb.due_date`,
      centerParam !== null ? [centerParam] : []
    )).rows;

    // ── Payables (reporters + services) ───────────────────────────────────────
    const payableRows = type && type !== 'RADIOLOGIST' && type !== 'SERVICE' ? [] : (await pool.query(
      `SELECT
        p.id,
        'payable'                   AS source_type,
        CASE
          WHEN p.reporter_id IS NOT NULL THEN 'RADIOLOGIST'
          ELSE 'SERVICE'
        END                         AS payee_type,
        COALESCE(rm.radiologist_name, vm.vendor_name, p.vendor_code, p.payable_number) AS payee_name,
        COALESCE(p.vendor_code, 'RAD-' || p.reporter_id::text) AS payee_code,
        p.payable_number            AS reference,
        p.created_at::date          AS doc_date,
        p.due_date,
        p.amount,
        p.paid_amount,
        p.balance_amount,
        p.status,
        p.center_id,
        c.name                      AS center_name,
        -- AP account: reporter category → ap_account_id or default 2113
        COALESCE(
          (SELECT ic.ap_account_id FROM item_categories ic
           WHERE ic.name = 'Tele-Radiology Service Charges' AND ic.active = true LIMIT 1),
          (SELECT id FROM chart_of_accounts WHERE account_code = '2113' LIMIT 1)
        )                           AS ap_account_id,
        '2113'                      AS ap_account_code,
        CURRENT_DATE - p.due_date   AS days_overdue
      FROM payables p
      LEFT JOIN radiologist_master rm ON rm.id = p.reporter_id
      LEFT JOIN vendor_master vm      ON vm.vendor_code = p.vendor_code
      LEFT JOIN centers c             ON c.id = p.center_id
      WHERE p.active = true
        AND p.status IN ('PENDING','PARTIAL')
        ${centerParam !== null ? 'AND p.center_id = $1' : ''}
      ORDER BY p.due_date`,
      centerParam !== null ? [centerParam] : []
    )).rows;

    const all = [...vendorBills, ...payableRows]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // Summary totals
    const totals = all.reduce((acc, r) => {
      acc.total_outstanding += parseFloat(r.balance_amount || 0);
      if ((r.days_overdue || 0) > 0) acc.total_overdue += parseFloat(r.balance_amount || 0);
      acc[r.payee_type] = (acc[r.payee_type] || 0) + parseFloat(r.balance_amount || 0);
      return acc;
    }, { total_outstanding: 0, total_overdue: 0, VENDOR: 0, RADIOLOGIST: 0, SERVICE: 0 });

    res.json({ success: true, payables: all, totals, count: all.length });
  } catch (e) {
    logger.error('payments outstanding GET:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// ── GET /api/payments/history ──────────────────────────────────────────────────
// Recent payments (vendor + payable)
router.get('/history', async (req, res) => {
  try {
    const { from, to, center_id } = req.query;
    const fromDate = from || new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA');
    const toDate   = to   || new Date().toLocaleDateString('en-CA');
    const histParams = [fromDate, toDate];
    const histCenterCond = center_id
      ? (() => { histParams.push(parseInt(center_id)); return `AND center_id = $${histParams.length}`; })()
      : '';

    const { rows } = await pool.query(
      `SELECT
        vp.id,
        'vendor_bill'  AS source_type,
        COALESCE(vm.vendor_name, vb.vendor_name_text, vb.vendor_code) AS payee_name,
        vb.bill_number AS reference,
        vp.payment_date,
        vp.payment_mode,
        vp.amount_paid AS amount,
        vp.transaction_reference,
        je.entry_number AS journal_number,
        c.name AS center_name
      FROM vendor_payments vp
      JOIN vendor_bills vb ON vb.id = vp.bill_id
      LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code
      LEFT JOIN centers c        ON c.id = vb.center_id
      LEFT JOIN journal_entries je ON je.id = vp.journal_entry_id
      WHERE vp.active = true AND vp.bill_id IS NOT NULL
        AND vp.payment_date BETWEEN $1 AND $2
        ${histCenterCond.replace('center_id', 'vb.center_id')}

      UNION ALL

      SELECT
        pp.id,
        'payable'      AS source_type,
        COALESCE(rm.radiologist_name, vm.vendor_name, pp.vendor_code) AS payee_name,
        pp.payable_number AS reference,
        pp.updated_at::date AS payment_date,
        pp.payment_mode,
        pp.paid_amount AS amount,
        NULL AS transaction_reference,
        NULL AS journal_number,
        c2.name AS center_name
      FROM payables pp
      LEFT JOIN radiologist_master rm ON rm.id = pp.reporter_id
      LEFT JOIN vendor_master vm      ON vm.vendor_code = pp.vendor_code
      LEFT JOIN centers c2            ON c2.id = pp.center_id
      WHERE pp.active = true AND pp.status = 'PAID'
        AND pp.updated_at::date BETWEEN $1 AND $2
        ${histCenterCond.replace('center_id', 'pp.center_id')}

      UNION ALL

      SELECT
        vp.id,
        'grn_purchase' AS source_type,
        vm.vendor_name AS payee_name,
        pr.grn_number  AS reference,
        vp.payment_date,
        vp.payment_mode,
        vp.amount_paid AS amount,
        vp.transaction_reference,
        je.entry_number AS journal_number,
        NULL::text AS center_name
      FROM vendor_payments vp
      JOIN purchase_receipts pr ON pr.id = vp.grn_id
      JOIN procurement_orders po ON po.id = pr.po_id
      JOIN vendor_master vm ON vm.id = po.vendor_id
      LEFT JOIN journal_entries je ON je.id = vp.journal_entry_id
      WHERE vp.active = true AND vp.grn_id IS NOT NULL
        AND vp.payment_date BETWEEN $1 AND $2

      ORDER BY payment_date DESC
      LIMIT 200`,
      histParams
    );

    res.json({ success: true, payments: rows });
  } catch (e) {
    logger.error('payments history GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/payments/payable/:id/pay ────────────────────────────────────────
// Pay a `payables` record (radiologist or service provider)
// GL: DR ap_account → CR bank/cash
router.post('/payable/:id/pay', authorize(AP_WRITE), [
  body('payment_mode').isIn(['CASH','CHEQUE','NEFT','RTGS','UPI']),
  body('amount_paid').isFloat({ min: 0.01 }),
  body('payment_date').isDate(),
  body('transaction_reference').trim().notEmpty().withMessage('Transaction reference is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the payable row
    // ap_account_id is stored on the payables row at accrual time (migration 065).
    // Fall back to 2113 for older rows that were created before the migration.
    const { rows: [payable] } = await client.query(
      `SELECT p.*,
              COALESCE(
                p.ap_account_id,
                (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
              ) AS ap_account_id
       FROM payables p
       WHERE p.id = $1 AND p.active = true FOR UPDATE`,
      [req.params.id]
    );
    // Fetch radiologist name separately (no lock needed)
    let radiologistName = null;
    if (payable?.reporter_id) {
      const { rows: [rm] } = await client.query(
        `SELECT radiologist_name FROM radiologist_master WHERE id = $1`, [payable.reporter_id]
      );
      radiologistName = rm?.radiologist_name || null;
    }
    if (!payable) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payable not found' });
    }
    if (payable.status === 'PAID') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payable is already fully paid' });
    }

    const { payment_mode, amount_paid, payment_date,
            transaction_reference, notes, bank_account_id } = req.body;

    const amt = parseFloat(parseFloat(amount_paid).toFixed(2));
    const bal = parseFloat(payable.balance_amount);
    if (amt > bal + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Amount ₹${amt} exceeds balance ₹${bal}` });
    }

    // Resolve bank/cash GL account
    // Priority: bank_accounts.gl_account_id > hardcoded fallback
    let bankAccId = null;
    if (bank_account_id) {
      const { rows: [ba] } = await client.query(
        `SELECT gl_account_id FROM bank_accounts WHERE id = $1 AND active = true LIMIT 1`,
        [bank_account_id]
      );
      bankAccId = ba?.gl_account_id || null;
    }
    if (!bankAccId) {
      const bankCode = payment_mode === 'CASH' ? '1111' : '1112';
      const { rows: [ba] } = await client.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = $1 LIMIT 1`, [bankCode]
      );
      bankAccId = ba?.id || null;
    }

    const newPaid    = parseFloat(payable.paid_amount) + amt;
    const newBalance = parseFloat(payable.amount) - newPaid;
    const newStatus  = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';

    await client.query(
      `UPDATE payables
       SET paid_amount=$1, balance_amount=$2, status=$3,
           payment_mode=$4, updated_at=NOW()
       WHERE id=$5`,
      [newPaid, Math.max(0, newBalance), newStatus, payment_mode, req.params.id]
    );

    // ── Post JE: DR AP → CR Bank ──────────────────────────────────────────
    if (!bankAccId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot post payment: bank/cash GL account not found. '
             + 'Select a bank account, or ensure COA codes 1111 (Cash) / 1112 (Bank) exist and are active.',
      });
    }

    let jeId = null;
    if (payable.ap_account_id && bankAccId) {
      const payeeName = radiologistName || payable.vendor_code || 'Service Provider';
      const je = await financeService.createAndPostJE({
        sourceModule: 'AP_PAYMENT',
        sourceId:     payable.id,
        sourceRef:    `Payment for ${payable.payable_number}`,
        narration:    `Payment to ${payeeName} | ${payable.payable_number} | ${payment_mode}`,
        lines: [
          {
            accountId:   payable.ap_account_id,
            debit:       amt,
            credit:      0,
            description: `AP cleared — ${payable.payable_number}`,
            centerId:    payable.center_id || null,
          },
          {
            accountId:   bankAccId,
            debit:       0,
            credit:      amt,
            description: `Payment to ${payeeName} via ${payment_mode}`,
            centerId:    payable.center_id || null,
          },
        ],
        createdBy:  req.user?.id || null,
        postingKey: `PPAY-${payable.id}-${(payment_date || '').replace(/-/g, '')}`,
        entryDate:  payment_date,
        client,
      });
      jeId = je.id;
      logger.info('Payable payment JE posted', { payable_id: payable.id, je_id: je.id });
    } else {
      logger.warn('Payable payment JE skipped — missing AP or bank account',
        { payable_id: req.params.id });
    }

    await client.query('COMMIT');
    logger.info('Payable payment recorded', {
      payable_id: req.params.id, amount: amt, status: newStatus, je_id: jeId
    });
    res.json({
      success: true,
      status: newStatus,
      paid_amount: newPaid,
      balance_amount: Math.max(0, newBalance),
      journal_entry_id: jeId,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Payable payment POST:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ── POST /api/payments/vendor-bill/:id/pay ────────────────────────────────────
// Thin wrapper — delegates to vendors.js logic by calling it directly here
// (avoids internal HTTP call)
router.post('/vendor-bill/:id/pay', authorize(AP_WRITE), [
  body('payment_mode').isIn(['CASH','CHEQUE','NEFT','RTGS','UPI']),
  body('amount_paid').isFloat({ min: 0.01 }),
  body('payment_date').isDate(),
  body('transaction_reference').trim().notEmpty().withMessage('Transaction reference is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [bill] } = await client.query(
      `SELECT vb.*,
              -- AP account priority:
              -- 1. Bill's own posted JE credit line (self-consistent — matches what was originally credited)
              -- 2. For GRN-linked bills: GRN JE credit line
              -- 3. Item category on the bill's PO items (item type drives AP, not vendor)
              -- 4. Fallback: 2112 Equipment AP
              COALESCE(
                (SELECT jel.account_id FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = vb.journal_entry_id
                   AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT jel.account_id FROM journal_entry_lines jel
                 JOIN purchase_receipts pr ON pr.journal_entry_id = jel.journal_entry_id
                 WHERE pr.id = vb.source_grn_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT ic.ap_account_id
                 FROM procurement_order_items poi
                 JOIN item_master im ON im.id = poi.item_master_id
                 JOIN item_categories ic ON ic.id = im.category_id
                 WHERE poi.po_id = vb.source_po_id AND ic.ap_account_id IS NOT NULL
                 LIMIT 1),
                (SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1)
              ) AS ap_account_id,
              COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name,
              (SELECT p.id FROM parties p JOIN vendor_master vm2 ON vm2.id = p.vendor_id
               WHERE vm2.vendor_code = vb.vendor_code LIMIT 1) AS party_id
       FROM vendor_bills vb
       LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code AND vm.active = true
       WHERE vb.id=$1 AND vb.active=true FOR UPDATE OF vb`,
      [req.params.id]
    );
    if (!bill) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill not found' }); }
    if (bill.bill_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Bill must be APPROVED before payment (current status: ${bill.bill_status})` });
    }
    if (bill.payment_status === 'PAID') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bill is already fully paid' });
    }

    const { payment_mode, amount_paid, payment_date,
            transaction_reference, notes, bank_account_id } = req.body;

    const amt = parseFloat(parseFloat(amount_paid).toFixed(2));

    // Overpayment guard — total of existing payments + this payment must not exceed bill total
    const { rows: [{ already_paid }] } = await client.query(
      `SELECT COALESCE(SUM(amount_paid),0) AS already_paid
       FROM vendor_payments WHERE bill_id=$1 AND active=true`,
      [req.params.id]
    );
    const remaining = parseFloat(bill.total_amount) - parseFloat(already_paid);
    if (amt > remaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment ₹${amt.toFixed(2)} exceeds outstanding balance ₹${remaining.toFixed(2)}`,
      });
    }

    // bank_account_id = bank_accounts.id (FK); also resolve gl_account_id for JE
    let bankRowId = bank_account_id || null;
    let bankGlId  = null;
    if (bankRowId) {
      const { rows: [ba] } = await client.query(
        `SELECT id, gl_account_id FROM bank_accounts WHERE id = $1`, [bankRowId]
      );
      bankGlId = ba?.gl_account_id || null;
    }
    if (!bankGlId) {
      const bankCode = payment_mode === 'CASH' ? '1111' : '1112';
      const { rows: [ba] } = await client.query(
        `SELECT ba.id, ba.gl_account_id FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE coa.account_code = $1 LIMIT 1`, [bankCode]
      );
      bankRowId = ba?.id || null;
      bankGlId  = ba?.gl_account_id || null;
    }

    const { rows: [payment] } = await client.query(
      `INSERT INTO vendor_payments
         (bill_id, payment_mode, amount_paid, payment_date,
          transaction_reference, notes, bank_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, payment_mode, amt, payment_date,
       transaction_reference||null, notes||null, bankRowId]
    );

    const { rows: [{ total_paid }] } = await client.query(
      `SELECT COALESCE(SUM(amount_paid),0) AS total_paid
       FROM vendor_payments WHERE bill_id=$1 AND active=true`,
      [req.params.id]
    );
    const paidAmt   = parseFloat(total_paid);
    const billTotal = parseFloat(bill.total_amount);
    const newStatus = paidAmt >= billTotal - 0.01 ? 'PAID' : 'PARTIAL';
    await client.query(
      `UPDATE vendor_bills SET payment_status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, req.params.id]
    );

    if (!bankGlId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot post payment: bank/cash GL account not found. '
             + 'Select a bank account, or ensure COA codes 1111 (Cash) / 1112 (Bank) exist and are active.',
      });
    }

    if (bill.ap_account_id && bankGlId) {
      const je = await financeService.createAndPostJE({
        sourceModule: 'AP_PAYMENT',
        sourceId:     payment.id,
        sourceRef:    `Payment for Bill ${bill.bill_number}`,
        narration:    `Payment to ${bill.vendor_name} | ${bill.bill_number} | ${payment_mode}`,
        lines: [
          { accountId: bill.ap_account_id, debit: amt, credit: 0,
            description: `AP cleared — ${bill.bill_number}`, centerId: bill.center_id||null, partyId: bill.party_id||null },
          { accountId: bankGlId, debit: 0, credit: amt,
            description: `Payment to ${bill.vendor_name} via ${payment_mode}`, centerId: bill.center_id||null },
        ],
        createdBy:  req.user?.id || null,
        postingKey: `VPAY-${payment.id}`,
        entryDate:  payment_date,
        client,
      });
      await client.query(
        `UPDATE vendor_payments SET journal_entry_id=$1 WHERE id=$2`, [je.id, payment.id]
      );
      if (bill.party_id) {
        await financeService.writePartyLedger(
          client, bill.party_id, je.id, null, bill.center_id||null,
          je.entry_date, je.entry_number, `Payment: ${bill.bill_number}`,
          amt, 0, 'AP_PAYMENT', bill.bill_number
        );
      }

      // Reduce payables explicitly linked to this vendor bill (consolidated accruals only)
      await client.query(
        `UPDATE payables
         SET paid_amount    = LEAST(amount, COALESCE(paid_amount,0) + $1),
             balance_amount = GREATEST(0, COALESCE(balance_amount, amount) - $1),
             status         = CASE
               WHEN COALESCE(balance_amount, amount) - $1 <= 0.01 THEN 'PAID'
               ELSE status
             END,
             updated_at = NOW()
         WHERE vendor_bill_id = $2
           AND status NOT IN ('PAID','CANCELLED')
           AND active = true`,
        [amt, bill.id]
      );
    }

    // Advance knock-off: if this REGULAR bill has a source_grn_id → po_id with paid advance bills,
    // post a knock-off JE: DR AP / CR Advance to Suppliers
    if (bill.bill_type !== 'ADVANCE' && bill.source_grn_id) {
      const { rows: [poLink] } = await client.query(
        `SELECT po.id AS po_id FROM purchase_receipts pr
         JOIN procurement_orders po ON po.id = pr.po_id
         WHERE pr.id = $1`, [bill.source_grn_id]
      );
      if (poLink?.po_id) {
        const { rows: advBills } = await client.query(
          `SELECT vb.id, vb.total_amount,
                  COALESCE(SUM(vp.amount_paid),0) AS paid
           FROM vendor_bills vb
           LEFT JOIN vendor_payments vp ON vp.bill_id = vb.id AND vp.active=true
           WHERE vb.source_po_id=$1 AND vb.bill_type='ADVANCE'
             AND vb.bill_status='APPROVED' AND vb.payment_status='PAID' AND vb.active=true
           GROUP BY vb.id, vb.total_amount`, [poLink.po_id]
        );
        const totalAdvance = advBills.reduce((s, r) => s + parseFloat(r.total_amount), 0);
        // Check ALL knockoffs on this PO (not just this bill) to prevent double-applying the same advance
        const { rows: [alreadyKnocked] } = await client.query(
          `SELECT COALESCE(SUM(vp.amount_paid), 0) AS knocked
           FROM vendor_payments vp
           LEFT JOIN vendor_bills vb2 ON vb2.id = vp.bill_id
           WHERE vp.payment_mode = 'ADVANCE_KNOCKOFF' AND vp.active = true
             AND (vb2.source_po_id = $1
                  OR vp.grn_id IN (SELECT id FROM purchase_receipts WHERE po_id = $1))`,
          [poLink.po_id]
        );
        const availableAdv = totalAdvance - parseFloat(alreadyKnocked.knocked);
        if (availableAdv > 0.01) {
          const knockAmt = Math.min(availableAdv, parseFloat(bill.total_amount));
          const { rows: [advGl] } = await client.query(
            `SELECT id FROM chart_of_accounts WHERE account_code='1131' AND is_active=true LIMIT 1`
          );
          if (advGl) {
            const knockJe = await financeService.createAndPostJE({
              sourceModule: 'AP_ADV_KNOCKOFF',
              sourceId:     parseInt(req.params.id),
              sourceRef:    `Advance Knock-off for Bill ${bill.bill_number}`,
              narration:    `Advance adjusted against ${bill.vendor_name} | ${bill.bill_number}`,
              lines: [
                { accountId: bill.ap_account_id, debit: knockAmt, credit: 0,
                  description: `AP cleared (advance) — ${bill.bill_number}`, centerId: bill.center_id||null },
                { accountId: advGl.id, debit: 0, credit: knockAmt,
                  description: `Advance knocked off — PO #${poLink.po_id}`, centerId: bill.center_id||null },
              ],
              createdBy: req.user?.id || null,
              postingKey: `ADV-KNOCK-${req.params.id}-${poLink.po_id}`,
              entryDate: payment_date,
              client,
            });
            // Record knock-off in vendor_payments so C8's balance check stays accurate
            await client.query(
              `INSERT INTO vendor_payments
                 (bill_id, payment_mode, amount_paid, payment_date, journal_entry_id,
                  notes, active, created_at, updated_at)
               VALUES ($1,'ADVANCE_KNOCKOFF',$2,$3,$4,$5,true,NOW(),NOW())`,
              [req.params.id, knockAmt, payment_date, knockJe.id,
               `Advance knock-off applied during payment — PO #${poLink.po_id}`]
            );
            logger.info('Advance knock-off JE posted', { bill_id: req.params.id, po_id: poLink.po_id, amount: knockAmt });
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, payment_status: newStatus, paid_amount: paidAmt });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Vendor bill payment POST:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ── POST /api/payments/grn/:id/pay ───────────────────────────────────────────
// Pay a GRN-based payable (procurement workflow — no vendor_bill)
// GL: DR ap_account (from vendor_master) → CR bank/cash
router.post('/grn/:id/pay', authorize(AP_WRITE), [
  body('payment_mode').isIn(['CASH','CHEQUE','NEFT','RTGS','UPI']),
  body('amount_paid').isFloat({ min: 0.01 }),
  body('payment_date').isDate(),
  body('transaction_reference').trim().notEmpty().withMessage('Transaction reference is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [grn] } = await client.query(
      `SELECT pr.*, po.vendor_id, vm.vendor_name, vm.vendor_code,
              -- AP account from GRN JE credit line — item category driven, not vendor driven
              (SELECT jel.account_id FROM journal_entry_lines jel
               WHERE jel.journal_entry_id = pr.journal_entry_id AND jel.credit_amount > 0
               ORDER BY jel.id LIMIT 1) AS ap_account_id,
              COALESCE(
                (SELECT SUM(vp.amount_paid) FROM vendor_payments vp
                 WHERE vp.grn_id = pr.id AND vp.active = true), 0
              ) AS already_paid
       FROM purchase_receipts pr
       JOIN procurement_orders po ON po.id = pr.po_id
       LEFT JOIN vendor_master vm ON vm.id = po.vendor_id AND vm.active = true
       WHERE pr.id = $1 AND pr.active = true FOR UPDATE OF pr`,
      [req.params.id]
    );
    if (!grn) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'GRN not found' });
    }
    if (!['APPROVED','POSTED'].includes(grn.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `GRN status is ${grn.status}, cannot pay` });
    }

    const { payment_mode, amount_paid, payment_date,
            transaction_reference, notes, bank_account_id } = req.body;

    const amt       = parseFloat(parseFloat(amount_paid).toFixed(2));
    const remaining = parseFloat(grn.total_value) - parseFloat(grn.already_paid);
    if (amt > remaining + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment ₹${amt.toFixed(2)} exceeds outstanding balance ₹${remaining.toFixed(2)}`,
      });
    }

    // Resolve bank GL account
    let bankRowId = bank_account_id || null;
    let bankGlId  = null;
    if (bankRowId) {
      const { rows: [ba] } = await client.query(
        `SELECT id, gl_account_id FROM bank_accounts WHERE id = $1`, [bankRowId]
      );
      bankGlId = ba?.gl_account_id || null;
    }
    if (!bankGlId) {
      const bankCode = payment_mode === 'CASH' ? '1111' : '1112';
      const { rows: [ba] } = await client.query(
        `SELECT ba.id, ba.gl_account_id FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE coa.account_code = $1 LIMIT 1`, [bankCode]
      );
      bankRowId = ba?.id || null;
      bankGlId  = ba?.gl_account_id || null;
    }
    if (!bankGlId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot post payment: bank/cash GL account not found.',
      });
    }

    // Insert payment record
    const { rows: [payment] } = await client.query(
      `INSERT INTO vendor_payments
         (grn_id, payment_mode, amount_paid, payment_date,
          transaction_reference, notes, bank_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [grn.id, payment_mode, amt, payment_date,
       transaction_reference || null, notes || null, bankRowId]
    );

    // Post JE: DR AP → CR Bank
    const je = await financeService.createAndPostJE({
      sourceModule: 'AP_PAYMENT',
      sourceId:     payment.id,
      sourceRef:    `Payment for GRN ${grn.grn_number}`,
      narration:    `Payment to ${grn.vendor_name} | ${grn.grn_number} | ${payment_mode}`,
      lines: [
        { accountId: grn.ap_account_id, debit: amt, credit: 0,
          description: `AP cleared — ${grn.grn_number}`, centerId: grn.center_id || null },
        { accountId: bankGlId, debit: 0, credit: amt,
          description: `Payment to ${grn.vendor_name} via ${payment_mode}`, centerId: grn.center_id || null },
      ],
      createdBy:  req.user?.id || null,
      postingKey: `GRNPAY-${payment.id}`,
      entryDate:  payment_date,
      client,
    });

    await client.query(
      `UPDATE vendor_payments SET journal_entry_id=$1 WHERE id=$2`, [je.id, payment.id]
    );

    // Advance knock-off: if this PO had a paid advance bill, reconcile it now
    const { rows: [poRow] } = await client.query(
      `SELECT po.id AS po_id FROM procurement_orders po WHERE po.id = $1`, [grn.po_id]
    );
    if (poRow?.po_id) {
      const { rows: advBills } = await client.query(
        `SELECT vb.id, vb.total_amount,
                COALESCE(SUM(vp.amount_paid),0) AS paid
         FROM vendor_bills vb
         LEFT JOIN vendor_payments vp ON vp.bill_id = vb.id AND vp.active = true
         WHERE vb.source_po_id = $1 AND vb.bill_type = 'ADVANCE'
           AND vb.bill_status = 'APPROVED' AND vb.payment_status = 'PAID' AND vb.active = true
         GROUP BY vb.id, vb.total_amount`, [poRow.po_id]
      );
      const totalAdvance = advBills.reduce((s, r) => s + parseFloat(r.total_amount), 0);
      // Check ALL knockoffs against this PO (not just this GRN) to prevent double-applying the same advance
      const { rows: [alreadyKnocked] } = await client.query(
        `SELECT COALESCE(SUM(vp.amount_paid), 0) AS knocked
         FROM vendor_payments vp
         LEFT JOIN vendor_bills vb ON vb.id = vp.bill_id
         WHERE vp.payment_mode = 'ADVANCE_KNOCKOFF' AND vp.active = true
           AND (vp.grn_id IN (SELECT id FROM purchase_receipts WHERE po_id = $1)
                OR vb.source_po_id = $1)`,
        [poRow.po_id]
      );
      const availableAdv = totalAdvance - parseFloat(alreadyKnocked.knocked);
      if (availableAdv > 0.01) {
        const knockAmt = Math.min(availableAdv, parseFloat(grn.total_value));
        const { rows: [advGl] } = await client.query(
          `SELECT id FROM chart_of_accounts WHERE account_code = '1131' AND is_active = true LIMIT 1`
        );
        if (advGl && grn.ap_account_id) {
          const knockJe = await financeService.createAndPostJE({
            sourceModule: 'AP_ADV_KNOCKOFF',
            sourceId:     grn.id,
            sourceRef:    `Advance Knock-off for GRN ${grn.grn_number}`,
            narration:    `Advance adjusted against ${grn.vendor_name} | ${grn.grn_number}`,
            lines: [
              { accountId: grn.ap_account_id, debit: knockAmt, credit: 0,
                description: `AP cleared (advance) — ${grn.grn_number}`, centerId: grn.center_id || null },
              { accountId: advGl.id, debit: 0, credit: knockAmt,
                description: `Advance knocked off — PO #${poRow.po_id}`, centerId: grn.center_id || null },
            ],
            createdBy:  req.user?.id || null,
            postingKey: `ADV-KNOCK-GRN-${grn.id}-${poRow.po_id}`,
            entryDate:  payment_date,
            client,
          });
          await client.query(
            `INSERT INTO vendor_payments
               (grn_id, payment_mode, amount_paid, payment_date, journal_entry_id,
                notes, active, created_at, updated_at)
             VALUES ($1,'ADVANCE_KNOCKOFF',$2,$3,$4,$5,true,NOW(),NOW())`,
            [grn.id, knockAmt, payment_date, knockJe.id,
             `Advance knock-off applied during GRN payment — PO #${poRow.po_id}`]
          );
          logger.info('GRN advance knock-off JE posted', { grn_id: grn.id, po_id: poRow.po_id, amount: knockAmt });
        }
      }
    }

    const totalPaid = parseFloat(grn.already_paid) + amt;
    const newStatus = totalPaid >= parseFloat(grn.total_value) - 0.01 ? 'PAID' : 'PARTIAL';

    await client.query('COMMIT');
    logger.info('GRN payment recorded', { grn_id: grn.id, amount: amt, je_id: je.id });
    res.json({
      success: true,
      payment_status: newStatus,
      paid_amount: totalPaid,
      balance_amount: Math.max(0, parseFloat(grn.total_value) - totalPaid),
      journal_entry_id: je.id,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('GRN payment POST:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ── GET /api/payments/vendor-bills/:id/advance-info ──────────────────────────
// Returns available advance for the PO linked to this bill
router.get('/vendor-bills/:id/advance-info', async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query(
      `SELECT vb.source_grn_id FROM vendor_bills vb WHERE vb.id=$1 AND vb.active=true`,
      [req.params.id]
    );
    if (!bill?.source_grn_id) return res.json({ success: true, advance_available: 0, advance_bills: [] });

    const { rows: [poLink] } = await pool.query(
      `SELECT po.id AS po_id, po.po_number, po.advance_amount FROM purchase_receipts pr
       JOIN procurement_orders po ON po.id = pr.po_id WHERE pr.id=$1`, [bill.source_grn_id]
    );
    if (!poLink) return res.json({ success: true, advance_available: 0, advance_bills: [] });

    const { rows: advBills } = await pool.query(
      `SELECT vb.id, vb.bill_number, vb.total_amount, vb.payment_status
       FROM vendor_bills vb
       WHERE vb.source_po_id=$1 AND vb.bill_type='ADVANCE'
         AND vb.bill_status='APPROVED' AND vb.payment_status='PAID' AND vb.active=true`,
      [poLink.po_id]
    );
    const totalAdvance = advBills.reduce((s, r) => s + parseFloat(r.total_amount), 0);
    res.json({ success: true, po_id: poLink.po_id, po_number: poLink.po_number,
               advance_available: totalAdvance, advance_bills: advBills });
  } catch (e) {
    logger.error('advance-info GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/payments/vendor-bills/:id/apply-advance ────────────────────────
// Knock off paid advance against this regular vendor bill.
// Creates JE: DR AP / CR Advance to Suppliers (1131)
// Uses bill.ap_account_id with fallback to COA code '2111'
router.post('/vendor-bills/:id/apply-advance', authorize(AP_WRITE), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Load the vendor bill (lock row)
    const { rows: [bill] } = await client.query(
      `SELECT vb.*, pr.po_id AS grn_po_id,
              -- AP account: read GRN JE credit line (item-type-driven, must match what was credited at GRN)
              COALESCE(
                (SELECT jel.account_id FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = pr.journal_entry_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT ic.ap_account_id
                 FROM procurement_order_items poi
                 JOIN item_master im ON im.id = poi.item_master_id
                 JOIN item_categories ic ON ic.id = im.category_id
                 WHERE poi.po_id = COALESCE(pr.po_id, vb.source_po_id)
                   AND ic.ap_account_id IS NOT NULL
                 LIMIT 1),
                (SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1)
              ) AS ap_account_id
       FROM vendor_bills vb
       LEFT JOIN purchase_receipts pr ON pr.id = vb.source_grn_id
       WHERE vb.id = $1 AND vb.active = true
       FOR UPDATE OF vb`,
      [req.params.id]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (bill.bill_status !== 'APPROVED') return res.status(400).json({ error: 'Bill must be APPROVED before applying advance' });
    if (bill.payment_status === 'PAID') return res.status(400).json({ error: 'Bill is already paid' });

    const po_id = bill.po_id || bill.grn_po_id;
    if (!po_id) return res.status(400).json({ error: 'No PO linked to this bill' });

    // 2. Find paid advance bills on the same PO
    const { rows: advBills } = await client.query(
      `SELECT vb.id, vb.bill_number, vb.total_amount
       FROM vendor_bills vb
       WHERE vb.source_po_id = $1 AND vb.bill_type = 'ADVANCE'
         AND vb.bill_status = 'APPROVED' AND vb.payment_status = 'PAID' AND vb.active = true`,
      [po_id]
    );

    if (!advBills.length) {
      // Check for unpaid advance bills — vendor delivered without collecting advance
      const { rows: unpaidAdv } = await client.query(
        `SELECT id, bill_number FROM vendor_bills
         WHERE source_po_id = $1 AND bill_type = 'ADVANCE'
           AND payment_status != 'PAID' AND active = true`,
        [po_id]
      );
      if (unpaidAdv.length) {
        // Void the unpaid advance bills — advance was never actually paid out
        await client.query(
          `UPDATE vendor_bills SET bill_status = 'CANCELLED', active = false, updated_at = NOW()
           WHERE id = ANY($1::int[])`,
          [unpaidAdv.map(r => r.id)]
        );
        await client.query('COMMIT');
        return res.json({
          success: true,
          advance_voided: true,
          voided_bills: unpaidAdv.map(r => r.bill_number),
          message: `Advance ${unpaidAdv.map(r => r.bill_number).join(', ')} voided (never paid) — pay the full bill amount directly`,
        });
      }
      // No advance was ever created for this PO — skip knock-off, proceed with direct payment
      await client.query('COMMIT');
      return res.json({ success: true, no_advance: true, message: 'No advance bill found — pay the full amount directly' });
    }

    const totalAdvance = advBills.reduce((s, r) => s + parseFloat(r.total_amount), 0);

    // Subtract advance already knocked off against other bills on this PO
    const { rows: [knockedRow] } = await client.query(
      `SELECT COALESCE(SUM(vp.amount_paid), 0) AS knocked
       FROM vendor_payments vp
       LEFT JOIN vendor_bills vb ON vb.id = vp.bill_id
       WHERE vp.payment_mode = 'ADVANCE_KNOCKOFF' AND vp.active = true
         AND (vb.source_po_id = $1
              OR vp.grn_id IN (SELECT id FROM purchase_receipts WHERE po_id = $1))`,
      [po_id]
    );
    const alreadyKnockedOff = parseFloat(knockedRow.knocked);
    const remainingAdvance  = totalAdvance - alreadyKnockedOff;
    const billAmount        = parseFloat(bill.total_amount);
    const applyAmount       = Math.min(remainingAdvance, billAmount);

    if (applyAmount <= 0) {
      await client.query('COMMIT');
      return res.json({ success: true, no_advance: true, message: 'Advance already fully applied to previous GRNs — pay the full amount directly' });
    }

    // 3. Resolve AP and Advance accounts
    // AP account comes from the bill query (GRN JE credit line → PO item category → fallback)
    const AP_ACCT_ID = bill.ap_account_id ? parseInt(bill.ap_account_id) : null;
    if (!AP_ACCT_ID) throw new Error('AP GL account not found — ensure GRN has a posted JE or PO has item categories with AP accounts set');
    const { rows: [advGlRow] } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code='1131' AND is_active=true LIMIT 1`
    );
    if (!advGlRow) throw new Error('GL account 1131 (Advance to Suppliers) not found');
    const ADV_ACCT_ID = advGlRow.id;

    // 4. Build knock-off JE via createAndPostJE (handles balance check, period, COA updates, idempotency)
    const narration = `Advance knock-off — ${advBills.map(b => b.bill_number).join(', ')} → ${bill.bill_number}`;
    const je = await financeService.createAndPostJE({
      sourceModule: 'ADVANCE_KNOCKOFF',
      sourceId:     bill.id,
      sourceRef:    bill.bill_number,
      narration,
      lines: [
        { accountId: AP_ACCT_ID,  debit: applyAmount, credit: 0, description: `Advance applied — ${bill.bill_number}` },
        { accountId: ADV_ACCT_ID, debit: 0, credit: applyAmount, description: `Advance cleared — ${advBills.map(b => b.bill_number).join(', ')}` },
      ],
      createdBy:  req.user?.id || null,
      client,
      postingKey: `ADV-KNOCK-${bill.id}`,
      centerId:   bill.center_id || null,
    });

    // 5. Record knock-off in vendor_payments so balance_amount stays accurate
    await client.query(
      `INSERT INTO vendor_payments
         (bill_id, payment_mode, amount_paid, payment_date, journal_entry_id,
          notes, active, created_at, updated_at)
       VALUES ($1, 'ADVANCE_KNOCKOFF', $2, CURRENT_DATE, $3, $4, true, NOW(), NOW())`,
      [bill.id, applyAmount, je.id,
       `Advance knock-off — ${advBills.map(b => b.bill_number).join(', ')}`]
    );

    // 6. Mark this vendor bill status based on remaining balance
    const newStatus = applyAmount >= billAmount ? 'PAID' : 'PARTIAL';
    await client.query(
      `UPDATE vendor_bills
       SET payment_status = $1, journal_entry_id = COALESCE(journal_entry_id, $2), updated_at = NOW()
       WHERE id = $3`,
      [newStatus, je.id, bill.id]
    );

    await client.query('COMMIT');
    logger.info('Advance knock-off posted', { bill_id: bill.id, je_id: je.id, amount: applyAmount });
    res.json({ success: true, je_id: je.id, entry_number: je.entry_number, applied_amount: applyAmount, payment_status: newStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('apply-advance error:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR BILLS — AP lifecycle (DRAFT → SUBMITTED → APPROVED → PAID)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/payments/grn-bills ───────────────────────────────────────────────
// Returns all POSTED GRNs with their linked bill status (if any).
// AP team uses this as the starting point to raise vendor bills.
router.get('/grn-bills', async (req, res) => {
  try {
    const { center_id } = req.query;
    const conds = [`pr.status IN ('APPROVED','POSTED')`, `pr.active = true`];
    const params = [];
    if (center_id) { params.push(parseInt(center_id)); conds.push(`pr.center_id = $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT
        pr.id              AS grn_id,
        pr.grn_number,
        pr.receipt_date,
        pr.total_value,
        pr.center_id,
        c.name             AS center_name,
        c.code             AS center_code,
        po.id              AS po_id,
        po.po_number,
        po.vendor_name,
        po.vendor_gstin,
        po.subtotal        AS po_subtotal,
        po.gst_amount      AS po_gst_amount,
        po.advance_required,
        po.advance_amount  AS po_advance_amount,
        -- Bill (if already raised against this GRN)
        vb.id              AS bill_id,
        vb.bill_number,
        vb.bill_status,
        vb.payment_status,
        vb.vendor_invoice_number,
        vb.due_date        AS bill_due_date,
        vb.total_amount    AS bill_amount,
        vb.rejected_reason,
        vb.bill_type,
        vb.source_po_id,
        -- Line items as JSON array
        (SELECT json_agg(json_build_object(
          'item_name',    pri.item_name,
          'uom',          pri.uom,
          'received_qty', pri.received_qty,
          'unit_rate',    pri.unit_rate,
          'gst_rate',     pri.gst_rate,
          'gst_amount',   pri.gst_amount,
          'amount',       pri.amount
        ) ORDER BY pri.id)
         FROM purchase_receipt_items pri WHERE pri.receipt_id = pr.id
        )                  AS items
      FROM purchase_receipts pr
      JOIN procurement_orders po ON po.id = pr.po_id
      LEFT JOIN centers c        ON c.id  = pr.center_id
      LEFT JOIN vendor_bills vb  ON vb.source_grn_id = pr.id AND vb.active = true
      WHERE ${conds.join(' AND ')}
      ORDER BY pr.receipt_date DESC, pr.id DESC
    `, params);

    // Also fetch standalone ADVANCE bills (from POs, no GRN)
    const { rows: advRows } = await pool.query(`
      SELECT
        vb.id              AS bill_id,
        vb.bill_number,
        vb.bill_status,
        vb.payment_status,
        vb.bill_type,
        vb.total_amount    AS bill_amount,
        vb.rejected_reason,
        vb.vendor_name_text AS vendor_name,
        vb.center_id,
        vb.source_po_id,
        vb.bill_date,
        vb.due_date        AS bill_due_date,
        po.po_number,
        po.advance_percentage,
        c.name             AS center_name,
        c.code             AS center_code
      FROM vendor_bills vb
      LEFT JOIN procurement_orders po ON po.id = vb.source_po_id
      LEFT JOIN centers c             ON c.id  = vb.center_id
      WHERE vb.bill_type = 'ADVANCE' AND vb.active = true
      ORDER BY vb.created_at DESC
    `);

    res.json({ success: true, grns: rows, advance_bills: advRows });
  } catch (e) {
    logger.error('grn-bills GET:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// ── GET /api/payments/vendor-bills ────────────────────────────────────────────
router.get('/vendor-bills', async (req, res) => {
  try {
    const { bill_status, payment_status, vendor_code, center_id, from, to } = req.query;
    const conds = ['vb.active = true'];
    const params = [];

    if (bill_status)    { params.push(bill_status);        conds.push(`vb.bill_status = $${params.length}`); }
    if (payment_status) { params.push(payment_status);     conds.push(`vb.payment_status = $${params.length}`); }
    if (vendor_code)    { params.push(vendor_code);        conds.push(`vb.vendor_code = $${params.length}`); }
    if (center_id)      { params.push(parseInt(center_id)); conds.push(`vb.center_id = $${params.length}`); }
    if (from)           { params.push(from);               conds.push(`vb.bill_date >= $${params.length}`); }
    if (to)             { params.push(to);                 conds.push(`vb.bill_date <= $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT
        vb.*,
        COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name,
        c.name          AS center_name,
        po.po_number,
        u_sub.username  AS submitted_by_name,
        u_apr.username  AS approved_by_name,
        COALESCE(
          (SELECT SUM(vp.amount_paid) FROM vendor_payments vp
           WHERE vp.bill_id = vb.id AND vp.active = true), 0
        )               AS amount_paid
      FROM vendor_bills vb
      LEFT JOIN vendor_master vm        ON vm.vendor_code = vb.vendor_code
      LEFT JOIN centers c               ON c.id = vb.center_id
      LEFT JOIN procurement_orders po   ON po.id = vb.po_id
      LEFT JOIN users u_sub             ON u_sub.id = vb.submitted_by
      LEFT JOIN users u_apr             ON u_apr.id = vb.approved_by
      WHERE ${conds.join(' AND ')}
      ORDER BY vb.bill_date DESC, vb.id DESC
    `, params);

    const now = new Date();
    const kpis = {
      total_bills:          rows.length,
      pending_approval:     rows.filter(r => r.bill_status === 'SUBMITTED').length,
      approved_outstanding: rows.filter(r => r.bill_status === 'APPROVED' && r.payment_status !== 'PAID').length,
      paid_this_month:      rows.filter(r => {
        const bd = new Date(r.bill_date);
        return r.payment_status === 'PAID'
          && bd.getMonth() === now.getMonth() && bd.getFullYear() === now.getFullYear();
      }).length,
    };

    res.json({ success: true, bills: rows, kpis });
  } catch (e) {
    logger.error('vendor-bills GET:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// ── POST /api/payments/vendor-bills — create DRAFT ────────────────────────────
router.post('/vendor-bills', authorize(PROC_WRITE), [
  body('vendor_invoice_number').trim().notEmpty().withMessage('Vendor invoice number is required'),
  body('bill_date').isDate().withMessage('Valid bill date required'),
  body('due_date').isDate().withMessage('Valid due date required'),
  body('subtotal').isFloat({ min: 0.01 }).withMessage('Subtotal must be > 0'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const {
      vendor_invoice_number, center_id, bill_date, due_date,
      subtotal, cgst_pct = 0, sgst_pct = 0, igst_pct = 0,
      notes, po_id, grn_id, vendor_name, vendor_gstin,
    } = req.body;

    // Prevent duplicate bill for same GRN
    if (grn_id) {
      const { rows: [dup] } = await pool.query(
        `SELECT id FROM vendor_bills WHERE source_grn_id=$1 AND active=true LIMIT 1`, [grn_id]
      );
      if (dup) return res.status(409).json({ error: 'A bill already exists for this GRN' });
    }

    // Auto-resolve vendor_code from vendor_master by GSTIN (preferred) or name
    const { rows: [vm] } = await pool.query(
      `SELECT vendor_code FROM vendor_master
       WHERE active = true AND (
         (gst_number IS NOT NULL AND gst_number <> '' AND gst_number = $1)
         OR LOWER(vendor_name) = LOWER($2)
         OR LOWER($2) LIKE '%' || LOWER(vendor_name) || '%'
         OR LOWER(vendor_name) LIKE '%' || LOWER(SPLIT_PART($2, ' ', 1)) || '%'
       )
       ORDER BY
         (gst_number = $1) DESC,
         (LOWER(vendor_name) = LOWER($2)) DESC
       LIMIT 1`,
      [vendor_gstin || '', vendor_name || '']
    );
    const vendor_code     = vm?.vendor_code || null;
    const vendor_name_text = vendor_name || null;

    const sub          = parseFloat(subtotal);
    const cgst_amount  = parseFloat(((sub * cgst_pct) / 100).toFixed(2));
    const sgst_amount  = parseFloat(((sub * sgst_pct) / 100).toFixed(2));
    const igst_amount  = parseFloat(((sub * igst_pct) / 100).toFixed(2));
    const total_amount = parseFloat((sub + cgst_amount + sgst_amount + igst_amount).toFixed(2));

    // Generate bill number: VB-YYYYMM-NNNNN
    const { rows: [seq] } = await pool.query(
      `SELECT COALESCE(MAX(
         CAST(SPLIT_PART(bill_number, '-', 3) AS INTEGER)
       ), 0) + 1 AS next
       FROM vendor_bills WHERE bill_number LIKE 'VB-%-%'`
    );
    const bill_number = `VB-${bill_date.slice(0, 7).replace('-', '')}-${String(seq.next).padStart(5, '0')}`;

    const { rows: [bill] } = await pool.query(
      `INSERT INTO vendor_bills
         (vendor_code, vendor_name_text, vendor_invoice_number, center_id, bill_number,
          bill_date, due_date, subtotal, cgst_amount, sgst_amount, igst_amount,
          total_amount, notes, po_id, source_grn_id,
          bill_status, submitted_by, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'DRAFT',$16,'PENDING')
       RETURNING *`,
      [vendor_code, vendor_name_text, vendor_invoice_number, center_id || null, bill_number,
       bill_date, due_date, sub, cgst_amount, sgst_amount, igst_amount,
       total_amount, notes || null, po_id || null, grn_id || null,
       req.user?.id || null]
    );

    logger.info('Vendor bill DRAFT created', { bill_id: bill.id, bill_number, vendor_code });
    res.status(201).json({ success: true, bill });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Duplicate bill number — retry' });
    logger.error('vendor-bills POST:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// ── PUT /api/payments/vendor-bills/:id — update DRAFT ─────────────────────────
router.put('/vendor-bills/:id', authorize(PROC_WRITE), [
  body('vendor_invoice_number').optional().trim().notEmpty(),
  body('bill_date').optional().isDate(),
  body('due_date').optional().isDate(),
  body('subtotal').optional().isFloat({ min: 0.01 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { rows: [existing] } = await pool.query(
      `SELECT id, bill_status FROM vendor_bills WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!existing)                      return res.status(404).json({ error: 'Bill not found' });
    if (!['DRAFT','REJECTED'].includes(existing.bill_status)) return res.status(400).json({ error: 'Only DRAFT or REJECTED bills can be edited' });

    const { vendor_invoice_number, center_id, bill_date, due_date,
            subtotal, cgst_pct, sgst_pct, igst_pct, notes, po_id } = req.body;

    let cgst_amount = null, sgst_amount = null, igst_amount = null, total_amount = null;
    if (subtotal !== undefined) {
      const sub = parseFloat(subtotal);
      cgst_amount  = parseFloat(((sub * (cgst_pct || 0)) / 100).toFixed(2));
      sgst_amount  = parseFloat(((sub * (sgst_pct || 0)) / 100).toFixed(2));
      igst_amount  = parseFloat(((sub * (igst_pct || 0)) / 100).toFixed(2));
      total_amount = parseFloat((sub + cgst_amount + sgst_amount + igst_amount).toFixed(2));
    }

    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills SET
         vendor_invoice_number = COALESCE($1,  vendor_invoice_number),
         center_id    = COALESCE($2,  center_id),
         bill_date    = COALESCE($3,  bill_date),
         due_date     = COALESCE($4,  due_date),
         subtotal     = COALESCE($5,  subtotal),
         cgst_amount  = COALESCE($6,  cgst_amount),
         sgst_amount  = COALESCE($7,  sgst_amount),
         igst_amount  = COALESCE($8,  igst_amount),
         total_amount = COALESCE($9,  total_amount),
         notes        = COALESCE($10, notes),
         po_id        = COALESCE($11, po_id),
         updated_at   = NOW()
       WHERE id=$12 RETURNING *`,
      [vendor_invoice_number || null, center_id || null, bill_date || null, due_date || null,
       subtotal || null, cgst_amount, sgst_amount, igst_amount, total_amount,
       notes || null, po_id || null, req.params.id]
    );
    res.json({ success: true, bill });
  } catch (e) {
    logger.error('vendor-bills PUT:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
});

// ── POST /api/payments/vendor-bills/:id/submit ────────────────────────────────
router.post('/vendor-bills/:id/submit', authorize(PROC_WRITE), async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills
       SET bill_status='SUBMITTED', submitted_by=$1, rejected_reason=NULL, updated_at=NOW()
       WHERE id=$2 AND bill_status IN ('DRAFT','REJECTED') AND active=true
       RETURNING id, bill_status, bill_number`,
      [req.user?.id || null, req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not editable' });
    logger.info('Bill submitted for approval', { bill_id: bill.id });
    res.json({ success: true, bill_status: bill.bill_status });
  } catch (e) {
    logger.error('vendor-bills submit:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/payments/vendor-bills/:id/approve ───────────────────────────────
// Approves the bill and posts the AP Journal Entry:
//   DR Expense/Purchase account  →  CR Vendor AP account
router.post('/vendor-bills/:id/approve', authorize(AP_ADMIN), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [bill] } = await client.query(
      `SELECT vb.*,
              -- AP account priority (item type drives AP, not vendor):
              -- 1. GRN JE credit line (REGULAR bills — what was already credited at GRN)
              -- 2. PO items' item category ap_account_id (ADVANCE bills — matches future GRN)
              -- 3. Fallback: 2112 Equipment AP
              COALESCE(
                (SELECT jel.account_id FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = pr.journal_entry_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT ic.ap_account_id
                 FROM procurement_order_items poi
                 JOIN item_master im ON im.id = poi.item_master_id
                 JOIN item_categories ic ON ic.id = im.category_id
                 WHERE poi.po_id = COALESCE(vb.source_po_id, pr.po_id)
                   AND ic.ap_account_id IS NOT NULL
                 LIMIT 1),
                (SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1)
              ) AS ap_account_id,
              COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name,
              (SELECT p.id FROM parties p JOIN vendor_master vm2 ON vm2.id = p.vendor_id WHERE vm2.vendor_code = vb.vendor_code LIMIT 1) AS party_id,
              pr.journal_entry_id AS grn_je_id
       FROM vendor_bills vb
       LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code AND vm.active = true
       LEFT JOIN purchase_receipts pr ON pr.id = vb.source_grn_id
       WHERE vb.id=$1 AND vb.bill_status='SUBMITTED' AND vb.active=true
       FOR UPDATE OF vb`,
      [req.params.id]
    );
    if (!bill) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bill not found or not in SUBMITTED status' });
    }

    // Post JE at approval:
    //   ADVANCE bill:  DR Advance to Suppliers (1131) → CR AP  (always)
    //   REGULAR bill with existing JE or GRN JE already posted → skip (avoid double-count)
    //   REGULAR bill without prior JE: DR item GL accounts → CR AP
    let jeId = bill.journal_entry_id || null;

    const needsJE = bill.bill_type === 'ADVANCE'
      ? true  // advance bills always need approval JE
      : !bill.journal_entry_id && !bill.grn_je_id;  // regular: skip if JE already exists or GRN JE covers it

    if (needsJE && !bill.ap_account_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot approve bill: AP GL account is not set on this bill. '
             + 'Set it on the vendor master or assign it manually before approving.',
      });
    }

    if (needsJE && bill.ap_account_id) {
      if (bill.bill_type === 'ADVANCE') {
        // DR 1131 Advance to Suppliers / CR AP
        const { rows: [advGl] } = await client.query(
          `SELECT id FROM chart_of_accounts WHERE account_code='1131' AND is_active=true LIMIT 1`
        );
        if (advGl) {
          const je = await financeService.createAndPostJE({
            sourceModule: 'AP_ADVANCE',
            sourceId:     bill.id,
            sourceRef:    `Vendor Bill ${bill.bill_number}`,
            narration:    `Advance to ${bill.vendor_name} | PO ${bill.source_po_id ? '#'+bill.source_po_id : ''} | ${bill.bill_number}`,
            lines: [
              { accountId: advGl.id, debit: parseFloat(bill.total_amount), credit: 0,
                description: `Advance — ${bill.bill_number}`, centerId: bill.center_id || null },
              { accountId: bill.ap_account_id, debit: 0, credit: parseFloat(bill.total_amount),
                description: `AP — ${bill.vendor_name} | ${bill.bill_number}`, centerId: bill.center_id || null },
            ],
            createdBy:  req.user?.id || null,
            postingKey: `VBILL-AP-${bill.id}`,
            entryDate:  bill.bill_date,
            client,
          });
          jeId = je.id;
        }
      } else {
        // REGULAR bill without GRN: DR item GL accounts / CR AP
        const { rows: billItems } = await client.query(
          `SELECT vbi.amount, vbi.gst_amount,
                  COALESCE(vbi.gl_account_id,
                    (SELECT id FROM chart_of_accounts WHERE account_code LIKE '5%' AND is_active=true ORDER BY account_code LIMIT 1)
                  ) AS gl_account_id
           FROM vendor_bill_items vbi WHERE vbi.bill_id=$1`, [bill.id]
        );
        const glGroups = {};
        for (const item of billItems) {
          const glId = item.gl_account_id;
          if (!glId) continue;
          glGroups[glId] = (glGroups[glId] || 0) + parseFloat(item.amount);
        }
        const debitLines = Object.entries(glGroups)
          .filter(([, amt]) => amt > 0.001)
          .map(([accountId, amt]) => ({
            accountId: parseInt(accountId), debit: parseFloat(amt.toFixed(2)), credit: 0,
            description: `Purchase — ${bill.bill_number}`, centerId: bill.center_id || null,
          }));
        if (debitLines.length) {
          const total = debitLines.reduce((s, l) => s + l.debit, 0);
          const je = await financeService.createAndPostJE({
            sourceModule: 'AP_BILL',
            sourceId:     bill.id,
            sourceRef:    `Vendor Bill ${bill.bill_number}`,
            narration:    `Vendor Invoice from ${bill.vendor_name} | ${bill.bill_number}`,
            lines: [
              ...debitLines,
              { accountId: bill.ap_account_id, debit: 0, credit: parseFloat(total.toFixed(2)),
                description: `AP — ${bill.vendor_name} | ${bill.bill_number}`, centerId: bill.center_id || null },
            ],
            createdBy:  req.user?.id || null,
            postingKey: `VBILL-AP-${bill.id}`,
            entryDate:  bill.bill_date,
            client,
          });
          jeId = je.id;
        }
      }
    }

    await client.query(
      `UPDATE vendor_bills
       SET bill_status='APPROVED', approved_by=$1, approved_at=NOW(),
           journal_entry_id=COALESCE($2, journal_entry_id), updated_at=NOW()
       WHERE id=$3`,
      [req.user?.id || null, jeId, req.params.id]
    );

    await client.query('COMMIT');
    logger.info('Bill approved + JE posted', { bill_id: req.params.id, je_id: jeId });
    res.json({ success: true, bill_status: 'APPROVED', journal_entry_id: jeId });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('vendor-bills approve:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ── POST /api/payments/vendor-bills/:id/reject ────────────────────────────────
router.post('/vendor-bills/:id/reject', authorize(AP_ADMIN), [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills
       SET bill_status='REJECTED', rejected_reason=$1, updated_at=NOW()
       WHERE id=$2 AND bill_status='SUBMITTED' AND active=true
       RETURNING id, bill_status`,
      [req.body.reason, req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not in SUBMITTED status' });
    logger.info('Bill rejected', { bill_id: bill.id });
    res.json({ success: true, bill_status: 'REJECTED' });
  } catch (e) {
    logger.error('vendor-bills reject:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/payments/vendor-bills/:id/repost ─────────────────────────────────
// Correct vendor_invoice_number and/or due_date on a REJECTED bill and resubmit
router.put('/vendor-bills/:id/repost', authorize(PROC_WRITE), async (req, res) => {
  try {
    const { vendor_invoice_number, due_date } = req.body;
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills
       SET vendor_invoice_number = COALESCE(NULLIF($1,''), vendor_invoice_number),
           due_date = COALESCE($2::date, due_date),
           bill_status = 'SUBMITTED',
           rejected_reason = NULL,
           submitted_by = $3,
           updated_at = NOW()
       WHERE id=$4 AND bill_status='REJECTED' AND active=true
       RETURNING id, bill_number, bill_status, vendor_invoice_number, due_date`,
      [vendor_invoice_number || '', due_date || null, req.user?.id || null, req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not in REJECTED status' });
    logger.info('Bill reposted from REJECTED → SUBMITTED', { bill_id: bill.id });
    res.json({ success: true, bill });
  } catch (e) {
    logger.error('vendor-bills repost:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/payments/tele-rad/accruals ──────────────────────────────────────
// List pending tele-rad accruals grouped by reporter, ready for consolidation
router.get('/tele-rad/accruals', async (req, res) => {
  try {
    const { reporter_id, date_from, date_to, center_id } = req.query;
    const conds = [`rm.reporter_type IN ('TELERADIOLOGY','RADIOLOGIST')`, `p.vendor_bill_id IS NULL`, `p.active = true`, `p.status = 'PENDING'`];
    const params = [];
    if (reporter_id) { params.push(reporter_id); conds.push(`p.reporter_id = $${params.length}`); }
    if (center_id)   { params.push(center_id);   conds.push(`p.center_id = $${params.length}`); }
    if (date_from)   { params.push(date_from);   conds.push(`p.created_at::date >= $${params.length}`); }
    if (date_to)     { params.push(date_to);     conds.push(`p.created_at::date <= $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT
        p.id, p.payable_number, p.amount, p.notes,
        p.created_at, p.center_id, p.reporter_id,
        rm.radiologist_name AS reporter_name,
        rm.radiologist_code AS reporter_code,
        rm.reporter_type,
        rm.vendor_code,
        rm.tds_rate,
        rm.pan_number,
        rm.bank_account_number,
        rm.bank_name,
        rm.ifsc_code,
        rm.upi_id,
        c.name AS center_name
      FROM payables p
      JOIN radiologist_master rm ON rm.id = p.reporter_id
      LEFT JOIN centers c ON c.id = p.center_id
      WHERE ${conds.join(' AND ')}
      ORDER BY rm.reporter_type, rm.radiologist_name, p.created_at`, params);

    // Group by reporter
    const grouped = {};
    for (const row of rows) {
      const key = row.reporter_id;
      if (!grouped[key]) {
        grouped[key] = {
          reporter_id:          row.reporter_id,
          reporter_name:        row.reporter_name,
          reporter_code:        row.reporter_code,
          reporter_type:        row.reporter_type,
          vendor_code:          row.vendor_code,
          tds_rate:             parseFloat(row.tds_rate || 0),
          pan_number:           row.pan_number,
          bank_account_number:  row.bank_account_number,
          bank_name:            row.bank_name,
          ifsc_code:            row.ifsc_code,
          upi_id:               row.upi_id,
          total:                0,
          count:                0,
          entries:              [],
        };
      }
      grouped[key].total += parseFloat(row.amount);
      grouped[key].count += 1;
      grouped[key].entries.push(row);
    }

    res.json({ success: true, reporters: Object.values(grouped) });
  } catch (e) {
    logger.error('tele-rad accruals GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/payments/tele-rad/consolidate ───────────────────────────────────
// Consolidate all pending accruals for a tele-rad reporter into one vendor bill
router.post('/tele-rad/consolidate', authorize(AP_ADMIN), [
  body('reporter_id').isInt({ min: 1 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { reporter_id, date_from, date_to } = req.body;

    // Fetch reporter (both types)
    const { rows: [reporter] } = await client.query(
      `SELECT rm.*, vm.ap_account_id
       FROM radiologist_master rm
       LEFT JOIN vendor_master vm ON vm.vendor_code = rm.vendor_code
       WHERE rm.id = $1 AND rm.reporter_type IN ('TELERADIOLOGY','RADIOLOGIST') AND rm.active = true`,
      [reporter_id]
    );
    if (!reporter) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reporter not found' });
    }

    const isTeleRad = reporter.reporter_type === 'TELERADIOLOGY';

    // TELERADIOLOGY must have a vendor_code (they send GST invoices)
    if (isTeleRad && !reporter.vendor_code) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Reporter "${reporter.radiologist_name}" has no vendor_code linked. Set it in Radiologist Master first.` });
    }

    // Fetch all unconsolidated accruals for this reporter in period
    const conds = [`p.reporter_id = $1`, `p.vendor_bill_id IS NULL`, `p.active = true`, `p.status = 'PENDING'`];
    const params = [reporter_id];
    if (date_from) { params.push(date_from); conds.push(`p.created_at::date >= $${params.length}`); }
    if (date_to)   { params.push(date_to);   conds.push(`p.created_at::date <= $${params.length}`); }

    const { rows: accruals } = await client.query(
      `SELECT p.* FROM payables p WHERE ${conds.join(' AND ')} ORDER BY p.created_at`,
      params
    );
    if (!accruals.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending accruals found for this reporter in the given period' });
    }

    const grossAmount = accruals.reduce((s, a) => s + parseFloat(a.amount), 0);
    const tdsRate     = parseFloat(reporter.tds_rate || 0);
    const tdsAmount   = isTeleRad ? 0 : parseFloat((grossAmount * tdsRate / 100).toFixed(2));
    const netAmount   = parseFloat((grossAmount - tdsAmount).toFixed(2));
    const centerId    = accruals[0].center_id;
    const today       = new Date().toLocaleDateString('en-CA');
    const periodLabel = date_from && date_to ? `${date_from} to ${date_to}` : today;

    // Generate bill number
    const { rows: [seq] } = await client.query(
      `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(bill_number,'^VB-\\d{6}-','') AS INTEGER)),0)+1 AS next
       FROM vendor_bills WHERE bill_number ~ '^VB-\\d{6}-'`
    );
    const billNumber = `VB-${today.slice(0,7).replace('-','')}-${String(seq.next).padStart(5,'0')}`;

    let bill;
    if (isTeleRad) {
      // TELERADIOLOGY: APPROVED immediately — consolidation by AP_ADMIN is the approval
      const { rows: [b] } = await client.query(
        `INSERT INTO vendor_bills
           (bill_number, vendor_code, vendor_name_text, center_id, bill_date, due_date,
            subtotal, total_amount, bill_status, payment_status, bill_type, notes, active)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$6,'APPROVED','PENDING','REGULAR',$7,true)
         RETURNING *`,
        [billNumber, reporter.vendor_code, reporter.radiologist_name,
         centerId, today,
         parseFloat(grossAmount.toFixed(2)),
         `Teleradiology reporting fees | ${reporter.radiologist_name} | ${periodLabel} | ${accruals.length} studies`]
      );
      bill = b;
    } else {
      // RADIOLOGIST: APPROVED immediately (internal payment batch, no external invoice)
      // TDS deducted — net payable is grossAmount - tdsAmount
      const { rows: [b] } = await client.query(
        `INSERT INTO vendor_bills
           (bill_number, vendor_code, vendor_name_text, center_id, bill_date, due_date,
            subtotal, total_amount, bill_status, payment_status, bill_type, notes, active)
         VALUES ($1,NULL,$2,$3,$4,$4,$5,$6,'APPROVED','PENDING','RAD_BATCH',$7,true)
         RETURNING *`,
        [billNumber, reporter.radiologist_name,
         centerId, today,
         parseFloat(grossAmount.toFixed(2)),
         parseFloat(netAmount.toFixed(2)),
         `Radiologist fees | ${reporter.radiologist_name} | ${periodLabel} | ${accruals.length} studies | TDS @${tdsRate}% = ₹${tdsAmount.toFixed(2)}`]
      );
      bill = b;

      // Post TDS payable to TDS ledger (2116) if any TDS
      if (tdsAmount > 0) {
        const { rows: [tdsAcc] } = await client.query(
          `SELECT id FROM chart_of_accounts WHERE account_code = '2116' AND is_active = true LIMIT 1`
        );
        if (tdsAcc) {
          await client.query(
            `INSERT INTO payables
               (payable_number, center_id, vendor_bill_id, amount, due_date, status, balance_amount, notes)
             VALUES ($1,$2,$3,$4,$5,'PENDING',$4,$6)`,
            [`TDS-${billNumber}`, centerId, bill.id, tdsAmount,
             new Date(new Date(today).getTime() + 30 * 86400000).toLocaleDateString('en-CA'),
             `TDS 194J on ${reporter.radiologist_name} | ${periodLabel}`]
          );
        }
      }
    }

    // Link all accruals to this bill
    await client.query(
      `UPDATE payables SET vendor_bill_id = $1, status = 'CONSOLIDATED', updated_at = NOW()
       WHERE id = ANY($2::int[])`,
      [bill.id, accruals.map(a => a.id)]
    );

    await client.query('COMMIT');
    logger.info('Reporter consolidated bill created', {
      bill_number: billNumber, reporter_id, reporter_type: reporter.reporter_type,
      studies: accruals.length, gross: grossAmount, tds: tdsAmount, net: netAmount,
    });
    res.status(201).json({
      success:      true,
      bill_number:  billNumber,
      bill_id:      bill.id,
      reporter_type: reporter.reporter_type,
      studies:      accruals.length,
      gross:        parseFloat(grossAmount.toFixed(2)),
      tds_amount:   tdsAmount,
      net_amount:   netAmount,
      bill_status:  bill.bill_status,
      message:      isTeleRad
        ? `Consolidated ${accruals.length} accruals into vendor bill ${billNumber} — pending AP approval`
        : `Consolidated ${accruals.length} accruals into payment batch ${billNumber} — net payable ₹${netAmount.toFixed(2)} after TDS ₹${tdsAmount.toFixed(2)}`,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('tele-rad consolidate:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

// ── POST /api/payments/vendor-bulk-pay ────────────────────────────────────────
// Pay multiple vendor bills in one transaction / one JE.
// Body: { bill_ids: [int], payment_mode, payment_date, bank_account_id,
//         transaction_reference, notes }
router.post('/vendor-bulk-pay', authorize(AP_WRITE), [
  body('bill_ids').isArray({ min: 1 }).withMessage('Select at least one bill'),
  body('bill_ids.*').isInt({ min: 1 }),
  body('payment_mode').isIn(['CASH','CHEQUE','NEFT','RTGS','UPI']),
  body('payment_date').isDate(),
  body('transaction_reference').trim().notEmpty().withMessage('Transaction reference is required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

  const { bill_ids, payment_mode, payment_date,
          transaction_reference, notes, bank_account_id } = req.body;
  const uniqueIds = [...new Set(bill_ids.map(Number))];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Load all bills with AP account resolution (same priority chain as single-pay)
    const { rows: bills } = await client.query(
      `SELECT vb.*,
              COALESCE(
                (SELECT jel.account_id FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = vb.journal_entry_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT jel.account_id FROM journal_entry_lines jel
                 JOIN purchase_receipts pr ON pr.journal_entry_id = jel.journal_entry_id
                 WHERE pr.id = vb.source_grn_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                (SELECT ic.ap_account_id
                 FROM procurement_order_items poi
                 JOIN item_master im ON im.id = poi.item_master_id
                 JOIN item_categories ic ON ic.id = im.category_id
                 WHERE poi.po_id = vb.source_po_id AND ic.ap_account_id IS NOT NULL
                 LIMIT 1),
                (SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1)
              ) AS ap_account_id,
              COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name,
              (SELECT p.id FROM parties p JOIN vendor_master vm2 ON vm2.id = p.vendor_id
               WHERE vm2.vendor_code = vb.vendor_code LIMIT 1) AS party_id
       FROM vendor_bills vb
       LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code AND vm.active = true
       WHERE vb.id = ANY($1::int[]) AND vb.active = true
       FOR UPDATE OF vb`,
      [uniqueIds]
    );

    if (bills.length !== uniqueIds.length) {
      const found = bills.map(b => b.id);
      const missing = uniqueIds.filter(id => !found.includes(id));
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Bills not found: ${missing.join(', ')}` });
    }

    // Validate all bills are payable
    for (const b of bills) {
      if (b.bill_status !== 'APPROVED')
        return res.status(400).json({ error: `Bill ${b.bill_number} is not APPROVED (status: ${b.bill_status})` });
      if (b.payment_status === 'PAID')
        return res.status(400).json({ error: `Bill ${b.bill_number} is already PAID` });
    }

    // 2. Resolve bank GL account
    let bankRowId = bank_account_id || null;
    let bankGlId  = null;
    if (bankRowId) {
      const { rows: [ba] } = await client.query(
        `SELECT id, gl_account_id FROM bank_accounts WHERE id = $1`, [bankRowId]
      );
      bankGlId = ba?.gl_account_id || null;
    }
    if (!bankGlId) {
      const bankCode = payment_mode === 'CASH' ? '1111' : '1112';
      const { rows: [ba] } = await client.query(
        `SELECT ba.id, ba.gl_account_id FROM bank_accounts ba
         JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
         WHERE coa.account_code = $1 LIMIT 1`, [bankCode]
      );
      bankRowId = ba?.id || null;
      bankGlId  = ba?.gl_account_id || null;
    }
    if (!bankGlId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bank/cash GL account not found. Select a bank account.' });
    }

    // 3. Calculate outstanding balance per bill and group debit lines by AP account
    const billBalances = [];
    for (const b of bills) {
      const { rows: [{ already_paid }] } = await client.query(
        `SELECT COALESCE(SUM(amount_paid),0) AS already_paid
         FROM vendor_payments WHERE bill_id=$1 AND active=true`, [b.id]
      );
      const balance = parseFloat(b.total_amount) - parseFloat(already_paid);
      if (balance > 0.01) billBalances.push({ bill: b, balance: parseFloat(balance.toFixed(2)) });
    }

    if (!billBalances.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'All selected bills are already fully paid' });
    }

    // Group by AP account for JE debit lines
    const apGroups = new Map(); // ap_account_id → { amount, bills[] }
    for (const { bill, balance } of billBalances) {
      const apId = bill.ap_account_id;
      if (!apId) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Cannot resolve AP account for bill ${bill.bill_number}` }); }
      if (!apGroups.has(apId)) apGroups.set(apId, { amount: 0, billNums: [] });
      const g = apGroups.get(apId);
      g.amount += balance;
      g.billNums.push(bill.bill_number);
    }

    const totalAmt = billBalances.reduce((s, { balance }) => s + balance, 0);
    const vendorNames = [...new Set(billBalances.map(({ bill }) => bill.vendor_name))].join(', ');

    // 4. Build JE: N debit lines (one per AP account) + 1 credit line (bank)
    const jeLines = [];
    for (const [apId, { amount, billNums }] of apGroups) {
      jeLines.push({
        accountId: apId,
        debit: parseFloat(amount.toFixed(2)),
        credit: 0,
        description: `AP cleared — ${billNums.join(', ')}`,
      });
    }
    jeLines.push({
      accountId: bankGlId,
      debit: 0,
      credit: parseFloat(totalAmt.toFixed(2)),
      description: `Consolidated payment to ${vendorNames} via ${payment_mode}`,
    });

    const billNums = billBalances.map(({ bill }) => bill.bill_number).join(', ');
    const je = await financeService.createAndPostJE({
      sourceModule: 'AP_BULK_PAYMENT',
      sourceId:     uniqueIds[0],
      sourceRef:    `Bulk payment — ${billNums}`,
      narration:    `Consolidated payment to ${vendorNames} | ${payment_mode} | ${transaction_reference || ''}`,
      lines: jeLines,
      createdBy:  req.user?.id || null,
      postingKey: `VBULK-${uniqueIds.sort().join('-')}-${payment_date}`,
      entryDate:  payment_date,
      client,
    });

    // 5. Record vendor_payments and update bill statuses
    const results = [];
    for (const { bill, balance } of billBalances) {
      await client.query(
        `INSERT INTO vendor_payments
           (bill_id, payment_mode, amount_paid, payment_date,
            transaction_reference, notes, bank_account_id, journal_entry_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [bill.id, payment_mode, balance, payment_date,
         transaction_reference || null, notes || null, bankRowId, je.id]
      );

      const { rows: [{ total_paid }] } = await client.query(
        `SELECT COALESCE(SUM(amount_paid),0) AS total_paid
         FROM vendor_payments WHERE bill_id=$1 AND active=true`, [bill.id]
      );
      const newStatus = parseFloat(total_paid) >= parseFloat(bill.total_amount) - 0.01 ? 'PAID' : 'PARTIAL';
      await client.query(
        `UPDATE vendor_bills SET payment_status=$1, updated_at=NOW() WHERE id=$2`,
        [newStatus, bill.id]
      );

      if (bill.party_id) {
        await financeService.writePartyLedger(
          client, bill.party_id, je.id, null, bill.center_id || null,
          je.entry_date, je.entry_number, `Bulk payment: ${bill.bill_number}`,
          balance, 0, 'AP_BULK_PAYMENT', bill.bill_number
        );
      }

      results.push({ bill_id: bill.id, bill_number: bill.bill_number, amount: balance, status: newStatus });
    }

    // 6. Advance knock-off — process once per unique PO across all bills in this bulk payment
    // Groups bills by source_po_id so the same advance is never double-applied.
    const poIds = [...new Set(
      billBalances.map(({ bill }) => bill.source_po_id).filter(Boolean)
    )];
    const { rows: [advGl] } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code='1131' AND is_active=true LIMIT 1`
    );
    if (advGl && poIds.length) {
      for (const poId of poIds) {
        // Find paid advance bills for this PO
        const { rows: advBills } = await client.query(
          `SELECT vb.id, vb.total_amount
           FROM vendor_bills vb
           WHERE vb.source_po_id=$1 AND vb.bill_type='ADVANCE'
             AND vb.bill_status='APPROVED' AND vb.payment_status='PAID' AND vb.active=true`,
          [poId]
        );
        if (!advBills.length) continue;
        const totalAdvance = advBills.reduce((s, r) => s + parseFloat(r.total_amount), 0);

        // How much has already been knocked off for this PO (prevent double-apply)
        const { rows: [alreadyKnocked] } = await client.query(
          `SELECT COALESCE(SUM(vp.amount_paid), 0) AS knocked
           FROM vendor_payments vp
           LEFT JOIN vendor_bills vb ON vb.id = vp.bill_id
           WHERE vp.payment_mode='ADVANCE_KNOCKOFF' AND vp.active=true
             AND (vp.grn_id IN (SELECT id FROM purchase_receipts WHERE po_id=$1)
                  OR vb.source_po_id=$1)`,
          [poId]
        );
        const availableAdv = totalAdvance - parseFloat(alreadyKnocked.knocked);
        if (availableAdv <= 0.01) continue;

        // Total AP being paid in this bulk run for this PO's bills
        const poAmt = billBalances
          .filter(({ bill }) => bill.source_po_id === poId)
          .reduce((s, { balance }) => s + balance, 0);
        const knockAmt = parseFloat(Math.min(availableAdv, poAmt).toFixed(2));

        // Resolve AP account from the first bill of this PO in this bulk run
        const firstBill = billBalances.find(({ bill }) => bill.source_po_id === poId).bill;
        if (!firstBill.ap_account_id) continue;

        const knockJe = await financeService.createAndPostJE({
          sourceModule: 'AP_ADV_KNOCKOFF',
          sourceId:     poId,
          sourceRef:    `Advance Knock-off for PO #${poId}`,
          narration:    `Advance adjusted against ${firstBill.vendor_name} | PO #${poId}`,
          lines: [
            { accountId: firstBill.ap_account_id, debit: knockAmt, credit: 0,
              description: `AP cleared (advance) — PO #${poId}`, centerId: firstBill.center_id || null },
            { accountId: advGl.id, debit: 0, credit: knockAmt,
              description: `Advance knocked off — PO #${poId}`, centerId: firstBill.center_id || null },
          ],
          createdBy:  req.user?.id || null,
          postingKey: `ADV-KNOCK-BULK-${poId}-${payment_date}`,
          entryDate:  payment_date,
          client,
        });
        if (knockJe) {
          await client.query(
            `INSERT INTO vendor_payments
               (bill_id, payment_mode, amount_paid, payment_date, journal_entry_id,
                notes, active, created_at, updated_at)
             VALUES ($1,'ADVANCE_KNOCKOFF',$2,$3,$4,$5,true,NOW(),NOW())`,
            [firstBill.id, knockAmt, payment_date, knockJe.id,
             `Advance knock-off applied during bulk payment — PO #${poId}`]
          );
          logger.info('Bulk advance knock-off JE posted', { po_id: poId, amount: knockAmt, je: knockJe.entry_number });
        }
      }
    }

    await client.query('COMMIT');
    logger.info(`Bulk payment posted: ${je.entry_number} for ₹${totalAmt} covering ${billBalances.length} bills`);
    res.json({
      success: true,
      entry_number: je.entry_number,
      total_amount: totalAmt,
      bills_paid: results,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('vendor-bulk-pay error:', e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  } finally { client.release(); }
});

module.exports = router;
