'use strict';
const express = require('express');
const pool    = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('MASTER_DATA_VIEW'));

const ok  = (res, data)      => res.json({ success: true, ...data });
const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

// ── GET /api/corporate-entities — list all ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM corporate_entities ORDER BY entity_name`
    );
    ok(res, { entities: rows });
  } catch (err) {
    logger.error('GET corporate-entities error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── GET /api/corporate-entities/:id — single with linked centers ──────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM corporate_entities WHERE id = $1`, [id]
    );
    if (!rows[0]) return fail(res, 404, 'Entity not found');

    const { rows: centers } = await pool.query(
      `SELECT id, name, code, city, state, status, active
       FROM centers WHERE corporate_entity_id = $1 ORDER BY name`, [id]
    );

    ok(res, { entity: rows[0], centers });
  } catch (err) {
    logger.error('GET corporate-entities/:id error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── POST /api/corporate-entities — create ────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      entity_code, entity_name, legal_name, gstin, pan,
      address, city, state, country, email, phone
    } = req.body;

    if (!entity_code || !entity_name) {
      return fail(res, 400, 'entity_code and entity_name are required');
    }

    const { rows } = await pool.query(
      `INSERT INTO corporate_entities
         (entity_code, entity_name, legal_name, gstin, pan, address, city, state, country, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [entity_code, entity_name, legal_name, gstin, pan, address, city, state, country || 'India', email, phone]
    );

    logger.info(`Corporate entity created: ${entity_code}`);
    ok(res, { entity: rows[0] });
  } catch (err) {
    if (err.code === '23505') return fail(res, 409, 'entity_code already exists');
    logger.error('POST corporate-entities error:', err);
    fail(res, 500, 'Internal server error');
  }
});

// ── PUT /api/corporate-entities/:id — update ─────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entity_name, legal_name, gstin, pan,
      address, city, state, country, email, phone, active
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE corporate_entities SET
         entity_name  = COALESCE($1, entity_name),
         legal_name   = COALESCE($2, legal_name),
         gstin        = COALESCE($3, gstin),
         pan          = COALESCE($4, pan),
         address      = COALESCE($5, address),
         city         = COALESCE($6, city),
         state        = COALESCE($7, state),
         country      = COALESCE($8, country),
         email        = COALESCE($9, email),
         phone        = COALESCE($10, phone),
         active       = COALESCE($11, active),
         updated_at   = NOW()
       WHERE id = $12
       RETURNING *`,
      [entity_name, legal_name, gstin, pan, address, city, state, country, email, phone, active, id]
    );

    if (!rows[0]) return fail(res, 404, 'Entity not found');
    logger.info(`Corporate entity updated: id=${id}`);
    ok(res, { entity: rows[0] });
  } catch (err) {
    logger.error('PUT corporate-entities/:id error:', err);
    fail(res, 500, 'Internal server error');
  }
});

module.exports = router;
