'use strict';
/**
 * financeService.js
 * Shared helper for auto-creating and posting Journal Entries
 * from billing, procurement, payroll and expense modules.
 *
 * Category-based GL lookups now use item_categories table directly.
 * The old hardcoded normalizeExpenseCategory / normalizePOCategory
 * functions and the EXPENSE_RECORDED / PO_COMPLETED mapping rows
 * have been removed in migration 047.
 */

const pool = require('../config/db');
const { logger } = require('../config/logger');

// ──────────────────────────────────────────────────────────────────────────────
// New helpers — period guard, idempotency, party subledger
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Return the financial_periods row that covers `date`.
 * Returns null if no period found (posting still allowed — open book).
 */
async function getActivePeriod(date) {
  const d = date || new Date();
  const { rows } = await pool.query(
    `SELECT id, is_closed FROM financial_periods
     WHERE start_date <= $1 AND end_date >= $1 LIMIT 1`,
    [d]
  );
  return rows[0] || null;
}

/**
 * Return existing JE row if posting_key already used, else null.
 */
async function checkIdempotency(postingKey) {
  if (!postingKey) return null;
  const { rows } = await pool.query(
    `SELECT id, entry_number FROM journal_entries WHERE posting_key = $1`,
    [postingKey]
  );
  return rows[0] || null;
}

/**
 * Insert one row into party_ledgers using an existing transaction client.
 */
