/* ============================================================
   ARIS ERP v3.0 — Database Seed Script
   Creates default users with bcrypt-hashed passwords.
   Run once after schema is applied:
     node seed.js
   ============================================================ */
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'aris_erp',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASS     || '',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      }
);

const REQUIRED_SEED_PASSWORDS = [
  'ARIS_SEED_SUPERADMIN_PASSWORD',
  'ARIS_SEED_ADMIN_PASSWORD',
  'ARIS_SEED_ADMIN_KLM_PASSWORD',
  'ARIS_SEED_ADMIN_PRP_PASSWORD',
  'ARIS_SEED_RECEPTION_KLM_PASSWORD',
  'ARIS_SEED_RECEPTION_PRP_PASSWORD',
  'ARIS_SEED_FINANCE_PASSWORD',
  'ARIS_SEED_RADIOLOGIST_PASSWORD',
  'ARIS_SEED_HR_PASSWORD',
  'ARIS_SEED_OPERATIONS_PASSWORD',
];

for (const key of REQUIRED_SEED_PASSWORDS) {
  if (!process.env[key]) {
    console.error(`[SEED] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const USERS = [
  { role: 'superadmin',   username: 'superadmin',    password: process.env.ARIS_SEED_SUPERADMIN_PASSWORD,    center_id: null, name: 'Super Administrator' },
  { role: 'admin',        username: 'admin',         password: process.env.ARIS_SEED_ADMIN_PASSWORD,         center_id: null, name: 'System Administrator' },
  { role: 'admin',        username: 'admin.klm',     password: process.env.ARIS_SEED_ADMIN_KLM_PASSWORD,     center_id: 1,    name: 'Admin - Kollam' },
  { role: 'admin',        username: 'admin.prp',     password: process.env.ARIS_SEED_ADMIN_PRP_PASSWORD,     center_id: 2,    name: 'Admin - Parippally' },
  { role: 'receptionist', username: 'reception.klm', password: process.env.ARIS_SEED_RECEPTION_KLM_PASSWORD, center_id: 1,    name: 'Receptionist - Kollam' },
  { role: 'receptionist', username: 'reception.prp', password: process.env.ARIS_SEED_RECEPTION_PRP_PASSWORD, center_id: 2,    name: 'Receptionist - Parippally' },
  { role: 'finance',      username: 'finance',       password: process.env.ARIS_SEED_FINANCE_PASSWORD,       center_id: null, name: 'Finance Officer' },
  { role: 'radiologist',  username: 'radiologist',   password: process.env.ARIS_SEED_RADIOLOGIST_PASSWORD,   center_id: null, name: 'Radiologist User' },
  { role: 'hr',           username: 'hr',            password: process.env.ARIS_SEED_HR_PASSWORD,            center_id: null, name: 'HR Officer' },
  { role: 'operations',   username: 'operations',    password: process.env.ARIS_SEED_OPERATIONS_PASSWORD,    center_id: null, name: 'Operations Officer' },
];

async function seed() {
  console.log('[SEED] ARIS ERP v3.0 — Database Seeder');
  const existing = await pool.query(`SELECT COUNT(*) FROM users`);
  if (parseInt(existing.rows[0].count) > 0) {
    console.log(`[SEED] ${existing.rows[0].count} users already exist — skipping.`);
    await pool.end(); return;
  }
  console.log('[SEED] Creating default users...');
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    await pool.query(
      `INSERT INTO users (name,username,password,role,center_id,password_changed)
       VALUES ($1,$2,$3,$4,$5,false) ON CONFLICT (username) DO NOTHING`,
      [u.name, u.username, hash, u.role, u.center_id]
    );
    console.log(`  [+] ${u.role.padEnd(14)} ${u.username}`);
  }
  console.log('\n[SEED] Default login credentials (password change required on first login):');
  console.log('  Username          Password       Role');
  console.log('  ─────────────────────────────────────────');
  for (const u of USERS) {
    console.log(`  ${u.username.padEnd(18)} ${u.password.padEnd(15)} ${u.role}`);
  }
  console.log('\n  ⚠  Change ALL passwords immediately after first login!');
  console.log('[SEED] Done.\n');
  await pool.end();
}

seed().catch(err => {
  console.error('[SEED] Error:', err.message);
  pool.end(); process.exit(1);
});
