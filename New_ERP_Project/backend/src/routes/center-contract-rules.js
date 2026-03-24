'use strict';
const express    = require('express');
const pool       = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('CENTER_CONTRACT_VIEW'));

const ok   = (res, data)      => res.json({ success: true, ...data });
const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

const VALID_MODELS = ['LEASE', 'REVENUE_SHARE', 'HYBRID', 'CUSTOM'];

const RULE_SELECT = `
  SELECT
    ccr.*,
    coa.account_name   AS expense_account_name,
    coa.account_code   AS expense_account_code,
    p.party_name       AS payable_party_name,
    p.party_type       AS payable_party_type,
    c.name             AS center_name
  FROM center_contract_rules ccr
  LEFT JOIN chart_of_accounts coa ON ccr.expense_account_id = coa.id
  LEFT JOIN parties            p  ON ccr.payable_party_id   = p.id
  LEFT JOIN centers            c  ON ccr.center_id          = c.id
`;

// ── GET /api/center-contract-rules?center_id=X ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const { center_id } = req.query;
    if (!center_id) return fail(res, 400, 'center_id is required');

    const { rows } = await pool.query(
      `${RULE_SELECT} WHERE ccr.center_id = $1 ORDER BY ccr.effective_from DESC`,
      [center_id]
    );
    ok(res, { rules: rows });
  } catch (err) {
    logger.error('GET center-contract-rules error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── GET /api/center-contract-rules/active?center_id=X&date=YYYY-MM-DD ────
router.get('/active', async (req, res) => {
  try {
    const { center_id, date } = req.query;
    if (!center_id) return fail(res, 400, 'center_id is required');
    const refDate = date || new Date().toLocaleDateString('en-CA');

    const { rows } = await pool.query(
      `${RULE_SELECT}
       WHERE ccr.center_id = $1
         AND ccr.active = true
         AND ccr.effective_from <= $2
         AND (ccr.effective_to IS NULL OR ccr.effective_to > $2)
       ORDER BY ccr.effective_from DESC
       LIMIT 1`,
      [center_id, refDate]
    );
    ok(res, { rule: rows[0] || null });
  } catch (err) {
    logger.error('GET center-contract-rules/active error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── POST /api/center-contract-rules — create ─────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      center_id, contract_model, effective_from, effective_to,
      fixed_fee_amount, revenue_share_percent, share_basis,
      minimum_guarantee, settlement_frequency,
      expense_account_id, payable_party_id, notes
    } = req.body;

    if (!center_id)       return fail(res, 400, 'center_id is required');
    if (!effective_from)  return fail(res, 400, 'effective_from is required');
    if (!contract_model || !VALID_MODELS.includes(contract_model)) {
      return fail(res, 400, `contract_model must be one of: ${VALID_MODELS.join(', ')}`);
    }
    if (effective_to && new Date(effective_to) <= new Date(effective_from)) {
      return fail(res, 400, 'effective_to must be after effective_from');
    }

    const createdBy = req.user?.id || null;

    const { rows } = await pool.query(
      `INSERT INTO center_contract_rules
         (center_id, contract_model, effective_from, effective_to,
          fixed_fee_amount, revenue_share_percent, share_basis,
          minimum_guarantee, settlement_frequency,
          expense_account_id, payable_party_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        center_id, contract_model, effective_from, effective_to || null,
        fixed_fee_amount || 0, revenue_share_percent || 0, share_basis || 'GROSS_BILL',
        minimum_guarantee || 0, settlement_frequency || 'MONTHLY',
        expense_account_id || null, payable_party_id || null, notes || null, createdBy
      ]
    );

    logger.info(`Center contract rule created: center_id=${center_id} model=${contract_model} from=${effective_from}`);
    ok(res, { rule: rows[0] });
  } catch (err) {
    logger.error('POST center-contract-rules error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── PUT /api/center-contract-rules/:id — update ───────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch existing rule
    const { rows: existing } = await pool.query(
      'SELECT * FROM center_contract_rules WHERE id = $1', [id]
    );
    if (!existing[0]) return fail(res, 404, 'Rule not found');

    const today = new Date().toLocaleDateString('en-CA');
    if (existing[0].effective_from < today) {
      return fail(res, 400, 'Cannot edit a rule that has already started. Create a new rule instead.');
    }

    const {
      contract_model, effective_from, effective_to,
      fixed_fee_amount, revenue_share_percent, share_basis,
      minimum_guarantee, settlement_frequency,
      expense_account_id, payable_party_id, notes, active
    } = req.body;

    if (contract_model && !VALID_MODELS.includes(contract_model)) {
      return fail(res, 400, `contract_model must be one of: ${VALID_MODELS.join(', ')}`);
    }
    if (effective_from && effective_to && new Date(effective_to) <= new Date(effective_from)) {
      return fail(res, 400, 'effective_to must be after effective_from');
    }

    const { rows } = await pool.query(
      `UPDATE center_contract_rules SET
         contract_model        = COALESCE($1, contract_model),
         effective_from        = COALESCE($2, effective_from),
         effective_to          = COALESCE($3, effective_to),
         fixed_fee_amount      = COALESCE($4, fixed_fee_amount),
         revenue_share_percent = COALESCE($5, revenue_share_percent),
         share_basis           = COALESCE($6, share_basis),
         minimum_guarantee     = COALESCE($7, minimum_guarantee),
         settlement_frequency  = COALESCE($8, settlement_frequency),
         expense_account_id    = COALESCE($9, expense_account_id),
         payable_party_id      = COALESCE($10, payable_party_id),
         notes                 = COALESCE($11, notes),
         active                = COALESCE($12, active),
         updated_at            = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        contract_model, effective_from, effective_to,
        fixed_fee_amount, revenue_share_percent, share_basis,
        minimum_guarantee, settlement_frequency,
        expense_account_id, payable_party_id, notes, active, id
      ]
    );

    logger.info(`Center contract rule updated: id=${id}`);
    ok(res, { rule: rows[0] });
  } catch (err) {
    logger.error('PUT center-contract-rules/:id error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── DELETE /api/center-contract-rules/:id — soft delete ───────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query(
      'SELECT * FROM center_contract_rules WHERE id = $1', [id]
    );
    if (!existing[0]) return fail(res, 404, 'Rule not found');

    const today = new Date().toLocaleDateString('en-CA');
    if (existing[0].effective_from <= today) {
      return fail(res, 400, 'Cannot delete a rule that has already started. Use effective_to to close it instead.');
    }

    await pool.query(
      'UPDATE center_contract_rules SET active = false, updated_at = NOW() WHERE id = $1', [id]
    );

    logger.info(`Center contract rule soft-deleted: id=${id}`);
    ok(res, { message: 'Rule deactivated' });
  } catch (err) {
    logger.error('DELETE center-contract-rules/:id error:', err);
    fail(res, 500, 'Internal server error');
  }
});

module.exports = router;