async function writePartyLedger(
  client, partyId, jeId, lineId, centerId,
  date, docNum, narration, debit, credit, sourceModule, sourceRef
) {
  if (!partyId || !jeId) return;
  await client.query(
    `INSERT INTO party_ledgers
       (party_id, journal_entry_id, journal_line_id, center_id,
        transaction_date, document_number, narration,
        debit_amount, credit_amount, source_module, source_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [partyId, jeId, lineId || null, centerId || null,
     date, docNum || null, narration || null,
     debit || 0, credit || 0, sourceModule || null, sourceRef || null]
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Fetch the mapping row for a given event_type + sub_type */
async function getMapping(eventType, subType, client) {
  const db = client || pool;
  const res = await db.query(
    `SELECT m.*,
            da.account_code AS debit_code,  da.account_name AS debit_name,
            ca.account_code AS credit_code, ca.account_name AS credit_name
     FROM   finance_account_mappings m
     LEFT JOIN chart_of_accounts da ON da.id = m.debit_account_id
     LEFT JOIN chart_of_accounts ca ON ca.id = m.credit_account_id
     WHERE  m.event_type = $1 AND m.sub_type = $2 AND m.is_active = TRUE`,
    [eventType, subType]
  );
  return res.rows[0] || null;
}

/** Generate the next JE reference number (JE-YYYY-NNNNN) */
async function nextJERef(client) {
  const db = client || pool;
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  // Use REGEXP approach to avoid parameterised SUBSTRING position issues
  const res = await db.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(entry_number, '^JE-\\d{4}-', '') AS INTEGER)), 0) AS max_seq
     FROM journal_entries WHERE entry_number ~ $1`,
    [`^JE-${year}-\\d+$`]
  );
  const seq = parseInt(res.rows[0].max_seq, 10) + 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

/** Update account current_balance after posting */
async function updateBalance(accountId, debitAmount, creditAmount, client) {
  const db = client || pool;
  const accRes = await db.query(
    'SELECT normal_balance FROM chart_of_accounts WHERE id = $1',
    [accountId]
  );
  if (!accRes.rows[0]) return;
  const normalBal = accRes.rows[0].normal_balance; // 'debit' or 'credit'
  const net = normalBal === 'debit'
    ? (debitAmount - creditAmount)
    : (creditAmount - debitAmount);
  await db.query(
    'UPDATE chart_of_accounts SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
    [net, accountId]
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Category GL lookup (migration 047+)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Look up GL accounts for a given item_categories.id.
 * Returns { item_type, asset_gl_id, expense_gl_id, ap_account_id,
 *           asset_gl_code, expense_gl_code, ap_code } or null.
 */
async function getCategoryAccounts(categoryId) {
  if (!categoryId) return null;
  const { rows } = await pool.query(`
    SELECT ic.item_type, ic.asset_gl_id, ic.expense_gl_id, ic.ap_account_id,
           ag.account_code AS asset_gl_code,
           eg.account_code AS expense_gl_code,
           ap.account_code AS ap_code
    FROM item_categories ic
    LEFT JOIN chart_of_accounts ag ON ic.asset_gl_id   = ag.id
    LEFT JOIN chart_of_accounts eg ON ic.expense_gl_id = eg.id
    LEFT JOIN chart_of_accounts ap ON ic.ap_account_id = ap.id
    WHERE ic.id = $1 AND ic.active = true
  `, [categoryId]);
  return rows[0] || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core: createAndPostJE
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Creates a POSTED journal entry automatically.
 *
 * @param {object} opts
 *   sourceModule   - 'BILLING' | 'PROCUREMENT' | 'PAYROLL' | 'EXPENSE' | 'REPORTING'
 *   sourceId       - PK of the source record (integer) — use sourceRef for UUID sources
 *   sourceRef      - Human-readable label e.g. "Bill B-2026-00001"
 *   narration      - Description for the JE
 *   lines          - Array of { accountId, debit, credit, description,
 *                               centerId, partyId, studyInstanceId,
 *                               reportingEntityId, narration }
 *   createdBy      - user id
 *   postingKey     - optional idempotency key (VARCHAR 150)
 *   entryDate      - optional date override (defaults to today)
 *   client         - optional pg transaction client
 *
 * @returns {object} created journal entry row
 */
async function createAndPostJE({
  sourceModule, sourceId, sourceRef, narration, lines,
  createdBy, client, postingKey, entryDate, centerId
}) {
  // ── Idempotency check (outside transaction) ──
  if (postingKey) {
    const existing = await checkIdempotency(postingKey);
    if (existing) {
      logger.info(`createAndPostJE: idempotent return for posting_key=${postingKey}, je_id=${existing.id}`);
      return existing;
    }
  }

  const ownTx = !client;
  let txClient = client;

  try {
    if (ownTx) {
      txClient = await pool.connect();
      await txClient.query('BEGIN');
    }

    // ── Period closed check ──
    const jeDate = entryDate || new Date();
    const period = await getActivePeriod(jeDate);
    if (period && period.is_closed) {
      throw new Error('Posting period is closed');
    }

    // Validate balance
    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(
        `Journal entry imbalanced: Dr ${totalDebit.toFixed(2)} ≠ Cr ${totalCredit.toFixed(2)}`
      );
    }
    if (lines.length < 2) {
      throw new Error('Journal entry requires at least 2 lines');
    }

    const jeRef   = await nextJERef(txClient);
    // Use entryDate string directly if it's already a YYYY-MM-DD date (avoids UTC midnight off-by-one)
    // Otherwise format in IST (Asia/Kolkata) — TZ env var ensures this works on any server
    const today = entryDate && typeof entryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)
      ? entryDate
      : new Date(entryDate || Date.now())
          .toLocaleDateString('en-CA', { timeZone: process.env.TZ || 'Asia/Kolkata' });

    // Derive center_id: use explicit param, otherwise take from first line that has one
    const resolvedCenterId = centerId || lines.find(l => l.centerId)?.centerId || null;

    const jeRes = await txClient.query(
      `INSERT INTO journal_entries
         (entry_number, entry_date, description, status,
          total_debit, total_credit,
          source_module, source_id, source_ref, is_auto_posted,
          posting_key, center_id, created_by, created_at, updated_at,
          reference_type, reference_id)
       VALUES ($1,$2,$3,'POSTED',$4,$5,$6,$7,$8,TRUE,$9,$10,$11,NOW(),NOW(),$12,$13)
       RETURNING *`,
      [jeRef, today, narration, totalDebit, totalCredit,
       sourceModule, sourceId || null, sourceRef, postingKey || null,
       resolvedCenterId, createdBy,
       sourceModule || null, sourceId || null]
    );
    const je = jeRes.rows[0];

    for (const line of lines) {
      const lineRes = await txClient.query(
        `INSERT INTO journal_entry_lines
           (journal_entry_id, account_id, debit_amount, credit_amount, description,
            center_id, party_id, study_instance_id, reporting_entity_id,
            source_ref, narration, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         RETURNING id`,
        [
          je.id, line.accountId, line.debit || 0, line.credit || 0,
          line.description || narration,
          line.centerId          || null,
          line.partyId           || null,
          line.studyInstanceId   || null,
          line.reportingEntityId || null,
          line.sourceRef         || null,
          line.narration         || null
        ]
      );
      await updateBalance(line.accountId, line.debit || 0, line.credit || 0, txClient);
      line._insertedId = lineRes.rows[0]?.id;
    }

    if (ownTx) {
      await txClient.query('COMMIT');
      txClient.release();
    }

    logger.info(`Auto JE posted: ${jeRef} | ${sourceModule} | ${sourceRef}`);
    return je;

  } catch (err) {
    if (ownTx && txClient) {
      try { await txClient.query('ROLLBACK'); } catch (_) {}
      txClient.release();
    }
    logger.error(`financeService.createAndPostJE failed: ${err.message}`, { sourceModule, sourceRef });
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Module-specific helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Post JE for a patient bill.
 *
 * All patients are direct-pay (Cash / Card / UPI).
 * Flow for paid bills:
 *   DR  1111 Cash                      (CASH)
 *   DR  1112 Bank                      (CARD / UPI / BANK)
 *   CR  4110–4190 Revenue by modality
 *   CR  2121 CGST Payable
 *   CR  2122 SGST Payable
 *
 * Flow for unpaid / credit bills (bill_status = 'BILLED', no cash received yet):
 *   DR  1121 AR – Self-Pay Patients
 *   CR  Revenue + GST
 *
 * @param {object} bill            patient_bills row
 * @param {string} paymentMethod   CASH | CARD | UPI | BANK | null (unpaid)
 * @param {number} createdBy
 */
async function postBillingJE(bill, paymentMethod, createdBy) {
  const method = (paymentMethod || '').toUpperCase();
  const isPaid = ['CASH', 'CARD', 'UPI', 'BANK'].includes(method);

  // Resolve debit account: cash/bank for paid, AR for credit/unpaid
  let debitAccountId = null;
  let debitDescription;

  if (isPaid) {
    const payMapping = await getMapping('BILLING_PAYMENT', method)
      || await getMapping('BILLING_PAYMENT', 'CASH');
    if (!payMapping?.debit_account_id) {
      logger.warn(`postBillingJE: no payment mapping for BILLING_PAYMENT/${method} — skipping JE`);
      return null;
    }
    debitAccountId  = payMapping.debit_account_id;
    debitDescription = `${method} payment — ${bill.bill_number || bill.id}`;
  } else {
    // Unpaid / billed — debit AR self-pay (1121)
    const { rows: arRows } = await pool.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1121' AND is_active = true
       UNION ALL
       SELECT id FROM chart_of_accounts WHERE account_code = '1120' AND is_active = true
       LIMIT 1`
    );
    debitAccountId  = arRows[0]?.id;
    debitDescription = `AR – Self Pay — ${bill.bill_number || bill.id}`;
    if (!debitAccountId) {
      logger.warn(`postBillingJE: AR account 1121 not found — skipping JE`);
      return null;
    }
  }

  // Resolve revenue account from modality/service type
  const svcType = normalizeServiceType(bill.service_type || bill.modality_type || bill.modality || '');
  const revMapping = await getMapping('BILLING_REVENUE', svcType)
    || await getMapping('BILLING_REVENUE', 'GENERAL');
  if (!revMapping?.credit_account_id) {
    logger.warn(`postBillingJE: no revenue mapping for BILLING_REVENUE/${svcType} — skipping JE`);
    return null;
  }

  const netAmount = parseFloat(Number(bill.net_amount || bill.total_amount || 0).toFixed(2));
  const cgst      = parseFloat(Number(bill.cgst_amount || 0).toFixed(2));
  const sgst      = parseFloat(Number(bill.sgst_amount || 0).toFixed(2));
  const taxable   = parseFloat((netAmount - cgst - sgst).toFixed(2));
  const revenueAmt = taxable > 0 ? taxable : netAmount;

  if (netAmount <= 0) {
    logger.warn(`postBillingJE: zero amount on bill ${bill.bill_number || bill.id} — skipping JE`);
    return null;
  }

  const lines = [
    {
      accountId:       debitAccountId,
      debit:           netAmount,
      credit:          0,
      description:     debitDescription,
      centerId:        bill.center_id || null,
    },
    {
      accountId:       revMapping.credit_account_id,
      debit:           0,
      credit:          revenueAmt,
      description:     `${svcType} service revenue`,
      centerId:        bill.center_id || null,
      studyInstanceId: bill.study_id  || null,
    },
  ];

  if (cgst > 0) {
    const cgstMap = await getMapping('BILLING_GST', 'CGST');
    if (cgstMap?.credit_account_id) {
      lines.push({
        accountId:   cgstMap.credit_account_id,
        debit:       0,
        credit:      cgst,
        description: `CGST on ${bill.bill_number || bill.id}`,
        centerId:    bill.center_id || null,
      });
    }
  }

  if (sgst > 0) {
    const sgstMap = await getMapping('BILLING_GST', 'SGST');
    if (sgstMap?.credit_account_id) {
      lines.push({
        accountId:   sgstMap.credit_account_id,
        debit:       0,
        credit:      sgst,
        description: `SGST on ${bill.bill_number || bill.id}`,
        centerId:    bill.center_id || null,
      });
    }
  }

  // Ensure DR = CR (absorb rounding into revenue line)
  const totalCr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const totalDr = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const diff = parseFloat((totalDr - totalCr).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    const revLine = lines.find(l => l.accountId === revMapping.credit_account_id);
    if (revLine) revLine.credit = parseFloat((revLine.credit + diff).toFixed(2));
  }

  return createAndPostJE({
    sourceModule: 'BILLING',
    sourceId:     bill.id,
    sourceRef:    bill.bill_number || `Bill #${bill.id}`,
    narration:    `Patient billing — ${bill.bill_number || bill.id} | ${method || 'CREDIT'}`,
    lines,
    createdBy,
    centerId:     bill.center_id || null,
    postingKey:   `BILL-${bill.id}`,
  });
}

/**
 * Post a single balanced JE for a patient bill that may contain multiple
 * service types (studies + contrast add-ons + DICOM).
 *
 * Structure:
 *   DR  Cash / Bank / AR          — full bill total (one debit line)
 *   CR  Study Revenue             — study subtotal
 *   CR  Contrast Service Revenue  — contrast add-on subtotal  (if any)
 *   CR  DICOM Revenue             — DICOM add-on subtotal     (if any)
 *   CR  CGST / SGST               — GST lines                 (if applicable)
 *
 * @param {object} bill          - patient_bills row
 * @param {Array}  itemLines     - [{ item_type, rate }] from study_details
 * @param {string} paymentMethod - CASH | UPI | CARD | BANK_TRANSFER | INSURANCE
 * @param {*}      createdBy
 */
async function postBillingJEWithLines(bill, itemLines = [], paymentMethod, createdBy) {
  const method = (paymentMethod || '').toUpperCase();
  const isPaid = ['CASH', 'CARD', 'UPI', 'BANK', 'BANK_TRANSFER'].includes(method);

  // ── Debit account ───────────────────────────────────────────────────────────
  let debitAccountId, debitDescription;
  if (isPaid) {
    const payMapping = await getMapping('BILLING_PAYMENT', method)
      || await getMapping('BILLING_PAYMENT', 'CASH');
    if (!payMapping?.debit_account_id) {
      logger.warn(`postBillingJEWithLines: no payment mapping for ${method} — skipping`);
      return null;
    }
    debitAccountId   = payMapping.debit_account_id;
    debitDescription = `${method} received — ${bill.invoice_number || bill.id}`;
  } else {
    const { rows: arRows } = await pool.query(
      `SELECT id FROM chart_of_accounts WHERE account_code IN ('1121','1120') AND is_active = true ORDER BY account_code LIMIT 1`
    );
    debitAccountId   = arRows[0]?.id;
    debitDescription = `AR – Self Pay — ${bill.invoice_number || bill.id}`;
    if (!debitAccountId) { logger.warn('postBillingJEWithLines: AR account not found'); return null; }
  }

  const netAmount  = parseFloat(Number(bill.total_amount || 0).toFixed(2));
  const cgst       = parseFloat(Number(bill.cgst_amount || 0).toFixed(2));
  const sgst       = parseFloat(Number(bill.sgst_amount || 0).toFixed(2));
  const taxable    = parseFloat((netAmount - cgst - sgst).toFixed(2));

  if (netAmount <= 0) { logger.warn(`postBillingJEWithLines: zero amount — skipping`); return null; }

  // Modality → finance_account_mappings sub_type
  const modalitySubType = (m) => {
    if (!m) return 'GENERAL';
    const u = m.toUpperCase();
    if (u === 'MRI')          return 'MRI';
    if (u === 'CT')           return 'CT_SCAN';
    if (u === 'XRAY' || u === 'DR' || u === 'X-RAY') return 'XRAY';
    if (u === 'ULTRASOUND' || u === 'USG' || u === 'DOPPLER') return 'ULTRASOUND';
    if (u === 'MAMMOGRAPHY' || u === 'MG') return 'MAMMOGRAPHY';
    if (u === 'PET_CT' || u === 'PET-CT' || u === 'PETCT') return 'PET_CT';
    return 'GENERAL';
  };

  // ── Group item lines by revenue sub_type ────────────────────────────────────
  // STUDY lines grouped per modality; add-ons get their own key
  const groups = {};
  for (const item of itemLines) {
    let key;
    if (item.item_type === 'CONTRAST')  key = 'CONTRAST';
    else if (item.item_type === 'DICOM_CD') key = 'DICOM';
    else key = modalitySubType(item.modality);   // MRI / CT_SCAN / XRAY / etc.
    groups[key] = (groups[key] || 0) + parseFloat(item.rate || 0);
  }
  if (Object.keys(groups).length === 0) {
    // fallback: use bill's service_type/modality or GENERAL
    const fallbackKey = modalitySubType(bill.service_type || bill.modality);
    groups[fallbackKey] = taxable > 0 ? taxable : netAmount;
  }

  // Scale to taxable amount (remove GST from revenue lines)
  const rawTotal = Object.values(groups).reduce((s, v) => s + v, 0);
  const scale    = rawTotal > 0 && taxable > 0 ? taxable / rawTotal : 1;

  // ── Build JE lines ─────────────────────────────────────────────────────────
  const lines = [{
    accountId:   debitAccountId,
    debit:       netAmount,
    credit:      0,
    description: debitDescription,
    centerId:    bill.center_id || null,
  }];

  const revDescMap = {
    MRI: 'MRI revenue', CT_SCAN: 'CT scan revenue', XRAY: 'X-Ray revenue',
    ULTRASOUND: 'Ultrasound revenue', MAMMOGRAPHY: 'Mammography revenue',
    PET_CT: 'PET-CT revenue', GENERAL: 'Study revenue',
    CONTRAST: 'Contrast service revenue', DICOM: 'DICOM media revenue',
  };

  for (const [grp, rawAmt] of Object.entries(groups)) {
    const revMap = await getMapping('BILLING_REVENUE', grp)
               || await getMapping('BILLING_REVENUE', 'GENERAL');
    if (!revMap?.credit_account_id) {
      logger.warn(`postBillingJEWithLines: no revenue account for ${grp} — skipping credit line`);
      continue;
    }
    lines.push({
      accountId:   revMap.credit_account_id,
      debit:       0,
      credit:      parseFloat((rawAmt * scale).toFixed(2)),
      description: `${revDescMap[grp] || grp} — ${bill.invoice_number || bill.id}`,
      centerId:    bill.center_id || null,
    });
  }

  // GST lines
  if (cgst > 0) {
    const cgstMap = await getMapping('BILLING_GST', 'CGST');
    if (cgstMap?.credit_account_id) lines.push({ accountId: cgstMap.credit_account_id, debit: 0, credit: cgst, description: `CGST — ${bill.invoice_number || bill.id}`, centerId: bill.center_id || null });
  }
  if (sgst > 0) {
    const sgstMap = await getMapping('BILLING_GST', 'SGST');
    if (sgstMap?.credit_account_id) lines.push({ accountId: sgstMap.credit_account_id, debit: 0, credit: sgst, description: `SGST — ${bill.invoice_number || bill.id}`, centerId: bill.center_id || null });
  }

  // Absorb rounding into first revenue line
  const totalCr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const diff    = parseFloat((netAmount - totalCr).toFixed(2));
  const firstRev = lines.find(l => l.credit > 0 && !['CGST','SGST'].some(t => l.description?.includes(t)));
  if (firstRev && Math.abs(diff) > 0.001) firstRev.credit = parseFloat((firstRev.credit + diff).toFixed(2));

  return createAndPostJE({
    sourceModule: 'BILLING',
    sourceId:     bill.id,
    sourceRef:    bill.invoice_number || `Bill #${bill.id}`,
    narration:    `Patient billing — ${bill.invoice_number || bill.id} | ${method || 'CREDIT'}`,
    lines,
    createdBy,
    centerId:     bill.center_id || null,
    postingKey:   `BILL-${bill.id}`,
  });
}

/**
 * Post JE when a vendor bill is paid.
 *   DR  AP account (from vendor_bill or category)
 *   CR  Bank/Cash account
 *
 * Also updates vendor_bills.payment_status → 'PAID' and
 * updates payables.paid_amount / balance_amount / status.
 *
 * @param {object} payment
 *   {
 *     vendor_bill_id  : integer,   -- vendor_bills.id
 *     amount          : number,    -- payment amount (can be partial)
 *     payment_date    : string,    -- ISO date
 *     payment_mode    : string,    -- CASH | BANK_TRANSFER | UPI | CHEQUE
 *     bank_account_id : integer|null,  -- optional specific bank account
 *     reference       : string,    -- cheque/UTR/reference number
 *     notes           : string,
 *   }
 * @param {number} createdBy
 * @param {object} [txClient]
 */
async function postVendorPaymentJE(payment, createdBy, txClient = null) {
  const db = txClient || pool;

  // Fetch vendor bill + AP account from bill's posted JE credit line (item-category driven)
  const { rows: billRows } = await db.query(
    `SELECT vb.*,
            (SELECT jel.account_id FROM journal_entry_lines jel
             WHERE jel.journal_entry_id = vb.journal_entry_id AND jel.credit_amount > 0
             ORDER BY jel.id LIMIT 1) AS ap_account_id
     FROM vendor_bills vb
     WHERE vb.id = $1`,
    [payment.vendor_bill_id]
  );
  if (!billRows.length) {
    logger.warn(`postVendorPaymentJE: vendor_bill ${payment.vendor_bill_id} not found`);
    return null;
  }
  const bill = billRows[0];

  const amount = parseFloat(payment.amount || bill.total_amount || 0);
  if (amount <= 0) return null;

  // Resolve AP account (DR side) — from bill JE credit line, fallback 2113
  const apAccountId = bill.ap_account_id
    || (await db.query(
         `SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1`
       )).rows[0]?.id;

  if (!apAccountId) {
    logger.warn(`postVendorPaymentJE: AP account not found for bill ${bill.bill_number}`);
    return null;
  }

  // Resolve bank/cash account (CR side)
  const pMode = (payment.payment_mode || 'BANK_TRANSFER').toUpperCase();
  const bankCode = pMode === 'CASH' ? '1111' : '1112';
  let bankAccountId = null;

  if (payment.bank_account_id) {
    // Specific bank account selected
    const { rows } = await db.query(
      `SELECT coa_account_id FROM bank_accounts WHERE id = $1 LIMIT 1`,
      [payment.bank_account_id]
    );
    bankAccountId = rows[0]?.coa_account_id || null;
  }
  if (!bankAccountId) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
      [bankCode]
    );
    bankAccountId = rows[0]?.id || null;
  }
  if (!bankAccountId) {
    logger.warn(`postVendorPaymentJE: bank account not found for payment mode ${pMode}`);
    return null;
  }

  // Align posting key with payments.js pay endpoint format (VPAY-{payment_row_id}) when id available
  const postingKey = payment.id
    ? `VPAY-${payment.id}`
    : `VPAY-${payment.vendor_bill_id}-${(payment.payment_date || '').replace(/-/g, '')}`;

  const je = await createAndPostJE({
    sourceModule: 'VENDOR_PAYMENT',
    sourceId:     payment.vendor_bill_id,
    sourceRef:    bill.bill_number,
    narration:    `Vendor payment — ${bill.bill_number} | ${payment.reference || pMode}`,
    lines: [
      {
        accountId:   apAccountId,
        debit:       amount,
        credit:      0,
        description: `AP cleared — ${bill.bill_number}`,
        centerId:    bill.center_id || null,
      },
      {
        accountId:   bankAccountId,
        debit:       0,
        credit:      amount,
        description: `Payment via ${pMode}${payment.reference ? ' | ' + payment.reference : ''}`,
        centerId:    bill.center_id || null,
      },
    ],
    createdBy,
    postingKey,
    entryDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
    client:    txClient || undefined,
  });

  if (je) {
    // Update vendor_bill
    const totalPaid = parseFloat(bill.paid_amount || 0) + amount;
    const remaining = parseFloat(bill.total_amount || 0) - totalPaid;
    const newStatus = remaining <= 0.01 ? 'PAID' : 'PARTIAL';
    await db.query(
      `UPDATE vendor_bills
       SET paid_amount = $1, payment_status = $2, paid_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [totalPaid, newStatus, payment.vendor_bill_id]
    );

    // Update matching payables by vendor_bill_id (exact FK match, not broad text search)
    await db.query(
      `UPDATE payables
       SET paid_amount    = LEAST(amount, paid_amount + $1),
           balance_amount = GREATEST(0, balance_amount - $1),
           status         = CASE WHEN balance_amount - $1 <= 0.01 THEN 'PAID' ELSE status END,
           updated_at     = NOW()
       WHERE vendor_bill_id = $2`,
      [amount, payment.vendor_bill_id]
    );

    logger.info(`postVendorPaymentJE: posted JE ${je.entry_number} for ₹${amount} on bill ${bill.bill_number}`);
  }

  return je;
}

/**
 * Post JE when a PO is completed.
 * For each line item, looks up category GL accounts from item_categories.
 * Groups lines by GL account for a clean JE.
 *
 * Supported call forms:
 *   postProcurementJE(po, createdBy)               — fetches items from DB, own transaction
 *   postProcurementJE(po, createdBy, txClient)      — fetches items from DB, shared transaction
 *   postProcurementJE(po, items[], createdBy)       — items provided, own transaction
 *   postProcurementJE(po, items[], createdBy, txClient) — items provided, shared transaction
 *
 * @param {object} po        - procurement_orders row
 * @param {Array|number} items - PO line items array OR createdBy user id (if no items)
 * @param {number|object} createdBy - user id OR pg txClient (if no items array)
 * @param {object} [txClient] - optional pg client to share caller's transaction
 */
async function postProcurementJE(po, items, createdBy, txClient = null) {
  // Normalise call forms — allow (po, createdBy) and (po, createdBy, txClient)
  if (!Array.isArray(items)) {
    // items arg is actually createdBy; createdBy arg is actually txClient
    txClient  = (createdBy && typeof createdBy === 'object' && typeof createdBy.query === 'function')
                  ? createdBy : txClient;
    createdBy = (typeof items === 'number' || items === null) ? items : null;
    items     = null;
    const db = txClient || pool;
    const { rows } = await db.query(
      `SELECT poi.*, im.category_id, im.item_type
       FROM procurement_order_items poi
       LEFT JOIN item_master im ON im.id = poi.item_master_id
       WHERE poi.po_id = $1`,
      [po.id]
    );
    items = rows;
  }
  if (!items || !items.length) {
    logger.warn(`postProcurementJE: no items for PO ${po.po_number || po.id} — skipping JE`);
    return null;
  }

  // Group debit amounts by GL account
  const debitMap = {}; // accountId → { accountId, amount, description }

  for (const it of items) {
    const lineTotal = Number(it.amount || (parseFloat(it.quantity || 0) * parseFloat(it.unit_rate || 0)));
    if (lineTotal <= 0) continue;

    // Fetch category from item_master
    let categoryId = it.category_id;
    let itemType   = it.item_type;

    if (!categoryId && it.item_master_id) {
      const { rows } = await pool.query(
        'SELECT category_id, item_type FROM item_master WHERE id = $1',
        [it.item_master_id]
      );
      if (rows[0]) { categoryId = rows[0].category_id; itemType = rows[0].item_type; }
    }

    if (!categoryId) {
      logger.warn(`postProcurementJE: item "${it.item_name || it.item_master_id}" has no category_id — skipping line`);
      continue;
    }

    const catAccounts = await getCategoryAccounts(categoryId);
    if (!catAccounts) {
      logger.warn(`postProcurementJE: category ${categoryId} not found — skipping line`);
      continue;
    }

    // Determine debit account
    let debitAccountId;
    if (catAccounts.item_type === 'STOCK' || catAccounts.item_type === 'FIXED_ASSET') {
      debitAccountId = catAccounts.asset_gl_id;
    } else {
      // EXPENSE / NON_STOCK
      debitAccountId = catAccounts.expense_gl_id;
    }

    if (!debitAccountId) {
      logger.warn(`postProcurementJE: no debit GL for category ${categoryId} — skipping line`);
      continue;
    }

    if (!debitMap[debitAccountId]) {
      debitMap[debitAccountId] = { accountId: debitAccountId, amount: 0, description: `Purchase — ${po.po_number || po.id}` };
    }
    debitMap[debitAccountId].amount += lineTotal;
  }

  const debitLines = Object.values(debitMap);
  if (!debitLines.length) {
    logger.warn(`postProcurementJE: no valid lines for PO ${po.po_number || po.id} — skipping JE`);
    return null;
  }

  const total = debitLines.reduce((s, l) => s + l.amount, 0);
  if (total <= 0) return null;

  // Resolve AP (credit) account — priority order:
  //   1. First item's category ap_account_id
  //   2. Last resort: 2113 (AP – Service Providers) — generic fallback
  //   Vendor master is NOT consulted — AP is driven by item type, not vendor
  const db = txClient || pool;
  let creditAccountId = null;

  if (items[0]) {
    const firstCatId = items[0].category_id
      || (items[0].item_master_id
        ? (await db.query('SELECT category_id FROM item_master WHERE id=$1', [items[0].item_master_id])).rows[0]?.category_id
        : null);
    if (firstCatId) {
      const cat = await getCategoryAccounts(firstCatId);
      creditAccountId = cat?.ap_account_id || null;
    }
  }

  // Last resort: 2113 (Service Providers — more generic than old hardcoded 2112)
  if (!creditAccountId) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1`
    );
    creditAccountId = rows[0]?.id;
  }

  if (!creditAccountId) {
    logger.warn(`postProcurementJE: no AP account found for PO ${po.po_number || po.id} — skipping JE`);
    return null;
  }

  // Resolve party_id for vendor
  let vendorPartyId = null;
  if (po.vendor_id) {
    const { rows: vPRows } = await pool.query(
      'SELECT id FROM parties WHERE vendor_id = $1 LIMIT 1', [po.vendor_id]
    );
    vendorPartyId = vPRows[0]?.id || null;
  }

  // AP is only created at GRN receipt (3-way match).
  // postProcurementJE records the purchase commitment as a memo/informational JE
  // (DR Expense/Asset / CR AP) but this DUPLICATES the GRN JE.
  // To prevent double AP: we do NOT post a credit to AP here.
  // Instead we post debit lines only — the GRN JE will balance with the AP credit.
  // In practice the PO JE is skipped entirely; only GRN creates AP.
  logger.info(`postProcurementJE: PO ${po.po_number || po.id} — AP posting skipped; AP will be created at GRN receipt`);
  return null; // GRN handles all accounting

  /* ── DISABLED: dual AP posting ──────────────────────────────────────────
  const lines = [
    ...debitLines.map(l => ({
      accountId:   l.accountId,
      debit:       l.amount,
      credit:      0,
      description: l.description,
      centerId:    po.center_id || null
    })),
    {
      accountId:   creditAccountId,
      debit:       0,
      credit:      total,
      description: `Accounts Payable — ${po.vendor_name || po.supplier_name || 'Supplier'}`,
      centerId:    po.center_id || null,
      partyId:     vendorPartyId
    }
  ];

  const je = await createAndPostJE({
    sourceModule: 'PROCUREMENT',
    sourceId:     po.id,
    sourceRef:    po.po_number || `PO #${po.id}`,
    narration:    `PO completed — ${po.po_number || po.id} | ${po.vendor_name || po.supplier_name || ''}`,
    lines,
    createdBy,
    client:       txClient || undefined
  });
  ── END DISABLED ──────────────────────────────────────────────────────── */

  // Write party subledger for vendor credit
  if (je && vendorPartyId) {
    if (txClient) {
      // Reuse caller's transaction — no nested BEGIN/COMMIT
      await writePartyLedger(
        txClient, vendorPartyId, je.id, null, po.center_id || null,
        je.entry_date, je.entry_number,
        `PO: ${po.po_number || po.id}`,
        0, total, 'PROCUREMENT', po.po_number || `PO #${po.id}`
      );
    } else {
      const ownClient = await pool.connect();
      try {
        await ownClient.query('BEGIN');
        await writePartyLedger(
          ownClient, vendorPartyId, je.id, null, po.center_id || null,
          je.entry_date, je.entry_number,
          `PO: ${po.po_number || po.id}`,
          0, total, 'PROCUREMENT', po.po_number || `PO #${po.id}`
        );
        await ownClient.query('COMMIT');
      } catch (e) {
        await ownClient.query('ROLLBACK');
        logger.error('postProcurementJE: party_ledger write failed:', e.message);
      } finally {
        ownClient.release();
      }
    }
  }

  return je;
}

/**
 * Post JE for a single GRN receipt (partial or full).
 *   DR inventory GL (STOCK items) or expense GL (NON_STOCK items) per line
 *   CR vendor AP account
 *
 * @param {object} receipt - purchase_receipts row (id, grn_number, center_id, receipt_date)
 * @param {Array}  items   - purchase_receipt_items rows
 * @param {object} po      - procurement_orders row (vendor_name, center_id)
 * @param {number} createdBy
 * @param {object} [txClient] - optional shared pg client
 */
async function postGRNJE(receipt, items, po, createdBy, txClient = null) {
  const db = txClient || pool;

  if (!items?.length) {
    logger.warn(`postGRNJE: no items for GRN ${receipt.grn_number} — skipping`);
    return null;
  }

  // AP (credit) account is driven by item type/category, NOT by vendor.
  // A single vendor can supply goods from multiple categories (equipment, consumables, IT, etc.)
  // so vendor_master.ap_account_id is intentionally excluded from this resolution chain.
  // creditAccountId is set per-item below from item_categories.ap_account_id.
  let creditAccountId = null;

  // Vendor party subledger id — for party ledger only, not AP account selection
  let vendorPartyId = null;
  if (po.vendor_name) {
    const { rows: vRows } = await db.query(
      `SELECT p.id AS party_id
       FROM vendor_master vm
       LEFT JOIN parties p ON p.vendor_id = vm.id
       WHERE LOWER(vm.vendor_name) = LOWER($1) AND vm.active = true LIMIT 1`,
      [po.vendor_name]
    );
    vendorPartyId = vRows[0]?.party_id || null;
  }
  if (!vendorPartyId && po.vendor_gstin) {
    const { rows: gRows } = await db.query(
      `SELECT p.id AS party_id
       FROM vendor_master vm
       LEFT JOIN parties p ON p.vendor_id = vm.id
       WHERE vm.gst_number = $1 AND vm.active = true LIMIT 1`,
      [po.vendor_gstin]
    );
    vendorPartyId = gRows[0]?.party_id || null;
  }

  // Resolve GST ITC accounts — split into CGST(1135)/SGST(1136)/IGST(1137); fallback to 1134
  const { rows: itcRows } = await db.query(
    `SELECT account_code, id FROM chart_of_accounts
     WHERE account_code IN ('1134','1135','1136','1137') AND is_active = true`
  );
  const itcMap = Object.fromEntries(itcRows.map(r => [r.account_code, r.id]));
  const itcAccountId    = itcMap['1134'] || null; // fallback only
  const cgstItcAccId    = itcMap['1135'] || itcAccountId;
  const sgstItcAccId    = itcMap['1136'] || itcAccountId;
  const igstItcAccId    = itcMap['1137'] || itcAccountId;

  // Determine intra-state vs inter-state using corporate GSTIN (single registration for all centers)
  const { rows: coRows } = await db.query(
    `SELECT gstin FROM company_info ORDER BY id LIMIT 1`
  );
  const corporateGstin  = coRows[0]?.gstin || '';
  const companyStateCode = /^\d{2}/.test(corporateGstin) ? corporateGstin.substring(0, 2) : '32'; // fallback Kerala
  const vendorStateCode = po.vendor_gstin && /^\d{2}/.test(po.vendor_gstin)
    ? po.vendor_gstin.substring(0, 2) : null;
  const isIntraState = vendorStateCode && vendorStateCode === companyStateCode;

  // Resolve Capital WIP account (1280) once — used for FIXED_ASSET GRN lines
  let cwipAccountId = null;
  {
    const { rows: cwipRows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1280' AND is_active = true LIMIT 1`
    );
    cwipAccountId = cwipRows[0]?.id || null;
  }

  // Build debit lines — group by GL account (BASE amount only, excluding GST)
  const lineMap = {}; // accountId → { amount, isStock, isCWIP }
  let totalGST = 0;
  for (const item of items) {
    const gstAmount = parseFloat(item.gst_amount || 0);
    // purchase_receipt_items.amount = base + GST (gross); use base only for GL debit
    const amount = parseFloat(item.amount || 0) - gstAmount;
    if (amount <= 0) continue;
    totalGST += gstAmount;

    let debitAccountId = null;
    let isStock = true;
    let isCWIP  = false;

    if (item.item_master_id) {
      const { rows: imRows } = await db.query(
        `SELECT im.item_type, ic.asset_gl_id, ic.expense_gl_id, ic.ap_account_id
         FROM item_master im
         LEFT JOIN item_categories ic ON ic.id = im.category_id
         WHERE im.id = $1`,
        [item.item_master_id]
      );
      const im = imRows[0];
      if (im) {
        if (im.item_type === 'FIXED_ASSET') {
          // DR CWIP (1280) at GRN stage — capitalisation JE will move CWIP → Fixed Asset GL
          debitAccountId = cwipAccountId;
          if (!debitAccountId) {
            logger.warn(`postGRNJE: CWIP account 1280 not found for FA item ${item.item_name} — skipping`);
            continue;
          }
          isStock = false;
          isCWIP  = true;
          // Item category drives AP — first item with an ap_account_id wins
          if (!creditAccountId && im.ap_account_id) creditAccountId = im.ap_account_id;
        } else {
          isStock = im.item_type === 'STOCK';
          debitAccountId = isStock
            ? (im.asset_gl_id || im.expense_gl_id)
            : im.expense_gl_id;
          if (!creditAccountId && im.ap_account_id) creditAccountId = im.ap_account_id;
        }
      }
    }

    // Fallback debit: first 5xxx expense account
    if (!debitAccountId) {
      const { rows } = await db.query(
        `SELECT id FROM chart_of_accounts
         WHERE account_code LIKE '5%' AND is_active = true ORDER BY account_code LIMIT 1`
      );
      debitAccountId = rows[0]?.id;
    }

    if (!debitAccountId) {
      logger.warn(`postGRNJE: no debit GL for item ${item.item_name} — skipping line`);
      continue;
    }

    if (!lineMap[debitAccountId]) lineMap[debitAccountId] = { amount: 0, isStock, isCWIP };
    lineMap[debitAccountId].amount += amount;
  }

  // AP fallback — only reached when item_categories.ap_account_id is not set.
  // Set ap_account_id on the relevant item category to avoid this fallback.
  if (!creditAccountId) {
    logger.warn(`postGRNJE: no ap_account_id found on any item category for GRN ${receipt.grn_number} — using fallback 2112`);
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1`
    );
    creditAccountId = rows[0]?.id;
  }

  const debitLines = Object.entries(lineMap).map(([accountId, { amount, isStock }]) => ({
    accountId: parseInt(accountId),
    debit:     parseFloat(amount.toFixed(2)),
    credit:    0,
    description: isStock
      ? `Inventory receipt — ${receipt.grn_number}`
      : `Asset/Expense — ${receipt.grn_number}`,
    centerId:  receipt.center_id || null,
  }));

  if (!debitLines.length || !creditAccountId) {
    logger.warn(`postGRNJE: insufficient GL accounts for GRN ${receipt.grn_number} — skipping`);
    return null;
  }

  const netTotal   = parseFloat(debitLines.reduce((s, l) => s + l.debit, 0).toFixed(2));
  const gstRounded = parseFloat(totalGST.toFixed(2));

  // Build ITC lines — split CGST+SGST for intra-state, IGST for inter-state
  const itcLines = [];
  if (gstRounded > 0) {
    if (isIntraState && cgstItcAccId && sgstItcAccId) {
      const half = parseFloat((gstRounded / 2).toFixed(2));
      const other = parseFloat((gstRounded - half).toFixed(2)); // handles odd paise
      itcLines.push({
        accountId:   cgstItcAccId,
        debit:       half,
        credit:      0,
        description: `CGST ITC — ${receipt.grn_number}`,
        centerId:    receipt.center_id || null,
      });
      itcLines.push({
        accountId:   sgstItcAccId,
        debit:       other,
        credit:      0,
        description: `SGST ITC — ${receipt.grn_number}`,
        centerId:    receipt.center_id || null,
      });
    } else if (igstItcAccId) {
      itcLines.push({
        accountId:   igstItcAccId,
        debit:       gstRounded,
        credit:      0,
        description: `IGST ITC — ${receipt.grn_number}`,
        centerId:    receipt.center_id || null,
      });
    } else if (itcAccountId) {
      // fallback: single ITC account
      itcLines.push({
        accountId:   itcAccountId,
        debit:       gstRounded,
        credit:      0,
        description: `GST Input Credit (ITC) — ${receipt.grn_number}`,
        centerId:    receipt.center_id || null,
      });
    }
  }

  // grandTotal = sum of ALL debit lines (inventory/CWIP + ITC) → must equal AP credit
  const grandTotal = parseFloat(
    (netTotal + itcLines.reduce((s, l) => s + (l.debit || 0), 0)).toFixed(2)
  );

  const lines = [
    ...debitLines,
    ...itcLines,
    {
      accountId:   creditAccountId,
      debit:       0,
      credit:      grandTotal,
      description: `AP — ${po.vendor_name || 'Supplier'} | ${receipt.grn_number}`,
      centerId:    receipt.center_id || null,
      partyId:     vendorPartyId || null,
    },
  ];

  const je = await createAndPostJE({
    sourceModule: 'GRN',
    sourceId:     receipt.id,
    sourceRef:    receipt.grn_number,
    narration:    `GRN received — ${receipt.grn_number} | ${po.vendor_name || ''}`,
    lines,
    createdBy,
    postingKey:   `GRN-${receipt.id}`,
    entryDate:    receipt.receipt_date,
    client:       txClient || undefined,
  });

  // Party subledger — AP credit increases (use grandTotal including GST)
  if (je && vendorPartyId) {
    if (txClient) {
      await writePartyLedger(
        txClient, vendorPartyId, je.id, null, receipt.center_id || null,
        je.entry_date, je.entry_number,
        `GRN: ${receipt.grn_number}`, 0, grandTotal, 'GRN', receipt.grn_number
      );
    } else {
      const ownClient = await pool.connect();
      try {
        await ownClient.query('BEGIN');
        await writePartyLedger(
          ownClient, vendorPartyId, je.id, null, receipt.center_id || null,
          je.entry_date, je.entry_number,
          `GRN: ${receipt.grn_number}`, 0, grandTotal, 'GRN', receipt.grn_number
        );
        await ownClient.query('COMMIT');
      } catch (e) {
        await ownClient.query('ROLLBACK');
        logger.error('postGRNJE: party_ledger write failed:', e.message);
      } finally { ownClient.release(); }
    }
  }

  // Create vendor_bills record so AP aging and payment matching work
  if (je && grandTotal > 0) {
    try {
      // Resolve vendor credit terms (default 30 days)
      let creditDays = 30;
      if (po.vendor_code || po.vendor_name) {
        const vField = po.vendor_code ? 'vendor_code' : 'LOWER(vendor_name)';
        const vVal   = po.vendor_code ? po.vendor_code : (po.vendor_name || '').toLowerCase();
        const { rows: vRows } = await (txClient || pool).query(
          `SELECT payment_terms FROM vendor_master WHERE ${vField} = $1 AND active = true LIMIT 1`,
          [vVal]
        );
        if (vRows[0]?.payment_terms) {
          const parsed = parseInt((vRows[0].payment_terms || '').replace(/\D/g, ''));
          if (!isNaN(parsed) && parsed > 0) creditDays = parsed;
        }
      }

      const receiptDate = receipt.receipt_date
        ? new Date(receipt.receipt_date).toLocaleDateString('en-CA')
        : new Date().toLocaleDateString('en-CA');
      const dueDate = new Date(new Date(receiptDate).getTime() + creditDays * 86400000)
        .toLocaleDateString('en-CA');

      // Resolve vendor_code — procurement_orders has vendor_name but not vendor_code
      let resolvedVendorCode = po.vendor_code || null;
      if (!resolvedVendorCode && po.vendor_gstin) {
        const { rows: vcRows } = await (txClient || pool).query(
          `SELECT vendor_code FROM vendor_master WHERE gst_number=$1 AND active=true LIMIT 1`,
          [po.vendor_gstin]
        );
        resolvedVendorCode = vcRows[0]?.vendor_code || null;
      }
      if (!resolvedVendorCode && po.vendor_name) {
        const { rows: vcRows } = await (txClient || pool).query(
          `SELECT vendor_code FROM vendor_master WHERE vendor_name ILIKE $1 AND active=true LIMIT 1`,
          [po.vendor_name]
        );
        resolvedVendorCode = vcRows[0]?.vendor_code || null;
      }
      if (!resolvedVendorCode) {
        logger.warn(`postGRNJE: vendor_code not resolved for GRN ${receipt.grn_number} — vendor bill will have null vendor_code (vendor: "${po.vendor_name || 'unknown'}")`);
      }

      // Split GST into CGST/SGST (intra-state) or IGST (inter-state)
      // Reuse isIntraState already computed above from companyStateCode vs vendorStateCode
      const sgstAmt = isIntraState ? parseFloat((gstRounded / 2).toFixed(2)) : 0;
      const cgstAmt = isIntraState ? parseFloat((gstRounded - sgstAmt).toFixed(2)) : 0;
      const igstAmt = isIntraState ? 0 : gstRounded;

      // Idempotency: one vendor_bill per GRN receipt.
      // If a stale row exists with wrong GST breakdown (cgst=0/sgst=0 but gstRounded>0),
      // self-heal it so re-posting a GRN always produces correct data.
      const { rows: existing } = await (txClient || pool).query(
        `SELECT id, cgst_amount, sgst_amount FROM vendor_bills WHERE bill_number = $1 LIMIT 1`,
        [receipt.grn_number]
      );
      if (!existing.length) {
        await (txClient || pool).query(
          `INSERT INTO vendor_bills
             (vendor_code, vendor_name_text, center_id, bill_number, bill_date, due_date,
              subtotal, cgst_amount, sgst_amount, igst_amount, total_amount,
              payment_status, bill_status, source_grn_id, source_po_id, journal_entry_id, active, notes,
              created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING','DRAFT',$12,$13,$14,true,$15,NOW(),NOW())`,
          [
            resolvedVendorCode,
            po.vendor_name   || null,
            receipt.center_id || null,
            receipt.grn_number,
            receiptDate,
            dueDate,
            netTotal,
            cgstAmt,      // cgst
            sgstAmt,      // sgst
            igstAmt,      // igst
            grandTotal,
            receipt.id,   // source_grn_id
            po.id || null, // source_po_id
            je.id,         // journal_entry_id — FK to the GRN JE
            `Auto-created from GRN ${receipt.grn_number} | JE ${je.entry_number}`,
          ]
        );
        logger.info(`postGRNJE: vendor_bill created for GRN ${receipt.grn_number}`);
      } else if (gstRounded > 0 && parseFloat(existing[0].cgst_amount || 0) === 0 && parseFloat(existing[0].sgst_amount || 0) === 0) {
        // Stale row has zero GST split — patch it
        await (txClient || pool).query(
          `UPDATE vendor_bills
             SET subtotal = $1, cgst_amount = $2, sgst_amount = $3, igst_amount = $4,
                 total_amount = $5, updated_at = NOW()
           WHERE bill_number = $6`,
          [netTotal, cgstAmt, sgstAmt, igstAmt, grandTotal, receipt.grn_number]
        );
        logger.info(`postGRNJE: patched stale GST breakdown on vendor_bill for GRN ${receipt.grn_number}`);
      }
    } catch (vbErr) {
      logger.warn('postGRNJE: vendor_bill creation failed (non-critical):', vbErr.message);
    }
  }

  return je;
}

