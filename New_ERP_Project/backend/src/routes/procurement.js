'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────
const ok  = (res, data)        => res.json({ success: true, ...data });
const err = (res, msg, status) => res.status(status || 400).json({ success: false, error: msg });

async function notify(userId, type, title, message, prId = null, poId = null) {
  try {
    await pool.query(
      `INSERT INTO procurement_notifications (user_id, type, title, message, pr_id, po_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, type, title, message, prId, poId]
    );
  } catch (e) { logger.error('Notify error', e); }
}

// Find approvers for a given PR — permission-based (primary) with approval_matrix as per-center override
async function getApprovers(centerId, level) {
  // 1. Check approval_matrix for a center-specific override first
  const { rows: matrix } = await pool.query(
    `SELECT am.user_id, u.name, u.email
       FROM approval_matrix am
       JOIN users u ON u.id = am.user_id AND u.active = true
      WHERE am.level = $1 AND am.active = true
        AND (am.center_id = $2 OR am.center_id IS NULL)
      ORDER BY am.center_id NULLS LAST`,
    [level, centerId]
  );
  if (matrix.length) return matrix;

  // 2. Permission-based fallback: users whose role carries PR_APPROVE_L1 / PR_APPROVE_L2
  const perm = level === 1 ? 'PR_APPROVE_L1' : 'PR_APPROVE_L2';
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email
       FROM users u
       JOIN user_roles ur ON ur.role = u.role AND ur.active = true
      WHERE u.active = true
        AND (ur.permissions @> $1::jsonb OR ur.permissions @> '["ALL_ACCESS"]'::jsonb)
        AND ($2::integer IS NULL OR u.center_id = $2 OR ur.can_access_all_centers = true)
      LIMIT 10`,
    [JSON.stringify([perm]), centerId || null]
  );
  return rows;
}

// Find PO approvers — users whose role carries PO_APPROVE permission
async function getPOApprovers(centerId) {
  const { rows: matrix } = await pool.query(
    `SELECT am.user_id, u.name, u.email
       FROM approval_matrix am
       JOIN users u ON u.id = am.user_id AND u.active = true
      WHERE am.level = 2 AND am.active = true
        AND (am.center_id = $1 OR am.center_id IS NULL)
      ORDER BY am.center_id NULLS LAST`,
    [centerId]
  );
  if (matrix.length) return matrix;

  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email
       FROM users u
       JOIN user_roles ur ON ur.role = u.role AND ur.active = true
      WHERE u.active = true
        AND (ur.permissions @> '["PO_APPROVE"]'::jsonb OR ur.permissions @> '["ALL_ACCESS"]'::jsonb)
        AND ($1::integer IS NULL OR u.center_id = $1 OR ur.can_access_all_centers = true)
      LIMIT 10`,
    [centerId || null]
  );
  return rows;
}

// ── GET /api/procurement/items/search ────────────────────────────────────────
// Searches item_master AND distinct spare parts from asset_maintenance_parts
router.get('/items/search', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    const term = `%${q.trim()}%`;
    const { rows } = await pool.query(
      `SELECT id, item_code, item_name, category,
              uom, consumption_uom, uom_conversion,
              -- estimated_rate for PR/PO is always per purchase (primary) UOM
              ROUND(standard_rate * uom_conversion, 2) AS standard_rate,
              gst_rate, item_type, 'ITEM_MASTER' AS source
         FROM item_master
        WHERE active = true
          AND (item_name ILIKE $1 OR item_code ILIKE $1 OR category ILIKE $1)
       UNION
       SELECT NULL AS id,
              part_code AS item_code,
              part_name AS item_name,
              'Spare Part' AS category,
              'PCS' AS uom,
              AVG(unit_cost) AS standard_rate,
              AVG(gst_rate) AS gst_rate,
              NULL AS item_type,
              'SPARE_PART' AS source
         FROM asset_maintenance_parts
        WHERE item_master_id IS NULL
          AND (part_name ILIKE $1 OR part_code ILIKE $1)
        GROUP BY part_code, part_name
       ORDER BY item_name
       LIMIT $2`,
      [term, parseInt(limit)]
    );
    ok(res, { items: rows });
  } catch (e) { logger.error('Item search error', e); err(res, 'Server error', 500); }
});

// ── GET /api/procurement/notifications ───────────────────────────────────────
router.get('/notifications', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT n.*, pr.pr_number, po.po_number
         FROM procurement_notifications n
         LEFT JOIN purchase_requisitions pr ON pr.id = n.pr_id
         LEFT JOIN procurement_orders po ON po.id = n.po_id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC LIMIT 50`,
      [userId]
    );
    const unread = rows.filter(r => !r.is_read).length;
    ok(res, { notifications: rows, unread });
  } catch (e) { logger.error('Notifications error', e); err(res, 'Server error', 500); }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    await pool.query(
      `UPDATE procurement_notifications SET is_read = true WHERE user_id = $1`,
      [req.user.id]
    );
    ok(res, {});
  } catch (e) { err(res, 'Server error', 500); }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE procurement_notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    ok(res, {});
  } catch (e) { err(res, 'Server error', 500); }
});

