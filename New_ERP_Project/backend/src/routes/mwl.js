'use strict';
/**
 * DICOM MWL Gateway Route  —  /api/mwl
 *
 * Two auth layers:
 *   1. Bearer <center-token>  →  public worklist endpoint (called by local center app)
 *   2. ARIS JWT               →  admin endpoints (token CRUD, logs, settings)
 *
 * Token format:  mwl_<32 random hex bytes>
 * Only SHA-256 hash stored in DB; first 8 chars shown in UI.
 */

const express  = require('express');
const crypto   = require('crypto');
const pool     = require('../config/db');
const { logger } = require('../config/logger');
const { authenticateToken, authorizePermission } = require('../middleware/auth');

// Shorthand: JWT auth + permission check for all admin endpoints
const adminAuth = (...perms) => [authenticateToken, authorizePermission(...perms)];

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────────────────
const ok  = (res, data)        => res.json({ success: true, ...data });
const err = (res, msg, status) => res.status(status || 400).json({ success: false, error: msg });

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generateToken() {
  return 'mwl_' + crypto.randomBytes(32).toString('hex');
}

/** Write one row to mwl_access_logs (fire-and-forget — never throws) */
async function writeLog({ center_id, token_prefix, client_ip, endpoint,
                          query_params, records_returned, status,
                          error_message, response_ms, user_agent }) {
  try {
    await pool.query(
      `INSERT INTO mwl_access_logs
         (center_id, token_prefix, client_ip, endpoint, query_params,
          records_returned, status, error_message, response_ms, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [center_id   || null,
       token_prefix|| null,
       client_ip   || null,
       endpoint,
       query_params ? JSON.stringify(query_params) : null,
       records_returned ?? 0,
       status,
       error_message || null,
       response_ms  || null,
       user_agent   || null]
    );
  } catch (e) {
    logger.warn('mwl_access_logs write failed', e.message);
  }
}

/** Update last_used_at + last_ip on the token row */
async function touchToken(centerId, ip) {
  try {
    await pool.query(
      `UPDATE mwl_center_tokens SET last_used_at=NOW(), last_ip=$1 WHERE center_id=$2`,
      [ip, centerId]
    );
  } catch (_) { /* silent */ }
}

// ── Bearer token middleware (used only on the public /worklist endpoint) ─────
// Requires TWO credentials on every request:
//   Authorization: Bearer <token>    — proves the caller holds the secret
//   X-Center-ID: <center_id>         — proves the caller knows which center they represent
// Both must agree; a stolen token cannot be replayed against a different center.
async function bearerTokenAuth(req, res, next) {
  const t0       = Date.now();
  const authHdr  = req.headers['authorization'] || '';
  const rawToken = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : null;
  const centerId = req.headers['x-center-id'] || req.query.center_id || null;
  const clientIp = req.ip || req.socket?.remoteAddress;
  const endpoint = req.path;

  // ── Both credentials must be present ─────────────────────────────────────
  if (!rawToken) {
    await writeLog({ client_ip: clientIp, endpoint, status: 'UNAUTHORIZED',
                     error_message: 'Missing Authorization header', response_ms: Date.now() - t0 });
    return err(res, 'Authorization required — provide Bearer token in Authorization header', 401);
  }

  if (!centerId) {
    await writeLog({ client_ip: clientIp, endpoint, status: 'UNAUTHORIZED',
                     error_message: 'Missing X-Center-ID header', response_ms: Date.now() - t0 });
    return err(res, 'Center ID required — provide X-Center-ID header (e.g. X-Center-ID: 3)', 401);
  }

  const hash   = sha256(rawToken);
  const prefix = rawToken.slice(0, 8);

  try {
    const { rows } = await pool.query(
      `SELECT mct.center_id, mct.enabled, mct.token_prefix,
              c.name AS center_name, c.ae_title
         FROM mwl_center_tokens mct
         JOIN centers c ON c.id = mct.center_id
        WHERE mct.token_hash = $1`,
      [hash]
    );

    // ── Token unknown ─────────────────────────────────────────────────────
    if (!rows.length) {
      await writeLog({ token_prefix: prefix, client_ip: clientIp, endpoint,
                       status: 'UNAUTHORIZED', error_message: 'Invalid token',
                       response_ms: Date.now() - t0 });
      return err(res, 'Invalid token', 401);
    }

    const tokenRow = rows[0];

    // ── Center ID mismatch — token is bound to a different center ─────────
    if (String(tokenRow.center_id) !== String(centerId)) {
      await writeLog({ center_id: tokenRow.center_id, token_prefix: prefix,
                       client_ip: clientIp, endpoint, status: 'UNAUTHORIZED',
                       error_message: `Center ID mismatch: token bound to center ${tokenRow.center_id}, request sent ${centerId}`,
                       response_ms: Date.now() - t0 });
      return err(res, 'Center ID mismatch — token is not valid for the specified center', 401);
    }

    // ── Center disabled ───────────────────────────────────────────────────
    if (!tokenRow.enabled) {
      await writeLog({ center_id: tokenRow.center_id, token_prefix: prefix,
                       client_ip: clientIp, endpoint, status: 'DISABLED',
                       error_message: 'MWL disabled for this center',
                       response_ms: Date.now() - t0 });
      return err(res, 'MWL integration is disabled for this center', 403);
    }

    req.mwlCenter    = { id: tokenRow.center_id, name: tokenRow.center_name, ae_title: tokenRow.ae_title };
    req.mwlTokenInfo = { prefix, t0 };
    next();
  } catch (e) {
    logger.error('bearerTokenAuth error', e);
    err(res, 'Internal error', 500);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC  —  GET /api/mwl/worklist
// Called by local center app with Bearer token.
// Returns DICOM MWL-ready scheduled studies for the token's center.
// ════════════════════════════════════════════════════════════════════════════
router.get('/worklist', bearerTokenAuth, async (req, res) => {
  const { id: centerId, name: centerName, ae_title } = req.mwlCenter;
  const { prefix, t0 } = req.mwlTokenInfo;
  const clientIp = req.ip || req.socket?.remoteAddress;

  try {
    const {
      date,                    // YYYY-MM-DD  (default: today)
      status,                  // exam_workflow_status override (default: EXAM_SCHEDULED)
      accession,               // exact accession lookup
      days_ahead = 0,          // fetch N future days (0 = today only)
      include_completed = 'false', // also return EXAM_COMPLETED studies
    } = req.query;

    const params = [centerId];
    const conds  = ['s.center_id = $1', 's.active = true'];
    let   i      = 2;

    // ── Date / accession filter ───────────────────────────────────────────
    if (accession) {
      conds.push(`s.accession_number = $${i++}`);
      params.push(accession);
    } else {
      const fromDate = date || new Date().toLocaleDateString('en-CA');
      conds.push(`s.appointment_date >= $${i++}`);
      params.push(fromDate);
      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + parseInt(days_ahead));
      conds.push(`s.appointment_date <= $${i++}`);
      params.push(toDate.toLocaleDateString('en-CA'));
    }

    // ── Status filter — prefer exam_workflow_status, fall back to legacy status column ─
    // exam_workflow_status values: EXAM_SCHEDULED | EXAM_COMPLETED | REPORT_COMPLETED
    // Default: show EXAM_SCHEDULED (ready for modality). Pass include_completed=true to
    // also include EXAM_COMPLETED (done on scanner, waiting for report).
    if (status) {
      // Explicit override — direct match on exam_workflow_status
      conds.push(`s.exam_workflow_status = $${i++}`);
      params.push(status.toUpperCase());
    } else if (include_completed === 'true') {
      conds.push(`(s.exam_workflow_status IN ('EXAM_SCHEDULED','EXAM_COMPLETED')
                   OR (s.exam_workflow_status IS NULL AND LOWER(s.status) IN ('scheduled','in_progress')))`);
    } else {
      conds.push(`(s.exam_workflow_status = 'EXAM_SCHEDULED'
                   OR (s.exam_workflow_status IS NULL AND LOWER(s.status) = 'scheduled'))`);
    }

    // No modality filter — the local DICOM app receives ALL modalities for the center
    // and generates a separate MWL entry per modality from the returned data.

    const { rows } = await pool.query(`
      SELECT
        s.id                                        AS study_id,
        s.accession_number,
        s.study_instance_uid,
        s.study_code,
        s.requested_procedure,
        s.actual_procedure,
        s.scanner_type,
        s.status,
        s.exam_workflow_status,
        s.payment_status,
        s.appointment_date,
        s.appointment_time,
        s.contrast_used,
        s.emergency_study,
        s.payment_type,
        s.notes,

        -- Patient demographics (including PID — internal patient identifier)
        p.id                                        AS patient_id,
        p.pid                                       AS patient_pid,
        p.name                                      AS patient_name,
        p.date_of_birth                             AS patient_dob,
        p.gender                                    AS patient_sex,
        p.phone                                     AS patient_phone,
        p.email                                     AS patient_email,
        p.address                                   AS patient_address,
        p.city                                      AS patient_city,
        p.state                                     AS patient_state,
        p.blood_group                               AS patient_blood_group,

        -- Study definition (canonical catalog — migration 042)
        -- Falls back to study_master billing row if definition not found
        COALESCE(sd.study_name, sm.study_name)      AS study_name,
        COALESCE(sd.modality,   sm.modality)        AS modality,
        COALESCE(sd.study_type, sm.study_type)      AS study_type,
        COALESCE(sd.description,sm.description)     AS study_description,
        sm.cpt_code,
        sm.billing_code,

        -- Referring physician — prefer study-level code; fall back to patient registration
        COALESCE(s.referring_physician_code, p.referring_physician_code)
                                                    AS resolved_physician_code,
        rpm.physician_name                          AS referring_physician_name,
        rpm.specialty                               AS referring_physician_specialty,

        -- Center
        c.name                                      AS center_name,
        c.ae_title                                  AS station_ae_title,
        c.address                                   AS center_address,
        c.city                                      AS center_city

      FROM studies s
      JOIN patients              p   ON p.id   = s.patient_id
      JOIN centers               c   ON c.id   = s.center_id
      -- study_definitions is the canonical catalog (migration 042)
      LEFT JOIN study_definitions    sd  ON sd.study_code = s.study_code
      -- study_master holds center pricing and cpt_code / billing_code
      LEFT JOIN study_master         sm  ON sm.study_code = s.study_code
      -- referring physician: COALESCE(study-level, patient-level)
      LEFT JOIN referring_physician_master rpm
                ON rpm.physician_code = COALESCE(s.referring_physician_code, p.referring_physician_code)
      WHERE ${conds.join(' AND ')}
      ORDER BY s.appointment_date ASC, s.appointment_time ASC
    `, params);

    // ── Transform to DICOM MWL format ────────────────────────────────────
    const worklist = rows.map(r => {
      // DICOM Patient Name: LAST^FIRST^MIDDLE (best-effort from single name field)
      const nameParts = (r.patient_name || '').trim().split(/\s+/);
      const lastName  = nameParts.pop() || '';
      const firstName = nameParts.join(' ');
      const dicomName = lastName
        ? `${lastName.toUpperCase()}^${firstName.toUpperCase()}^`
        : (r.patient_name || '').toUpperCase();

      // DICOM DOB: YYYYMMDD
      const dobDicom = r.patient_dob
        ? new Date(r.patient_dob).toISOString().slice(0, 10).replace(/-/g, '')
        : '';

      // DICOM DateTime: YYYYMMDDHHmm00
      const apptDate = (r.appointment_date || '').toString().slice(0, 10).replace(/-/g, '');
      const apptTime = (r.appointment_time || '0000').replace(':', '').padEnd(4, '0');
      const scheduledDT = `${apptDate}${apptTime}00`;

      // Referring physician DICOM name (LAST^FIRST format, strip Dr. prefix)
      const refPhysRaw = r.referring_physician_name || '';
      const refPhysDicom = refPhysRaw
        ? refPhysRaw.replace(/^(dr\.?\s*)/i, '').trim().toUpperCase().replace(/\s+/, '^')
        : '';

      // AE title: token's center ae_title, then DB ae_title, then empty string
      const stationAeTitle = ae_title || r.station_ae_title || '';

      // Accession number — may be null if billing has not been completed yet
      // The local app should handle null gracefully and retry after billing
      const accessionNum = r.accession_number || null;

      // Study Instance UID — generate a placeholder if missing (shouldn't happen after billing)
      const studyUID = r.study_instance_uid || `2.25.${r.study_id.replace(/\D/g, '')}`;

      return {
        // ── DICOM identifiers ─────────────────────────────────────────────
        accession_number:       accessionNum,
        study_instance_uid:     studyUID,
        has_accession:          !!accessionNum,   // explicit flag for local app logic

        // ── Patient identifiers ───────────────────────────────────────────
        patient_id:             r.patient_id,     // internal UUID
        patient_pid:            r.patient_pid,    // AR00000001 — ARIS PID (use as DICOM PatientID)

        // ── Patient demographics (DICOM-ready) ────────────────────────────
        patient_name_dicom:     dicomName,        // LAST^FIRST^ format
        patient_name:           r.patient_name,
        patient_dob:            dobDicom,         // YYYYMMDD
        patient_dob_iso:        r.patient_dob,
        patient_sex:            r.patient_sex ? r.patient_sex[0].toUpperCase() : 'O',
        patient_phone:          r.patient_phone  || '',
        patient_email:          r.patient_email  || '',
        patient_address:        r.patient_address || '',
        patient_city:           r.patient_city   || '',
        patient_state:          r.patient_state  || '',
        patient_blood_group:    r.patient_blood_group || '',

        // ── Scheduled procedure step ──────────────────────────────────────
        scheduled_procedure: {
          step_id:               accessionNum || r.study_id,
          modality:              r.modality || r.scanner_type || 'OT',
          study_type:            r.study_type || '',
          procedure_code:        r.study_code || '',
          procedure_description: r.study_name || r.requested_procedure || '',
          billing_code:          r.billing_code || '',
          cpt_code:              r.cpt_code || '',
          scheduled_datetime:    scheduledDT,  // YYYYMMDDHHmmSS
          scheduled_date:        r.appointment_date,
          scheduled_time:        r.appointment_time,
          station_ae_title:      stationAeTitle,
          contrast_used:         r.contrast_used  || false,
          emergency:             r.emergency_study || false,
        },

        // ── Referring physician ───────────────────────────────────────────
        referring_physician_dicom:    refPhysDicom,
        referring_physician_name:     r.referring_physician_name || '',
        referring_physician_code:     r.resolved_physician_code  || '',
        referring_physician_specialty: r.referring_physician_specialty || '',

        // ── Performing center ─────────────────────────────────────────────
        center: {
          name:     r.center_name,
          city:     r.center_city    || '',
          address:  r.center_address || '',
          ae_title: stationAeTitle,
        },

        // ── Workflow status ───────────────────────────────────────────────
        workflow_status:  r.exam_workflow_status || r.status || 'scheduled',
        payment_status:   r.payment_status  || '',
        payment_type:     r.payment_type    || '',
        notes:            r.notes           || '',
      };
    });

    const responseMs = Date.now() - t0;
    touchToken(centerId, clientIp);
    await writeLog({ center_id: centerId, token_prefix: prefix, client_ip: clientIp,
                     endpoint: '/worklist', query_params: req.query,
                     records_returned: worklist.length, status: 'SUCCESS',
                     response_ms: responseMs });

    ok(res, {
      center:    { id: centerId, name: centerName, ae_title },
      date:      req.query.date || new Date().toLocaleDateString('en-CA'),
      count:     worklist.length,
      worklist,
      generated_at: new Date().toISOString(),
    });

  } catch (e) {
    logger.error('MWL worklist error', e);
    await writeLog({ center_id: centerId, token_prefix: prefix, client_ip: clientIp,
                     endpoint: '/worklist', query_params: req.query,
                     status: 'ERROR', error_message: e.message });
    err(res, e.message, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — protected by ARIS JWT + MWL_VIEW / MWL_MANAGE permissions
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/mwl/settings  —  all centers with token status ─────────────────
router.get('/settings', adminAuth('MWL_VIEW'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id          AS center_id,
        c.name        AS center_name,
        c.ae_title,
        c.active      AS center_active,
        mct.id        AS token_id,
        mct.enabled,
        mct.token_prefix,
        mct.label,
        mct.created_at,
        mct.updated_at,
        mct.last_used_at,
        mct.last_ip,
        u.name        AS created_by_name,
        -- quick stats
        (SELECT COUNT(*) FROM mwl_access_logs mal WHERE mal.center_id = c.id
           AND mal.fetched_at >= NOW() - INTERVAL '24 hours') AS calls_24h,
        (SELECT COUNT(*) FROM mwl_access_logs mal WHERE mal.center_id = c.id
           AND mal.status = 'ERROR'
           AND mal.fetched_at >= NOW() - INTERVAL '24 hours') AS errors_24h,
        (SELECT MAX(fetched_at) FROM mwl_access_logs mal WHERE mal.center_id = c.id) AS last_call_at
      FROM centers c
      LEFT JOIN mwl_center_tokens mct ON mct.center_id = c.id
      LEFT JOIN users u ON u.id = mct.created_by
      WHERE c.active = true AND c.is_corporate = false
      ORDER BY c.name
    `);
    ok(res, { settings: rows });
  } catch (e) {
    logger.error('mwl settings list error', e);
    err(res, e.message, 500);
  }
});

