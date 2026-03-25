'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');
const router = express.Router();

// ── GL Accounts for AP/Expense dropdowns ────────────────────────────────────

// GET /api/vendors/ap-accounts
router.get('/ap-accounts', async (req, res) => {
  try {
    const { rows: apAccounts } = await pool.query(
      `SELECT id, account_code, account_name FROM chart_of_accounts
       WHERE account_code LIKE '211%' AND is_active = true AND account_level >= 4
       ORDER BY account_code`
    );
    const { rows: expenseAccounts } = await pool.query(
      `SELECT id, account_code, account_name FROM chart_of_accounts
       WHERE account_code LIKE '5%' AND is_active = true AND account_level >= 3
       ORDER BY account_code`
    );
    const { rows: assetAccounts } = await pool.query(
      `SELECT id, account_code, account_name FROM chart_of_accounts
       WHERE account_code IN ('1151','1152','1153','1154','1155',
                              '1210','1220','1230','1240','1250','1260')
         AND is_active = true
       ORDER BY account_code`
    );
    const { rows: cashAccounts } = await pool.query(
      `SELECT id, account_code, account_name FROM chart_of_accounts
       WHERE account_code IN ('1111','1112','1113','1114')
         AND is_active = true
       ORDER BY account_code`
    );
    res.json({ success: true, apAccounts, expenseAccounts, assetAccounts, cashAccounts });
  } catch (e) {
    logger.error('AP accounts GET:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Vendor Master ─────────────────────────────────────────────────────────────

// GET /api/vendors
router.get('/', async (req, res) => {
  try {
    const { active = 'true', vendor_type, search } = req.query;
    const conds = ['v.active = $1'];
    const params = [active === 'true'];
    if (vendor_type) { params.push(vendor_type); conds.push(`v.vendor_type = $${params.length}`); }
    if (search)      { params.push(`%${search}%`); conds.push(`(v.vendor_name ILIKE $${params.length} OR v.vendor_code ILIKE $${params.length})`); }
    const { rows: vendors } = await pool.query(
      `SELECT v.* FROM vendor_master v
       WHERE ${conds.join(' AND ')} ORDER BY v.vendor_name`,
      params
    );
    res.json({ success: true, vendors });
  } catch (e) { logger.error('Vendors GET:', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/vendors
router.post('/', authorizePermission('VENDOR_WRITE'), [
  body('vendor_code').trim().notEmpty(),
  body('vendor_name').trim().isLength({ min: 2 }),
  body('vendor_type').isIn(['SUPPLIER','SERVICE','CONTRACTOR','UTILITY','OTHER']),
  body('address').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('state').trim().notEmpty(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { vendor_code, vendor_name, vendor_type, gst_number, pan_number, phone, email,
            address, city, state, postal_code, contact_person, payment_terms,
            bank_account_number, bank_name, ifsc_code, notes, is_taxpayer } = req.body;

    // A vendor without a GSTIN cannot be a taxpayer
    const taxpayer = is_taxpayer === false || is_taxpayer === 'false' ? false
                   : gst_number ? true : false;

    const { rows: [v] } = await pool.query(
      `INSERT INTO vendor_master (vendor_code, vendor_name, vendor_type, gst_number, pan_number,
         phone, email, address, city, state, postal_code, contact_person, payment_terms,
         bank_account_number, bank_name, ifsc_code, notes, is_taxpayer)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [vendor_code.trim().toUpperCase(), vendor_name, vendor_type, gst_number||null, pan_number||null,
       phone||null, email||null, address, city, state, postal_code||null, contact_person||null,
       payment_terms||null, bank_account_number||null, bank_name||null, ifsc_code||null,
       notes||null, taxpayer]
    );

    // Upsert into parties for AP subledger
    await pool.query(
      `INSERT INTO parties (party_code, party_name, party_type, vendor_id, gstin)
       VALUES ($1, $2, 'VENDOR', $3, $4)
       ON CONFLICT (party_code) DO UPDATE SET
         party_name = EXCLUDED.party_name,
         gstin      = EXCLUDED.gstin`,
      [`V-${v.vendor_code}`, v.vendor_name, v.id, v.gst_number || null]
    );

    logger.info('Vendor created', { vendor_code });
    res.status(201).json({ success: true, vendor: v });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Vendor code already exists' });
    logger.error('Vendor POST:', e); res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/vendors/:id
router.put('/:id', authorizePermission('VENDOR_WRITE'), async (req, res) => {
  try {
    const { vendor_name, vendor_type, gst_number, pan_number, phone, email,
            address, city, state, postal_code, contact_person, payment_terms,
            bank_account_number, bank_name, ifsc_code, notes, is_taxpayer } = req.body;

    const taxpayer = is_taxpayer === false || is_taxpayer === 'false' ? false
                   : gst_number ? true : false;

    const { rows: [v] } = await pool.query(
      `UPDATE vendor_master SET vendor_name=$1, vendor_type=$2, gst_number=$3, pan_number=$4,
         phone=$5, email=$6, address=$7, city=$8, state=$9, postal_code=$10,
         contact_person=$11, payment_terms=$12, bank_account_number=$13, bank_name=$14,
         ifsc_code=$15, notes=$16, is_taxpayer=$17, updated_at=NOW()
       WHERE id=$18 AND active=true RETURNING *`,
      [vendor_name, vendor_type, gst_number||null, pan_number||null, phone||null, email||null,
       address, city, state, postal_code||null, contact_person||null, payment_terms||null,
       bank_account_number||null, bank_name||null, ifsc_code||null, notes||null,
       taxpayer, req.params.id]
    );
    if (!v) return res.status(404).json({ error: 'Vendor not found' });

    // Sync name and GSTIN to parties
    await pool.query(
      `UPDATE parties SET party_name=$1, gstin=$2, updated_at=NOW() WHERE vendor_id=$3`,
      [vendor_name, gst_number || null, req.params.id]
    );

    res.json({ success: true, vendor: v });
  } catch (e) { logger.error('Vendor PUT:', e); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/vendors/:id
router.delete('/:id', authorizePermission('VENDOR_WRITE'), async (req, res) => {
  try {
    const { rows: [v] } = await pool.query(
      `UPDATE vendor_master SET active=false, updated_at=NOW() WHERE id=$1 AND active=true RETURNING id`,
      [req.params.id]
    );
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ── Vendor Bills ─────────────────────────────────────────────────────────────

// GET /api/vendors/bills
router.get('/bills', async (req, res) => {
  try {
    const { vendor_code, payment_status, approval_status, center_id, direct_only } = req.query;
    const conds = ['vb.active = true'];
    const params = [];
    if (vendor_code)     { params.push(vendor_code);     conds.push(`vb.vendor_code = $${params.length}`); }
    if (payment_status)  { params.push(payment_status);  conds.push(`vb.payment_status = $${params.length}`); }
    if (approval_status) { params.push(approval_status); conds.push(`vb.approval_status = $${params.length}`); }
    if (center_id)       { params.push(center_id);       conds.push(`vb.center_id = $${params.length}`); }
    // Direct bills only: not GRN-sourced, not PO-sourced, not advance/system types
    if (direct_only === 'true') {
      conds.push(`vb.source_grn_id IS NULL`);
      conds.push(`vb.source_po_id IS NULL`);
      conds.push(`COALESCE(vb.bill_type,'DIRECT') NOT IN ('ADVANCE','RAD_BATCH')`);
    }
    const { rows } = await pool.query(
      `SELECT vb.*, vm.vendor_name, c.name AS center_name,
              (SELECT COALESCE(SUM(amount_paid),0) FROM vendor_payments WHERE bill_id=vb.id AND active=true) AS amount_paid
       FROM vendor_bills vb
       JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code
       LEFT JOIN centers c ON c.id = vb.center_id
       WHERE ${conds.join(' AND ')}
       ORDER BY vb.bill_date DESC, vb.id DESC`,
      params
    );
    res.json({ success: true, bills: rows });
  } catch (e) { logger.error('Bills GET:', e); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/vendors/bills/:id
router.get('/bills/:id', async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query(
      `SELECT vb.*, vm.vendor_name FROM vendor_bills vb
       JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code
       WHERE vb.id=$1 AND vb.active=true`, [req.params.id]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const { rows: items } = await pool.query(
      `SELECT vbi.*, ca.account_code AS gl_account_code, ca.account_name AS gl_account_name
       FROM vendor_bill_items vbi
       LEFT JOIN chart_of_accounts ca ON ca.id = vbi.gl_account_id
       WHERE vbi.bill_id=$1`, [req.params.id]
    );
    const { rows: payments } = await pool.query(
      `SELECT vp.*, ca.account_code AS bank_account_code, ca.account_name AS bank_account_name
       FROM vendor_payments vp
       LEFT JOIN chart_of_accounts ca ON ca.id = vp.bank_account_id
       WHERE vp.bill_id=$1 AND vp.active=true ORDER BY vp.payment_date DESC`, [req.params.id]
    );
    res.json({ success: true, bill, items, payments });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/vendors/bills
router.post('/bills', authorizePermission('VENDOR_WRITE'), [
  body('vendor_code').trim().notEmpty(),
  body('bill_number').trim().notEmpty(),
  body('bill_date').isDate(),
  body('due_date').isDate(),
  body('items').isArray({ min: 1 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { vendor_code, center_id, bill_number, bill_date, due_date,
            notes, items, itc_claimable } = req.body;

    // Get vendor with AP account and party_id
    const { rows: [vendor] } = await client.query(
      `SELECT vm.*, p.id AS party_id
       FROM vendor_master vm
       LEFT JOIN parties p ON p.vendor_id = vm.id
       WHERE vm.vendor_code = $1 AND vm.active = true
       LIMIT 1`,
      [vendor_code]
    );
    if (!vendor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Vendor not found' });
    }

    // Server-side enforcement: non-taxpayer vendor cannot have GST on a bill
    if (!vendor.is_taxpayer) {
      items.forEach(i => { i.cgst_amount = 0; i.sgst_amount = 0; i.igst_amount = 0; i.gst_rate = 0; });
    }

    const subtotal = items.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.rate), 0);
    const cgst    = items.reduce((s, i) => s + parseFloat(i.cgst_amount||0), 0);
    const sgst    = items.reduce((s, i) => s + parseFloat(i.sgst_amount||0), 0);
    const igst    = items.reduce((s, i) => s + parseFloat(i.igst_amount||0), 0);
    const totalGst = cgst + sgst + igst;
    const total    = subtotal + totalGst;
    const claimITC = itc_claimable ? true : false;

    const { rows: [bill] } = await client.query(
      `INSERT INTO vendor_bills (vendor_code, center_id, bill_number, bill_date, due_date,
         subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, notes, itc_claimable,
         approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [vendor_code, center_id||null, bill_number, bill_date, due_date,
       subtotal, cgst, sgst, igst, total, notes||null, claimITC, 'DRAFT']
    );

    for (const item of items) {
      const amt    = parseFloat(item.quantity) * parseFloat(item.rate);
      const gstAmt = (parseFloat(item.cgst_amount||0) + parseFloat(item.sgst_amount||0)
                    + parseFloat(item.igst_amount||0));
      await client.query(
        `INSERT INTO vendor_bill_items
           (bill_id, item_name, description, quantity, rate, amount,
            gst_rate, gst_amount, hsn_code, gl_account_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bill.id, item.item_name, item.description||null, item.quantity, item.rate, amt,
         item.gst_rate||0, gstAmt, item.hsn_code||null, item.gl_account_id||null]
      );
    }

    // JE is posted on APPROVE — not at creation.
    await client.query('COMMIT');
    logger.info('Vendor bill created (DRAFT)', { bill_number, vendor_code });
    res.status(201).json({ success: true, bill });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'Bill number already exists for this vendor' });
    logger.error('Bill POST:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Vendor Payments ───────────────────────────────────────────────────────────

// POST /api/vendors/bills/:id/pay
router.post('/bills/:id/pay', authorizePermission('VENDOR_WRITE', 'JE_APPROVE'), [
  body('payment_mode').isIn(['CASH','CHEQUE','NEFT','RTGS','UPI']),
  body('amount_paid').isFloat({ min: 0.01 }),
  body('payment_date').isDate(),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [bill] } = await client.query(
      `SELECT vb.*,
              COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name,
              (SELECT id FROM parties WHERE vendor_id = vm.id LIMIT 1) AS party_id,
              COALESCE(
                -- 1. Bill's own posted JE credit line (self-consistent)
                (SELECT jel.account_id FROM journal_entry_lines jel
                 WHERE jel.journal_entry_id = vb.journal_entry_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                -- 2. GRN-linked bill: use GRN JE credit line
                (SELECT jel.account_id FROM journal_entry_lines jel
                 JOIN purchase_receipts pr ON pr.journal_entry_id = jel.journal_entry_id
                 WHERE pr.id = vb.source_grn_id AND jel.credit_amount > 0
                 ORDER BY jel.id LIMIT 1),
                -- 3. PO item category drives AP account
                (SELECT ic.ap_account_id
                 FROM procurement_order_items poi
                 JOIN item_master im ON im.id = poi.item_master_id
                 JOIN item_categories ic ON ic.id = im.category_id
                 WHERE poi.po_id = vb.source_po_id AND ic.ap_account_id IS NOT NULL
                 LIMIT 1),
                -- 4. Consolidated reporter bill: use linked payable's ap_account_id
                (SELECT p.ap_account_id FROM payables p
                 WHERE p.vendor_bill_id = vb.id AND p.ap_account_id IS NOT NULL
                 LIMIT 1),
                -- 5. Smart fallback: reporter bills → 2113, equipment/GRN bills → 2112
                (SELECT id FROM chart_of_accounts
                 WHERE account_code = CASE
                   WHEN vb.vendor_code IS NULL AND vb.source_grn_id IS NULL THEN '2113'
                   ELSE '2112'
                 END
                 AND is_active = true LIMIT 1)
              ) AS ap_account_id
       FROM vendor_bills vb
       LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code AND vm.active = true
       WHERE vb.id=$1 AND vb.active=true FOR UPDATE`,
      [req.params.id]
    );
    if (!bill) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill not found' }); }
    if (bill.approval_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Bill must be APPROVED before payment (current status: ${bill.approval_status})` });
    }
    if (bill.payment_status === 'PAID') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bill is already fully paid' });
    }

    const { payment_mode, amount_paid, payment_date,
            transaction_reference, notes, bank_account_id } = req.body;

    // Resolve bank/cash GL: prefer bank_accounts.gl_account_id, fall back to COA code
    let bankRowId = bank_account_id || null;
    let bankGlId  = null;
    if (bankRowId) {
      const { rows: [ba] } = await client.query(
        `SELECT id, gl_account_id FROM bank_accounts WHERE id = $1 AND active = true LIMIT 1`,
        [bankRowId]
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
        error: 'Cannot post payment: bank/cash GL account not found. '
             + 'Select a bank account, or ensure COA codes 1111 (Cash) / 1112 (Bank) exist and are active.',
      });
    }

    const { rows: [payment] } = await client.query(
      `INSERT INTO vendor_payments
         (bill_id, payment_mode, amount_paid, payment_date,
          transaction_reference, notes, bank_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, payment_mode, amount_paid, payment_date,
       transaction_reference||null, notes||null, bankRowId]
    );

    // Update payment_status
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

    // ── Post Payment JE: DR AP, CR Cash/Bank ──────────────────────────────
    const amt = parseFloat(parseFloat(amount_paid).toFixed(2));
    if (bill.ap_account_id && bankGlId) {
      const je = await financeService.createAndPostJE({
        sourceModule: 'AP_PAYMENT',
        sourceId:     payment.id,
        sourceRef:    `Payment for Bill ${bill.bill_number}`,
        narration:    `Payment to ${bill.vendor_name} | ${bill.bill_number} | ${payment_mode}`,
        lines: [
          {
            accountId:   bill.ap_account_id,
            debit:       amt,
            credit:      0,
            description: `AP cleared — ${bill.bill_number}`,
            centerId:    bill.center_id || null,
            partyId:     bill.party_id || null,
          },
          {
            accountId:   bankGlId,
            debit:       0,
            credit:      amt,
            description: `Payment to ${bill.vendor_name} via ${payment_mode}`,
            centerId:    bill.center_id || null,
          },
        ],
        createdBy:  req.user?.id || null,
        postingKey: `VPAY-${payment.id}`,
        entryDate:  payment_date,
        client,
      });
      await client.query(
        `UPDATE vendor_payments SET journal_entry_id=$1 WHERE id=$2`,
        [je.id, payment.id]
      );
      if (bill.party_id) {
        await financeService.writePartyLedger(
          client, bill.party_id, je.id, null, bill.center_id || null,
          je.entry_date, je.entry_number,
          `Payment: ${bill.bill_number}`,
          amt, 0, 'AP_PAYMENT', bill.bill_number
        );
      }
      logger.info('Vendor payment JE posted', { payment_id: payment.id, je_id: je.id });
    } else {
      logger.warn('Vendor payment JE skipped — missing AP account',
        { bill_id: req.params.id });
    }

    await client.query('COMMIT');
    logger.info('Vendor payment recorded', { bill_id: req.params.id, amount_paid });
    res.json({ success: true, payment_status: newStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('Payment POST:', e);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Vendor Bill Approval Workflow ─────────────────────────────────────────────

// Helper: build and post the AP JE for a vendor bill
async function _postVendorBillJE(client, bill, items, vendor) {
  const claimITC = bill.itc_claimable;
  const totalGst = parseFloat(bill.cgst_amount||0) + parseFloat(bill.sgst_amount||0) + parseFloat(bill.igst_amount||0);

  let itcAccountId = null;
  if (claimITC && totalGst > 0) {
    const { rows: [itcAcc] } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1134' AND is_active = true LIMIT 1`
    );
    itcAccountId = itcAcc?.id || null;
  }

  const glGroups = {};
  for (const item of items) {
    const glId  = item.gl_account_id || 'fallback';
    const net   = parseFloat(item.quantity) * parseFloat(item.rate);
    const gst   = parseFloat(item.cgst_amount||0) + parseFloat(item.sgst_amount||0) + parseFloat(item.igst_amount||0);
    const debit = itcAccountId ? net : net + gst;
    if (!glGroups[glId]) glGroups[glId] = { accountId: item.gl_account_id || null, amount: 0 };
    glGroups[glId].amount += debit;
  }

  let fallbackGlId = null;
  if (glGroups['fallback']) {
    const { rows: [misc] } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code LIKE '5%' AND account_level >= 3 AND is_active = true ORDER BY account_code LIMIT 1`
    );
    fallbackGlId = misc?.id || null;
  }

  // AP account: driven by item category of the bill's GL accounts, not by vendor
  // Look up item_categories.ap_account_id where expense_gl_id or asset_gl_id matches any bill item's gl_account_id
  let apAccountId = null;
  const itemGlIds = items.map(i => i.gl_account_id).filter(Boolean);
  if (itemGlIds.length > 0) {
    const { rows: [apRow] } = await client.query(
      `SELECT ap_account_id FROM item_categories
       WHERE ap_account_id IS NOT NULL
         AND (expense_gl_id = ANY($1::int[]) OR asset_gl_id = ANY($1::int[]))
       LIMIT 1`,
      [itemGlIds]
    );
    apAccountId = apRow?.ap_account_id || null;
  }
  if (!apAccountId) {
    const { rows: [fallback] } = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1`
    );
    apAccountId = fallback?.id || null;
  }
  if (!apAccountId) return null;

  const jeLines = [];
  for (const group of Object.values(glGroups)) {
    const accountId = group.accountId || fallbackGlId;
    if (accountId && group.amount > 0.001) {
      jeLines.push({ accountId, debit: parseFloat(group.amount.toFixed(2)), credit: 0,
        description: `Vendor Bill ${bill.bill_number}`, centerId: bill.center_id || null, partyId: vendor.party_id || null });
    }
  }
  if (itcAccountId && totalGst > 0.001) {
    jeLines.push({ accountId: itcAccountId, debit: parseFloat(totalGst.toFixed(2)), credit: 0,
      description: `GST Input Credit — ${bill.bill_number}`, centerId: bill.center_id || null });
  }
  jeLines.push({ accountId: apAccountId, debit: 0, credit: parseFloat(parseFloat(bill.total_amount).toFixed(2)),
    description: `AP — ${vendor.vendor_name} | ${bill.bill_number}`, centerId: bill.center_id || null, partyId: vendor.party_id || null });

  const validLines = jeLines.filter(l => l.accountId);
  if (validLines.length < 2) return null;

  const je = await financeService.createAndPostJE({
    sourceModule: 'AP_BILL', sourceId: bill.id,
    sourceRef:    `Vendor Bill ${bill.bill_number}`,
    narration:    `Vendor Bill from ${vendor.vendor_name} | ${bill.bill_number}`,
    lines:        validLines,
    createdBy:    null,
    postingKey:   `VBILL-${bill.id}`,
    entryDate:    bill.bill_date,
    client,
  });
  await client.query(`UPDATE vendor_bills SET journal_entry_id=$1 WHERE id=$2`, [je.id, bill.id]);
  if (vendor.party_id) {
    await financeService.writePartyLedger(
      client, vendor.party_id, je.id, null, bill.center_id || null,
      je.entry_date, je.entry_number,
      `Bill: ${bill.bill_number}`, 0, parseFloat(parseFloat(bill.total_amount).toFixed(2)), 'AP_BILL', bill.bill_number
    );
  }
  return je;
}

// POST /api/vendors/bills/:id/submit  — DRAFT → SUBMITTED
router.post('/bills/:id/submit', authorizePermission('VENDOR_WRITE'), async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills SET approval_status='SUBMITTED', updated_at=NOW()
        WHERE id=$1 AND approval_status='DRAFT' RETURNING *`, [req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not in DRAFT status' });
    res.json({ success: true, bill });
  } catch (e) { logger.error('Bill submit:', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/vendors/bills/:id/approve  — SUBMITTED → APPROVED + post JE
router.post('/bills/:id/approve', authorizePermission('VENDOR_WRITE', 'JE_APPROVE'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch bill + vendor BEFORE updating status
    const { rows: [billRow] } = await client.query(
      `SELECT vb.*, COALESCE(vm.vendor_name, vb.vendor_name_text) AS vendor_name, p.id AS party_id
       FROM vendor_bills vb
       LEFT JOIN vendor_master vm ON vm.vendor_code = vb.vendor_code AND vm.active = true
       LEFT JOIN parties p ON p.vendor_id = vm.id
       WHERE vb.id = $1 AND vb.approval_status = 'SUBMITTED'
       FOR UPDATE OF vb`,
      [req.params.id]
    );
    if (!billRow) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bill not found or not in SUBMITTED status' });
    }

    const { rows: items } = await client.query(`SELECT * FROM vendor_bill_items WHERE bill_id=$1`, [billRow.id]);

    // Now update status
    const { rows: [bill] } = await client.query(
      `UPDATE vendor_bills SET approval_status='APPROVED', approved_by=$1, approved_at=NOW(), updated_at=NOW()
        WHERE id=$2 RETURNING *`,
      [req.user?.id || null, req.params.id]
    );

    const vendor = { vendor_name: billRow.vendor_name, party_id: billRow.party_id };
    const je = await _postVendorBillJE(client, bill, items, vendor);
    if (je) logger.info('Vendor bill JE posted on approval', { bill_id: bill.id, je_id: je.id });
    else     logger.warn('Vendor bill JE skipped (missing GL accounts)', { bill_id: bill.id });

    await client.query('COMMIT');
    res.json({ success: true, bill });
  } catch (e) { await client.query('ROLLBACK'); logger.error('Bill approve:', e); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// POST /api/vendors/bills/:id/reject  — SUBMITTED → REJECTED
router.post('/bills/:id/reject', authorizePermission('VENDOR_WRITE', 'JE_APPROVE'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills SET approval_status='REJECTED', rejected_by=$1, rejected_at=NOW(),
          rejection_reason=$2, updated_at=NOW()
        WHERE id=$3 AND approval_status='SUBMITTED' RETURNING *`,
      [req.user?.id || null, reason.trim(), req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not in SUBMITTED status' });
    res.json({ success: true, bill });
  } catch (e) { logger.error('Bill reject:', e); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/vendors/bills/:id/resubmit  — REJECTED → SUBMITTED
router.post('/bills/:id/resubmit', authorizePermission('VENDOR_WRITE'), async (req, res) => {
  try {
    const { rows: [bill] } = await pool.query(
      `UPDATE vendor_bills SET approval_status='SUBMITTED', rejection_reason=NULL,
          rejected_by=NULL, rejected_at=NULL, updated_at=NOW()
        WHERE id=$1 AND approval_status='REJECTED' RETURNING *`, [req.params.id]
    );
    if (!bill) return res.status(400).json({ error: 'Bill not found or not in REJECTED status' });
    res.json({ success: true, bill });
  } catch (e) { logger.error('Bill resubmit:', e); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