/**
 * Post JE for a stock issue / consumption (STOCK_OUT movement).
 *   DR expense GL (from item category)
 *   CR inventory asset GL (from item category)
 *
 * @param {object} item     - item_master row with category join (asset_gl_id, expense_gl_id)
 * @param {number} qty      - quantity issued
 * @param {number} unitCost - cost per unit
 * @param {object} movement - inventory_movements row (id, center_id, reference_number, movement_date)
 * @param {number} createdBy
 * @param {object} [txClient]
 */
async function postStockIssueJE(item, qty, unitCost, movement, createdBy, txClient = null) {
  const db = txClient || pool;
  const amount = parseFloat((qty * unitCost).toFixed(2));

  if (amount <= 0) {
    logger.warn(`postStockIssueJE: zero amount for movement ${movement.id} — skipping`);
    return null;
  }

  // Fetch GL accounts + item_type from category if not already on item object
  let expenseGl  = item.expense_gl_id || null;
  let assetGl    = item.asset_gl_id   || null;
  let apGl       = item.ap_account_id || null;
  let itemType   = item.item_type     || 'STOCK';

  if (!expenseGl || !assetGl || !apGl) {
    const { rows } = await db.query(
      `SELECT ic.expense_gl_id, ic.asset_gl_id, ic.ap_account_id, im.item_type
       FROM item_master im
       LEFT JOIN item_categories ic ON ic.id = im.category_id
       WHERE im.id = $1`,
      [item.id]
    );
    if (rows[0]) {
      expenseGl = expenseGl || rows[0].expense_gl_id;
      assetGl   = assetGl   || rows[0].asset_gl_id;
      apGl      = apGl      || rows[0].ap_account_id;
      itemType  = rows[0].item_type || itemType;
    }
  }

  // For EXPENSE items (e.g. tele-rad SAAS per-study fee):
  //   DR expense_gl / CR ap_account  (payable to service provider)
  // For STOCK items:
  //   DR expense_gl / CR asset_gl    (inventory reduction)
  const isExpenseItem = itemType === 'EXPENSE';
  const creditGl = isExpenseItem ? apGl : assetGl;

  // Fallback for expense GL
  if (!expenseGl) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code LIKE '5%' AND is_active = true ORDER BY account_code LIMIT 1`
    );
    expenseGl = rows[0]?.id;
  }
  // Fallback for credit GL
  if (!creditGl) {
    const fallbackCode = isExpenseItem ? '2113' : '1151';
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
      [fallbackCode]
    );
    if (isExpenseItem) apGl = rows[0]?.id;
    else assetGl = rows[0]?.id;
  }

  const resolvedCreditGl = isExpenseItem ? (apGl || creditGl) : (assetGl || creditGl);

  if (!expenseGl || !resolvedCreditGl) {
    logger.warn(`postStockIssueJE: missing GL accounts for item ${item.id} (type=${itemType}) — skipping`);
    return null;
  }

  const creditDesc = isExpenseItem
    ? `Accrued service cost — ${item.item_name || item.id}`
    : `Inventory reduced — ${item.item_name || item.id}`;

  // Best practice: expense (DR) hits the consuming center; inventory reduction (CR)
  // hits the holding center (where stock was received). For single-entity multi-center
  // operations this keeps both P&L-by-center and balance-sheet-by-center accurate.
  const consumingCenter = movement.center_id || null;
  let holdingCenter = consumingCenter; // default: same center (non-corporate stock)
  if (!isExpenseItem) {
    const { rows: [stockIn] } = await db.query(
      `SELECT center_id FROM inventory_movements
       WHERE item_id = $1 AND movement_type IN ('STOCK_IN','OPENING')
       ORDER BY created_at DESC LIMIT 1`,
      [item.id]
    );
    if (stockIn?.center_id) holdingCenter = stockIn.center_id;
  }

  return createAndPostJE({
    sourceModule: 'STOCK_ISSUE',
    sourceId:     movement.id,
    sourceRef:    movement.movement_number || `MOV-${movement.id}`,
    narration:    `${isExpenseItem ? 'Expense' : 'Stock'} issued — ${item.item_name || item.id} × ${qty} @ ₹${unitCost}`,
    lines: [
      {
        accountId:   expenseGl,
        debit:       amount,
        credit:      0,
        description: `Consumption — ${item.item_name || item.id}`,
        centerId:    consumingCenter,
      },
      {
        accountId:   resolvedCreditGl,
        debit:       0,
        credit:      amount,
        description: creditDesc,
        centerId:    holdingCenter,
      },
    ],
    createdBy,
    postingKey: `STOCKOUT-${movement.id}`,
    entryDate:  movement.movement_date || new Date(),
    client:     txClient || undefined,
  });
}

/**
 * Post JE for a payroll run.
 *
 * Supports per-staff-category salary expense accounts:
 *   MEDICAL / TECHNICAL / NURSING / LABORATORY → DR 5210
 *   ADMIN   / ACCOUNTS  / RECEPTION            → DR 5220
 *   SUPPORT / MAINTENANCE / HOUSEKEEPING        → DR 5230
 *
 * Full deduction breakdown:
 *   DR  5210/5220/5230  Gross salary by staff category
 *   CR  2131            Net salaries payable
 *   DR  5240            Employer PF + ESI contribution
 *   CR  2132            PF payable  (employee + employer)
 *   CR  2133            ESI payable (employee + employer)
 *   CR  2141            TDS payable (employee income tax deducted)
 *
 * @param {object} summary
 *   {
 *     periodLabel       : 'YYYY-MM',
 *     totalGross        : number,
 *     totalNet          : number,
 *     totalPF           : number,   -- employer PF
 *     totalESI          : number,   -- employer ESI
 *     employeePF        : number,   -- employee PF deduction
 *     employeeESI       : number,   -- employee ESI deduction
 *     totalTDS          : number,   -- TDS deducted
 *     // per-category breakdown (optional — falls back to single SALARY mapping)
 *     byCategory        : [{ category: 'MEDICAL', gross: number }, ...]
 *   }
 * @param {number} createdBy
 * @param {number|null} centerId
 */
async function postPayrollJE(summary, createdBy, centerId) {
  const pfMap  = await getMapping('PAYROLL_RUN', 'PF');
  const esiMap = await getMapping('PAYROLL_RUN', 'ESI');
  const tdsMap = await getMapping('PAYROLL_RUN', 'TDS');

  const gross      = parseFloat(Number(summary.totalGross    || 0).toFixed(2));
  const net        = parseFloat(Number(summary.totalNet      || 0).toFixed(2));
  const empPF      = parseFloat(Number(summary.employeePF    || 0).toFixed(2));
  const empESI     = parseFloat(Number(summary.employeeESI   || 0).toFixed(2));
  const emplrPF    = parseFloat(Number(summary.totalPF       || 0).toFixed(2));
  const emplrESI   = parseFloat(Number(summary.totalESI      || 0).toFixed(2));
  const tds        = parseFloat(Number(summary.totalTDS      || 0).toFixed(2));
  const totalPF    = parseFloat((empPF  + emplrPF ).toFixed(2));
  const totalESI   = parseFloat((empESI + emplrESI).toFixed(2));

  if (gross <= 0) return null;

  const postingKey = `PAYROLL:${centerId || 'ALL'}:${summary.periodLabel}`;

  const lines = [];

  // ── Salary expense lines by staff category ─────────────────────────────
  const byCategory = summary.byCategory || [];
  if (byCategory.length > 0) {
    for (const cat of byCategory) {
      const catGross = parseFloat(Number(cat.gross || 0).toFixed(2));
      if (catGross <= 0) continue;
      const catMap = await getMapping('PAYROLL_RUN', cat.category.toUpperCase())
        || await getMapping('PAYROLL_RUN', 'SALARY');
      if (!catMap?.debit_account_id) {
        logger.warn(`postPayrollJE: no salary mapping for category ${cat.category} — skipping`);
        continue;
      }
      lines.push({
        accountId:   catMap.debit_account_id,
        debit:       catGross,
        credit:      0,
        centerId,
        description: `${cat.category} salaries — ${summary.periodLabel}`,
      });
    }
  } else {
    // Fallback — single gross salary line using SALARY mapping
    const salMap = await getMapping('PAYROLL_RUN', 'SALARY');
    if (!salMap?.debit_account_id) {
      logger.warn('postPayrollJE: no mapping for PAYROLL_RUN/SALARY — skipping JE');
      return null;
    }
    lines.push({
      accountId:   salMap.debit_account_id,
      debit:       gross,
      credit:      0,
      centerId,
      description: `Gross salaries — ${summary.periodLabel}`,
    });
  }

  if (lines.length === 0) return null;

  // ── Employer PF & ESI expense ───────────────────────────────────────────
  const emplrTotal = parseFloat((emplrPF + emplrESI).toFixed(2));
  if (emplrTotal > 0 && pfMap?.debit_account_id) {
    lines.push({
      accountId:   pfMap.debit_account_id,
      debit:       emplrTotal,
      credit:      0,
      centerId,
      description: `Employer PF+ESI contribution — ${summary.periodLabel}`,
    });
  }

  // ── Credit lines ────────────────────────────────────────────────────────

  // Net salaries payable (what employees actually receive)
  const salPayableAccId = (await getMapping('PAYROLL_RUN', 'SALARY'))?.credit_account_id
    || (await pool.query(
         `SELECT id FROM chart_of_accounts WHERE account_code = '2131' AND is_active = true
          UNION ALL SELECT id FROM chart_of_accounts WHERE account_code = '2130' AND is_active = true
          LIMIT 1`
       )).rows[0]?.id;

  if (!salPayableAccId) {
    logger.warn('postPayrollJE: salaries payable account 2131 not found — skipping JE');
    return null;
  }
  lines.push({
    accountId:   salPayableAccId,
    debit:       0,
    credit:      net,
    centerId,
    description: `Net salaries payable — ${summary.periodLabel}`,
  });

  // PF payable (employee + employer)
  if (totalPF > 0 && pfMap?.credit_account_id) {
    lines.push({
      accountId:   pfMap.credit_account_id,
      debit:       0,
      credit:      totalPF,
      centerId,
      description: `PF payable (emp ${empPF} + emplr ${emplrPF}) — ${summary.periodLabel}`,
    });
  }

  // ESI payable (employee + employer)
  if (totalESI > 0 && esiMap?.credit_account_id) {
    lines.push({
      accountId:   esiMap.credit_account_id,
      debit:       0,
      credit:      totalESI,
      centerId,
      description: `ESI payable (emp ${empESI} + emplr ${emplrESI}) — ${summary.periodLabel}`,
    });
  }

  // TDS payable
  if (tds > 0 && tdsMap?.credit_account_id) {
    lines.push({
      accountId:   tdsMap.credit_account_id,
      debit:       0,
      credit:      tds,
      centerId,
      description: `TDS deducted — ${summary.periodLabel}`,
    });
  }

  // ── Rounding balance ────────────────────────────────────────────────────
  const totalDr = parseFloat(lines.reduce((s, l) => s + Number(l.debit  || 0), 0).toFixed(2));
  const totalCr = parseFloat(lines.reduce((s, l) => s + Number(l.credit || 0), 0).toFixed(2));
  const diff = parseFloat((totalDr - totalCr).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    const netLine = lines.find(l => l.accountId === salPayableAccId && l.credit > 0);
    if (netLine) netLine.credit = parseFloat((netLine.credit + diff).toFixed(2));
  }

  return createAndPostJE({
    sourceModule: 'PAYROLL',
    sourceId:     null,
    sourceRef:    `Payroll ${summary.periodLabel}`,
    narration:    `Payroll run — ${summary.periodLabel}`,
    lines,
    createdBy,
    centerId,
    postingKey,
  });
}

/**
 * Post JE for a recorded expense.
 * Priority:
 *   1. expense.debit_account_id + expense.credit_account_id (manually set)
 *   2. category_id → item_categories GL accounts
 *   3. Skip and log warning
 */
async function postExpenseJE(expense, createdBy) {
  let debitAccountId  = expense.debit_account_id;
  let creditAccountId = expense.credit_account_id;

  if (!debitAccountId || !creditAccountId) {
    const catAccounts = await getCategoryAccounts(expense.category_id);
    if (catAccounts?.expense_gl_id && catAccounts?.ap_account_id) {
      debitAccountId  = catAccounts.expense_gl_id;
      creditAccountId = catAccounts.ap_account_id;
    } else {
      logger.warn(
        `postExpenseJE: no GL accounts for expense ${expense.expense_number || expense.id}` +
        ` (category_id=${expense.category_id}) — skipping JE`
      );
      return null;
    }
  }

  const total  = Number(expense.total_amount || expense.amount || 0);
  const gst    = Number(expense.gst_amount || 0);
  const netExp = parseFloat((total - gst).toFixed(2));
  if (total <= 0) return null;

  // Resolve party_id from vendor if available
  let partyId = expense.party_id || null;
  if (!partyId && expense.vendor_id) {
    const { rows: pRows } = await pool.query(
      'SELECT id FROM parties WHERE vendor_id = $1 LIMIT 1', [expense.vendor_id]
    );
    partyId = pRows[0]?.id || null;
  }

  // Resolve GST Input Credit (ITC) account 1134
  let itcAccountId = null;
  if (gst > 0) {
    const { rows: itcRows } = await pool.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1134' AND is_active = true LIMIT 1`
    );
    itcAccountId = itcRows[0]?.id || null;
  }

  const lines = [
    {
      accountId:   debitAccountId,
      debit:       itcAccountId ? netExp : total,   // net only when ITC is split out
      credit:      0,
      description: expense.description || 'Expense recorded',
      centerId:    expense.center_id || null
    },
    {
      accountId:   creditAccountId,
      debit:       0,
      credit:      total,
      description: expense.vendor_name ? `Payable to ${expense.vendor_name}` : 'Accounts Payable',
      centerId:    expense.center_id || null,
      partyId
    }
  ];

  // Split GST into ITC debit line (DR 1134 GST Input Credit)
  if (itcAccountId && gst > 0) {
    lines.push({
      accountId:   itcAccountId,
      debit:       gst,
      credit:      0,
      description: `GST Input Credit — ${expense.expense_number || expense.description}`,
      centerId:    expense.center_id || null
    });
  }

  const je = await createAndPostJE({
    sourceModule: 'EXPENSE',
    sourceId:     expense.id,
    sourceRef:    expense.expense_number || `Exp #${expense.id}`,
    narration:    `Expense — ${expense.expense_number} | ${expense.description}`,
    lines,
    createdBy,
    postingKey:   `EXPENSE-${expense.id}`
  });

  // Write party subledger (credit side — amount owed to vendor)
  if (je && partyId) {
    const txClient = await pool.connect();
    try {
      await txClient.query('BEGIN');
      await writePartyLedger(
        txClient, partyId, je.id, null, expense.center_id || null,
        je.entry_date, je.entry_number,
        `Expense: ${expense.description}`,
        0, total, 'EXPENSE', expense.expense_number || `Exp #${expense.id}`
      );
      await txClient.query('COMMIT');
    } catch (e) {
      await txClient.query('ROLLBACK');
      logger.error('postExpenseJE: party_ledger write failed:', e.message);
    } finally {
      txClient.release();
    }
  }

  // Create payables row so this expense appears in AP aging/outstanding
  // Only when vendor is identified (vendor_code or vendor_name present)
  if (je && (expense.vendor_code || expense.vendor_name)) {
    try {
      const isPaid = (expense.payment_status || '').toUpperCase() === 'PAID';
      const expenseDate = expense.expense_date || expense.created_at || new Date();
      const dueDate = new Date(expenseDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const payableNumber = `EXP-PAY-${expense.expense_number || expense.id}`;

      // Skip if payable already exists for this expense
      const { rows: existingPay } = await pool.query(
        `SELECT id FROM payables WHERE payable_number = $1 LIMIT 1`,
        [payableNumber]
      );
      if (!existingPay.length) {
        await pool.query(
          `INSERT INTO payables
             (payable_number, vendor_code, center_id, amount, due_date,
              status, paid_amount, balance_amount, ap_account_id, notes, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
          [
            payableNumber,
            expense.vendor_code || null,
            expense.center_id   || null,
            total,
            dueDate.toLocaleDateString('en-CA'),
            isPaid ? 'PAID' : 'PENDING',
            isPaid ? total  : 0,
            isPaid ? 0      : total,
            creditAccountId,
            `Expense: ${expense.description || expense.expense_number}`
          ]
        );
        logger.info(`postExpenseJE: payable created for expense ${expense.expense_number || expense.id}`);
      }
    } catch (payErr) {
      logger.warn('postExpenseJE: payable creation failed (non-critical):', payErr.message);
    }
  }

  return je;
}

/**
 * Post JE for a fixed asset purchase / capitalisation.
 * Priority:
 *   1. category_id → item_categories.asset_gl_id + ap_account_id
 *   2. Fallback: asset_type-based account code mapping (backward compat)
 */
async function postAssetPurchaseJE(asset, createdBy, txClient = null) {
  const db = txClient || pool;
  try {
    let assetAccId = null;
    let apAccId    = null;

    // Priority 1: item_master → category → asset_gl_id + ap_account_id
    if (asset.item_master_id) {
      const { rows } = await db.query(
        `SELECT ic.asset_gl_id, ic.ap_account_id
         FROM item_master im
         LEFT JOIN item_categories ic ON ic.id = im.category_id
         WHERE im.id = $1`,
        [asset.item_master_id]
      );
      if (rows[0]) { assetAccId = rows[0].asset_gl_id; apAccId = rows[0].ap_account_id; }
    }

    // Priority 2: category_id directly
    if ((!assetAccId || !apAccId) && asset.category_id) {
      const cat = await getCategoryAccounts(asset.category_id);
      if (cat) { assetAccId = assetAccId || cat.asset_gl_id; apAccId = apAccId || cat.ap_account_id; }
    }

    // Fallback: asset_type-based mapping
    if (!assetAccId || !apAccId) {
      const assetTypeMap = { MODALITY: '1210', EQUIPMENT: '1210', ELECTRONICS: '1220', FURNITURE: '1230', APPLIANCE: '1210', SOFTWARE: '1220' };
      const assetAccCode = assetTypeMap[asset.asset_type] || '1210';
      const [assetAcc, apAcc] = await Promise.all([
        db.query(`SELECT id FROM chart_of_accounts WHERE account_code=$1 AND is_active=true LIMIT 1`, [assetAccCode]),
        db.query(`SELECT id FROM chart_of_accounts WHERE account_code='2112' AND is_active=true LIMIT 1`),
      ]);
      if (!assetAcc.rows.length || !apAcc.rows.length) {
        logger.warn(`postAssetPurchaseJE: GL accounts not found for asset ${asset.asset_code}`);
        return null;
      }
      assetAccId = assetAccId || assetAcc.rows[0].id;
      apAccId    = apAccId    || apAcc.rows[0].id;
    }

    const cost = parseFloat(asset.purchase_cost);

    // Credit account depends on asset source:
    //   GRN-sourced asset  → CR CWIP 1280 (reclassification; AP already created at GRN)
    //   Manually-added     → CR AP account  (liability created here, also creates vendor_bill)
    let creditAccId;
    let isGrnSourced = !!asset.grn_id;

    if (isGrnSourced) {
      const { rows: cwipRows } = await db.query(
        `SELECT id FROM chart_of_accounts WHERE account_code = '1280' AND is_active = true LIMIT 1`
      );
      creditAccId = cwipRows[0]?.id || null;
      if (!creditAccId) {
        logger.warn(`postAssetPurchaseJE: CWIP account 1280 not found for ${asset.asset_code} — falling back to AP`);
        creditAccId = apAccId;
        isGrnSourced = false; // treat as manual so vendor_bill is created
      }
    } else {
      creditAccId = apAccId;
    }

    const creditDesc = isGrnSourced
      ? `CWIP cleared — ${asset.asset_code}`
      : `AP: ${asset.vendor_name || 'Vendor'}`;

    const je = await createAndPostJE({
      sourceModule: 'ASSET',
      sourceId:     asset.id,
      sourceRef:    asset.asset_code,
      narration:    `Asset capitalised — ${asset.asset_name} (${asset.asset_code})`,
      lines: [
        { accountId: assetAccId,  debit: cost, credit: 0,
          description: `Fixed asset: ${asset.asset_name}`, centerId: asset.center_id || null },
        { accountId: creditAccId, debit: 0, credit: cost,
          description: creditDesc, centerId: asset.center_id || null },
      ],
      createdBy,
      postingKey: `ASSET-${asset.id}`,
      client:     txClient || undefined,
    });

    // For manually-added assets (no GRN) create vendor_bill so AP aging works.
    // GRN-sourced assets already have a vendor_bill from postGRNJE — no duplication.
    if (!isGrnSourced && je && cost > 0) {
      try {
        const assetDate = asset.purchase_date
          ? new Date(asset.purchase_date).toLocaleDateString('en-CA')
          : new Date().toLocaleDateString('en-CA');
        const dueDate = new Date(new Date(assetDate).getTime() + 30 * 86400000)
          .toLocaleDateString('en-CA');
        const billNumber = `ASSET-BILL-${asset.asset_code}`;
        const { rows: existing } = await (txClient || pool).query(
          `SELECT id FROM vendor_bills WHERE bill_number = $1 LIMIT 1`, [billNumber]
        );
        if (!existing.length) {
          let vendorCode = asset.vendor_code || null;
          if (!vendorCode && asset.vendor_name) {
            const { rows: vRows } = await (txClient || pool).query(
              `SELECT vendor_code FROM vendor_master WHERE LOWER(vendor_name)=LOWER($1) AND active=true LIMIT 1`,
              [asset.vendor_name]
            );
            vendorCode = vRows[0]?.vendor_code || null;
          }
          await (txClient || pool).query(
            `INSERT INTO vendor_bills
               (vendor_code, center_id, bill_number, bill_date, due_date,
                subtotal, total_amount, payment_status, notes, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$6,'PENDING',$7,NOW(),NOW())`,
            [
              vendorCode,
              asset.center_id || null,
              billNumber,
              assetDate,
              dueDate,
              cost,
              `Asset capitalisation — ${asset.asset_name} (${asset.asset_code}) | JE ${je.entry_number}`,
            ]
          );
          logger.info(`postAssetPurchaseJE: vendor_bill created for manually-added asset ${asset.asset_code}`);
        }
      } catch (vbErr) {
        logger.warn('postAssetPurchaseJE: vendor_bill creation failed (non-critical):', vbErr.message);
      }
    }

    return je;
  } catch (e) {
    logger.error('postAssetPurchaseJE error:', e);
    if (txClient) throw e;
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reporting payout JE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Post a radiologist reading-fee payable JE when a study is finalised.
 * Does NOT throw if rate not found — returns null gracefully.
 *
 * @param {object} study - { id, study_code, center_id, radiologist_code, report_date, accession_number }
 * @param {number} userId
 */
async function postReportingPayoutJE(study, userId) {
  try {
    const postingKey = `REPORTING-${study.id}`;

    // Idempotency
    const existing = await checkIdempotency(postingKey);
    if (existing) {
      logger.info(`postReportingPayoutJE: already posted, je_id=${existing.id}`);
      return { je_id: existing.id, amount: null };
    }

    if (!study.radiologist_code) {
      logger.warn(`postReportingPayoutJE: no radiologist_code on study ${study.id}`);
      return null;
    }

    // Fetch radiologist
    const { rows: radRows } = await pool.query(
      'SELECT * FROM radiologist_master WHERE radiologist_code = $1 AND active = true LIMIT 1',
      [study.radiologist_code]
    );
    const radiologist = radRows[0];
    if (!radiologist) {
      logger.warn(`postReportingPayoutJE: radiologist ${study.radiologist_code} not found`);
      return null;
    }

    // Fetch party linked to radiologist
    const { rows: partyRows } = await pool.query(
      'SELECT * FROM parties WHERE radiologist_id = $1 AND active = true LIMIT 1',
      [radiologist.id]
    );
    const party = partyRows[0];

    // Resolve study_master id from study_code
    let studyMasterId = null;
    if (study.study_code) {
      const { rows: smRows } = await pool.query(
        'SELECT id FROM study_master WHERE study_code = $1 LIMIT 1',
        [study.study_code]
      );
      studyMasterId = smRows[0]?.id || null;
    }

    // Look up radiologist rate (center-specific > global, latest effective date)
    let rate = null;
    if (studyMasterId) {
      const reportDate = study.report_date
        ? new Date(study.report_date).toLocaleDateString('en-CA')
        : new Date().toLocaleDateString('en-CA');

      const { rows: rateRows } = await pool.query(
        `SELECT rate FROM radiologist_study_rates
         WHERE radiologist_id = $1
           AND study_id       = $2
           AND effective_from <= $3
           AND (effective_to IS NULL OR effective_to > $3)
           AND (center_id = $4 OR center_id IS NULL)
         ORDER BY center_id DESC NULLS LAST, effective_from DESC
         LIMIT 1`,
        [radiologist.id, studyMasterId, reportDate, study.center_id]
      );
      rate = rateRows[0]?.rate ? parseFloat(rateRows[0].rate) : null;
    }

    if (!rate || rate <= 0) {
      logger.warn(
        `postReportingPayoutJE: no rate found for radiologist=${study.radiologist_code} ` +
        `study_code=${study.study_code} center=${study.center_id} — skipping JE`
      );
      return null;
    }

    // Determine expense GL — normalize both type columns for backward compatibility
    const isTeleRadType =
      radiologist.type === 'TELERADIOLOGY_COMPANY' ||
      (radiologist.reporter_type || '').toUpperCase() === 'TELERADIOLOGY';
    const expenseGLCode = isTeleRadType ? '5123' : '5121';

    const { rows: expRows } = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1',
      [expenseGLCode]
    );
    const expenseGlId = expRows[0]?.id;
    if (!expenseGlId) {
      logger.warn(`postReportingPayoutJE: GL account ${expenseGLCode} not found`);
      return null;
    }

    const { rows: apRows } = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1',
      ['2113']
    );
    const apAccountId = apRows[0]?.id;
    if (!apAccountId) {
      logger.warn('postReportingPayoutJE: AP account 2113 not found');
      return null;
    }

    const reportDate = study.report_date
      ? new Date(study.report_date).toLocaleDateString('en-CA')
      : new Date().toLocaleDateString('en-CA');

    const narration = `Reporting fee: ${study.radiologist_code} | ${study.accession_number || study.id}`;

    const lines = [
      {
        accountId:        expenseGlId,
        debit:            rate,
        credit:           0,
        description:      narration,
        centerId:         study.center_id || null,
        studyInstanceId:  study.id,
        reportingEntityId: radiologist.id,
        narration
      },
      {
        accountId:   apAccountId,
        debit:       0,
        credit:      rate,
        description: `AP: ${radiologist.radiologist_name}`,
        centerId:    study.center_id || null,
        partyId:     party?.id || null,
        narration:   `Payable to ${radiologist.radiologist_name}`
      }
    ];

    const je = await createAndPostJE({
      sourceModule: 'REPORTING',
      sourceId:     null,           // study.id is UUID, not integer
      sourceRef:    study.id,
      narration,
      lines,
      createdBy:    userId,
      postingKey,
      entryDate:    new Date(reportDate)
    });

    // Create payables entry
    const yyyymm = reportDate.slice(0, 7).replace('-', '');
    const { rows: paySeq } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM payables WHERE payable_number LIKE $1`,
      [`RAD-PAY-${yyyymm}-%`]
    );
    const seq = parseInt(paySeq[0].cnt, 10) + 1;
    const payableNumber = `RAD-PAY-${yyyymm}-${String(seq).padStart(4, '0')}`;
    const dueDate = new Date(new Date(reportDate).getTime() + 30 * 86400000)
      .toLocaleDateString('en-CA');

    const { rows: payRows } = await pool.query(
      `INSERT INTO payables
         (payable_number, vendor_code, center_id, amount, due_date,
          status, balance_amount, ap_account_id, reporter_id, notes)
       VALUES ($1, NULL, $2, $3, $4, 'PENDING', $3, $5, $6, $7)
       RETURNING id`,
      [
        payableNumber,
        study.center_id || null,
        rate,
        dueDate,
        apAccountId,
        radiologist.id,
        `Radiologist: ${radiologist.radiologist_name} (${study.radiologist_code}) | Study: ${study.accession_number || study.id}`
      ]
    );
    const payableId = payRows[0]?.id;

    // Update study with finance tracking
    await pool.query(
      `UPDATE studies
       SET reporting_je_id = $1, reporting_payable_id = $2, reporting_posted_at = NOW()
       WHERE id = $3`,
      [je.id, payableId || null, study.id]
    );

    // Write party subledger (credit — amount owed to radiologist)
    if (party?.id) {
      const txClient = await pool.connect();
      try {
        await txClient.query('BEGIN');
        await writePartyLedger(
          txClient, party.id, je.id, null, study.center_id || null,
          reportDate, je.entry_number,
          narration,
          0, rate, 'REPORTING', study.id
        );
        await txClient.query('COMMIT');
      } catch (e) {
        await txClient.query('ROLLBACK');
        logger.error('postReportingPayoutJE: party_ledger write failed:', e.message);
      } finally {
        txClient.release();
      }
    }

    logger.info(`postReportingPayoutJE: posted je_id=${je.id} amount=${rate} study=${study.id}`);
    return { je_id: je.id, amount: rate };

  } catch (err) {
    logger.error('postReportingPayoutJE error:', err);
    return null;   // must not throw — reporting must not be blocked
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Reporter payable JE — posted at EXAM_COMPLETED (rate supplied directly, no table lookup)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Post reporter AP bill at exam-complete time.
 * Uses rate_snapshot supplied by the user (not looked up from rates table).
 * DR: 5121 (Radiologist) or 5123 (Teleradiology)  CR: 2113 (AP – Service Providers)
 * Creates a payables record with auto bill# RAD-BILL-YYYYMMDDHHmmSS.
 *
 * @param {object} params - { reporter, rate, bill, studyId, examDate }
 * @param {number} userId
 */
async function postReporterPayableJE({ reporter, rate, bill, studyId, examDate }, userId) {
  try {
    if (!rate || rate <= 0) return null;

    const postingKey = `REPORTER-EXAM-${studyId}`;
    const existing = await checkIdempotency(postingKey);
    if (existing) {
      // JE already exists — but check if payable was also created. If not, create it now.
      const { rows: [existingPayable] } = await pool.query(
        `SELECT id FROM payables WHERE notes LIKE $1 AND reporter_id = $2 AND active = true LIMIT 1`,
        [`%${bill.invoice_number || bill.id}%`, reporter.id]
      );
      if (existingPayable) {
        logger.info(`postReporterPayableJE: already posted je_id=${existing.id} payable_id=${existingPayable.id}`);
        return { je_id: existing.id };
      }
      // JE exists but payable is missing — create payable only
      logger.warn(`postReporterPayableJE: JE exists (${existing.id}) but payable missing — creating payable now`);
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      const dueDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
      const isTeleRad = (reporter.reporter_type || '').toUpperCase() === 'TELERADIOLOGY';
      const payableNumber = isTeleRad ? `TRAD-ACCR-${ts}` : `RAD-BILL-${ts}`;
      const { rows: [recoveredPayable] } = await pool.query(
        `INSERT INTO payables (payable_number, reporter_id, center_id, amount, due_date, status, balance_amount, notes)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $4, $6) RETURNING id`,
        [payableNumber, reporter.id || null, bill.center_id, rate, dueDate,
         isTeleRad
           ? `Tele-rad accrual: ${reporter.radiologist_name} | ${bill.invoice_number || bill.id}`
           : `Reporter fee: ${reporter.radiologist_name} | ${bill.invoice_number || bill.id}`]
      );
      await pool.query(
        `UPDATE studies SET reporting_je_id = $1, reporting_payable_id = $2, reporting_posted_at = NOW() WHERE id = $3`,
        [existing.id, recoveredPayable.id, studyId]
      );
      logger.info(`postReporterPayableJE: payable recovered for je_id=${existing.id} payable_id=${recoveredPayable.id}`);
      return { je_id: existing.id, payableNumber };
    }

    const expGLCode = (reporter.reporter_type || '').toUpperCase() === 'TELERADIOLOGY' ? '5123' : '5121'; // default 5121 for any non-teleradiology type
    const [{ rows: [expAcc] }, { rows: [apAcc] }] = await Promise.all([
      pool.query(`SELECT id FROM chart_of_accounts WHERE account_code=$1 AND is_active=true LIMIT 1`, [expGLCode]),
      pool.query(`SELECT id FROM chart_of_accounts WHERE account_code='2113' AND is_active=true LIMIT 1`),
    ]);

    if (!expAcc) { logger.warn(`postReporterPayableJE: GL ${expGLCode} not found`); return null; }
    if (!apAcc)  { logger.warn('postReporterPayableJE: AP 2113 not found'); return null; }

    const dateStr   = new Date(examDate).toLocaleDateString('en-CA');
    const narration = `Reporter fee: ${reporter.radiologist_code} | ${bill.invoice_number || bill.id}`;

    // RCM applies only when reporter is TELERADIOLOGY AND has a GST number (registered supplier)
    const isTeleRadForRCM = (reporter.reporter_type || '').toUpperCase() === 'TELERADIOLOGY'
      && reporter.gst_number;

    // RCM GST for tele-radiology: 18% IGST under reverse charge
    // DR ITC Input (1134) / CR IGST Payable (2123)
    let rcmLines = [];
    if (isTeleRadForRCM) {
      const rcmRate = parseFloat((rate * 0.18).toFixed(2));
      const { rows: rcmMap } = await pool.query(
        `SELECT fam.debit_account_id, fam.credit_account_id
         FROM finance_account_mappings fam
         WHERE fam.event_type = 'RCM_GST' AND fam.sub_type = 'TELE_RADIOLOGY_IGST'
           AND fam.is_active = true LIMIT 1`
      );
      if (rcmMap.length && rcmMap[0].debit_account_id && rcmMap[0].credit_account_id) {
        rcmLines = [
          {
            accountId:   rcmMap[0].debit_account_id,
            debit:       rcmRate,
            credit:      0,
            description: `RCM GST (18% IGST) on tele-rad: ${reporter.radiologist_name}`,
            centerId:    bill.center_id || null,
          },
          {
            accountId:   rcmMap[0].credit_account_id,
            debit:       0,
            credit:      rcmRate,
            description: `RCM IGST Payable — ${reporter.radiologist_name}`,
            centerId:    bill.center_id || null,
          },
        ];
      } else {
        logger.warn(`postReporterPayableJE: RCM GST mapping not found for tele-radiology, skipping RCM lines`);
      }
    }

    const je = await createAndPostJE({
      sourceModule: 'REPORTING',
      sourceId:     null,
      sourceRef:    studyId,
      narration,
      lines: [
        { accountId: expAcc.id, debit: rate,  credit: 0,    description: narration, centerId: bill.center_id || null },
        { accountId: apAcc.id,  debit: 0,     credit: rate, description: `AP: ${reporter.radiologist_name}`, centerId: bill.center_id || null },
        ...rcmLines,
      ],
      createdBy:  userId,
      postingKey,
      entryDate:  new Date(dateStr),
    });

    // Both reporter types: create accrual payable — vendor bill consolidated monthly
    const isTeleRad = (reporter.reporter_type || '').toUpperCase() === 'TELERADIOLOGY';
    const ts         = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const dueDate    = new Date(new Date(dateStr).getTime() + 30 * 86400000).toLocaleDateString('en-CA');
    const payableNumber = isTeleRad ? `TRAD-ACCR-${ts}` : `RAD-ACCR-${ts}`;
    const notes         = isTeleRad
      ? `Tele-rad accrual: ${reporter.radiologist_name} | ${bill.invoice_number || bill.id}`
      : `Reporter accrual: ${reporter.radiologist_name} | ${bill.invoice_number || bill.id}`;
    const { rows: [p] } = await pool.query(
      `INSERT INTO payables (payable_number, reporter_id, center_id, amount, due_date, status, balance_amount, ap_account_id, notes)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $4, $6, $7) RETURNING id`,
      [payableNumber, reporter.id || null, bill.center_id, rate, dueDate, apAcc.id, notes]
    );
    let payableId = p.id;

    // Always link the study to the JE and payable so we can detect orphans
    if (studyId && je?.id) {
      await pool.query(
        `UPDATE studies SET reporting_je_id = $1, reporting_payable_id = $2, reporting_posted_at = NOW() WHERE id = $3`,
        [je.id, payableId, studyId]
      );
    }

    logger.info(`postReporterPayableJE: je_id=${je?.id} payable_id=${payableId} amount=${rate} payable=${payableNumber} type=${reporter.reporter_type}`);
    return { je_id: je?.id, payableNumber, payableId };
  } catch (err) {
    logger.error('postReporterPayableJE error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Center contract settlement JE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Calculate and post a center contract obligation JE for a given period.
 *
 * @param {number} centerId
 * @param {string} periodStart  YYYY-MM-DD
 * @param {string} periodEnd    YYYY-MM-DD
 * @param {number} userId
 */
async function postCenterContractSettlement(centerId, periodStart, periodEnd, userId) {
  const postingKey = `CENTER-SETTLEMENT-${centerId}-${periodStart}`;

  // Idempotency
  const existing = await checkIdempotency(postingKey);
  if (existing) {
    logger.info(`postCenterContractSettlement: already posted, je_id=${existing.id}`);
    return { je_id: existing.id, obligation: null };
  }

  // Get active contract rule
  const { rows: ruleRows } = await pool.query(
    `SELECT * FROM center_contract_rules
     WHERE center_id = $1
       AND active = true
       AND effective_from <= $2
       AND (effective_to IS NULL OR effective_to > $3)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [centerId, periodEnd, periodStart]
  );
  const rule = ruleRows[0];
  if (!rule) {
    throw new Error(`No active contract rule for center ${centerId}`);
  }

  let obligation = 0;

  if (rule.contract_model === 'LEASE') {
    obligation = parseFloat(rule.fixed_fee_amount || 0);
  } else {
    // Calculate revenue for REVENUE_SHARE or HYBRID
    let revenue = 0;
    const basis = rule.share_basis || 'GROSS_BILL';

    if (basis === 'COLLECTION') {
      const { rows: colRows } = await pool.query(
        `SELECT COALESCE(SUM(bp.amount_paid), 0) AS rev
         FROM bill_payments bp
         JOIN bills b ON b.id = bp.bill_id
         WHERE b.center_id = $1
           AND bp.payment_date BETWEEN $2 AND $3`,
        [centerId, periodStart, periodEnd]
      );
      revenue = parseFloat(colRows[0]?.rev || 0);
    } else if (basis === 'NET_BILL') {
      const { rows: netRows } = await pool.query(
        `SELECT COALESCE(SUM(net_amount), 0) AS rev
         FROM bills
         WHERE center_id = $1
           AND bill_date BETWEEN $2 AND $3
           AND status != 'CANCELLED'`,
        [centerId, periodStart, periodEnd]
      );
      revenue = parseFloat(netRows[0]?.rev || 0);
    } else {
      // GROSS_BILL
      const { rows: grossRows } = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS rev
         FROM bills
         WHERE center_id = $1
           AND bill_date BETWEEN $2 AND $3
           AND status != 'CANCELLED'`,
        [centerId, periodStart, periodEnd]
      );
      revenue = parseFloat(grossRows[0]?.rev || 0);
    }

    const shareObligation = revenue * parseFloat(rule.revenue_share_percent || 0) / 100;

    if (rule.contract_model === 'HYBRID') {
      obligation = Math.max(parseFloat(rule.minimum_guarantee || 0), shareObligation);
    } else {
      obligation = shareObligation;
    }
  }

  if (obligation <= 0) {
    logger.info(`postCenterContractSettlement: obligation is 0 for center ${centerId} — skipping`);
    return { je_id: null, obligation: 0 };
  }

  // Get expense GL
  let expenseAccountId = rule.expense_account_id;
  if (!expenseAccountId) {
    const { rows: glRows } = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1',
      ['5310']
    );
    expenseAccountId = glRows[0]?.id;
  }
  if (!expenseAccountId) {
    throw new Error('Expense account 5310 (Rent/Lease) not found in COA');
  }

  const { rows: apRows } = await pool.query(
    'SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1',
    ['2113']
  );
  const apAccountId = apRows[0]?.id;
  if (!apAccountId) throw new Error('AP account 2113 not found in COA');

  const narration = `Center settlement: ${rule.contract_model} [${periodStart} to ${periodEnd}]`;

  const lines = [
    {
      accountId:   expenseAccountId,
      debit:       obligation,
      credit:      0,
      description: narration,
      centerId
    },
    {
      accountId:   apAccountId,
      debit:       0,
      credit:      obligation,
      description: `AP: Center contract obligation`,
      centerId,
      partyId:     rule.payable_party_id || null
    }
  ];

  const je = await createAndPostJE({
    sourceModule: 'CENTER_SETTLEMENT',
    sourceId:     centerId,
    sourceRef:    `Settlement-${centerId}-${periodStart}`,
    narration,
    lines,
    createdBy:    userId,
    postingKey
  });

  // Create payables entry
  const yyyymm = periodStart.slice(0, 7).replace('-', '');
  const { rows: paySeq } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM payables WHERE payable_number LIKE $1`,
    [`CTR-PAY-${yyyymm}-%`]
  );
  const seq = parseInt(paySeq[0].cnt, 10) + 1;
  const payableNumber = `CTR-PAY-${yyyymm}-${String(seq).padStart(4, '0')}`;
  const dueDate = new Date(new Date(periodEnd).getTime() + 15 * 86400000)
    .toLocaleDateString('en-CA');

  await pool.query(
    `INSERT INTO payables
       (payable_number, center_id, amount, due_date, status, balance_amount, notes)
     VALUES ($1, $2, $3, $4, 'PENDING', $3, $5)`,
    [
      payableNumber, centerId, obligation, dueDate,
      `Center contract: ${rule.contract_model} | ${periodStart} to ${periodEnd}`
    ]
  );

  // Write party subledger
  if (rule.payable_party_id) {
    const txClient = await pool.connect();
    try {
      await txClient.query('BEGIN');
      await writePartyLedger(
        txClient, rule.payable_party_id, je.id, null, centerId,
        je.entry_date, je.entry_number,
        narration,
        0, obligation, 'CENTER_SETTLEMENT', `Settlement-${centerId}-${periodStart}`
      );
      await txClient.query('COMMIT');
    } catch (e) {
      await txClient.query('ROLLBACK');
      logger.error('postCenterContractSettlement: party_ledger write failed:', e.message);
    } finally {
      txClient.release();
    }
  }

  logger.info(`postCenterContractSettlement: posted je_id=${je.id} obligation=${obligation} center=${centerId}`);
  return { je_id: je.id, obligation };
}

// ──────────────────────────────────────────────────────────────────────────────
// Normalisation helpers
// ──────────────────────────────────────────────────────────────────────────────

function normalizeServiceType(raw) {
  const s = (raw || '').toUpperCase().replace(/[\s_-]/g, '');
  if (s.includes('CT'))          return 'CT_SCAN';
  if (s.includes('MRI'))         return 'MRI';
  if (s.includes('XRAY') || s.includes('DR') || s.includes('DIGITALRADIOGRAPHY')) return 'XRAY';
  if (s.includes('ULTRA') || s.includes('SONO') || s.includes('DOPPLER')) return 'ULTRASOUND';
  if (s.includes('MAMMO'))       return 'MAMMOGRAPHY';
  if (s.includes('PET'))         return 'PET_CT';
  return 'GENERAL';
}

// ──────────────────────────────────────────────────────────────────────────────
// Account Mappings CRUD (for the Finance UI settings tab)
// ──────────────────────────────────────────────────────────────────────────────

async function getMappings() {
  const res = await pool.query(
    `SELECT m.*,
            da.account_code AS debit_code,  da.account_name AS debit_name,
            ca.account_code AS credit_code, ca.account_name AS credit_name
     FROM   finance_account_mappings m
     LEFT JOIN chart_of_accounts da ON da.id = m.debit_account_id
     LEFT JOIN chart_of_accounts ca ON ca.id = m.credit_account_id
     ORDER BY m.event_type, m.sub_type`
  );
  return res.rows;
}

async function updateMapping(id, { debitAccountId, creditAccountId, description, isActive }) {
  const res = await pool.query(
    `UPDATE finance_account_mappings
     SET debit_account_id  = COALESCE($1, debit_account_id),
         credit_account_id = COALESCE($2, credit_account_id),
         description       = COALESCE($3, description),
         is_active         = COALESCE($4, is_active),
         updated_at        = NOW()
     WHERE id = $5
     RETURNING *`,
    [debitAccountId, creditAccountId, description, isActive, id]
  );
  return res.rows[0];
}

/**
 * Run monthly depreciation for all active assets and post JEs.
 * Idempotent: skips any asset already processed for the given period.
 *
 * @param {number} year       - e.g. 2026
 * @param {number} month      - 1–12
 * @param {number} createdBy  - user id
 * @param {number|null} centerId - restrict to one center, or null for all
 * @returns {{ posted: number, skipped: number, errors: number }}
 */
async function runMonthlyDepreciation(year, month, createdBy, centerId = null) {
  // Fallback COA accounts used when an asset has no coa_account_id set
  const FALLBACK_ACCUM_CODE  = '1290'; // parent accumulated depreciation
  const FALLBACK_EXPENSE_CODE = '5910'; // medical equipment depreciation expense

  // Fetch all active, non-disposed assets — join COA + item_category for depreciation config
  // Useful-life priority: item_category > COA account > asset_depreciation_settings > asset_types > 5
  let assetQuery = `
    SELECT am.id, am.asset_code, am.asset_name, am.asset_type,
           am.center_id, am.accumulated_depreciation, am.purchase_cost,
           am.salvage_value,
           COALESCE(
             ic.useful_life_years,
             coa.useful_life_years,
             ads.useful_life_years,
             at.useful_life_years,
             5
           ) AS useful_life_years,
           coa.accum_depr_account_id,
           coa.depr_expense_account_id
    FROM asset_master am
    LEFT JOIN item_categories ic  ON ic.id = am.item_category_id AND ic.active = true
    LEFT JOIN chart_of_accounts coa ON coa.id = am.coa_account_id AND coa.is_active = true
    LEFT JOIN asset_types at ON at.type_code = am.asset_type
    LEFT JOIN asset_depreciation_settings ads ON ads.category_code = at.type_code
    WHERE am.active = true AND am.status NOT IN ('DISPOSED','SOLD')
      AND am.purchase_cost > 0
  `;
  const assetParams = [];
  if (centerId) {
    assetParams.push(centerId);
    assetQuery += ` AND am.center_id = $${assetParams.length}`;
  }

  const { rows: assets } = await pool.query(assetQuery, assetParams);

  // Resolve fallback accounts once
  const { rows: fbAccum }  = await pool.query(
    `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
    [FALLBACK_ACCUM_CODE]
  );
  const { rows: fbExpense } = await pool.query(
    `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = true LIMIT 1`,
    [FALLBACK_EXPENSE_CODE]
  );
  const fallbackAccumId   = fbAccum[0]?.id;
  const fallbackExpenseId = fbExpense[0]?.id;

  let posted = 0, skipped = 0, errors = 0;

  for (const asset of assets) {
    try {
      const cost    = parseFloat(asset.purchase_cost    || 0);
      const salvage = parseFloat(asset.salvage_value    || 0);
      const life    = parseInt(asset.useful_life_years  || 5);
      const annualDepr  = (cost - salvage) / life;
      const monthlyDepr = parseFloat((annualDepr / 12).toFixed(2));

      if (monthlyDepr <= 0) { skipped++; continue; }

      // Skip fully-depreciated assets
      const accum = parseFloat(asset.accumulated_depreciation || 0);
      const depreciable = cost - salvage;
      if (accum >= depreciable) { skipped++; continue; }

      // Cap so we don't over-depreciate
      const actualDepr = Math.min(monthlyDepr, depreciable - accum);

      // Idempotency check
      const { rows: runRows } = await pool.query(
        `SELECT id FROM asset_depreciation_runs WHERE asset_id=$1 AND period_year=$2 AND period_month=$3`,
        [asset.id, year, month]
      );
      if (runRows.length) { skipped++; continue; }

      // Resolve GL accounts from COA config, fall back if unset
      const accumAccId  = asset.accum_depr_account_id  || fallbackAccumId;
      const expAccId    = asset.depr_expense_account_id || fallbackExpenseId;

      if (!accumAccId || !expAccId) {
        logger.error(`runMonthlyDepreciation: GL accounts not resolved for asset ${asset.asset_code} — skipping`);
        errors++;
        continue;
      }

      const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
      const entryDate   = new Date(year, month - 1, 1);

      // Per-asset transaction: JE + asset_master update + run record are atomic
      const txClient = await pool.connect();
      let je = null;
      try {
        await txClient.query('BEGIN');

        je = await createAndPostJE({
          sourceModule: 'ASSET',
          sourceId:     asset.id,
          sourceRef:    asset.asset_code,
          narration:    `Depreciation — ${asset.asset_name} | ${periodLabel}`,
          lines: [
            {
              accountId:   expAccId,
              debit:       actualDepr,
              credit:      0,
              description: `Depreciation expense — ${asset.asset_name} (${periodLabel})`,
              centerId:    asset.center_id || null,
            },
            {
              accountId:   accumAccId,
              debit:       0,
              credit:      actualDepr,
              description: `Accumulated depreciation — ${asset.asset_name}`,
              centerId:    asset.center_id || null,
            },
          ],
          createdBy,
          centerId:   asset.center_id || null,
          postingKey: `DEPR:${asset.id}:${year}:${month}`,
          entryDate,
          client:     txClient,
        });

        if (je) {
          await txClient.query(
            `UPDATE asset_master
             SET accumulated_depreciation = accumulated_depreciation + $1, updated_at = NOW()
             WHERE id = $2`,
            [actualDepr, asset.id]
          );
          await txClient.query(
            `INSERT INTO asset_depreciation_runs
               (asset_id, period_year, period_month, depreciation_amount, journal_entry_id, run_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (asset_id, period_year, period_month) DO NOTHING`,
            [asset.id, year, month, actualDepr, je.id, createdBy]
          );
        }

        await txClient.query('COMMIT');
        if (je) posted++;
      } catch (txErr) {
        await txClient.query('ROLLBACK');
        throw txErr;
      } finally {
        txClient.release();
      }
    } catch (assetErr) {
      logger.error(`runMonthlyDepreciation: error for asset ${asset.asset_code}:`, assetErr.message);
      errors++;
    }
  }

  logger.info(`Depreciation run ${year}-${String(month).padStart(2,'0')}: posted=${posted}, skipped=${skipped}, errors=${errors}`);
  return { posted, skipped, errors };
}

/**
 * Post a reversal JE for a previously posted JE.
 * Swaps all debit/credit amounts, tags with REVERSAL prefix.
 *
 * @param {number} originalJEId  - id of the JE to reverse
 * @param {string} narration     - reason for reversal
 * @param {number} createdBy     - user id
 * @returns {object|null} new JE row, or null if original not found
 */
async function postReversalJE(originalJEId, narration, createdBy) {
  // Fetch original JE header
  const { rows: jeRows } = await pool.query(
    `SELECT * FROM journal_entries WHERE id = $1`, [originalJEId]
  );
  if (!jeRows.length) {
    logger.warn(`postReversalJE: original JE ${originalJEId} not found`);
    return null;
  }
  const orig = jeRows[0];

  // Fetch original lines
  const { rows: lines } = await pool.query(
    `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1`, [originalJEId]
  );
  if (!lines.length) {
    logger.warn(`postReversalJE: original JE ${originalJEId} has no lines`);
    return null;
  }

  // Build reversal lines (swap DR/CR)
  const reversalLines = lines.map(l => ({
    accountId:         l.account_id,
    debit:             Number(l.credit_amount || 0),
    credit:            Number(l.debit_amount  || 0),
    description:       `Reversal: ${l.description || ''}`,
    centerId:          l.center_id          || null,
    partyId:           l.party_id           || null,
    studyInstanceId:   l.study_instance_id  || null,
    reportingEntityId: l.reporting_entity_id || null,
  }));

  // Idempotency: one reversal per original JE
  const postingKey = `REVERSAL:JE:${originalJEId}`;

  return createAndPostJE({
    sourceModule: orig.source_module,
    sourceId:     orig.source_id   || null,
    sourceRef:    `Reversal of ${orig.entry_number}`,
    narration:    narration || `Reversal of JE ${orig.entry_number}`,
    lines:        reversalLines,
    createdBy,
    centerId:     orig.center_id   || null,
    postingKey,
  });
}

/**
 * Post JE for asset disposal (write-off or sale).
 *
 * Entries:
 *   DR  Accumulated Depreciation   (reverse accum depr to date)
 *   DR  Loss on Disposal           (if book value > sale proceeds)
 *   CR  Fixed Asset account        (original cost)
 *   CR  Gain on Disposal / Bank    (if sale proceeds > book value)
 *
 * @param {object} asset   - asset_master row (id, asset_code, asset_name, asset_type,
 *                           purchase_cost, salvage_value, accumulated_depreciation,
 *                           coa_account_id, center_id)
 * @param {object} disposal
 *   {
 *     disposal_date  : string,   -- ISO date
 *     sale_proceeds  : number,   -- 0 for write-off
 *     notes          : string,
 *   }
 * @param {number} createdBy
 * @param {object} [txClient]
 */
async function postAssetDisposalJE(asset, disposal, createdBy, txClient = null) {
  const db = txClient || pool;

  const cost          = parseFloat(asset.purchase_cost          || 0);
  const accumDepr     = parseFloat(asset.accumulated_depreciation || 0);
  const saleProceeds  = parseFloat(disposal.sale_proceeds        || 0);
  const bookValue     = parseFloat((cost - accumDepr).toFixed(2));
  const gainOrLoss    = parseFloat((saleProceeds - bookValue).toFixed(2));

  if (cost <= 0) {
    logger.warn(`postAssetDisposalJE: asset ${asset.asset_code} has zero cost — skipping`);
    return null;
  }

  // Resolve asset GL (1210/1220/etc.)
  let assetAccId  = null;
  let accumAccId  = null;

  // From COA linked to asset
  if (asset.coa_account_id) {
    const { rows } = await db.query(
      `SELECT id, accum_depr_account_id FROM chart_of_accounts WHERE id = $1 AND is_active = true`,
      [asset.coa_account_id]
    );
    if (rows[0]) {
      assetAccId = rows[0].id;
      accumAccId = rows[0].accum_depr_account_id;
    }
  }

  // Fallback via item_category
  if (!assetAccId && asset.item_category_id) {
    const cat = await getCategoryAccounts(asset.item_category_id);
    assetAccId = assetAccId || cat?.asset_gl_id;
  }

  // Final fallback — 1210 Medical Equipment
  if (!assetAccId) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1`
    );
    assetAccId = rows[0]?.id;
  }

  // Accumulated depreciation account fallback — 1290
  if (!accumAccId) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1290' AND is_active = true
       UNION ALL SELECT id FROM chart_of_accounts WHERE account_code = '1291' AND is_active = true
       LIMIT 1`
    );
    accumAccId = rows[0]?.id;
  }

  if (!assetAccId) {
    logger.warn(`postAssetDisposalJE: fixed asset GL not found for ${asset.asset_code} — skipping`);
    return null;
  }

  // Gain on disposal account (4400 or similar)
  const { rows: gainRows } = await db.query(
    `SELECT id FROM chart_of_accounts
     WHERE account_code IN ('4400','4410','4390')
       AND is_active = true
     ORDER BY account_code LIMIT 1`
  );
  const gainAccId = gainRows[0]?.id;

  // Loss on disposal account (5800 or similar)
  const { rows: lossRows } = await db.query(
    `SELECT id FROM chart_of_accounts
     WHERE account_code IN ('5800','5810','5890')
       AND is_active = true
     ORDER BY account_code LIMIT 1`
  );
  const lossAccId = lossRows[0]?.id;

  // Bank account for sale proceeds
  let bankAccId = null;
  if (saleProceeds > 0) {
    const { rows } = await db.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = '1112' AND is_active = true LIMIT 1`
    );
    bankAccId = rows[0]?.id;
  }

  const lines = [];

  // DR Accumulated Depreciation (clear it)
  if (accumDepr > 0 && accumAccId) {
    lines.push({
      accountId:   accumAccId,
      debit:       accumDepr,
      credit:      0,
      description: `Accum depr cleared — ${asset.asset_code}`,
      centerId:    asset.center_id || null,
    });
  }

  // CR Fixed Asset at cost
  lines.push({
    accountId:   assetAccId,
    debit:       0,
    credit:      cost,
    description: `Asset disposed — ${asset.asset_name} (${asset.asset_code})`,
    centerId:    asset.center_id || null,
  });

  if (saleProceeds > 0 && bankAccId) {
    // DR Bank for proceeds
    lines.push({
      accountId:   bankAccId,
      debit:       saleProceeds,
      credit:      0,
      description: `Disposal proceeds — ${asset.asset_code}`,
      centerId:    asset.center_id || null,
    });
  }

  if (gainOrLoss > 0.01 && gainAccId) {
    // Gain: CR Gain on Disposal
    lines.push({
      accountId:   gainAccId,
      debit:       0,
      credit:      gainOrLoss,
      description: `Gain on disposal — ${asset.asset_code}`,
      centerId:    asset.center_id || null,
    });
  } else if (gainOrLoss < -0.01 && lossAccId) {
    // Loss: DR Loss on Disposal
    lines.push({
      accountId:   lossAccId,
      debit:       Math.abs(gainOrLoss),
      credit:      0,
      description: `Loss on disposal — ${asset.asset_code}`,
      centerId:    asset.center_id || null,
    });
  } else if (Math.abs(gainOrLoss) <= 0.01) {
    // Exactly at book value — no gain/loss line needed, already balanced
  }

  // Safety balance check
  const totalDr = parseFloat(lines.reduce((s, l) => s + Number(l.debit  || 0), 0).toFixed(2));
  const totalCr = parseFloat(lines.reduce((s, l) => s + Number(l.credit || 0), 0).toFixed(2));
  if (Math.abs(totalDr - totalCr) > 0.01) {
    logger.warn(`postAssetDisposalJE: JE imbalanced Dr=${totalDr} Cr=${totalCr} for ${asset.asset_code}`);
    return null;
  }

  if (lines.length < 2) {
    logger.warn(`postAssetDisposalJE: insufficient lines for ${asset.asset_code}`);
    return null;
  }

  const disposalDate = disposal.disposal_date
    ? new Date(disposal.disposal_date)
    : new Date();

  const je = await createAndPostJE({
    sourceModule: 'ASSET',
    sourceId:     asset.id,
    sourceRef:    asset.asset_code,
    narration:    `Asset disposal — ${asset.asset_name} (${asset.asset_code}) | Proceeds ₹${saleProceeds}`,
    lines,
    createdBy,
    centerId:     asset.center_id || null,
    postingKey:   `ASSET-DISPOSAL-${asset.id}`,
    entryDate:    disposalDate,
    client:       txClient || undefined,
  });

  if (je) {
    logger.info(`postAssetDisposalJE: posted ${je.entry_number} for ${asset.asset_code} | BV=${bookValue} Proceeds=${saleProceeds} G/L=${gainOrLoss}`);
  }

  return je;
}

module.exports = {
  createAndPostJE,
  getCategoryAccounts,
  getActivePeriod,
  checkIdempotency,
  writePartyLedger,
  postBillingJE,
  postBillingJEWithLines,
  postVendorPaymentJE,
  postProcurementJE,
  postGRNJE,
  postStockIssueJE,
  postPayrollJE,
  postExpenseJE,
  postAssetPurchaseJE,
  postAssetDisposalJE,
  postReportingPayoutJE,
  postReporterPayableJE,
  postCenterContractSettlement,
  postReversalJE,
  runMonthlyDepreciation,
  getMappings,
  updateMapping,
};