// ── POST /api/mwl/settings/:centerId/token  —  generate / regenerate token ──
router.post('/settings/:centerId/token', adminAuth('MWL_MANAGE'), async (req, res) => {
  const { centerId } = req.params;
  const { label }    = req.body;
  const userId       = req.user?.id || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify center exists and is not a corporate entity
    const { rows: cRows } = await client.query(
      `SELECT id, name, is_corporate FROM centers WHERE id = $1 AND active = true`, [centerId]
    );
    if (!cRows.length) throw new Error('Center not found');
    if (cRows[0].is_corporate) throw new Error('Cannot issue MWL tokens for corporate entities — only operational centers');

    const rawToken   = generateToken();
    const tokenHash  = sha256(rawToken);
    const tokenPrefix = rawToken.slice(0, 8);

    // Upsert — replaces any existing token for this center
    await client.query(
      `INSERT INTO mwl_center_tokens
         (center_id, token_hash, token_prefix, enabled, label, created_by, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, NOW())
       ON CONFLICT (center_id) DO UPDATE
         SET token_hash   = EXCLUDED.token_hash,
             token_prefix = EXCLUDED.token_prefix,
             enabled      = true,
             label        = COALESCE(EXCLUDED.label, mwl_center_tokens.label),
             updated_at   = NOW(),
             created_by   = EXCLUDED.created_by,
             last_used_at = NULL,
             last_ip      = NULL`,
      [centerId, tokenHash, tokenPrefix, label || null, userId]
    );

    await client.query('COMMIT');

    logger.info('MWL token generated', { centerId, tokenPrefix, user: userId });

    // Return the raw token ONCE — it will never be shown again
    ok(res, {
      raw_token:    rawToken,   // shown to admin once only
      token_prefix: tokenPrefix,
      center_id:    parseInt(centerId),
      center_name:  cRows[0].name,
      message: 'Token generated. Copy it now — it will not be shown again.',
    });
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('mwl token generate error', e);
    err(res, e.message, 400);
  } finally {
    client.release();
  }
});