// ── GET /api/procurement/approval-matrix ─────────────────────────────────────
router.get('/approval-matrix', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT am.*, u.name, u.email, u.role, c.name as center_name
         FROM approval_matrix am
         JOIN users u ON u.id = am.user_id
         LEFT JOIN centers c ON c.id = am.center_id
        WHERE am.active = true
        ORDER BY am.level, c.name NULLS FIRST, u.name`
    );
    ok(res, { matrix: rows });
  } catch (e) { logger.error('Approval matrix error', e); err(res, 'Server error', 500); }
});

router.post('/approval-matrix', authorizePermission('SYSTEM_ADMIN'), [
  body('user_id').isInt().toInt(),
  body('level').isInt({ min: 1, max: 2 }).toInt(),
  body('center_id').optional({ nullable: true }).custom(v => v === null || v === undefined || v === '' || Number.isInteger(Number(v))).withMessage('center_id must be an integer or null'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { user_id, level } = req.body;
    const centerId = req.body.center_id ? parseInt(req.body.center_id, 10) : null;
    const { rows } = await pool.query(
      `INSERT INTO approval_matrix (user_id, level, center_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (center_id, level, user_id) DO UPDATE SET active=true
       RETURNING *`,
      [user_id, level, centerId]
    );
    ok(res, { entry: rows[0] });
  } catch (e) { logger.error('Approval matrix add error', e); err(res, 'Server error', 500); }
});

router.delete('/approval-matrix/:id', authorizePermission('SYSTEM_ADMIN'), async (req, res) => {
  try {
    await pool.query(`UPDATE approval_matrix SET active=false WHERE id=$1`, [req.params.id]);
    ok(res, {});
  } catch (e) { err(res, 'Server error', 500); }
});

// ── GET /api/procurement/prs ──────────────────────────────────────────────────
router.get('/prs', async (req, res) => {
  try {
    const { status, center_id, my_approvals, page = 1, limit = 25 } = req.query;
    const userId = req.user.id;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['pr.active = true'];
    const params = [];
    let idx = 1;

    if (status)    { where.push(`pr.status = $${idx++}`); params.push(status); }
    if (center_id) { where.push(`pr.center_id = $${idx++}`); params.push(parseInt(center_id)); }

    // If approver view: show PRs pending at their level
    if (my_approvals === 'true') {
      where.push(`pr.status IN ('SUBMITTED','L1_APPROVED')`);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT pr.*,
              u.name as requester_name, u.email as requester_email,
              c.name as center_name, c.code as center_code,
              (SELECT COUNT(*) FROM pr_items WHERE pr_id = pr.id) as item_count,
              (SELECT COUNT(*) FROM procurement_approvals WHERE pr_id = pr.id) as approval_count
         FROM purchase_requisitions pr
         JOIN users u ON u.id = pr.requested_by
         JOIN centers c ON c.id = pr.center_id
        ${whereClause}
        ORDER BY pr.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: total } = await pool.query(
      `SELECT COUNT(*) FROM purchase_requisitions pr ${whereClause}`,
      params
    );

    ok(res, { prs: rows, total: parseInt(total[0].count) });
  } catch (e) { logger.error('List PRs error', e); err(res, 'Server error', 500); }
});

// ── GET /api/procurement/prs/:id ─────────────────────────────────────────────
router.get('/prs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pr.*,
              u.name as requester_name, u.email as requester_email,
              c.name as center_name
         FROM purchase_requisitions pr
         JOIN users u ON u.id = pr.requested_by
         JOIN centers c ON c.id = pr.center_id
        WHERE pr.id = $1 AND pr.active = true`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);

    const { rows: items } = await pool.query(
      `SELECT pi.*, im.item_type, im.hsn_sac_code, im.gst_rate
         FROM pr_items pi
         LEFT JOIN item_master im ON im.id = pi.item_master_id
        WHERE pi.pr_id = $1`,
      [req.params.id]
    );

    const { rows: approvals } = await pool.query(
      `SELECT pa.*, u.name as approver_name, u.role as approver_role
         FROM procurement_approvals pa
         JOIN users u ON u.id = pa.approver_id
        WHERE pa.pr_id = $1
        ORDER BY pa.acted_at`,
      [req.params.id]
    );

    ok(res, { pr: rows[0], items, approvals });
  } catch (e) { logger.error('Get PR error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/prs ─────────────────────────────────────────────────
router.post('/prs', authorizePermission('PR_WRITE'), [
  body('title').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
  body('justification').trim().isLength({ min: 10, max: 2000 }).withMessage('Justification must be at least 10 characters'),
  body('center_id').optional({ checkFalsy: true }).isInt().withMessage('Center is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.item_name').trim().isLength({ min: 1, max: 200 }).withMessage('Item name is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  body('priority').optional().isIn(['LOW','NORMAL','HIGH','URGENT']),
  body('required_by').optional({ nullable: true, checkFalsy: true }).isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { title, justification, items, priority, required_by, center_id: bodyCenterId } = req.body;
    const userId = req.user.id;
    const center_id = req.user.center_id || bodyCenterId || null;
    if (!center_id) return res.status(400).json({ error: 'Center is required' });

    const prNum = await pool.query('SELECT generate_pr_number()');
    const pr_number = prNum.rows[0].generate_pr_number;

    const total = items.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.estimated_rate || 0)), 0);
    const autoTitle = title?.trim() || pr_number;

    const { rows } = await pool.query(
      `INSERT INTO purchase_requisitions
         (pr_number, title, justification, center_id, requested_by,
          required_by, priority, total_estimated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [pr_number, autoTitle, justification, center_id, userId,
       required_by || null, priority || 'NORMAL', total]
    );
    const pr = rows[0];

    for (const item of items) {
      const amt = parseFloat(item.quantity) * parseFloat(item.estimated_rate || 0);
      await pool.query(
        `INSERT INTO pr_items (pr_id, item_master_id, item_code, item_name, category, uom, quantity, estimated_rate, estimated_amount, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pr.id, item.item_master_id || null, item.item_code || null, item.item_name,
         item.category || null, item.uom || 'PCS', item.quantity, item.estimated_rate || 0, amt, item.notes || null]
      );
    }

    logger.info(`PR created: ${pr_number}`, { pr_id: pr.id, user: userId });
    ok(res, { pr });
  } catch (e) { logger.error('Create PR error', e); err(res, 'Server error', 500); }
});

