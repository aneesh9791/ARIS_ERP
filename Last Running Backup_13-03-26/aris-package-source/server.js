/* ============================================================
   ARIS ERP — Express + PostgreSQL Backend  v3.0
   ARIS Diagnostic Centre | Kollam & Parippally | Kerala
   Supports: Billing, Assets, Radiologist Management,
             Referring Doctors, RBAC, MWL API, Reports
   ============================================================ */
require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const crypto     = require('crypto');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const app  = express();
app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));
const PORT = process.env.PORT || 3000;

// ─── PostgreSQL Pool ──────────────────────────────────────────
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'aris_erp',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASS     || '',
      }
);

// ─── Security Headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'cdnjs.cloudflare.com', "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'cdnjs.cloudflare.com', 'fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({ pool, tableName: 'sessions', createTableIfMissing: true }),
  secret:            process.env.SESSION_SECRET || 'aris-erp-secret-CHANGE-ME',
  resave:            false,
  saveUninitialized: false,
  rolling:           true,
  cookie: {
    maxAge:   8 * 60 * 60 * 1000,
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
}));

// ─── CSRF Protection ──────────────────────────────────────────
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/mwl')) return next();
  if (req.path === '/api/auth/login') return next();
  const token = req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}
app.use(csrfProtect);

// ─── Auth Middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ─── RBAC: Permission Check ───────────────────────────────────
// Checks user_permissions (override) then role_permissions (default).
// superadmin always passes.
async function hasPerm(userId, role, permCode) {
  if (role === 'superadmin') return true;
  // Check user-level override first
  const uRow = await pool.query(
    `SELECT granted, expiry_date FROM user_permissions
     WHERE user_id=$1 AND perm_code=$2
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`,
    [userId, permCode]
  );
  if (uRow.rows.length > 0) return uRow.rows[0].granted;
  // Fall back to role default
  const rRow = await pool.query(
    `SELECT granted FROM role_permissions WHERE role=$1 AND perm_code=$2`,
    [role, permCode]
  );
  return rRow.rows.length > 0 ? rRow.rows[0].granted : false;
}