// ── DELETE /api/mwl/settings/:centerId/token  —  revoke token ───────────────
router.delete('/settings/:centerId/token', adminAuth('MWL_MANAGE'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM mwl_center_tokens WHERE center_id = $1 RETURNING id`,
      [req.params.centerId]
    );
    if (!rows.length) return err(res, 'No token found for this center', 404);
    logger.info('MWL token revoked', { centerId: req.params.centerId });
    ok(res, { message: 'Token revoked' });
  } catch (e) {
    err(res, e.message, 500);
  }
});

// ── PATCH /api/mwl/settings/:centerId/toggle  —  enable / disable ───────────
router.patch('/settings/:centerId/toggle', adminAuth('MWL_MANAGE'), async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return err(res, 'enabled (boolean) required');

    const { rows } = await pool.query(
      `UPDATE mwl_center_tokens SET enabled=$1, updated_at=NOW()
       WHERE center_id=$2 RETURNING enabled, token_prefix`,
      [enabled, req.params.centerId]
    );
    if (!rows.length) return err(res, 'No token found — generate one first', 404);
    ok(res, { enabled: rows[0].enabled });
  } catch (e) {
    err(res, e.message, 500);
  }
});

// ── GET /api/mwl/logs  —  paginated audit log ────────────────────────────────
router.get('/logs', adminAuth('MWL_VIEW'), async (req, res) => {
  try {
    const {
      center_id, status, from, to,
      page = 1, limit = 100,
    } = req.query;

    const conds  = ['1=1'];
    const params = [];
    let   i      = 1;

    if (center_id) { conds.push(`mal.center_id = $${i++}`); params.push(center_id); }
    if (status)    { conds.push(`mal.status = $${i++}`);    params.push(status.toUpperCase()); }
    if (from)      { conds.push(`mal.fetched_at >= $${i++}`); params.push(from); }
    if (to)        { conds.push(`mal.fetched_at <  $${i++}`); params.push(to); }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await pool.query(`
      SELECT
        mal.*,
        c.name AS center_name,
        c.ae_title
      FROM mwl_access_logs mal
      LEFT JOIN centers c ON c.id = mal.center_id
      WHERE ${conds.join(' AND ')}
      ORDER BY mal.fetched_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, parseInt(limit), offset]);

    const { rows: cnt } = await pool.query(
      `SELECT COUNT(*) FROM mwl_access_logs mal WHERE ${conds.join(' AND ')}`,
      params
    );

    ok(res, { logs: rows, total: parseInt(cnt[0].count) });
  } catch (e) {
    logger.error('mwl logs error', e);
    err(res, e.message, 500);
  }
});