// ── PATCH /api/procurement/prs/:id ───────────────────────────────────────────
router.patch('/prs/:id', authorizePermission('PR_WRITE'), [
  body('title').optional().trim().isLength({ min: 5, max: 200 }),
  body('justification').optional().trim().isLength({ min: 10, max: 2000 }),
  body('items').optional().isArray({ min: 1 }),
], async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM purchase_requisitions WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);
    const pr = rows[0];
    if (pr.status !== 'DRAFT') return err(res, 'Only DRAFT PRs can be edited');
    if (pr.requested_by !== req.user.id && req.user.role !== 'admin')
      return err(res, 'Not authorised', 403);

    const { title, justification, priority, required_by, department, notes, items } = req.body;

    await pool.query(
      `UPDATE purchase_requisitions SET
         title=$1, justification=$2, priority=$3, required_by=$4,
         department=$5, notes=$6, updated_at=NOW()
       WHERE id=$7`,
      [title || pr.title, justification || pr.justification,
       priority || pr.priority, required_by || pr.required_by,
       department ?? pr.department, notes ?? pr.notes, pr.id]
    );

    if (items) {
      await pool.query(`DELETE FROM pr_items WHERE pr_id=$1`, [pr.id]);
      const total = items.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.estimated_rate || 0)), 0);
      for (const item of items) {
        const amt = parseFloat(item.quantity) * parseFloat(item.estimated_rate || 0);
        await pool.query(
          `INSERT INTO pr_items (pr_id, item_master_id, item_code, item_name, category, uom, quantity, estimated_rate, estimated_amount, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [pr.id, item.item_master_id || null, item.item_code || null, item.item_name,
           item.category || null, item.uom || 'PCS', item.quantity, item.estimated_rate || 0, amt, item.notes || null]
        );
      }
      await pool.query(`UPDATE purchase_requisitions SET total_estimated=$1 WHERE id=$2`, [total, pr.id]);
    }

    ok(res, { message: 'PR updated' });
  } catch (e) { logger.error('Update PR error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/prs/:id/submit ─────────────────────────────────────
router.post('/prs/:id/submit', authorizePermission('PR_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pr.*, c.name as center_name FROM purchase_requisitions pr
       JOIN centers c ON c.id = pr.center_id
       WHERE pr.id=$1 AND pr.active=true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);
    const pr = rows[0];
    if (pr.status !== 'DRAFT') return err(res, 'Only DRAFT PRs can be submitted');
    if (pr.requested_by !== req.user.id) return err(res, 'Not authorised', 403);

    await pool.query(
      `UPDATE purchase_requisitions SET status='SUBMITTED', updated_at=NOW() WHERE id=$1`, [pr.id]
    );

    // Notify L1 approvers
    const l1 = await getApprovers(pr.center_id, 1);
    for (const a of l1) {
      await notify(a.user_id, 'PR_SUBMITTED',
        `PR Approval Required: ${pr.pr_number}`,
        `${req.user.name || 'A user'} submitted PR "${pr.title}" from ${pr.center_name} for your approval.`,
        pr.id
      );
    }

    logger.info(`PR submitted: ${pr.pr_number}`);
    ok(res, { message: 'PR submitted for approval' });
  } catch (e) { logger.error('Submit PR error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/prs/:id/approve ────────────────────────────────────
router.post('/prs/:id/approve', authorizePermission('PR_APPROVE'), [
  body('comments').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pr.*, c.name as center_name, u.name as requester_name
         FROM purchase_requisitions pr
         JOIN centers c ON c.id = pr.center_id
         JOIN users u ON u.id = pr.requested_by
        WHERE pr.id=$1 AND pr.active=true`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);
    const pr = rows[0];
    const userId = req.user.id;
    const { comments } = req.body;

    if (!['SUBMITTED', 'L1_APPROVED'].includes(pr.status))
      return err(res, 'PR is not pending approval');

    // Determine which level this approver belongs to
    const { rows: myMatrix } = await pool.query(
      `SELECT level FROM approval_matrix
        WHERE user_id=$1 AND active=true
          AND (center_id=$2 OR center_id IS NULL)`,
      [userId, pr.center_id]
    );

    // Determine approver level: matrix entry wins, then permission-based
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const isAll = perms.includes('ALL_ACCESS');
    const canL2 = isAll || perms.includes('PR_APPROVE_L2');
    const canL1 = isAll || perms.includes('PR_APPROVE_L1');

    let level;
    if (myMatrix.length) {
      level = myMatrix[0].level;
      // If matrix says L2 but PR is still SUBMITTED, allow direct final approval
      if (level === 2 && pr.status === 'SUBMITTED') level = 2; // will jump straight to APPROVED
    } else {
      if (canL2) level = 2; // L2 can approve at any stage in one step
      else if (canL1) level = 1;
      else level = 1;
    }

    // L2 approvers can approve from either SUBMITTED or L1_APPROVED (one-step or two-step)
    if (level === 2 && !['SUBMITTED', 'L1_APPROVED'].includes(pr.status))
      return err(res, 'PR is not pending approval');
    if (level === 1 && pr.status !== 'SUBMITTED')
      return err(res, `PR is not at your approval level (expected SUBMITTED)`);

    await pool.query(
      `INSERT INTO procurement_approvals (pr_id, approver_id, level, action, comments)
       VALUES ($1,$2,$3,'APPROVED',$4)`,
      [pr.id, userId, level, comments || null]
    );

    const newStatus = level === 1 ? 'L1_APPROVED' : 'APPROVED';
    await pool.query(
      `UPDATE purchase_requisitions SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, pr.id]
    );

    // Notify requester
    await notify(pr.requested_by, 'PR_APPROVED',
      `PR ${level === 1 ? 'Level 1' : 'Fully'} Approved: ${pr.pr_number}`,
      `Your PR "${pr.title}" has been ${level === 1 ? 'approved by Center Admin' : 'fully approved. You can now create a Purchase Order'}.`,
      pr.id
    );

    if (level === 1) {
      // Notify L2 approvers
      const l2 = await getApprovers(pr.center_id, 2);
      for (const a of l2) {
        await notify(a.user_id, 'PR_L1_APPROVED',
          `PR Awaiting Director Approval: ${pr.pr_number}`,
          `PR "${pr.title}" from ${pr.center_name} has been approved by Center Admin and requires your final approval.`,
          pr.id
        );
      }
    }

    logger.info(`PR L${level} approved: ${pr.pr_number}`, { approver: userId });
    ok(res, { message: `PR ${newStatus.replace('_', ' ')}` });
  } catch (e) { logger.error('Approve PR error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/prs/:id/reject ─────────────────────────────────────
router.post('/prs/:id/reject', authorizePermission('PR_APPROVE'), [
  body('reason').trim().isLength({ min: 5, max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM purchase_requisitions WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);
    const pr = rows[0];
    const { reason } = req.body;

    if (!['SUBMITTED', 'L1_APPROVED'].includes(pr.status))
      return err(res, 'PR is not pending approval');

    const { rows: myMatrix } = await pool.query(
      `SELECT level FROM approval_matrix WHERE user_id=$1 AND active=true AND (center_id=$2 OR center_id IS NULL)`,
      [req.user.id, pr.center_id]
    );
    let level;
    if (myMatrix.length) {
      level = myMatrix[0].level;
    } else {
      const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      const isAll = perms.includes('ALL_ACCESS');
      level = (isAll || perms.includes('PR_APPROVE_L2')) ? 2 : 1;
    }

    await pool.query(
      `INSERT INTO procurement_approvals (pr_id, approver_id, level, action, comments)
       VALUES ($1,$2,$3,'REJECTED',$4)`,
      [pr.id, req.user.id, level, reason]
    );

    await pool.query(
      `UPDATE purchase_requisitions
         SET status='REJECTED', rejection_reason=$1, rejected_by=$2, rejected_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [reason, req.user.id, pr.id]
    );

    await notify(pr.requested_by, 'PR_REJECTED',
      `PR Rejected: ${pr.pr_number}`,
      `Your PR "${pr.title}" was rejected. Reason: ${reason}`,
      pr.id
    );

    logger.info(`PR rejected: ${pr.pr_number}`, { by: req.user.id, reason });
    ok(res, { message: 'PR rejected' });
  } catch (e) { logger.error('Reject PR error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/prs/:id/cancel ─────────────────────────────────────
router.post('/prs/:id/cancel', authorizePermission('PR_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM purchase_requisitions WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PR not found', 404);
    const pr = rows[0];
    if (!['DRAFT','SUBMITTED'].includes(pr.status)) return err(res, 'Cannot cancel this PR');
    if (pr.requested_by !== req.user.id && req.user.role !== 'admin') return err(res, 'Not authorised', 403);

    await pool.query(
      `UPDATE purchase_requisitions SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [pr.id]
    );
    ok(res, { message: 'PR cancelled' });
  } catch (e) { err(res, 'Server error', 500); }
});

// ── GET /api/procurement/pos ──────────────────────────────────────────────────
router.get('/pos', async (req, res) => {
  try {
    const { status, center_id, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['po.active = true'];
    const params = [];
    let idx = 1;

    if (status)    { where.push(`po.status=$${idx++}`); params.push(status); }
    if (center_id) { where.push(`po.center_id=$${idx++}`); params.push(parseInt(center_id)); }

    const { rows } = await pool.query(
      `SELECT po.*, u.name as creator_name, c.name as center_name, c.code as center_code,
              (SELECT CASE WHEN gstin ~ '^[0-9]{2}' THEN LEFT(gstin,2) ELSE '32' END
               FROM company_info ORDER BY id LIMIT 1) AS center_state_code,
              pr.pr_number, pr.title as pr_title,
              (SELECT COUNT(*) FROM procurement_order_items WHERE po_id=po.id) as item_count
         FROM procurement_orders po
         JOIN users u ON u.id = po.created_by
         JOIN centers c ON c.id = po.center_id
         LEFT JOIN purchase_requisitions pr ON pr.id = po.pr_id
        WHERE ${where.join(' AND ')}
        ORDER BY po.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    );
    ok(res, { pos: rows });
  } catch (e) { logger.error('List POs error', e); err(res, 'Server error', 500); }
});