function requirePerm(permCode) {
  return async (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const ok = await hasPerm(req.session.user.id, req.session.user.role, permCode);
      if (!ok) return res.status(403).json({ error: `Permission denied: ${permCode}` });
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// Legacy helpers kept for backward compatibility
function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!['admin','superadmin'].includes(req.session.user.role))
    return res.status(403).json({ error: 'Admin only' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
function centerFilter(req) {
  const u = req.session.user;
  if (['admin','superadmin','finance'].includes(u.role)) return null;
  return u.center_id || null;
}

// ─── MWL API Key Auth ─────────────────────────────────────────
async function requireMwlKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return res.status(401).json({ error: 'MWL API key required' });
  try {
    const r = await pool.query(
      `SELECT id, name, center_id FROM mwl_api_keys WHERE key_hash=$1 AND active=true`,
      [crypto.createHash('sha256').update(key).digest('hex')]
    );
    if (r.rows.length === 0) return res.status(401).json({ error: 'Invalid or inactive API key' });
    req.mwlClient = r.rows[0];
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ─── Audit Log Helper ─────────────────────────────────────────
async function audit(userId, action, detail = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, detail) VALUES ($1, $2, $3)`,
      [userId, action, JSON.stringify(detail)]
    );
  } catch (err) {
    console.error('[AUDIT FAILURE]', err.message, { action, detail });
  }
}

// ─── Login Rate Limiter ───────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const r = await pool.query(
      `SELECT u.*, c.name AS center_name FROM users u
       LEFT JOIN centers c ON c.id=u.center_id
       WHERE u.username=$1 AND u.active=true`,
      [username.trim()]
    );
    if (r.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      const csrfToken = crypto.randomBytes(32).toString('hex');
      req.session.csrfToken = csrfToken;
      req.session.user = {
        id: user.id, name: user.name, username: user.username,
        role: user.role, center_id: user.center_id, center_name: user.center_name,
        password_changed: user.password_changed,
      };
      await audit(user.id, 'LOGIN', { username });
      res.json({ user: req.session.user, csrfToken });
    });
  } catch (e) { res.status(500).json({ error: 'Authentication error' }); }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const uid = req.session.user.id;
  req.session.destroy(() => {});
  await audit(uid, 'LOGOUT');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const r = await pool.query(`SELECT password FROM users WHERE id=$1`, [req.session.user.id]);
    if (current_password) {
      const ok = await bcrypt.compare(current_password, r.rows[0].password);
      if (!ok) return res.status(400).json({ error: 'Current password incorrect' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `UPDATE users SET password=$1, password_changed=true, updated_at=NOW() WHERE id=$2`,
      [hash, req.session.user.id]
    );
    req.session.user.password_changed = true;
    await audit(req.session.user.id, 'PASSWORD_CHANGE');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
app.get('/api/config', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT key, value FROM config ORDER BY key`);
    const cfg = {};
    r.rows.forEach(row => { cfg[row.key] = row.value; });
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/config', requirePerm('CONFIG_MANAGE'), async (req, res) => {
  const entries = Object.entries(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO config (key,value) VALUES ($1,$2)
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, value]
      );
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, 'CONFIG_UPDATE', { keys: entries.map(e => e[0]) });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Logo upload — auto-resize with Sharp if available
app.post('/api/config/logo', requirePerm('CONFIG_MANAGE'), async (req, res) => {
  const { logo } = req.body;
  if (!logo) return res.status(400).json({ error: 'No logo provided' });
  if (!logo.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
  if (logo.length > 5000000) return res.status(400).json({ error: 'Logo too large. Max ~3.5 MB' });
  try {
    let finalLogo = logo;
    if (sharp) {
      const base64Data = logo.split(',')[1];
      const mimeType   = logo.split(';')[0].split(':')[1];
      const imgBuffer  = Buffer.from(base64Data, 'base64');
      const resized = await sharp(imgBuffer)
        .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
        .png({ quality: 85 })
        .toBuffer();
      finalLogo = `data:image/png;base64,${resized.toString('base64')}`;
    }
    await pool.query(
      `INSERT INTO config (key,value) VALUES ('logo',$1)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [finalLogo]
    );
    await audit(req.session.user.id, 'LOGO_UPLOAD', { resized: !!sharp });
    res.json({ ok: true, resized: !!sharp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  CENTERS
// ══════════════════════════════════════════════════════════════
app.get('/api/centers', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM centers ORDER BY id`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/centers', requirePerm('CENTER_CONFIG'), async (req, res) => {
  const { name, code, address, phone, email, gstin, ae_title } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  try {
    const r = await pool.query(
      `INSERT INTO centers (name,code,address,phone,email,gstin,ae_title)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, code.toUpperCase(), address||'', phone||'', email||'', gstin||'',
       ae_title || code.toUpperCase()]
    );
    await audit(req.session.user.id, 'CENTER_CREATE', { name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/centers/:id', requirePerm('CENTER_CONFIG'), async (req, res) => {
  const { name, code, address, phone, email, gstin, ae_title, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE centers SET name=$1,code=$2,address=$3,phone=$4,email=$5,
       gstin=$6,ae_title=$7,active=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [name, code?.toUpperCase(), address, phone, email, gstin, ae_title,
       active !== false, req.params.id]
    );
    await audit(req.session.user.id, 'CENTER_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  STUDIES MASTER
// ══════════════════════════════════════════════════════════════
app.get('/api/studies', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.*, r.name AS default_radiologist_name
       FROM studies s
       LEFT JOIN radiologists r ON r.id=s.default_radiologist_id
       WHERE s.active=true ORDER BY s.modality, s.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/studies/all', requirePerm('STUDY_MASTER_VIEW'), async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.*, r.name AS default_radiologist_name
       FROM studies s
       LEFT JOIN radiologists r ON r.id=s.default_radiologist_id
       ORDER BY s.modality, s.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/studies', requirePerm('STUDY_MASTER_EDIT'), async (req, res) => {
  const { code, name, modality, category, contrast, sac, price, gst_rate,
          duration, default_radiologist_id } = req.body;
  if (!code || !name || !modality) return res.status(400).json({ error: 'code, name, modality required' });
  try {
    const r = await pool.query(
      `INSERT INTO studies (code,name,modality,category,contrast,sac,price,gst_rate,duration,default_radiologist_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, name, modality, category||'', contrast||'Plain', sac||'999316',
       price||0, gst_rate||0, duration||30, default_radiologist_id||null]
    );
    await audit(req.session.user.id, 'STUDY_CREATE', { name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/studies/:id', requirePerm('STUDY_MASTER_EDIT'), async (req, res) => {
  const { code, name, modality, category, contrast, sac, price, gst_rate,
          duration, default_radiologist_id, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE studies SET code=$1,name=$2,modality=$3,category=$4,contrast=$5,
       sac=$6,price=$7,gst_rate=$8,duration=$9,default_radiologist_id=$10,
       active=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [code, name, modality, category||'', contrast||'Plain', sac||'999316',
       price||0, gst_rate||0, duration||30, default_radiologist_id||null,
       active !== false, req.params.id]
    );
    await audit(req.session.user.id, 'STUDY_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Tariffs ──────────────────────────────────────────────────
app.get('/api/tariffs', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT t.*, s.name AS study_name, c.name AS center_name
       FROM tariffs t
       JOIN studies s ON s.id=t.study_id
       JOIN centers c ON c.id=t.center_id
       ORDER BY c.name, s.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tariffs', requirePerm('STUDY_MASTER_EDIT'), async (req, res) => {
  const { study_id, center_id, price } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO tariffs (study_id,center_id,price)
       VALUES ($1,$2,$3)
       ON CONFLICT (study_id,center_id) DO UPDATE SET price=$3, updated_at=NOW()
       RETURNING *`,
      [study_id, center_id, price]
    );
    await audit(req.session.user.id, 'TARIFF_SET', { study_id, center_id, price });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  PATIENTS
// ══════════════════════════════════════════════════════════════
app.get('/api/patients', requirePerm('PATIENT_VIEW'), async (req, res) => {
  const { q, limit = 50 } = req.query;
  try {
    let rows;
    if (q) {
      const r = await pool.query(
        `SELECT * FROM patients
         WHERE name ILIKE $1 OR phone ILIKE $1 OR pid ILIKE $1
         ORDER BY name LIMIT $2`,
        [`%${q}%`, limit]
      );
      rows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT * FROM patients ORDER BY created_at DESC LIMIT $1`, [limit]
      );
      rows = r.rows;
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/patients/:id', requirePerm('PATIENT_VIEW'), async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM patients WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Patient not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/patients', requirePerm('PATIENT_EDIT'), async (req, res) => {
  let { pid, name, dob, gender, phone, email, address, ref_doctor } = req.body;

if (!name) return res.status(400).json({ error: 'name required' });

if (!pid) {
  const r = await pool.query(
    `SELECT pid FROM patients WHERE pid LIKE 'ARIS%' ORDER BY created_at DESC LIMIT 1`
  );

  let next = 1;

  if (r.rows.length) {
    const num = parseInt(r.rows[0].pid.replace('ARIS',''),10);
    if (!isNaN(num)) next = num + 1;
  }

  pid = 'ARIS' + String(next).padStart(8,'0');
}

  try {
    const r = await pool.query(
      `INSERT INTO patients (pid,name,dob,gender,phone,email,address,ref_doctor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [pid, name, dob||null, gender||'U', phone||'', email||'', address||'', ref_doctor||'']
    );
    await audit(req.session.user.id, 'PATIENT_CREATE', { pid, name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/patients/:id', requirePerm('PATIENT_EDIT'), async (req, res) => {
  const { name, dob, gender, phone, email, address, ref_doctor } = req.body;
  try {
    const r = await pool.query(
      `UPDATE patients SET name=$1,dob=$2,gender=$3,phone=$4,email=$5,
       address=$6,ref_doctor=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, dob||null, gender||'U', phone||'', email||'', address||'',
       ref_doctor||'', req.params.id]
    );
    await audit(req.session.user.id, 'PATIENT_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generate next PID
app.get('/api/patients/next-pid', requireAuth, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT pid FROM patients WHERE pid ~ '^PAT[0-9]+$' ORDER BY pid DESC LIMIT 1`
    );
    let next = 'PAT000001';
    if (r.rows.length) {
      const num = parseInt(r.rows[0].pid.replace('PAT','')) + 1;
      next = 'PAT' + String(num).padStart(6, '0');
    }
    res.json({ pid: next });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  REFERRING DOCTORS  (v3.0)
// ══════════════════════════════════════════════════════════════
app.get('/api/referring-doctors', requireAuth, async (req, res) => {
  const { center_id, q } = req.query;
  try {
    let sql = `SELECT rd.*, c.name AS center_name
               FROM referring_doctors rd
               LEFT JOIN centers c ON c.id=rd.center_id
               WHERE rd.active=true`;
    const params = [];
    if (center_id) { params.push(center_id); sql += ` AND (rd.center_id=$${params.length} OR rd.center_id IS NULL)`; }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (rd.first_name ILIKE $${params.length} OR rd.last_name ILIKE $${params.length} OR rd.clinic_name ILIKE $${params.length} OR rd.phone ILIKE $${params.length})`;
    }
    sql += ` ORDER BY rd.last_name, rd.first_name`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/referring-doctors/:id', requirePerm('DOCTOR_MASTER_VIEW'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rd.*, c.name AS center_name FROM referring_doctors rd
       LEFT JOIN centers c ON c.id=rd.center_id WHERE rd.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/referring-doctors', requirePerm('DOCTOR_MASTER_EDIT'), async (req, res) => {
  const { center_id, first_name, last_name, qualification, specialization,
          clinic_name, phone, email, registration_no, address } = req.body;
  if (!first_name) return res.status(400).json({ error: 'first_name required' });
  try {
    const r = await pool.query(
      `INSERT INTO referring_doctors
       (center_id,first_name,last_name,qualification,specialization,clinic_name,phone,email,registration_no,address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [center_id||null, first_name, last_name||'', qualification||'',
       specialization||'', clinic_name||'', phone||'', email||'',
       registration_no||'', address||'']
    );
    await audit(req.session.user.id, 'DOCTOR_CREATE', { first_name, last_name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/referring-doctors/:id', requirePerm('DOCTOR_MASTER_EDIT'), async (req, res) => {
  const { center_id, first_name, last_name, qualification, specialization,
          clinic_name, phone, email, registration_no, address, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE referring_doctors SET center_id=$1,first_name=$2,last_name=$3,
       qualification=$4,specialization=$5,clinic_name=$6,phone=$7,email=$8,
       registration_no=$9,address=$10,active=$11,updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [center_id||null, first_name, last_name||'', qualification||'',
       specialization||'', clinic_name||'', phone||'', email||'',
       registration_no||'', address||'', active !== false, req.params.id]
    );
    await audit(req.session.user.id, 'DOCTOR_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/referring-doctors/:id', requirePerm('DOCTOR_MASTER_EDIT'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM referring_doctors WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'DOCTOR_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  RADIOLOGISTS  (v3.0)
// ══════════════════════════════════════════════════════════════
app.get('/api/radiologists', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, c.name AS center_name FROM radiologists r
       LEFT JOIN centers c ON c.id=r.center_id
       WHERE r.active=true ORDER BY r.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/radiologists/all', requirePerm('RADIOLOGIST_VIEW'), async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, c.name AS center_name FROM radiologists r
       LEFT JOIN centers c ON c.id=r.center_id ORDER BY r.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/radiologists/:id', requirePerm('RADIOLOGIST_VIEW'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, c.name AS center_name FROM radiologists r
       LEFT JOIN centers c ON c.id=r.center_id WHERE r.id=$1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/radiologists', requirePerm('RADIOLOGIST_EDIT'), async (req, res) => {
  const { type, name, qualification, registration_no, center_id, phone, email,
          address, payment_terms, contract_cost_per_study, monthly_retainer,
          modality_scope, contract_start_date, contract_end_date, contract_doc_ref } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query(
      `INSERT INTO radiologists
       (type,name,qualification,registration_no,center_id,phone,email,address,
        payment_terms,contract_cost_per_study,monthly_retainer,modality_scope,
        contract_start_date,contract_end_date,contract_doc_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [type||'Individual', name, qualification||'', registration_no||'',
       center_id||null, phone||'', email||'', address||'',
       payment_terms||'Per Study', contract_cost_per_study||0, monthly_retainer||0,
       modality_scope||'*', contract_start_date||null, contract_end_date||null,
       contract_doc_ref||'']
    );
    await audit(req.session.user.id, 'RADIOLOGIST_CREATE', { name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/radiologists/:id', requirePerm('RADIOLOGIST_EDIT'), async (req, res) => {
  const { type, name, qualification, registration_no, center_id, phone, email,
          address, payment_terms, contract_cost_per_study, monthly_retainer,
          modality_scope, contract_start_date, contract_end_date, contract_doc_ref, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE radiologists SET type=$1,name=$2,qualification=$3,registration_no=$4,
       center_id=$5,phone=$6,email=$7,address=$8,payment_terms=$9,
       contract_cost_per_study=$10,monthly_retainer=$11,modality_scope=$12,
       contract_start_date=$13,contract_end_date=$14,contract_doc_ref=$15,
       active=$16,updated_at=NOW() WHERE id=$17 RETURNING *`,
      [type||'Individual', name, qualification||'', registration_no||'',
       center_id||null, phone||'', email||'', address||'',
       payment_terms||'Per Study', contract_cost_per_study||0, monthly_retainer||0,
       modality_scope||'*', contract_start_date||null, contract_end_date||null,
       contract_doc_ref||'', active !== false, req.params.id]
    );
    await audit(req.session.user.id, 'RADIOLOGIST_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/radiologists/:id', requirePerm('RADIOLOGIST_EDIT'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM radiologists WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'RADIOLOGIST_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Study Radiologist Mapping ────────────────────────────────
app.get('/api/study-radiologist', requirePerm('RADIOLOGIST_VIEW'), async (req, res) => {
  const { bill_id, radiologist_id, report_status, from, to, center_id } = req.query;
  try {
    let sql = `
      SELECT srm.*, r.name AS radiologist_name, r.type AS radiologist_type,
             b.bill_no, b.date AS bill_date, b.center_id,
             p.name AS patient_name, p.pid,
             bi.study_name, bi.modality,
             c.name AS center_name
      FROM study_radiologist_mapping srm
      JOIN radiologists r ON r.id=srm.radiologist_id
      JOIN bills b ON b.id=srm.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN bill_items bi ON bi.id=srm.bill_item_id
      LEFT JOIN centers c ON c.id=b.center_id
      WHERE 1=1`;
    const params = [];
    if (bill_id)         { params.push(bill_id);         sql += ` AND srm.bill_id=$${params.length}`; }
    if (radiologist_id)  { params.push(radiologist_id);  sql += ` AND srm.radiologist_id=$${params.length}`; }
    if (report_status)   { params.push(report_status);   sql += ` AND srm.report_status=$${params.length}`; }
    if (center_id)       { params.push(center_id);       sql += ` AND b.center_id=$${params.length}`; }
    if (from)            { params.push(from);             sql += ` AND b.date::date>=$${params.length}`; }
    if (to)              { params.push(to);               sql += ` AND b.date::date<=$${params.length}`; }
    sql += ` ORDER BY srm.assigned_at DESC`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/study-radiologist', requirePerm('RADIOLOGIST_ASSIGN'), async (req, res) => {
  const { bill_id, bill_item_id, radiologist_id, notes } = req.body;
  if (!bill_id || !radiologist_id) return res.status(400).json({ error: 'bill_id and radiologist_id required' });
  try {
    // Get radiologist cost at time of assignment
    const rr = await pool.query(`SELECT contract_cost_per_study FROM radiologists WHERE id=$1`, [radiologist_id]);
    if (!rr.rows.length) return res.status(404).json({ error: 'Radiologist not found' });
    const cost = rr.rows[0].contract_cost_per_study;
    const r = await pool.query(
      `INSERT INTO study_radiologist_mapping
       (bill_id, bill_item_id, radiologist_id, contract_cost_per_study, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [bill_id, bill_item_id||null, radiologist_id, cost, notes||'']
    );
    await audit(req.session.user.id, 'RADIOLOGIST_ASSIGN', { bill_id, radiologist_id });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/study-radiologist/:id', requirePerm('RADIOLOGIST_ASSIGN'), async (req, res) => {
  const { report_status, notes, radiologist_id, contract_cost_per_study } = req.body;
  try {
    let sql = `UPDATE study_radiologist_mapping SET notes=$1, updated_at=NOW()`;
    const params = [notes||''];
    if (report_status) {
      params.push(report_status);
      sql += `, report_status=$${params.length}`;
      if (report_status === 'Finalized' || report_status === 'Reported') {
        sql += `, reported_at=NOW()`;
      }
    }
    if (radiologist_id) { params.push(radiologist_id); sql += `, radiologist_id=$${params.length}`; }
    if (contract_cost_per_study !== undefined) {
      params.push(contract_cost_per_study);
      sql += `, contract_cost_per_study=$${params.length}`;
    }
    params.push(req.params.id);
    sql += ` WHERE id=$${params.length} RETURNING *`;
    const r = await pool.query(sql, params);
    await audit(req.session.user.id, 'RADIOLOGIST_REPORT_UPDATE', { id: req.params.id, report_status });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/study-radiologist/:id', requirePerm('RADIOLOGIST_ASSIGN'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM study_radiologist_mapping WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'STUDY_RADIOLOGIST_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════════════
app.get('/api/users', requirePerm('USER_MANAGE'), async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.username,u.role,u.center_id,u.active,
              u.password_changed,u.dashboard_preference,u.created_at,
              c.name AS center_name
       FROM users u LEFT JOIN centers c ON c.id=u.center_id ORDER BY u.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', requirePerm('USER_MANAGE'), async (req, res) => {
  const { name, username, password, role, center_id } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'name, username, password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO users (name,username,password,role,center_id,password_changed)
       VALUES ($1,$2,$3,$4,$5,false) RETURNING id,name,username,role,center_id,active,password_changed`,
      [name, username.trim().toLowerCase(), hash, role||'receptionist', center_id||null]
    );
    await audit(req.session.user.id, 'USER_CREATE', { username, role });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', requirePerm('USER_MANAGE'), async (req, res) => {
  const { name, role, center_id, active, password } = req.body;
  try {
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password min 8 characters' });
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE users SET name=$1,role=$2,center_id=$3,active=$4,
         password=$5,password_changed=false,updated_at=NOW() WHERE id=$6`,
        [name, role, center_id||null, active !== false, hash, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$1,role=$2,center_id=$3,active=$4,updated_at=NOW() WHERE id=$5`,
        [name, role, center_id||null, active !== false, req.params.id]
      );
    }
    await audit(req.session.user.id, 'USER_UPDATE', { id: req.params.id, role });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard preference save
app.put('/api/users/me/dashboard', requireAuth, async (req, res) => {
  const { preference } = req.body;
  try {
    await pool.query(
      `UPDATE users SET dashboard_preference=$1 WHERE id=$2`,
      [JSON.stringify(preference), req.session.user.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RBAC: Get permissions for a user/role ─────────────────────
app.get('/api/rbac/permissions', requirePerm('RBAC_MANAGE'), async (_req, res) => {
  try {
    const perms = await pool.query(`SELECT * FROM permissions ORDER BY module, code`);
    res.json(perms.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rbac/role/:role', requirePerm('RBAC_MANAGE'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rp.perm_code, rp.granted, p.module, p.description
       FROM role_permissions rp JOIN permissions p ON p.code=rp.perm_code
       WHERE rp.role=$1 ORDER BY p.module, rp.perm_code`,
      [req.params.role]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rbac/role/:role', requirePerm('RBAC_MANAGE'), async (req, res) => {
  // Body: { permissions: { PERM_CODE: true/false, ... } }
  const { permissions } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [code, granted] of Object.entries(permissions)) {
      await client.query(
        `INSERT INTO role_permissions (role, perm_code, granted) VALUES ($1,$2,$3)
         ON CONFLICT (role, perm_code) DO UPDATE SET granted=$3`,
        [req.params.role, code, !!granted]
      );
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, 'RBAC_ROLE_UPDATE', { role: req.params.role });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/rbac/user/:userId', requirePerm('RBAC_MANAGE'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT up.perm_code, up.granted, up.expiry_date, p.module, p.description
       FROM user_permissions up JOIN permissions p ON p.code=up.perm_code
       WHERE up.user_id=$1 ORDER BY p.module, up.perm_code`,
      [req.params.userId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/rbac/user/:userId', requirePerm('RBAC_MANAGE'), async (req, res) => {
  const { permissions } = req.body; // { PERM_CODE: { granted, expiry_date } }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [code, val] of Object.entries(permissions)) {
      if (val === null) {
        await client.query(`DELETE FROM user_permissions WHERE user_id=$1 AND perm_code=$2`,
          [req.params.userId, code]);
      } else {
        await client.query(
          `INSERT INTO user_permissions (user_id, perm_code, granted, expiry_date, granted_by)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_id, perm_code) DO UPDATE SET granted=$3, expiry_date=$4, updated_at=NOW()`,
          [req.params.userId, code, !!val.granted, val.expiry_date||null, req.session.user.id]
        );
      }
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, 'RBAC_USER_UPDATE', { userId: req.params.userId });
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Get effective permissions for current user
app.get('/api/rbac/my-permissions', requireAuth, async (req, res) => {
  try {
    const u = req.session.user;
    const allPerms = await pool.query(`SELECT code FROM permissions`);
    const result = {};
    for (const { code } of allPerms.rows) {
      result[code] = await hasPerm(u.id, u.role, code);
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  BILLS
// ══════════════════════════════════════════════════════════════
// Generate next accession number for a center
async function nextAccession(centerId, client) {
  const db = client || pool;
  const cr = await db.query(`SELECT code FROM centers WHERE id=$1`, [centerId]);
  const code = cr.rows[0]?.code || 'GEN';
  const year = new Date().getFullYear();
  const r = await db.query(
    `SELECT accession_no FROM bills
     WHERE center_id=$1 AND accession_no ~ $2
     ORDER BY accession_no DESC LIMIT 1`,
    [centerId, `^${code}${year}`]
  );
  let seq = 1;
  if (r.rows.length) {
    const last = r.rows[0].accession_no;
    seq = parseInt(last.slice(-6)) + 1;
  }
  return `${code}${year}${String(seq).padStart(6, '0')}`;
}

// Generate next bill number
async function nextBillNo(centerId, client) {
  const db = client || pool;
  const cr = await db.query(`SELECT code FROM centers WHERE id=$1`, [centerId]);
  const code = cr.rows[0]?.code || 'GEN';
  const yr   = String(new Date().getFullYear()).slice(2);
  const r = await db.query(
    `SELECT bill_no FROM bills WHERE center_id=$1 AND bill_no ~ $2 ORDER BY bill_no DESC LIMIT 1`,
    [centerId, `^INV-${code}-${yr}`]
  );
  let seq = 1;
  if (r.rows.length) seq = parseInt(r.rows[0].bill_no.split('-').pop()) + 1;
  return `INV-${code}-${yr}-${String(seq).padStart(5, '0')}`;
}

app.get('/api/bills', requirePerm('BILL_VIEW'), async (req, res) => {
  const { from, to, center_id, status, patient_id, mwl_status, q, limit = 100, offset = 0 } = req.query;
  const cf = centerFilter(req);
  try {
    let sql = `
      SELECT b.*, p.name AS patient_name, p.pid,
             c.name AS center_name,
             rd.first_name || ' ' || rd.last_name AS referring_doctor_name
      FROM bills b
      JOIN patients p ON p.id=b.patient_id
      JOIN centers c ON c.id=b.center_id
      LEFT JOIN referring_doctors rd ON rd.id=b.referring_doctor_id
      WHERE 1=1`;
    const params = [];
    if (cf)         { params.push(cf);      sql += ` AND b.center_id=$${params.length}`; }
    if (center_id)  { params.push(center_id); sql += ` AND b.center_id=$${params.length}`; }
    if (from)       { params.push(from);    sql += ` AND b.date::date>=$${params.length}`; }
    if (to)         { params.push(to);      sql += ` AND b.date::date<=$${params.length}`; }
    if (status)     { params.push(status);  sql += ` AND b.status=$${params.length}`; }
    if (mwl_status) { params.push(mwl_status); sql += ` AND b.mwl_status=$${params.length}`; }
    if (patient_id) { params.push(patient_id); sql += ` AND b.patient_id=$${params.length}`; }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (p.name ILIKE $${params.length} OR b.bill_no ILIKE $${params.length} OR b.accession_no ILIKE $${params.length} OR p.pid ILIKE $${params.length})`;
    }
    sql += ` ORDER BY b.date DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bills/:id', requirePerm('BILL_VIEW'), async (req, res) => {
  try {
    const bill = await pool.query(
      `SELECT b.*, p.name AS patient_name, p.pid, p.dob, p.gender, p.phone,
              c.name AS center_name, c.address AS center_address,
              c.gstin AS center_gstin, c.phone AS center_phone,
              rd.first_name || ' ' || rd.last_name AS referring_doctor_name,
              rd.qualification AS ref_doc_qual, rd.clinic_name AS ref_doc_clinic
       FROM bills b
       JOIN patients p ON p.id=b.patient_id
       JOIN centers c ON c.id=b.center_id
       LEFT JOIN referring_doctors rd ON rd.id=b.referring_doctor_id
       WHERE b.id=$1`,
      [req.params.id]
    );
    if (!bill.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const items = await pool.query(
      `SELECT * FROM bill_items WHERE bill_id=$1 ORDER BY id`, [req.params.id]
    );
    const srm = await pool.query(
      `SELECT srm.*, r.name AS radiologist_name
       FROM study_radiologist_mapping srm
       JOIN radiologists r ON r.id=srm.radiologist_id
       WHERE srm.bill_id=$1`, [req.params.id]
    );
    res.json({ ...bill.rows[0], items: items.rows, radiologist_assignments: srm.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bills', requirePerm('BILL_CREATE'), async (req, res) => {
  const {
    patient_id, center_id, date, ref_doctor, referring_doctor_id,
    items, discount, discount_type, gst_total, final_total,
    paid, payment_mode, payment_ref, notes
  } = req.body;
  if (!patient_id || !center_id || !items?.length)
    return res.status(400).json({ error: 'patient_id, center_id and items required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bill_no    = await nextBillNo(center_id, client);
    const accession  = await nextAccession(center_id, client);
    const subtotal   = items.reduce((s, i) => s + (parseFloat(i.line_total)||0), 0);
    const balance    = (parseFloat(final_total)||0) - (parseFloat(paid)||0);
    const status     = balance <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending');

    const br = await client.query(
      `INSERT INTO bills (bill_no,accession_no,patient_id,center_id,date,ref_doctor,
       referring_doctor_id,subtotal,discount,discount_type,gst_total,final_total,
       paid,balance,status,payment_mode,payment_ref,notes,mwl_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'Scheduled')
       RETURNING *`,
      [bill_no, accession, patient_id, center_id,
       date || new Date().toISOString(), ref_doctor||'',
       referring_doctor_id||null, subtotal,
       discount||0, discount_type||'flat', gst_total||0,
       final_total||subtotal, paid||0, balance, status,
       payment_mode||'Cash', payment_ref||'', notes||'']
    );
    const bill = br.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO bill_items (bill_id,study_id,study_name,modality,sac,qty,price,gst_rate,gst_amt,line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [bill.id, item.study_id||null, item.study_name, item.modality||'',
         item.sac||'999316', item.qty||1, item.price||0, item.gst_rate||0,
         item.gst_amt||0, item.line_total||0]
      );
    }

    if (paid > 0) {
      await client.query(
        `INSERT INTO collections (bill_id,center_id,amount,mode,ref,collected_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [bill.id, center_id, paid, payment_mode||'Cash', payment_ref||'', req.session.user.id]
      );
    }

    // Auto-assign default radiologist if study has one
    const billItems = await client.query(
      `SELECT bi.id, bi.study_id, s.default_radiologist_id, s.modality
       FROM bill_items bi JOIN studies s ON s.id=bi.study_id
       WHERE bi.bill_id=$1 AND s.default_radiologist_id IS NOT NULL`, [bill.id]
    );
    for (const item of billItems.rows) {
      const rr = await client.query(
        `SELECT contract_cost_per_study FROM radiologists WHERE id=$1 AND active=true`,
        [item.default_radiologist_id]
      );
      if (rr.rows.length) {
        await client.query(
          `INSERT INTO study_radiologist_mapping (bill_id,bill_item_id,radiologist_id,contract_cost_per_study)
           VALUES ($1,$2,$3,$4)`,
          [bill.id, item.id, item.default_radiologist_id, rr.rows[0].contract_cost_per_study]
        );
      }
    }

    await client.query('COMMIT');
    await audit(req.session.user.id, 'BILL_CREATE', { bill_no, final_total });
    res.status(201).json(bill);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.put('/api/bills/:id', requirePerm('BILL_EDIT'), async (req, res) => {
  const { ref_doctor, referring_doctor_id, discount, discount_type,
          gst_total, final_total, paid, payment_mode, payment_ref, notes,
          mwl_status, mwl_completed_at } = req.body;
  try {
    const balance = (parseFloat(final_total)||0) - (parseFloat(paid)||0);
    const status  = balance <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending');
    const r = await pool.query(
      `UPDATE bills SET ref_doctor=$1,referring_doctor_id=$2,discount=$3,
       discount_type=$4,gst_total=$5,final_total=$6,paid=$7,balance=$8,
       status=$9,payment_mode=$10,payment_ref=$11,notes=$12,
       mwl_status=COALESCE($13,mwl_status),
       mwl_completed_at=COALESCE($14,mwl_completed_at),
       updated_at=NOW() WHERE id=$15 RETURNING *`,
      [ref_doctor||'', referring_doctor_id||null, discount||0, discount_type||'flat',
       gst_total||0, final_total||0, paid||0, balance, status,
       payment_mode||'Cash', payment_ref||'', notes||'',
       mwl_status||null, mwl_completed_at||null, req.params.id]
    );
    await audit(req.session.user.id, 'BILL_UPDATE', { id: req.params.id });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bills/:id', requirePerm('BILL_VOID'), async (req, res) => {
  try {
    await pool.query(`UPDATE bills SET status='Void', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await audit(req.session.user.id, 'BILL_VOID', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Collections ──────────────────────────────────────────────
app.get('/api/collections', requirePerm('COLLECTION_VIEW'), async (req, res) => {
  const { from, to, center_id, limit = 200 } = req.query;
  const cf = centerFilter(req);
  try {
    let sql = `
      SELECT col.*, b.bill_no, p.name AS patient_name, u.name AS collector_name
      FROM collections col
      JOIN bills b ON b.id=col.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN users u ON u.id=col.collected_by
      WHERE 1=1`;
    const params = [];
    if (cf)        { params.push(cf);        sql += ` AND col.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); sql += ` AND col.center_id=$${params.length}`; }
    if (from)      { params.push(from);      sql += ` AND col.date::date>=$${params.length}`; }
    if (to)        { params.push(to);        sql += ` AND col.date::date<=$${params.length}`; }
    params.push(limit);
    sql += ` ORDER BY col.date DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/collections', requirePerm('COLLECTION_CREATE'), async (req, res) => {
  const { bill_id, center_id, amount, mode, ref } = req.body;
  if (!bill_id || !amount) return res.status(400).json({ error: 'bill_id and amount required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO collections (bill_id,center_id,amount,mode,ref,collected_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [bill_id, center_id, amount, mode||'Cash', ref||'', req.session.user.id]
    );
    // Update bill paid/balance
    await client.query(
      `UPDATE bills SET paid=paid+$1, balance=balance-$1,
       status=CASE WHEN (balance-$1)<=0 THEN 'Paid' ELSE 'Partial' END,
       updated_at=NOW() WHERE id=$2`,
      [amount, bill_id]
    );
    await client.query('COMMIT');
    await audit(req.session.user.id, 'COLLECTION_ADD', { bill_id, amount });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════
//  VENDORS
// ══════════════════════════════════════════════════════════════
app.get('/api/vendors', requireAuth, async (req, res) => {
  const { active = 'true' } = req.query;
  try {
    const r = await pool.query(
      `SELECT * FROM vendors WHERE active=$1 ORDER BY name`, [active === 'true']
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vendors', requirePerm('PAYABLE_CREATE'), async (req, res) => {
  const { name, cat, gstin, phone, addr, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query(
      `INSERT INTO vendors (name,cat,gstin,phone,addr,email)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, cat||'', gstin||'', phone||'', addr||'', email||'']
    );
    await audit(req.session.user.id, 'VENDOR_CREATE', { name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/vendors/:id', requirePerm('PAYABLE_CREATE'), async (req, res) => {
  const { name, cat, gstin, phone, addr, email, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE vendors SET name=$1,cat=$2,gstin=$3,phone=$4,addr=$5,email=$6,active=$7,updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, cat||'', gstin||'', phone||'', addr||'', email||'', active !== false, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  PAYABLES
// ══════════════════════════════════════════════════════════════
app.get('/api/payables', requirePerm('PAYABLE_VIEW'), async (req, res) => {
  const { from, to, center_id, status, vendor_id } = req.query;
  const cf = centerFilter(req);
  try {
    let sql = `
      SELECT p.*, v.name AS vendor_name, c.name AS center_name
      FROM payables p
      LEFT JOIN vendors v ON v.id=p.vendor_id
      LEFT JOIN centers c ON c.id=p.center_id
      WHERE 1=1`;
    const params = [];
    if (cf)        { params.push(cf);        sql += ` AND p.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); sql += ` AND p.center_id=$${params.length}`; }
    if (vendor_id) { params.push(vendor_id); sql += ` AND p.vendor_id=$${params.length}`; }
    if (from)      { params.push(from);      sql += ` AND p.date>=$${params.length}`; }
    if (to)        { params.push(to);        sql += ` AND p.date<=$${params.length}`; }
    if (status)    { params.push(status);    sql += ` AND p.status=$${params.length}`; }
    sql += ` ORDER BY p.date DESC LIMIT 500`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payables', requirePerm('PAYABLE_CREATE'), async (req, res) => {
  const { vendor_id, center_id, ref_no, date, due_date, amount, gst_amt, description } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount required' });
  try {
    const r = await pool.query(
      `INSERT INTO payables (vendor_id,center_id,ref_no,date,due_date,amount,gst_amt,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [vendor_id||null, center_id||null, ref_no||'',
       date||new Date().toISOString().slice(0,10), due_date||null,
       amount, gst_amt||0, description||'']
    );
    await audit(req.session.user.id, 'PAYABLE_CREATE', { amount, vendor_id });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/payables/:id', requirePerm('PAYABLE_APPROVE'), async (req, res) => {
  const { status, paid_amt, paid_date, paid_mode, ref_no, due_date, description } = req.body;
  try {
    const r = await pool.query(
      `UPDATE payables SET status=COALESCE($1,status),paid_amt=COALESCE($2,paid_amt),
       paid_date=COALESCE($3,paid_date),paid_mode=COALESCE($4,paid_mode),
       ref_no=COALESCE($5,ref_no),due_date=COALESCE($6,due_date),
       description=COALESCE($7,description),updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [status||null, paid_amt||null, paid_date||null, paid_mode||null,
       ref_no||null, due_date||null, description||null, req.params.id]
    );
    await audit(req.session.user.id, 'PAYABLE_UPDATE', { id: req.params.id, status });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  FIXED ASSETS  (v3.0)
// ══════════════════════════════════════════════════════════════
app.get('/api/assets', requirePerm('ASSET_VIEW'), async (req, res) => {
  const { center_id, category, status } = req.query;
  try {
    let sql = `
      SELECT fa.*, c.name AS center_name, v.name AS vendor_name
      FROM fixed_assets fa
      JOIN centers c ON c.id=fa.center_id
      LEFT JOIN vendors v ON v.id=fa.vendor_id
      WHERE 1=1`;
    const params = [];
    if (center_id) { params.push(center_id); sql += ` AND fa.center_id=$${params.length}`; }
    if (category)  { params.push(category);  sql += ` AND fa.category=$${params.length}`; }
    if (status)    { params.push(status);    sql += ` AND fa.status=$${params.length}`; }
    sql += ` ORDER BY fa.asset_code`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/assets/:id', requirePerm('ASSET_VIEW'), async (req, res) => {
  try {
    const asset = await pool.query(
      `SELECT fa.*, c.name AS center_name, v.name AS vendor_name
       FROM fixed_assets fa
       JOIN centers c ON c.id=fa.center_id
       LEFT JOIN vendors v ON v.id=fa.vendor_id
       WHERE fa.id=$1`, [req.params.id]
    );
    if (!asset.rows.length) return res.status(404).json({ error: 'Asset not found' });
    const contracts = await pool.query(
      `SELECT asc2.*, v.name AS vendor_name FROM asset_service_contracts asc2
       LEFT JOIN vendors v ON v.id=asc2.vendor_id
       WHERE asc2.asset_id=$1 ORDER BY asc2.start_date DESC`, [req.params.id]
    );
    const maintenance = await pool.query(
      `SELECT * FROM asset_maintenance_records WHERE asset_id=$1 ORDER BY date DESC LIMIT 20`,
      [req.params.id]
    );
    const depreciation = await pool.query(
      `SELECT * FROM asset_depreciation_schedules WHERE asset_id=$1 ORDER BY fiscal_year DESC`,
      [req.params.id]
    );
    res.json({
      ...asset.rows[0],
      contracts: contracts.rows,
      maintenance: maintenance.rows,
      depreciation: depreciation.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets', requirePerm('ASSET_CREATE'), async (req, res) => {
  const {
    asset_code, center_id, vendor_id, asset_name, category, sub_category,
    condition, serial_number, model_number, manufacturer, location,
    acquisition_date, acquisition_cost, installation_cost, salvage_value,
    depreciation_method, useful_life_years, wdv_rate,
    warranty_expiry_date, insurance_policy_no, insurance_expiry_date, notes
  } = req.body;
  if (!asset_code || !center_id || !asset_name)
    return res.status(400).json({ error: 'asset_code, center_id, asset_name required' });
  try {
    const depCost = (parseFloat(acquisition_cost)||0) + (parseFloat(installation_cost)||0);
    const r = await pool.query(
      `INSERT INTO fixed_assets
       (asset_code,center_id,vendor_id,asset_name,category,sub_category,condition,
        serial_number,model_number,manufacturer,location,acquisition_date,
        acquisition_cost,installation_cost,salvage_value,depreciation_method,
        useful_life_years,wdv_rate,current_book_value,
        warranty_expiry_date,insurance_policy_no,insurance_expiry_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [asset_code, center_id, vendor_id||null, asset_name,
       category||'Equipment', sub_category||'', condition||'New',
       serial_number||'', model_number||'', manufacturer||'', location||'',
       acquisition_date||new Date().toISOString().slice(0,10),
       acquisition_cost||0, installation_cost||0, salvage_value||0,
       depreciation_method||'SLM', useful_life_years||5, wdv_rate||0, depCost,
       warranty_expiry_date||null, insurance_policy_no||'',
       insurance_expiry_date||null, notes||'']
    );
    await audit(req.session.user.id, 'ASSET_CREATE', { asset_code, asset_name });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Asset code already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/assets/:id', requirePerm('ASSET_EDIT'), async (req, res) => {
  const {
    asset_name, category, sub_category, condition, serial_number,
    model_number, manufacturer, location, salvage_value, useful_life_years,
    wdv_rate, depreciation_method, warranty_expiry_date, insurance_policy_no,
    insurance_expiry_date, status, disposal_date, disposal_amount, disposal_reason, notes
  } = req.body;
  try {
    const r = await pool.query(
      `UPDATE fixed_assets SET asset_name=$1,category=$2,sub_category=$3,condition=$4,
       serial_number=$5,model_number=$6,manufacturer=$7,location=$8,salvage_value=$9,
       useful_life_years=$10,wdv_rate=$11,depreciation_method=$12,warranty_expiry_date=$13,
       insurance_policy_no=$14,insurance_expiry_date=$15,status=$16,
       disposal_date=$17,disposal_amount=$18,disposal_reason=$19,notes=$20,updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [asset_name, category||'Equipment', sub_category||'', condition||'New',
       serial_number||'', model_number||'', manufacturer||'', location||'',
       salvage_value||0, useful_life_years||5, wdv_rate||0, depreciation_method||'SLM',
       warranty_expiry_date||null, insurance_policy_no||'', insurance_expiry_date||null,
       status||'Active', disposal_date||null, disposal_amount||0, disposal_reason||'',
       notes||'', req.params.id]
    );
    await audit(req.session.user.id, 'ASSET_UPDATE', { id: req.params.id, status });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/assets/:id', requirePerm('ASSET_EDIT'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM fixed_assets WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'ASSET_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Asset Depreciation ───────────────────────────────────────
// Calculate (preview) depreciation for a fiscal year
app.post('/api/assets/depreciation/calculate', requirePerm('ASSET_VIEW'), async (req, res) => {
  const { fiscal_year, center_id } = req.body;
  if (!fiscal_year) return res.status(400).json({ error: 'fiscal_year required' });
  try {
    const assets = await pool.query(
      `SELECT * FROM fixed_assets WHERE status='Active'${center_id ? ' AND center_id=$1' : ''}
       ORDER BY asset_code`,
      center_id ? [center_id] : []
    );
    const results = [];
    for (const a of assets.rows) {
      const existing = await pool.query(
        `SELECT * FROM asset_depreciation_schedules WHERE asset_id=$1 AND fiscal_year=$2`,
        [a.id, fiscal_year]
      );
      const openingValue = parseFloat(a.current_book_value) || parseFloat(a.acquisition_cost) + parseFloat(a.installation_cost);
      let deprAmt = 0;
      let rate = 0;
      if (a.depreciation_method === 'SLM') {
        const depCost = parseFloat(a.acquisition_cost) + parseFloat(a.installation_cost);
        rate = ((depCost - parseFloat(a.salvage_value)) / parseFloat(a.useful_life_years) / depCost) * 100;
        deprAmt = (depCost - parseFloat(a.salvage_value)) / parseFloat(a.useful_life_years);
      } else { // WDV
        rate = parseFloat(a.wdv_rate);
        deprAmt = openingValue * (rate / 100);
      }
      deprAmt = Math.min(deprAmt, openingValue - parseFloat(a.salvage_value));
      deprAmt = Math.max(0, deprAmt);
      results.push({
        asset_id: a.id, asset_code: a.asset_code, asset_name: a.asset_name,
        fiscal_year, opening_value: openingValue,
        depreciation_amount: parseFloat(deprAmt.toFixed(2)),
        closing_value: parseFloat((openingValue - deprAmt).toFixed(2)),
        depreciation_rate: parseFloat(rate.toFixed(2)),
        already_posted: existing.rows.length > 0 && existing.rows[0].depreciation_posted
      });
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Post depreciation for fiscal year
app.post('/api/assets/depreciation/post', requirePerm('ASSET_DEPRECIATION_POST'), async (req, res) => {
  const { fiscal_year, entries } = req.body; // entries: [{asset_id, opening_value, depreciation_amount, closing_value, depreciation_rate}]
  if (!fiscal_year || !entries?.length) return res.status(400).json({ error: 'fiscal_year and entries required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      await client.query(
        `INSERT INTO asset_depreciation_schedules
         (asset_id,fiscal_year,opening_value,depreciation_amount,closing_value,depreciation_rate,depreciation_posted,posted_at,posted_by)
         VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),$7)
         ON CONFLICT (asset_id,fiscal_year) DO UPDATE SET
         depreciation_amount=$4,closing_value=$5,depreciation_rate=$6,
         depreciation_posted=true,posted_at=NOW(),posted_by=$7`,
        [e.asset_id, fiscal_year, e.opening_value, e.depreciation_amount,
         e.closing_value, e.depreciation_rate, req.session.user.id]
      );
      await client.query(
        `UPDATE fixed_assets SET current_book_value=$1,updated_at=NOW() WHERE id=$2`,
        [e.closing_value, e.asset_id]
      );
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, 'DEPRECIATION_POSTED', { fiscal_year, count: entries.length });
    res.json({ ok: true, posted: entries.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ─── Asset Service Contracts ──────────────────────────────────
app.get('/api/asset-contracts', requirePerm('ASSET_VIEW'), async (req, res) => {
  const { asset_id, status } = req.query;
  try {
    let sql = `
      SELECT asc2.*, fa.asset_name, fa.asset_code, v.name AS vendor_name, c.name AS center_name
      FROM asset_service_contracts asc2
      JOIN fixed_assets fa ON fa.id=asc2.asset_id
      JOIN centers c ON c.id=fa.center_id
      LEFT JOIN vendors v ON v.id=asc2.vendor_id
      WHERE 1=1`;
    const params = [];
    if (asset_id) { params.push(asset_id); sql += ` AND asc2.asset_id=$${params.length}`; }
    if (status)   { params.push(status);   sql += ` AND asc2.status=$${params.length}`; }
    sql += ` ORDER BY asc2.end_date DESC`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Contracts expiring soon
app.get('/api/asset-contracts/expiring', requireAuth, async (req, res) => {
  const { days = 30 } = req.query;
  try {
    const r = await pool.query(
      `SELECT asc2.id, fa.asset_code, fa.asset_name, asc2.contract_type,
              asc2.end_date, (asc2.end_date - CURRENT_DATE) AS days_remaining
       FROM asset_service_contracts asc2 JOIN fixed_assets fa ON fa.id=asc2.asset_id
       WHERE asc2.status='Active' AND asc2.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int
       ORDER BY asc2.end_date LIMIT 5`,
      [days]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asset-contracts', requirePerm('ASSET_CONTRACT_MANAGE'), async (req, res) => {
  const { asset_id, vendor_id, contract_type, contract_ref_no, start_date, end_date,
          annual_cost, coverage_details, response_time_sla, renewal_reminder_days } = req.body;
  if (!asset_id || !start_date || !end_date)
    return res.status(400).json({ error: 'asset_id, start_date, end_date required' });
  try {
    const r = await pool.query(
      `INSERT INTO asset_service_contracts
       (asset_id,vendor_id,contract_type,contract_ref_no,start_date,end_date,
        annual_cost,coverage_details,response_time_sla,renewal_reminder_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [asset_id, vendor_id||null, contract_type||'AMC', contract_ref_no||'',
       start_date, end_date, annual_cost||0, coverage_details||'',
       response_time_sla||'', renewal_reminder_days||30]
    );
    await audit(req.session.user.id, 'ASSET_CONTRACT_CREATE', { asset_id, contract_type });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/asset-contracts/:id', requirePerm('ASSET_CONTRACT_MANAGE'), async (req, res) => {
  const { vendor_id, contract_type, contract_ref_no, start_date, end_date,
          annual_cost, coverage_details, response_time_sla, renewal_reminder_days, status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE asset_service_contracts SET vendor_id=$1,contract_type=$2,contract_ref_no=$3,
       start_date=$4,end_date=$5,annual_cost=$6,coverage_details=$7,response_time_sla=$8,
       renewal_reminder_days=$9,status=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [vendor_id||null, contract_type||'AMC', contract_ref_no||'',
       start_date, end_date, annual_cost||0, coverage_details||'',
       response_time_sla||'', renewal_reminder_days||30, status||'Active', req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/asset-contracts/:id', requirePerm('ASSET_CONTRACT_MANAGE'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM asset_service_contracts WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'ASSET_CONTRACT_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Asset Maintenance Records ────────────────────────────────
app.get('/api/asset-maintenance', requirePerm('ASSET_VIEW'), async (req, res) => {
  const { asset_id, from, to, maintenance_type } = req.query;
  try {
    let sql = `
      SELECT amr.*, fa.asset_name, fa.asset_code, fa.center_id,
             v.name AS vendor_name, c.name AS center_name,
             u.name AS recorded_by_name
      FROM asset_maintenance_records amr
      JOIN fixed_assets fa ON fa.id=amr.asset_id
      JOIN centers c ON c.id=fa.center_id
      LEFT JOIN vendors v ON v.id=amr.vendor_id
      LEFT JOIN users u ON u.id=amr.recorded_by
      WHERE 1=1`;
    const params = [];
    if (asset_id)         { params.push(asset_id);         sql += ` AND amr.asset_id=$${params.length}`; }
    if (maintenance_type) { params.push(maintenance_type); sql += ` AND amr.maintenance_type=$${params.length}`; }
    if (from)             { params.push(from);             sql += ` AND amr.date>=$${params.length}`; }
    if (to)               { params.push(to);               sql += ` AND amr.date<=$${params.length}`; }
    sql += ` ORDER BY amr.date DESC LIMIT 200`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asset-maintenance', requirePerm('ASSET_MAINTENANCE_LOG'), async (req, res) => {
  const { asset_id, service_contract_id, vendor_id, maintenance_type, date,
          description, labor_cost, parts_cost, other_cost, downtime_hours,
          next_service_date, performed_by, status, notes } = req.body;
  if (!asset_id) return res.status(400).json({ error: 'asset_id required' });
  try {
    const r = await pool.query(
      `INSERT INTO asset_maintenance_records
       (asset_id,service_contract_id,vendor_id,maintenance_type,date,description,
        labor_cost,parts_cost,other_cost,downtime_hours,next_service_date,
        performed_by,recorded_by,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [asset_id, service_contract_id||null, vendor_id||null, maintenance_type||'Preventive',
       date||new Date().toISOString().slice(0,10), description||'',
       labor_cost||0, parts_cost||0, other_cost||0, downtime_hours||0,
       next_service_date||null, performed_by||'', req.session.user.id,
       status||'Completed', notes||'']
    );
    // If breakdown, update asset status
    if (maintenance_type === 'Breakdown') {
      await pool.query(
        `UPDATE fixed_assets SET status='Under Maintenance',updated_at=NOW() WHERE id=$1`,
        [asset_id]
      );
    }
    await audit(req.session.user.id, 'MAINTENANCE_LOG', { asset_id, maintenance_type });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/asset-maintenance/:id', requirePerm('ASSET_MAINTENANCE_LOG'), async (req, res) => {
  const { description, labor_cost, parts_cost, other_cost, downtime_hours,
          next_service_date, performed_by, status, notes } = req.body;
  try {
    const r = await pool.query(
      `UPDATE asset_maintenance_records SET description=$1,labor_cost=$2,parts_cost=$3,
       other_cost=$4,downtime_hours=$5,next_service_date=$6,performed_by=$7,
       status=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [description||'', labor_cost||0, parts_cost||0, other_cost||0,
       downtime_hours||0, next_service_date||null, performed_by||'',
       status||'Completed', notes||'', req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/asset-maintenance/:id', requirePerm('ASSET_MAINTENANCE_LOG'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM asset_maintenance_records WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'MAINTENANCE_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Asset Spare Parts ────────────────────────────────────────
app.get('/api/asset-spare-parts', requirePerm('ASSET_VIEW'), async (req, res) => {
  const { asset_id, center_id } = req.query;
  try {
    let sql = `
      SELECT asp.*, fa.asset_name, fa.asset_code, c.name AS center_name, v.name AS vendor_name
      FROM asset_spare_parts asp
      LEFT JOIN fixed_assets fa ON fa.id=asp.asset_id
      JOIN centers c ON c.id=asp.center_id
      LEFT JOIN vendors v ON v.id=asp.vendor_id
      WHERE 1=1`;
    const params = [];
    if (asset_id)  { params.push(asset_id);  sql += ` AND asp.asset_id=$${params.length}`; }
    if (center_id) { params.push(center_id); sql += ` AND asp.center_id=$${params.length}`; }
    sql += ` ORDER BY asp.part_name`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/asset-spare-parts', requirePerm('ASSET_EDIT'), async (req, res) => {
  const { asset_id, center_id, vendor_id, part_code, part_name, unit, unit_cost, current_stock, reorder_level } = req.body;
  if (!center_id || !part_name) return res.status(400).json({ error: 'center_id and part_name required' });
  try {
    const r = await pool.query(
      `INSERT INTO asset_spare_parts (asset_id,center_id,vendor_id,part_code,part_name,unit,unit_cost,current_stock,reorder_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [asset_id||null, center_id, vendor_id||null, part_code||'', part_name,
       unit||'Nos', unit_cost||0, current_stock||0, reorder_level||0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/asset-spare-parts/:id', requirePerm('ASSET_EDIT'), async (req, res) => {
  const { part_name, unit, unit_cost, current_stock, reorder_level, vendor_id } = req.body;
  try {
    const r = await pool.query(
      `UPDATE asset_spare_parts SET part_name=$1,unit=$2,unit_cost=$3,current_stock=$4,reorder_level=$5,vendor_id=$6,updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [part_name, unit||'Nos', unit_cost||0, current_stock||0, reorder_level||0, vendor_id||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  BANK ACCOUNTS & TRANSACTIONS
// ══════════════════════════════════════════════════════════════
app.get('/api/bank-accounts', requirePerm('BANK_VIEW'), async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT ba.*, c.name AS center_name FROM bank_accounts ba
       LEFT JOIN centers c ON c.id=ba.center_id WHERE ba.active=true ORDER BY ba.name`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bank-accounts', requirePerm('BANK_EDIT'), async (req, res) => {
  const { name, bank, acno, ifsc, type, center_id, balance } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO bank_accounts (name,bank,acno,ifsc,type,center_id,balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, bank||'', acno||'', ifsc||'', type||'Current', center_id||null, balance||0]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bank-transactions', requirePerm('BANK_VIEW'), async (req, res) => {
  const { account_id, from, to, limit = 200 } = req.query;
  try {
    let sql = `SELECT * FROM bank_transactions WHERE 1=1`;
    const params = [];
    if (account_id) { params.push(account_id); sql += ` AND account_id=$${params.length}`; }
    if (from)       { params.push(from);        sql += ` AND date>=$${params.length}`; }
    if (to)         { params.push(to);          sql += ` AND date<=$${params.length}`; }
    params.push(limit); sql += ` ORDER BY date DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bank-transactions', requirePerm('BANK_EDIT'), async (req, res) => {
  const { account_id, date, type, amount, description, ref_no, category } = req.body;
  if (!account_id || !amount) return res.status(400).json({ error: 'account_id and amount required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO bank_transactions (account_id,date,type,amount,description,ref_no,category)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [account_id, date||new Date().toISOString().slice(0,10), type||'Credit',
       amount, description||'', ref_no||'', category||'']
    );
    const delta = type === 'Debit' ? -parseFloat(amount) : parseFloat(amount);
    await client.query(
      `UPDATE bank_accounts SET balance=balance+$1,updated_at=NOW() WHERE id=$2`,
      [delta, account_id]
    );
    await client.query('COMMIT');
    await audit(req.session.user.id, 'BANK_TXN', { account_id, type, amount });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════
//  HR: EMPLOYEES, ATTENDANCE, PAYROLL
// ══════════════════════════════════════════════════════════════
app.get('/api/employees', requirePerm('HR_VIEW'), async (req, res) => {
  const { center_id, active = 'true' } = req.query;
  try {
    let sql = `SELECT e.*, c.name AS center_name FROM employees e
               LEFT JOIN centers c ON c.id=e.center_id WHERE e.active=$1`;
    const params = [active === 'true'];
    if (center_id) { params.push(center_id); sql += ` AND e.center_id=$${params.length}`; }
    sql += ` ORDER BY e.name`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', requirePerm('HR_EDIT'), async (req, res) => {
  const { emp_id, name, center_id, dept, designation, doj, dob, gender,
          phone, email, salary, bank_name, bank_acno, ifsc, pf_no, esi_no } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query(
      `INSERT INTO employees (emp_id,name,center_id,dept,designation,doj,dob,gender,
       phone,email,salary,bank_name,bank_acno,ifsc,pf_no,esi_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [emp_id||'', name, center_id||null, dept||'', designation||'', doj||null, dob||null,
       gender||'M', phone||'', email||'', salary||0, bank_name||'', bank_acno||'',
       ifsc||'', pf_no||'', esi_no||'']
    );
    await audit(req.session.user.id, 'EMPLOYEE_CREATE', { name });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/employees/:id', requirePerm('HR_EDIT'), async (req, res) => {
  const { name, center_id, dept, designation, doj, dob, gender, phone, email,
          salary, bank_name, bank_acno, ifsc, pf_no, esi_no, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE employees SET name=$1,center_id=$2,dept=$3,designation=$4,doj=$5,dob=$6,
       gender=$7,phone=$8,email=$9,salary=$10,bank_name=$11,bank_acno=$12,ifsc=$13,
       pf_no=$14,esi_no=$15,active=$16,updated_at=NOW() WHERE id=$17 RETURNING *`,
      [name, center_id||null, dept||'', designation||'', doj||null, dob||null,
       gender||'M', phone||'', email||'', salary||0, bank_name||'', bank_acno||'',
       ifsc||'', pf_no||'', esi_no||'', active !== false, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/attendance', requirePerm('HR_VIEW'), async (req, res) => {
  const { employee_id, month, year } = req.query;
  try {
    let sql = `SELECT a.*, e.name AS employee_name FROM attendance a
               JOIN employees e ON e.id=a.employee_id WHERE 1=1`;
    const params = [];
    if (employee_id) { params.push(employee_id); sql += ` AND a.employee_id=$${params.length}`; }
    if (month && year) {
      params.push(year, month);
      sql += ` AND EXTRACT(YEAR FROM a.date)=$${params.length-1} AND EXTRACT(MONTH FROM a.date)=$${params.length}`;
    }
    sql += ` ORDER BY a.date DESC`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/attendance/bulk', requirePerm('HR_EDIT'), async (req, res) => {
  const { records } = req.body; // [{employee_id, date, status, ot_hours}]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const rec of records) {
      await client.query(
        `INSERT INTO attendance (employee_id,date,status,ot_hours,notes)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (employee_id,date) DO UPDATE SET status=$3,ot_hours=$4,notes=$5`,
        [rec.employee_id, rec.date, rec.status||'P', rec.ot_hours||0, rec.notes||'']
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, saved: records.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/payroll', requirePerm('HR_VIEW'), async (req, res) => {
  const { month, year, center_id } = req.query;
  try {
    let sql = `
      SELECT pr.*, e.name AS employee_name, e.designation, c.name AS center_name
      FROM payroll pr JOIN employees e ON e.id=pr.employee_id
      LEFT JOIN centers c ON c.id=e.center_id WHERE 1=1`;
    const params = [];
    if (month)     { params.push(month);     sql += ` AND pr.month=$${params.length}`; }
    if (year)      { params.push(year);      sql += ` AND pr.year=$${params.length}`; }
    if (center_id) { params.push(center_id); sql += ` AND e.center_id=$${params.length}`; }
    sql += ` ORDER BY e.name`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payroll', requirePerm('PAYROLL_PROCESS'), async (req, res) => {
  const { employee_id, month, year, working_days, present_days, absent_days,
          ot_hours, basic, gross, deduction, pf_employee, pf_employer, esi, net } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO payroll (employee_id,month,year,working_days,present_days,absent_days,
       ot_hours,basic,gross,deduction,pf_employee,pf_employer,esi,net)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (employee_id,month,year) DO UPDATE SET
       working_days=$4,present_days=$5,absent_days=$6,ot_hours=$7,basic=$8,gross=$9,
       deduction=$10,pf_employee=$11,pf_employer=$12,esi=$13,net=$14,updated_at=NOW()
       RETURNING *`,
      [employee_id, month, year, working_days||0, present_days||0, absent_days||0,
       ot_hours||0, basic||0, gross||0, deduction||0, pf_employee||0,
       pf_employer||0, esi||0, net||0]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  REPORTS
// ══════════════════════════════════════════════════════════════
// Daily revenue summary
app.get('/api/reports/daily', requirePerm('REPORT_DAILY'), async (req, res) => {
  const { date = new Date().toISOString().slice(0,10), center_id } = req.query;
  const cf = centerFilter(req);
  try {
    const params = [date];
    let centWhere = '';
    if (cf)        { params.push(cf);        centWhere += ` AND b.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); centWhere += ` AND b.center_id=$${params.length}`; }

    const [summary, byModality, byMode, byCenter] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS bill_count, COALESCE(SUM(final_total),0) AS total_amount,
                  COALESCE(SUM(paid),0) AS collected, COALESCE(SUM(balance),0) AS outstanding,
                  COALESCE(SUM(gst_total),0) AS gst_total
                  FROM bills b WHERE b.date::date=$1${centWhere} AND b.status!='Void'`, params),
      pool.query(`SELECT bi.modality, COUNT(*) AS count, COALESCE(SUM(bi.line_total),0) AS amount
                  FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
                  WHERE b.date::date=$1${centWhere} AND b.status!='Void'
                  GROUP BY bi.modality ORDER BY amount DESC`, params),
      pool.query(`SELECT b.payment_mode, COUNT(*) AS count, COALESCE(SUM(b.paid),0) AS amount
                  FROM bills b WHERE b.date::date=$1${centWhere} AND b.status!='Void'
                  GROUP BY b.payment_mode ORDER BY amount DESC`, params),
      pool.query(`SELECT c.name AS center_name, COUNT(*) AS bill_count, COALESCE(SUM(b.final_total),0) AS total
                  FROM bills b JOIN centers c ON c.id=b.center_id
                  WHERE b.date::date=$1${centWhere} AND b.status!='Void'
                  GROUP BY c.name ORDER BY total DESC`, params)
    ]);
    res.json({ date, summary: summary.rows[0], by_modality: byModality.rows, by_mode: byMode.rows, by_center: byCenter.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Monthly summary
app.get('/api/reports/monthly', requirePerm('REPORT_MONTHLY'), async (req, res) => {
  const { year = new Date().getFullYear(), center_id } = req.query;
  const cf = centerFilter(req);
  try {
    const params = [year];
    let centWhere = '';
    if (cf)        { params.push(cf);        centWhere += ` AND b.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); centWhere += ` AND b.center_id=$${params.length}`; }
    const r = await pool.query(
      `SELECT TO_CHAR(b.date,'YYYY-MM') AS month,
              COUNT(*) AS bill_count,
              COALESCE(SUM(b.final_total),0) AS total,
              COALESCE(SUM(b.paid),0) AS collected,
              COALESCE(SUM(b.gst_total),0) AS gst
       FROM bills b
       WHERE EXTRACT(YEAR FROM b.date)=$1${centWhere} AND b.status!='Void'
       GROUP BY TO_CHAR(b.date,'YYYY-MM') ORDER BY month`, params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GST report
app.get('/api/reports/gst', requirePerm('REPORT_GST'), async (req, res) => {
  const { from, to, center_id } = req.query;
  const cf = centerFilter(req);
  try {
    const params = [];
    let where = `b.status!='Void'`;
    if (from)      { params.push(from);      where += ` AND b.date::date>=$${params.length}`; }
    if (to)        { params.push(to);        where += ` AND b.date::date<=$${params.length}`; }
    if (cf)        { params.push(cf);        where += ` AND b.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); where += ` AND b.center_id=$${params.length}`; }
    const r = await pool.query(
      `SELECT bi.sac, bi.gst_rate,
              SUM(bi.line_total - bi.gst_amt) AS taxable_value,
              SUM(bi.gst_amt) AS total_gst,
              SUM(bi.gst_amt)/2 AS cgst,
              SUM(bi.gst_amt)/2 AS sgst,
              COUNT(*) AS item_count
       FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
       WHERE ${where} AND bi.gst_rate>0
       GROUP BY bi.sac, bi.gst_rate ORDER BY bi.sac`, params
    );
    const totals = await pool.query(
      `SELECT COALESCE(SUM(b.gst_total),0) AS total_gst,
              COALESCE(SUM(b.final_total),0) AS total_revenue
       FROM bills b WHERE ${where}`, params
    );
    res.json({ line_items: r.rows, totals: totals.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Referring Doctor Report (v3.0)
app.get('/api/reports/referring-doctor', requirePerm('REPORT_REFERRING_DOCTOR'), async (req, res) => {
  const { from, to, center_id, doctor_id } = req.query;
  const cf = centerFilter(req);
  try {
    const params = [];
    let where = `b.status!='Void'`;
    if (from)      { params.push(from);      where += ` AND b.date::date>=$${params.length}`; }
    if (to)        { params.push(to);        where += ` AND b.date::date<=$${params.length}`; }
    if (cf)        { params.push(cf);        where += ` AND b.center_id=$${params.length}`; }
    if (center_id) { params.push(center_id); where += ` AND b.center_id=$${params.length}`; }
    if (doctor_id) { params.push(doctor_id); where += ` AND b.referring_doctor_id=$${params.length}`; }
    const r = await pool.query(
      `SELECT rd.id AS doctor_id,
              rd.first_name || ' ' || rd.last_name AS doctor_name,
              rd.qualification, rd.specialization, rd.clinic_name, rd.phone,
              COUNT(DISTINCT b.id) AS bill_count,
              COUNT(DISTINCT b.patient_id) AS patient_count,
              COALESCE(SUM(b.final_total),0) AS total_revenue,
              COALESCE(SUM(b.paid),0) AS total_collected
       FROM bills b
       JOIN referring_doctors rd ON rd.id=b.referring_doctor_id
       WHERE ${where}
       GROUP BY rd.id, rd.first_name, rd.last_name, rd.qualification, rd.specialization, rd.clinic_name, rd.phone
       ORDER BY total_revenue DESC`, params
    );
    const detail = doctor_id ? await pool.query(
      `SELECT b.bill_no, b.date, b.accession_no, p.name AS patient_name, p.pid,
              b.final_total, b.paid, b.status, b.payment_mode
       FROM bills b JOIN patients p ON p.id=b.patient_id
       WHERE ${where} ORDER BY b.date DESC`, params
    ) : null;
    res.json({ summary: r.rows, detail: detail?.rows || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Radiologist Payable Report (v3.0)
app.get('/api/reports/radiologist-payable', requirePerm('REPORT_RADIOLOGIST_PAYABLE'), async (req, res) => {
  const { from, to, center_id, radiologist_id, unbilled_only } = req.query;
  try {
    const params = [];
    let where = `1=1`;
    if (from)           { params.push(from);           where += ` AND b.date::date>=$${params.length}`; }
    if (to)             { params.push(to);             where += ` AND b.date::date<=$${params.length}`; }
    if (center_id)      { params.push(center_id);      where += ` AND b.center_id=$${params.length}`; }
    if (radiologist_id) { params.push(radiologist_id); where += ` AND srm.radiologist_id=$${params.length}`; }
    if (unbilled_only === 'true') { where += ` AND srm.billed_to_radiologist=false`; }
    const r = await pool.query(
      `SELECT srm.id, srm.bill_id, srm.report_status, srm.contract_cost_per_study,
              srm.billed_to_radiologist, srm.assigned_at, srm.reported_at,
              r.id AS radiologist_id, r.name AS radiologist_name, r.type AS radiologist_type,
              r.payment_terms,
              b.bill_no, b.date AS bill_date, b.accession_no,
              p.name AS patient_name, p.pid,
              bi.study_name, bi.modality,
              c.name AS center_name
       FROM study_radiologist_mapping srm
       JOIN radiologists r ON r.id=srm.radiologist_id
       JOIN bills b ON b.id=srm.bill_id
       JOIN patients p ON p.id=b.patient_id
       LEFT JOIN bill_items bi ON bi.id=srm.bill_item_id
       LEFT JOIN centers c ON c.id=b.center_id
       WHERE ${where}
       ORDER BY r.name, b.date DESC`, params
    );
    // Aggregate per radiologist
    const byRadiologist = {};
    for (const row of r.rows) {
      if (!byRadiologist[row.radiologist_id]) {
        byRadiologist[row.radiologist_id] = {
          radiologist_id: row.radiologist_id,
          radiologist_name: row.radiologist_name,
          radiologist_type: row.radiologist_type,
          payment_terms: row.payment_terms,
          total_studies: 0, total_payable: 0, unbilled_studies: 0, unbilled_amount: 0, studies: []
        };
      }
      const agg = byRadiologist[row.radiologist_id];
      agg.total_studies++;
      agg.total_payable += parseFloat(row.contract_cost_per_study) || 0;
      if (!row.billed_to_radiologist) {
        agg.unbilled_studies++;
        agg.unbilled_amount += parseFloat(row.contract_cost_per_study) || 0;
      }
      agg.studies.push(row);
    }
    res.json(Object.values(byRadiologist));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mark radiologist studies as billed
app.post('/api/reports/radiologist-payable/mark-billed', requirePerm('RADIOLOGIST_BILLING_CREATE'), async (req, res) => {
  const { srm_ids, payable_batch_ref } = req.body;
  if (!srm_ids?.length) return res.status(400).json({ error: 'srm_ids required' });
  try {
    await pool.query(
      `UPDATE study_radiologist_mapping SET billed_to_radiologist=true, payable_batch_ref=$1, updated_at=NOW()
       WHERE id=ANY($2::int[])`,
      [payable_batch_ref||'', srm_ids]
    );
    await audit(req.session.user.id, 'RADIOLOGIST_BILLED', { count: srm_ids.length, payable_batch_ref });
    res.json({ ok: true, marked: srm_ids.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fixed Asset Report
app.get('/api/reports/assets', requirePerm('REPORT_ASSET'), async (req, res) => {
  const { center_id, category, as_of_fy } = req.query;
  try {
    let sql = `
      SELECT fa.*,
             c.name AS center_name, v.name AS vendor_name,
             ads.fiscal_year, ads.opening_value, ads.depreciation_amount,
             ads.closing_value AS book_value_fy
      FROM fixed_assets fa
      JOIN centers c ON c.id=fa.center_id
      LEFT JOIN vendors v ON v.id=fa.vendor_id
      LEFT JOIN asset_depreciation_schedules ads ON ads.asset_id=fa.id AND ads.fiscal_year=$1
      WHERE 1=1`;
    const params = [as_of_fy || '2025-26'];
    if (center_id) { params.push(center_id); sql += ` AND fa.center_id=$${params.length}`; }
    if (category)  { params.push(category);  sql += ` AND fa.category=$${params.length}`; }
    sql += ` ORDER BY fa.center_id, fa.category, fa.asset_code`;
    const assets = await pool.query(sql, params);
    // Summary
    const summary = await pool.query(
      `SELECT c.name AS center_name, fa.category,
              COUNT(*) AS asset_count,
              SUM(fa.acquisition_cost + fa.installation_cost) AS gross_block,
              SUM(COALESCE(fa.current_book_value, fa.acquisition_cost + fa.installation_cost)) AS net_block
       FROM fixed_assets fa JOIN centers c ON c.id=fa.center_id
       WHERE fa.status!='Disposed'${center_id ? ` AND fa.center_id=$2` : ''}
       GROUP BY c.name, fa.category ORDER BY c.name, fa.category`,
      center_id ? [params[0], center_id] : [params[0]]
    );
    res.json({ assets: assets.rows, summary: summary.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit trail
app.get('/api/reports/audit', requirePerm('REPORT_AUDIT'), async (req, res) => {
  const { from, to, user_id, action, limit = 200 } = req.query;
  try {
    let sql = `SELECT al.*, u.name AS user_name, u.username FROM audit_log al
               LEFT JOIN users u ON u.id=al.user_id WHERE 1=1`;
    const params = [];
    if (user_id) { params.push(user_id); sql += ` AND al.user_id=$${params.length}`; }
    if (action)  { params.push(`%${action}%`); sql += ` AND al.action ILIKE $${params.length}`; }
    if (from)    { params.push(from);    sql += ` AND al.created_at::date>=$${params.length}`; }
    if (to)      { params.push(to);      sql += ` AND al.created_at::date<=$${params.length}`; }
    params.push(limit);
    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  DASHBOARD WIDGETS (v3.0)
// ══════════════════════════════════════════════════════════════
app.get('/api/dashboard/widgets', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM dashboard_widgets ORDER BY module, widget_code`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get dashboard data for the current user (aggregated widget data)
app.get('/api/dashboard/data', requireAuth, async (req, res) => {
  const { from, to, center_id } = req.query;
  const u = req.session.user;
  const cf = centerFilter(req);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Effective center filter (centre-locked users always use their center)
  const effCenter = cf || (center_id && center_id !== '0' ? center_id : null);
  const centWhere  = effCenter ? ` AND b.center_id=${parseInt(effCenter)}` : '';
  const centWhereS = effCenter ? ` AND center_id=${parseInt(effCenter)}` : '';

  const fromDate = from || todayStr;
  const toDate   = to   || todayStr;
  // Month start for the month containing fromDate
  const monthStart = todayStr.slice(0, 7) + '-01';

  try {
    const data = {};

    // ── Today summary ──────────────────────────────────────────
    const todayR = await pool.query(
      `SELECT COALESCE(SUM(final_total),0) AS revenue,
              COUNT(*) AS bill_count,
              COALESCE(SUM(paid),0) AS collected,
              COALESCE(SUM(balance),0) AS pending
       FROM bills WHERE date::date=$1 AND status!='Void'${centWhereS}`, [todayStr]);
    data.today = todayR.rows[0];

    // ── Month summary ──────────────────────────────────────────
    const monthR = await pool.query(
      `SELECT COALESCE(SUM(final_total),0) AS revenue,
              COALESCE(SUM(gst_total),0) AS gst,
              COALESCE(SUM(paid),0) AS collected,
              COALESCE(SUM(balance),0) AS pending
       FROM bills WHERE date::date>=$1 AND date::date<=$2 AND status!='Void'${centWhereS}`,
      [monthStart, todayStr]);
    data.month = monthR.rows[0];

    // ── Pending bills ──────────────────────────────────────────
    const pendR = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(balance),0) AS amount
       FROM bills WHERE status IN ('Unpaid','Partial')${centWhereS}`);
    data.pending = pendR.rows[0];

    // ── Bank balances ──────────────────────────────────────────
    const bankR = await pool.query(
      `SELECT name, bank, type, COALESCE(balance,0) AS balance
       FROM bank_accounts WHERE active=true ORDER BY name`);
    data.bank_balances = bankR.rows;

    // ── Center comparison (for selected date range) ────────────
    const cenR = await pool.query(
      `SELECT c.name AS center_name, COUNT(b.id) AS bill_count,
              COALESCE(SUM(b.final_total),0) AS revenue,
              COALESCE(SUM(b.paid),0) AS collected
       FROM centers c
       LEFT JOIN bills b ON b.center_id=c.id
         AND b.date::date>=$1 AND b.date::date<=$2 AND b.status!='Void'
       GROUP BY c.id, c.name ORDER BY c.name`, [fromDate, toDate]);
    data.center_comparison = cenR.rows;

    // ── Top studies (selected range) ───────────────────────────
    const studR = await pool.query(
      `SELECT bi.study_name, bi.modality,
              COUNT(*) AS count,
              COALESCE(SUM(bi.price * bi.qty),0) AS revenue
       FROM bill_items bi
       JOIN bills b ON b.id=bi.bill_id
       WHERE b.date::date>=$1 AND b.date::date<=$2 AND b.status!='Void'${centWhere}
       GROUP BY bi.study_name, bi.modality ORDER BY count DESC LIMIT 10`, [fromDate, toDate]);
    data.top_studies = studR.rows;

    // ── Recent bills ───────────────────────────────────────────
    const recR = await pool.query(
      `SELECT b.id, b.bill_no, b.date, p.name AS patient_name,
              c.name AS center_name, b.final_total, b.paid, b.status
       FROM bills b
       JOIN patients p ON p.id=b.patient_id
       JOIN centers  c ON c.id=b.center_id
       WHERE b.status!='Void'${centWhere}
       ORDER BY b.created_at DESC LIMIT 10`);
    data.recent_bills = recR.rows;

    // ── Payables summary ───────────────────────────────────────
    const payR = await pool.query(
      `SELECT COUNT(*) AS pending_count, COALESCE(SUM(amount),0) AS total_pending
       FROM payables WHERE status='Unpaid'`);
    data.payables = payR.rows[0];

    // ── Daily billing trend (selected range) ───────────────────
    const trendR = await pool.query(
      `SELECT date::date AS day,
              COALESCE(SUM(final_total),0) AS revenue,
              COALESCE(SUM(paid),0) AS collected
       FROM bills WHERE date::date>=$1 AND date::date<=$2 AND status!='Void'${centWhereS}
       GROUP BY date::date ORDER BY day`, [fromDate, toDate]);
    data.daily_trend = trendR.rows;

    // ── Payment modes (selected range) ────────────────────────
    const pmR = await pool.query(
      `SELECT payment_mode AS mode, COUNT(*) AS count,
              COALESCE(SUM(final_total),0) AS amount
       FROM bills WHERE date::date>=$1 AND date::date<=$2 AND status!='Void'${centWhereS}
       GROUP BY payment_mode`, [fromDate, toDate]);
    data.payment_modes = pmR.rows;

    // ── Modality revenue (selected range) ─────────────────────
    const modR = await pool.query(
      `SELECT bi.modality, COUNT(*) AS count,
              COALESCE(SUM(bi.price * bi.qty),0) AS revenue
       FROM bill_items bi
       JOIN bills b ON b.id=bi.bill_id
       WHERE b.date::date>=$1 AND b.date::date<=$2 AND b.status!='Void'${centWhere}
       GROUP BY bi.modality ORDER BY revenue DESC`, [fromDate, toDate]);
    data.modality_revenue = modR.rows;

    // ── v3 additions ───────────────────────────────────────────
    if (await hasPerm(u.id, u.role, 'ASSET_VIEW')) {
      const r = await pool.query(
        `SELECT asset_code, asset_name, status, warranty_expiry_date,
                (warranty_expiry_date - CURRENT_DATE) AS warranty_days_left
         FROM fixed_assets
         WHERE (status='Under Maintenance'
                OR (warranty_expiry_date IS NOT NULL
                    AND warranty_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30))
           AND status != 'Disposed'`);
      data.asset_alerts = r.rows;
    }

    if (await hasPerm(u.id, u.role, 'ASSET_CONTRACT_MANAGE')) {
      const r = await pool.query(
        `SELECT asc2.id, fa.asset_code, fa.asset_name, asc2.contract_type,
                asc2.end_date, (asc2.end_date - CURRENT_DATE) AS days_remaining
         FROM asset_service_contracts asc2
         JOIN fixed_assets fa ON fa.id=asc2.asset_id
         WHERE asc2.status='Active' AND asc2.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30
         ORDER BY asc2.end_date LIMIT 5`);
      data.contracts_expiring = r.rows;
    }

    if (await hasPerm(u.id, u.role, 'RADIOLOGIST_BILLING_VIEW')) {
      const r = await pool.query(
        `SELECT COALESCE(SUM(contract_cost_per_study),0) AS unbilled_amount, COUNT(*) AS count
         FROM study_radiologist_mapping WHERE billed_to_radiologist=false`);
      data.radiologist_unbilled = r.rows[0];
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  MWL (DICOM Modality Worklist) API  — v3.0 per-center
// ══════════════════════════════════════════════════════════════
app.get('/api/mwl/ping', (_req, res) => res.json({ ok: true, version: '3.0.0' }));
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/mwl/worklist', requireMwlKey, async (req, res) => {
  try {
    // Determine center scope: API key may be center-specific
    const keyCenterId = req.mwlClient.center_id;
    const queryCenterId = req.query.center_id ? parseInt(req.query.center_id) : null;
    // If key is center-locked, enforce it regardless of query param
    const effectiveCenterId = keyCenterId || queryCenterId;

    const cfgR = await pool.query(
      `SELECT key, value FROM config WHERE key IN ('mwl_worklist_days','mwl_enabled')`
    );
    const cfg = {};
    cfgR.rows.forEach(r => { cfg[r.key] = r.value; });
    if (cfg.mwl_enabled === 'false') return res.json([]);

    const days = parseInt(cfg.mwl_worklist_days) || 1;

    let sql = `
      SELECT b.id, b.accession_no, b.study_instance_uid, b.mwl_status, b.date,
             p.pid, p.name AS patient_name, p.dob, p.gender, p.phone,
             c.ae_title, c.name AS center_name,
             bi.study_name, bi.modality, bi.sac, bi.id AS bill_item_id,
             rd.first_name || ' ' || rd.last_name AS referring_physician,
             rd.qualification AS ref_physician_qual
      FROM bills b
      JOIN patients p ON p.id=b.patient_id
      JOIN centers c ON c.id=b.center_id
      JOIN bill_items bi ON bi.bill_id=b.id
      LEFT JOIN referring_doctors rd ON rd.id=b.referring_doctor_id
      WHERE b.mwl_status='Scheduled'
        AND b.date >= NOW() - INTERVAL '${days} days'
        AND b.status != 'Void'`;

    const params = [];
    if (effectiveCenterId) {
      params.push(effectiveCenterId);
      sql += ` AND b.center_id=$${params.length}`;
    }
    if (req.query.modality) {
      params.push(req.query.modality);
      sql += ` AND bi.modality=$${params.length}`;
    }
    sql += ` ORDER BY b.date ASC`;

    const r = await pool.query(sql, params);
    // Format as DICOM-friendly JSON
    const worklist = r.rows.map(row => ({
      AccessionNumber:            row.accession_no,
      StudyInstanceUID:           row.study_instance_uid || `2.25.${row.id}${Date.now()}`,
      PatientID:                  row.pid,
      PatientName:                row.patient_name.replace(/ /g, '^'),
      PatientBirthDate:           row.dob ? row.dob.toISOString().slice(0,10).replace(/-/g,'') : '',
      PatientSex:                 row.gender === 'M' ? 'M' : row.gender === 'F' ? 'F' : 'O',
      PatientPhone:               row.phone,
      StudyDescription:           row.study_name,
      Modality:                   row.modality,
      ScheduledProcedureStepDescription: row.study_name,
      ScheduledProcedureStepStartDate:   row.date?.toISOString?.().slice(0,10).replace(/-/g,''),
      ScheduledStationAETitle:    row.ae_title,
      InstitutionName:            row.center_name,
      ReferringPhysicianName:     row.referring_physician || row.ref_doctor || '',
      ReferringPhysicianQualification: row.ref_physician_qual || '',
      RequestedProcedureID:       row.accession_no,
      MWLStatus:                  row.mwl_status,
      BillItemID:                 row.bill_item_id
    }));
    res.json(worklist);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update MWL status (called by DICOM broker after study completion)
app.put('/api/mwl/status', requireMwlKey, async (req, res) => {
  const { accession_no, status, study_instance_uid } = req.body;
  if (!accession_no) return res.status(400).json({ error: 'accession_no required' });
  try {
    const newStatus = status || 'Completed';
    const r = await pool.query(
      `UPDATE bills SET mwl_status=$1,
       mwl_completed_at=CASE WHEN $1='Completed' THEN NOW() ELSE mwl_completed_at END,
       study_instance_uid=COALESCE($2,study_instance_uid),
       updated_at=NOW()
       WHERE accession_no=$3 RETURNING id`,
      [newStatus, study_instance_uid||null, accession_no]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Accession not found' });
    res.json({ ok: true, updated: r.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// MWL API Keys management
app.get('/api/mwl/keys', requirePerm('MWL_CONFIG_MANAGE'), async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT mk.id, mk.name, mk.ae_title, mk.center_id, mk.active, mk.created_at,
              c.name AS center_name
       FROM mwl_api_keys mk LEFT JOIN centers c ON c.id=mk.center_id ORDER BY mk.created_at DESC`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mwl/keys', requirePerm('MWL_CONFIG_MANAGE'), async (req, res) => {
  const { name, ae_title, center_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    await pool.query(
      `INSERT INTO mwl_api_keys (name, ae_title, center_id, key_hash) VALUES ($1,$2,$3,$4)`,
      [name, ae_title||'', center_id||null, keyHash]
    );
    await audit(req.session.user.id, 'MWL_KEY_CREATE', { name, center_id });
    res.status(201).json({ name, ae_title, center_id, rawKey, note: 'Save this key — it will not be shown again.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/mwl/keys/:id', requirePerm('MWL_CONFIG_MANAGE'), async (req, res) => {
  const { name, ae_title, center_id, active } = req.body;
  try {
    await pool.query(
      `UPDATE mwl_api_keys SET name=$1,ae_title=$2,center_id=$3,active=$4 WHERE id=$5`,
      [name, ae_title||'', center_id||null, active !== false, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/mwl/keys/:id', requirePerm('MWL_CONFIG_MANAGE'), async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM mwl_api_keys WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await audit(req.session.user.id, 'MWL_KEY_DELETE', { id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback for frontend routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════════════════════════
//  SERVER START
// ══════════════════════════════════════════════════════════════
pool.query('SELECT NOW()').then(() => {
  console.log('[ARIS] PostgreSQL connected');
  app.listen(PORT, () => {
    console.log(`[ARIS] v3.0 server running on port ${PORT}`);
    console.log(`[ARIS] ENV: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('[ARIS] DB connection failed:', err.message);
  process.exit(1);
});

module.exports = app; // for testing