// ── GET /api/mwl/logs/stats  —  24h summary stats per center ────────────────
router.get('/logs/stats', adminAuth('MWL_VIEW'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id                                          AS center_id,
        c.name                                        AS center_name,
        COUNT(mal.id)                                 AS total_calls,
        COUNT(CASE WHEN mal.status='SUCCESS'      THEN 1 END) AS success_count,
        COUNT(CASE WHEN mal.status='ERROR'        THEN 1 END) AS error_count,
        COUNT(CASE WHEN mal.status='UNAUTHORIZED' THEN 1 END) AS unauth_count,
        COUNT(CASE WHEN mal.status='DISABLED'     THEN 1 END) AS disabled_count,
        COALESCE(AVG(mal.response_ms), 0)::INT        AS avg_response_ms,
        COALESCE(SUM(mal.records_returned), 0)        AS total_records,
        MAX(mal.fetched_at)                           AS last_call_at
      FROM centers c
      LEFT JOIN mwl_access_logs mal ON mal.center_id = c.id
        AND mal.fetched_at >= NOW() - INTERVAL '24 hours'
      WHERE c.active = true
      GROUP BY c.id, c.name
      ORDER BY total_calls DESC
    `);
    ok(res, { stats: rows });
  } catch (e) {
    err(res, e.message, 500);
  }
});

// ── GET /api/mwl/health  —  public health check (no auth) ───────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ARIS MWL Gateway', timestamp: new Date().toISOString() });
});

module.exports = router;