// ── GET /api/procurement/pos/:id ─────────────────────────────────────────────
router.get('/pos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT po.*, u.name as creator_name, c.name as center_name,
              c.address as center_address, c.city as center_city, c.state as center_state,
              c.postal_code as center_postal_code, c.phone as center_phone,
              c.gst_number as center_gstin,
              (SELECT CASE WHEN gstin ~ '^[0-9]{2}' THEN LEFT(gstin,2) ELSE '32' END
               FROM company_info ORDER BY id LIMIT 1) AS center_state_code,
              pr.pr_number, pr.title as pr_title, pr.justification
         FROM procurement_orders po
         JOIN users u ON u.id = po.created_by
         JOIN centers c ON c.id = po.center_id
         LEFT JOIN purchase_requisitions pr ON pr.id = po.pr_id
        WHERE po.id=$1 AND po.active=true`,
      [req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);

    const { rows: items } = await pool.query(
      `SELECT * FROM procurement_order_items WHERE po_id=$1 ORDER BY id`,
      [req.params.id]
    );

    ok(res, { po: rows[0], items });
  } catch (e) { logger.error('Get PO error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/pos ─────────────────────────────────────────────────
router.post('/pos', authorizePermission('PO_WRITE'), [
  body('pr_id').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('vendor_name').trim().isLength({ min: 2, max: 200 }).withMessage('Vendor name is required'),
  body('center_id').optional({ checkFalsy: true }).isInt(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.item_name').trim().isLength({ min: 1 }).withMessage('Item name is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be > 0'),
  body('items.*.unit_rate').isFloat({ min: 0 }).withMessage('Rate must be >= 0'),
  body('quotation_ref').trim().isLength({ min: 1 }).withMessage('Supplier quotation reference is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { pr_id, vendor_name, vendor_address, vendor_gstin, vendor_email,
            vendor_phone, center_id: bodyCenterId, delivery_address, delivery_date,
            payment_terms, notes, terms_conditions, items, quotation_ref } = req.body;
    const center_id = req.user.center_id || bodyCenterId || null;

    // Validate PR if provided
    if (pr_id) {
      const { rows: prRows } = await pool.query(
        `SELECT status FROM purchase_requisitions WHERE id=$1 AND active=true`, [pr_id]
      );
      if (!prRows.length) return err(res, 'PR not found', 404);
      if (prRows[0].status !== 'APPROVED') return err(res, 'PR must be fully approved before creating PO');
    }

    const poNum = await pool.query('SELECT generate_po_number()');
    const po_number = poNum.rows[0].generate_po_number;

    // Server-side enforcement: non-taxpayer vendor (no GSTIN) → zero out all GST rates
    const vendorIsTaxpayer = !!(vendor_gstin && vendor_gstin.trim());
    if (!vendorIsTaxpayer) {
      items.forEach(it => { it.gst_rate = 0; });
    }

    let subtotal = 0, gstTotal = 0;
    for (const item of items) {
      const amt = parseFloat(item.quantity) * parseFloat(item.unit_rate);
      subtotal += amt;
      gstTotal += amt * (parseFloat(item.gst_rate || 0) / 100);
    }

    const { advance_required, advance_percentage } = req.body;
    const totalAmount = subtotal + gstTotal;
    const advRequired = advance_required === true || advance_required === 'true';
    const advPct      = parseFloat(advance_percentage) || 0;
    const advAmount   = advRequired && advPct > 0 ? parseFloat((totalAmount * advPct / 100).toFixed(2)) : parseFloat(req.body.advance_amount) || 0;

    const { rows } = await pool.query(
      `INSERT INTO procurement_orders
         (po_number, pr_id, vendor_name, vendor_address, vendor_gstin, vendor_email,
          vendor_phone, center_id, created_by, delivery_address, delivery_date,
          payment_terms, subtotal, gst_amount, total_amount, notes, terms_conditions,
          advance_required, advance_percentage, advance_amount, quotation_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [po_number, pr_id || null, vendor_name, vendor_address || null, vendor_gstin || null,
       vendor_email || null, vendor_phone || null, center_id, req.user.id,
       delivery_address || null, delivery_date || null, payment_terms || 'Net 30',
       subtotal, gstTotal, totalAmount, notes || null, terms_conditions || null,
       advRequired, advPct, advAmount, quotation_ref || null]
    );
    const po = rows[0];

    for (const item of items) {
      const amt    = parseFloat(item.quantity) * parseFloat(item.unit_rate);
      const gstAmt = amt * (parseFloat(item.gst_rate || 0) / 100);
      await pool.query(
        `INSERT INTO procurement_order_items
           (po_id, item_master_id, item_code, item_name, description, uom, quantity, unit_rate, gst_rate, gst_amount, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [po.id, item.item_master_id || null, item.item_code || null, item.item_name,
         item.description || null, item.uom || 'PCS', item.quantity, item.unit_rate,
         item.gst_rate || 0, gstAmt, amt]
      );
    }

    // Mark PR as PO_PENDING so it cannot be used to create another PO while this one is being processed
    if (pr_id) {
      await pool.query(
        `UPDATE purchase_requisitions SET status='PO_PENDING', updated_at=NOW()
         WHERE id=$1 AND status='APPROVED'`,
        [pr_id]
      );
    }

    logger.info(`PO created: ${po_number}`, { po_id: po.id, pr_id, user: req.user.id });
    ok(res, { po });
  } catch (e) { logger.error('Create PO error', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/pos/:id/submit ─────────────────────────────────────
// Creator submits DRAFT PO for approval → PENDING_APPROVAL, notifies L2 approvers
router.post('/pos/:id/submit', authorizePermission('PO_WRITE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT po.*, c.name AS center_name FROM procurement_orders po
       JOIN centers c ON c.id = po.center_id
       WHERE po.id = $1 AND po.active = true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);
    const po = rows[0];
    if (po.status !== 'DRAFT') return err(res, 'Only DRAFT POs can be submitted for approval');
    if (po.created_by !== req.user.id && !PROC_ADMIN.includes(req.user.role))
      return err(res, 'Not authorised', 403);

    await pool.query(
      `UPDATE procurement_orders
          SET status = 'PENDING_APPROVAL', submitted_by = $1, submitted_at = NOW(), updated_at = NOW()
        WHERE id = $2`,
      [req.user.id, po.id]
    );

    // PR stays APPROVED while PO is pending approval — only moves to PO_CREATED on actual approval

    // Notify L2 approvers
    const approvers = await getPOApprovers(po.center_id);
    for (const a of approvers) {
      await notify(a.user_id, 'PO_APPROVAL_REQUIRED',
        `PO Approval Required: ${po.po_number}`,
        `${req.user.name || 'A user'} submitted PO "${po.po_number}" (${po.vendor_name}, ₹${parseFloat(po.total_amount).toLocaleString('en-IN')}) from ${po.center_name} for your approval.`,
        null, po.id
      );
    }

    logger.info(`PO submitted for approval: ${po.po_number}`);
    ok(res, { message: 'PO submitted for approval' });
  } catch (e) { logger.error('Submit PO error:', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/pos/:id/approve ────────────────────────────────────
// L2 approver approves PENDING_APPROVAL PO → ISSUED, notifies creator
router.post('/pos/:id/approve', authorizePermission('PO_APPROVE'), [
  body('comments').optional().trim().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { rows } = await pool.query(
      `SELECT po.* FROM procurement_orders po WHERE po.id = $1 AND po.active = true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);
    const po = rows[0];
    if (po.status !== 'PENDING_APPROVAL') return err(res, 'PO is not pending approval');

    await pool.query(
      `UPDATE procurement_orders
          SET status = 'ISSUED', approved_by = $1, approved_at = NOW(),
              rejection_reason = NULL, updated_at = NOW()
        WHERE id = $2`,
      [req.user.id, po.id]
    );

    // Now that PO is approved and issued, mark linked PR as PO_CREATED
    if (po.pr_id) {
      await pool.query(
        `UPDATE purchase_requisitions SET status='PO_CREATED', updated_at=NOW()
         WHERE id=$1 AND status='PO_PENDING'`,
        [po.pr_id]
      );
    }

    // Auto-create advance vendor bill if required (same logic as status PATCH)
    if (po.advance_required && parseFloat(po.advance_amount) > 0) {
      try {
        const existing = await pool.query(
          `SELECT id FROM vendor_bills WHERE source_po_id=$1 AND bill_type='ADVANCE' AND active=true`,
          [po.id]
        );
        if (!existing.rows.length) {
          const today = new Date().toLocaleDateString('en-CA');
          const { rows: [seq] } = await pool.query(
            `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(bill_number,'^VB-\\d{6}-','') AS INTEGER)),0)+1 AS next
               FROM vendor_bills WHERE bill_number ~ '^VB-\\d{6}-'`
          );
          const bill_number = `VB-${today.slice(0,7).replace('-','')}-${String(seq.next).padStart(5,'0')}`;
          const resolvedVendorCode = po.vendor_code || null;
          await pool.query(
            `INSERT INTO vendor_bills
               (bill_number, vendor_code, vendor_name_text, center_id, bill_date, due_date,
                subtotal, total_amount, bill_status, payment_status, bill_type,
                source_po_id, notes, active)
             VALUES ($1,$2,$3,$4,$5,$5,$6,$6,'SUBMITTED','PENDING','ADVANCE',$7,$8,true)`,
            [bill_number, resolvedVendorCode, po.vendor_name, po.center_id, today,
             po.advance_amount, po.id, `Advance payment for PO ${po.po_number}`]
          );
        }
      } catch (advErr) { logger.warn('Advance bill creation failed:', advErr.message); }
    }

    // Notify creator
    await notify(po.created_by, 'PO_APPROVED',
      `PO Approved: ${po.po_number}`,
      `Your Purchase Order "${po.po_number}" for ${po.vendor_name} has been approved and issued.`,
      null, po.id
    );

    logger.info(`PO approved: ${po.po_number}`, { approver: req.user.id });
    ok(res, { message: 'PO approved and issued' });
  } catch (e) { logger.error('Approve PO error:', e); err(res, 'Server error', 500); }
});

// ── POST /api/procurement/pos/:id/reject-approval ────────────────────────────
// L2 approver rejects PENDING_APPROVAL PO → back to DRAFT, notifies creator
router.post('/pos/:id/reject-approval', authorizePermission('PO_APPROVE'), [
  body('reason').trim().isLength({ min: 5, max: 500 }).withMessage('Reason required (min 5 chars)'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM procurement_orders WHERE id = $1 AND active = true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);
    const po = rows[0];
    if (po.status !== 'PENDING_APPROVAL') return err(res, 'PO is not pending approval');
    const { reason } = req.body;

    await pool.query(
      `UPDATE procurement_orders
          SET status = 'DRAFT', rejection_reason = $1, updated_at = NOW()
        WHERE id = $2`,
      [reason, po.id]
    );

    // Revert linked PR back to APPROVED so a new PO can be created
    if (po.pr_id) {
      await pool.query(
        `UPDATE purchase_requisitions SET status='APPROVED', updated_at=NOW()
         WHERE id=$1 AND status='PO_PENDING'`,
        [po.pr_id]
      );
    }

    // Notify creator
    await notify(po.created_by, 'PO_REJECTED',
      `PO Approval Rejected: ${po.po_number}`,
      `Your Purchase Order "${po.po_number}" was sent back for revision. Reason: ${reason}`,
      null, po.id
    );

    logger.info(`PO approval rejected: ${po.po_number}`, { by: req.user.id });
    ok(res, { message: 'PO sent back for revision' });
  } catch (e) { logger.error('Reject PO error:', e); err(res, 'Server error', 500); }
});

// ── PATCH /api/procurement/pos/:id ───────────────────────────────────────────
// Edit a DRAFT PO (e.g. after sent back for revision)
router.patch('/pos/:id', authorizePermission('PO_WRITE'), [
  body('vendor_name').optional().trim().isLength({ min: 2, max: 200 }),
  body('quotation_ref').optional().trim().isLength({ min: 1 }).withMessage('Quotation reference is required'),
  body('items').optional().isArray({ min: 1 }),
  body('items.*.item_name').optional().trim().isLength({ min: 1 }),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }),
  body('items.*.unit_rate').optional().isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM procurement_orders WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);
    const po = rows[0];
    if (po.status !== 'DRAFT') return err(res, 'Only DRAFT POs can be edited');

    const {
      vendor_name, vendor_address, vendor_gstin, vendor_email, vendor_phone,
      delivery_address, delivery_date, payment_terms, notes, terms_conditions,
      advance_required, advance_percentage, advance_amount, quotation_ref, items,
    } = req.body;

    // Recalculate totals if items provided
    let subtotal = po.subtotal, gstTotal = po.gst_amount, totalAmount = po.total_amount;
    if (items) {
      const vendorIsTaxpayer = !!(vendor_gstin && vendor_gstin.trim());
      if (!vendorIsTaxpayer) items.forEach(it => { it.gst_rate = 0; });
      subtotal = 0; gstTotal = 0;
      for (const item of items) {
        const amt = parseFloat(item.quantity) * parseFloat(item.unit_rate);
        subtotal += amt;
        gstTotal += amt * (parseFloat(item.gst_rate || 0) / 100);
      }
      totalAmount = subtotal + gstTotal;
    }

    await pool.query(
      `UPDATE procurement_orders SET
         vendor_name       = COALESCE($1, vendor_name),
         vendor_address    = COALESCE($2, vendor_address),
         vendor_gstin      = COALESCE($3, vendor_gstin),
         vendor_email      = COALESCE($4, vendor_email),
         vendor_phone      = COALESCE($5, vendor_phone),
         delivery_address  = COALESCE($6, delivery_address),
         delivery_date     = COALESCE($7, delivery_date),
         payment_terms     = COALESCE($8, payment_terms),
         notes             = COALESCE($9, notes),
         terms_conditions  = COALESCE($10, terms_conditions),
         advance_required  = COALESCE($11, advance_required),
         advance_percentage= COALESCE($12, advance_percentage),
         advance_amount    = COALESCE($13, advance_amount),
         quotation_ref     = COALESCE($14, quotation_ref),
         subtotal          = $15,
         gst_amount        = $16,
         total_amount      = $17,
         rejection_reason  = NULL,
         updated_at        = NOW()
       WHERE id = $18`,
      [vendor_name || null, vendor_address || null, vendor_gstin || null,
       vendor_email || null, vendor_phone || null, delivery_address || null,
       delivery_date || null, payment_terms || null, notes || null,
       terms_conditions || null, advance_required ?? null,
       advance_percentage || null, advance_amount || null, quotation_ref || null,
       subtotal, gstTotal, totalAmount, po.id]
    );

    if (items) {
      await pool.query(`DELETE FROM procurement_order_items WHERE po_id=$1`, [po.id]);
      for (const item of items) {
        const amt    = parseFloat(item.quantity) * parseFloat(item.unit_rate);
        const gstAmt = amt * (parseFloat(item.gst_rate || 0) / 100);
        await pool.query(
          `INSERT INTO procurement_order_items
             (po_id, item_master_id, item_code, item_name, description, uom, quantity, unit_rate, gst_rate, gst_amount, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [po.id, item.item_master_id || null, item.item_code || null, item.item_name,
           item.description || null, item.uom || 'PCS', item.quantity, item.unit_rate,
           item.gst_rate || 0, gstAmt, amt]
        );
      }
    }

    logger.info(`PO updated: ${po.po_number}`, { user: req.user.id });
    ok(res, { message: 'PO updated' });
  } catch (e) { logger.error('Update PO error:', e); err(res, 'Server error', 500); }
});

// ── PATCH /api/procurement/pos/:id/status ────────────────────────────────────
// Valid transitions: DRAFT→PENDING_APPROVAL, PENDING_APPROVAL→ISSUED/DRAFT,
//                   ISSUED→ACKNOWLEDGED, ISSUED→CANCELLED,
//                   ACKNOWLEDGED→COMPLETED, ACKNOWLEDGED→CANCELLED
const PO_TRANSITIONS = {
  DRAFT:            ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['ISSUED', 'DRAFT', 'CANCELLED'],
  ISSUED:           ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED:     ['COMPLETED', 'CANCELLED'],
  COMPLETED:        [],
  CANCELLED:        [],
};

router.patch('/pos/:id/status', authorizePermission('PO_APPROVE'), [
  body('status').isIn(['DRAFT','PENDING_APPROVAL','ISSUED','ACKNOWLEDGED','COMPLETED','CANCELLED']),
], async (req, res) => {
  try {
    // Fetch current status before update
    const currentRes = await pool.query(
      `SELECT * FROM procurement_orders WHERE id=$1 AND active=true`, [req.params.id]
    );
    if (!currentRes.rows.length) return err(res, 'PO not found', 404);
    const prevStatus = currentRes.rows[0].status;

    // Guard: only allow valid transitions
    const allowed = PO_TRANSITIONS[prevStatus] || [];
    if (!allowed.includes(req.body.status)) {
      return err(res, `Cannot transition PO from ${prevStatus} to ${req.body.status}`);
    }

    const { rows } = await pool.query(
      `UPDATE procurement_orders SET status=$1, updated_at=NOW() WHERE id=$2 AND active=true RETURNING *`,
      [req.body.status, req.params.id]
    );
    if (!rows.length) return err(res, 'PO not found', 404);

    // Auto-post finance JE when PO moves to COMPLETED
    if (req.body.status === 'COMPLETED' && prevStatus !== 'COMPLETED') {
      setImmediate(async () => {
        try {
          await financeService.postProcurementJE(rows[0], req.user?.id);
        } catch (jeErr) {
          logger.error('Finance JE failed for procurement:', { po_id: req.params.id, error: jeErr.message });
        }
      });
    }

    // Auto-create ADVANCE vendor bill when PO is ISSUED (if advance_required and not already created)
    const po = rows[0];
    if (req.body.status === 'ISSUED' && prevStatus !== 'ISSUED' &&
        po.advance_required && parseFloat(po.advance_amount) > 0) {
      try {
        const existing = await pool.query(
          `SELECT id FROM vendor_bills WHERE source_po_id=$1 AND bill_type='ADVANCE' AND active=true`,
          [po.id]
        );
        if (existing.rows.length === 0) {
          // Resolve vendor_code from vendor_master by GSTIN or name
          let resolvedVendorCode = null;
          if (po.vendor_gstin) {
            const { rows: vm } = await pool.query(
              `SELECT vendor_code FROM vendor_master WHERE gst_number=$1 AND active=true LIMIT 1`,
              [po.vendor_gstin]
            );
            if (vm.length) resolvedVendorCode = vm[0].vendor_code;
          }
          if (!resolvedVendorCode && po.vendor_name) {
            const { rows: vm } = await pool.query(
              `SELECT vendor_code FROM vendor_master WHERE vendor_name ILIKE $1 AND active=true LIMIT 1`,
              [po.vendor_name]
            );
            if (vm.length) resolvedVendorCode = vm[0].vendor_code;
          }

          const { rows: seq } = await pool.query(
            `SELECT COALESCE(MAX(CAST(SPLIT_PART(bill_number,'-',3) AS INTEGER)),0)+1 AS next
             FROM vendor_bills WHERE bill_number LIKE 'VB-%'`
          );
          const bill_number = `VB-${new Date().toLocaleDateString('en-CA').slice(0,7).replace('-','')}-${String(seq[0].next).padStart(5,'0')}`;
          const today = new Date().toLocaleDateString('en-CA');
          await pool.query(
            `INSERT INTO vendor_bills
               (bill_number, vendor_code, vendor_name_text, center_id, bill_date, due_date,
                subtotal, total_amount, bill_status, payment_status, bill_type,
                source_po_id, notes, active)
             VALUES ($1,$2,$3,$4,$5,$5,$6,$6,'SUBMITTED','PENDING','ADVANCE',$7,$8,true)`,
            [bill_number, resolvedVendorCode, po.vendor_name,
             po.center_id, today,
             po.advance_amount, po.id,
             `Advance payment for PO ${po.po_number}`]
          );
          logger.info('Advance bill auto-created', { po_id: po.id, bill_number, amount: po.advance_amount });
        }
      } catch (advErr) {
        logger.error('Advance bill creation failed:', { po_id: po.id, error: advErr.message });
      }
    }

    // If PO is cancelled and it was raised from a PR, revert PR back to APPROVED
    // so the user can raise a new PO against it
    if (req.body.status === 'CANCELLED' && currentRes.rows[0].pr_id) {
      await pool.query(
        `UPDATE purchase_requisitions SET status='APPROVED', updated_at=NOW()
         WHERE id=$1 AND status IN ('PO_PENDING','PO_CREATED')`,
        [currentRes.rows[0].pr_id]
      );
    }

    ok(res, { po: rows[0] });
  } catch (e) { err(res, 'Server error', 500); }
});

module.exports = router;
