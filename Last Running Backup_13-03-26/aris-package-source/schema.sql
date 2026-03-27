-- ═══════════════════════════════════════════════════════════════════════════
--  ARIS ERP v3.0 — PostgreSQL Schema
--  ARIS Diagnostic Centre | Kollam & Parippally | Kerala
--  Version: 3.0.0 | Generated: 2026-03-11
--
--  Table creation order (FK dependencies respected):
--    sessions → config → centers → radiologists → studies → tariffs
--    → patients → referring_doctors → users → permissions
--    → role_permissions → user_permissions → bills → bill_items
--    → study_radiologist_mapping → collections → vendors → payables
--    → fixed_assets → asset_depreciation_schedules → asset_service_contracts
--    → asset_maintenance_records → asset_spare_parts → bank_accounts
--    → bank_transactions → employees → attendance → payroll
--    → audit_log → mwl_api_keys → dashboard_widgets
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── SESSIONS (connect-pg-simple) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  sid     VARCHAR PRIMARY KEY,
  sess    JSONB NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);

-- ─── CONFIG ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CENTERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS centers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  address    TEXT DEFAULT '',
  phone      TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  gstin      TEXT DEFAULT '',
  ae_title   TEXT DEFAULT '',
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RADIOLOGISTS (v3.0) ─────────────────────────────────────────────────
-- Defined early so studies.default_radiologist_id can FK to it
CREATE TABLE IF NOT EXISTS radiologists (
  id                      SERIAL PRIMARY KEY,
  type                    TEXT NOT NULL DEFAULT 'Individual',
                          -- Individual | Company | Teleradiology
  name                    TEXT NOT NULL,
  qualification           TEXT DEFAULT '',
  registration_no         TEXT DEFAULT '',
  center_id               INT REFERENCES centers(id),   -- NULL = all centers
  phone                   TEXT DEFAULT '',
  email                   TEXT DEFAULT '',
  address                 TEXT DEFAULT '',
  -- Payment configuration
  payment_terms           TEXT NOT NULL DEFAULT 'Per Study',
                          -- Per Study | Monthly | Quarterly
  contract_cost_per_study NUMERIC(10,2) DEFAULT 0,
  monthly_retainer        NUMERIC(12,2) DEFAULT 0,
  -- Modality scope: comma-separated list or '*' for all (e.g. 'MRI,CT')
  modality_scope          TEXT DEFAULT '*',
  -- Contract dates
  contract_start_date     DATE,
  contract_end_date       DATE,
  contract_doc_ref        TEXT DEFAULT '',
  active                  BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_radiologists_center ON radiologists(center_id);
CREATE INDEX IF NOT EXISTS idx_radiologists_active ON radiologists(active);

-- ─── STUDIES MASTER ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studies (
  id                     SERIAL PRIMARY KEY,
  code                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  modality               TEXT NOT NULL,
  category               TEXT DEFAULT '',
  contrast               TEXT DEFAULT 'Plain',
  sac                    TEXT DEFAULT '999316',
  price                  NUMERIC(10,2) DEFAULT 0,
  gst_rate               NUMERIC(5,2) DEFAULT 0,
  duration               INT DEFAULT 30,
  default_radiologist_id INT REFERENCES radiologists(id) ON DELETE SET NULL,
  active                 BOOLEAN DEFAULT true,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TARIFFS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tariffs (
  id         SERIAL PRIMARY KEY,
  study_id   INT NOT NULL REFERENCES studies(id),
  center_id  INT NOT NULL REFERENCES centers(id),
  price      NUMERIC(10,2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (study_id, center_id)
);

-- ─── PATIENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id         SERIAL PRIMARY KEY,
  pid        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  dob        DATE,
  gender     CHAR(1) DEFAULT 'U',
  phone      TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  address    TEXT DEFAULT '',
  ref_doctor TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_name  ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_pid   ON patients(pid);

-- ─── REFERRING DOCTORS (v3.0) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referring_doctors (
  id              SERIAL PRIMARY KEY,
  center_id       INT REFERENCES centers(id),   -- NULL = all centers
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL DEFAULT '',
  qualification   TEXT DEFAULT '',
  specialization  TEXT DEFAULT '',
  clinic_name     TEXT DEFAULT '',
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  registration_no TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_doctors_center ON referring_doctors(center_id);
CREATE INDEX IF NOT EXISTS idx_ref_doctors_name   ON referring_doctors(last_name, first_name);

-- ─── USERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  username             TEXT NOT NULL UNIQUE,
  password             TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'receptionist',
                       -- superadmin | admin | radiologist | finance | receptionist | hr | operations
  center_id            INT REFERENCES centers(id),
  active               BOOLEAN DEFAULT true,
  password_changed     BOOLEAN DEFAULT false,
  dashboard_preference JSONB DEFAULT '{}',    -- v3.0: widget visibility/order per user
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PERMISSIONS (v3.0) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  module      TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Role-level default grants
CREATE TABLE IF NOT EXISTS role_permissions (
  id        SERIAL PRIMARY KEY,
  role      TEXT NOT NULL,
  perm_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (role, perm_code)
);

-- Per-user permission overrides (grants or explicit denies)
CREATE TABLE IF NOT EXISTS user_permissions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  perm_code   TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted     BOOLEAN NOT NULL DEFAULT false,
  expiry_date DATE,                       -- NULL = no expiry
  granted_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, perm_code)
);
CREATE INDEX IF NOT EXISTS idx_user_perms_user ON user_permissions(user_id);

-- ─── BILLS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id                  SERIAL PRIMARY KEY,
  bill_no             TEXT NOT NULL UNIQUE,
  accession_no        TEXT NOT NULL DEFAULT '',
  patient_id          INT NOT NULL REFERENCES patients(id),
  center_id           INT NOT NULL REFERENCES centers(id),
  date                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ref_doctor          TEXT DEFAULT '',                      -- legacy free-text
  referring_doctor_id INT REFERENCES referring_doctors(id), -- v3.0 FK
  subtotal            NUMERIC(12,2) DEFAULT 0,
  discount            NUMERIC(10,2) DEFAULT 0,
  discount_type       TEXT DEFAULT 'flat',
  gst_total           NUMERIC(10,2) DEFAULT 0,
  final_total         NUMERIC(12,2) DEFAULT 0,
  paid                NUMERIC(12,2) DEFAULT 0,
  balance             NUMERIC(12,2) DEFAULT 0,
  status              TEXT DEFAULT 'Pending',
  payment_mode        TEXT DEFAULT 'Cash',
  payment_ref         TEXT DEFAULT '',
  notes               TEXT DEFAULT '',
  mwl_status          TEXT DEFAULT 'Scheduled',
  study_instance_uid  TEXT DEFAULT '',
  mwl_completed_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_date           ON bills(date);
CREATE INDEX IF NOT EXISTS idx_bills_center_id      ON bills(center_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient_id     ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_status         ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_accession      ON bills(accession_no);
CREATE INDEX IF NOT EXISTS idx_bills_mwl_status     ON bills(mwl_status);
CREATE INDEX IF NOT EXISTS idx_bills_ref_doctor_id  ON bills(referring_doctor_id);

-- ─── BILL ITEMS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_items (
  id         SERIAL PRIMARY KEY,
  bill_id    INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  study_id   INT REFERENCES studies(id),
  study_name TEXT NOT NULL,
  modality   TEXT DEFAULT '',
  sac        TEXT DEFAULT '999316',
  qty        INT DEFAULT 1,
  price      NUMERIC(10,2) DEFAULT 0,
  gst_rate   NUMERIC(5,2) DEFAULT 0,
  gst_amt    NUMERIC(10,2) DEFAULT 0,
  line_total NUMERIC(10,2) DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);

-- ─── STUDY RADIOLOGIST MAPPING (v3.0) ────────────────────────────────────
-- Maps each billed study instance to the radiologist who reported it
CREATE TABLE IF NOT EXISTS study_radiologist_mapping (
  id                      SERIAL PRIMARY KEY,
  bill_id                 INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  bill_item_id            INT REFERENCES bill_items(id) ON DELETE CASCADE,
  radiologist_id          INT NOT NULL REFERENCES radiologists(id),
  assigned_at             TIMESTAMPTZ DEFAULT NOW(),
  report_status           TEXT NOT NULL DEFAULT 'Pending',
                          -- Pending | Reported | Finalized | Rejected
  reported_at             TIMESTAMPTZ,
  contract_cost_per_study NUMERIC(10,2) DEFAULT 0,
  billed_to_radiologist   BOOLEAN DEFAULT false,
  payable_batch_ref       TEXT DEFAULT '',     -- reference to payable record
  notes                   TEXT DEFAULT '',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_srm_bill_id       ON study_radiologist_mapping(bill_id);
CREATE INDEX IF NOT EXISTS idx_srm_radiologist   ON study_radiologist_mapping(radiologist_id);
CREATE INDEX IF NOT EXISTS idx_srm_report_status ON study_radiologist_mapping(report_status);
CREATE INDEX IF NOT EXISTS idx_srm_billed        ON study_radiologist_mapping(billed_to_radiologist);

-- ─── COLLECTIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id           SERIAL PRIMARY KEY,
  bill_id      INT NOT NULL REFERENCES bills(id),
  center_id    INT NOT NULL REFERENCES centers(id),
  date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount       NUMERIC(10,2) NOT NULL,
  mode         TEXT DEFAULT 'Cash',
  ref          TEXT DEFAULT '',
  collected_by INT REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collections_date      ON collections(date);
CREATE INDEX IF NOT EXISTS idx_collections_center_id ON collections(center_id);
CREATE INDEX IF NOT EXISTS idx_collections_bill_id   ON collections(bill_id);

-- ─── VENDORS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  cat        TEXT DEFAULT '',
  gstin      TEXT DEFAULT '',
  phone      TEXT DEFAULT '',
  addr       TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAYABLES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payables (
  id          SERIAL PRIMARY KEY,
  vendor_id   INT REFERENCES vendors(id),
  center_id   INT REFERENCES centers(id),
  ref_no      TEXT DEFAULT '',
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date    DATE,
  amount      NUMERIC(12,2) DEFAULT 0,
  gst_amt     NUMERIC(10,2) DEFAULT 0,
  description TEXT DEFAULT '',
  status      TEXT DEFAULT 'Pending',
  paid_amt    NUMERIC(12,2) DEFAULT 0,
  paid_date   DATE,
  paid_mode   TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FIXED ASSETS (v3.0) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                    SERIAL PRIMARY KEY,
  asset_code            TEXT NOT NULL UNIQUE,
  center_id             INT NOT NULL REFERENCES centers(id),
  vendor_id             INT REFERENCES vendors(id),
  asset_name            TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'Equipment',
                        -- Equipment | Furniture | IT | Vehicle | Building | Other
  sub_category          TEXT DEFAULT '',
  condition             TEXT NOT NULL DEFAULT 'New',
                        -- New | Refurbished | Used
  serial_number         TEXT DEFAULT '',
  model_number          TEXT DEFAULT '',
  manufacturer          TEXT DEFAULT '',
  location              TEXT DEFAULT '',
  -- Financial
  acquisition_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  acquisition_cost      NUMERIC(14,2) NOT NULL DEFAULT 0,
  installation_cost     NUMERIC(12,2) DEFAULT 0,
  salvage_value         NUMERIC(12,2) DEFAULT 0,
  -- Depreciation
  depreciation_method   TEXT NOT NULL DEFAULT 'SLM',   -- SLM | WDV
  useful_life_years     NUMERIC(5,2) NOT NULL DEFAULT 5,
  wdv_rate              NUMERIC(5,2) DEFAULT 0,
  current_book_value    NUMERIC(14,2),
  -- Status
  status                TEXT NOT NULL DEFAULT 'Active',
                        -- Active | Under Maintenance | Disposed | Transferred
  disposal_date         DATE,
  disposal_amount       NUMERIC(12,2) DEFAULT 0,
  disposal_reason       TEXT DEFAULT '',
  -- Warranty & Insurance
  warranty_expiry_date  DATE,
  insurance_policy_no   TEXT DEFAULT '',
  insurance_expiry_date DATE,
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_center   ON fixed_assets(center_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets(category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status   ON fixed_assets(status);

-- ─── ASSET DEPRECIATION SCHEDULES (v3.0) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_schedules (
  id                  SERIAL PRIMARY KEY,
  asset_id            INT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  fiscal_year         TEXT NOT NULL,
  opening_value       NUMERIC(14,2) NOT NULL,
  depreciation_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_value       NUMERIC(14,2) NOT NULL,
  depreciation_rate   NUMERIC(5,2) DEFAULT 0,
  depreciation_posted BOOLEAN DEFAULT false,
  posted_at           TIMESTAMPTZ,
  posted_by           INT REFERENCES users(id),
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (asset_id, fiscal_year)
);
CREATE INDEX IF NOT EXISTS idx_depr_sched_asset ON asset_depreciation_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_depr_sched_fy    ON asset_depreciation_schedules(fiscal_year);

-- ─── ASSET SERVICE CONTRACTS (v3.0) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_service_contracts (
  id                  SERIAL PRIMARY KEY,
  asset_id            INT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  vendor_id           INT REFERENCES vendors(id),
  contract_type       TEXT NOT NULL DEFAULT 'AMC',
                      -- AMC | Software Support | SLA | Warranty | Other
  contract_ref_no     TEXT DEFAULT '',
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  annual_cost         NUMERIC(12,2) DEFAULT 0,
  coverage_details    TEXT DEFAULT '',
  response_time_sla   TEXT DEFAULT '',
  renewal_reminder_days INT DEFAULT 30,
  status              TEXT NOT NULL DEFAULT 'Active',
                      -- Active | Expired | Cancelled
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_svc_contracts_asset  ON asset_service_contracts(asset_id);
CREATE INDEX IF NOT EXISTS idx_svc_contracts_status ON asset_service_contracts(status);
CREATE INDEX IF NOT EXISTS idx_svc_contracts_end    ON asset_service_contracts(end_date);

-- ─── ASSET MAINTENANCE RECORDS (v3.0) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  id                  SERIAL PRIMARY KEY,
  asset_id            INT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  service_contract_id INT REFERENCES asset_service_contracts(id),
  vendor_id           INT REFERENCES vendors(id),
  maintenance_type    TEXT NOT NULL DEFAULT 'Preventive',
                      -- Preventive | Corrective | Breakdown | Calibration | Inspection
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  description         TEXT DEFAULT '',
  labor_cost          NUMERIC(10,2) DEFAULT 0,
  parts_cost          NUMERIC(10,2) DEFAULT 0,
  other_cost          NUMERIC(10,2) DEFAULT 0,
  total_cost          NUMERIC(12,2) GENERATED ALWAYS AS
                        (labor_cost + parts_cost + other_cost) STORED,
  downtime_hours      NUMERIC(6,2) DEFAULT 0,
  next_service_date   DATE,
  performed_by        TEXT DEFAULT '',
  recorded_by         INT REFERENCES users(id),
  status              TEXT DEFAULT 'Completed',
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_asset ON asset_maintenance_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_date  ON asset_maintenance_records(date);

-- ─── ASSET SPARE PARTS (v3.0) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_spare_parts (
  id            SERIAL PRIMARY KEY,
  asset_id      INT REFERENCES fixed_assets(id),   -- NULL = generic/non-asset-specific
  center_id     INT NOT NULL REFERENCES centers(id),
  vendor_id     INT REFERENCES vendors(id),
  part_code     TEXT DEFAULT '',
  part_name     TEXT NOT NULL,
  unit          TEXT DEFAULT 'Nos',
  unit_cost     NUMERIC(10,2) DEFAULT 0,
  current_stock NUMERIC(8,2) DEFAULT 0,
  reorder_level NUMERIC(8,2) DEFAULT 0,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_asset  ON asset_spare_parts(asset_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_center ON asset_spare_parts(center_id);

-- ─── BANK ACCOUNTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  bank       TEXT DEFAULT '',
  acno       TEXT DEFAULT '',
  ifsc       TEXT DEFAULT '',
  type       TEXT DEFAULT 'Current',
  center_id  INT REFERENCES centers(id),
  balance    NUMERIC(14,2) DEFAULT 0,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── BANK TRANSACTIONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  id          SERIAL PRIMARY KEY,
  account_id  INT NOT NULL REFERENCES bank_accounts(id),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  type        TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  description TEXT DEFAULT '',
  ref_no      TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_date    ON bank_transactions(date);

-- ─── EMPLOYEES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id          SERIAL PRIMARY KEY,
  emp_id      TEXT DEFAULT '',
  name        TEXT NOT NULL,
  center_id   INT REFERENCES centers(id),
  dept        TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  doj         DATE,
  dob         DATE,
  gender      CHAR(1) DEFAULT 'M',
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  salary      NUMERIC(10,2) DEFAULT 0,
  bank_name   TEXT DEFAULT '',
  bank_acno   TEXT DEFAULT '',
  ifsc        TEXT DEFAULT '',
  pf_no       TEXT DEFAULT '',
  esi_no      TEXT DEFAULT '',
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ATTENDANCE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id          SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id),
  date        DATE NOT NULL,
  status      CHAR(2) DEFAULT 'P',
  ot_hours    NUMERIC(4,2) DEFAULT 0,
  notes       TEXT DEFAULT '',
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);

-- ─── PAYROLL ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll (
  id           SERIAL PRIMARY KEY,
  employee_id  INT NOT NULL REFERENCES employees(id),
  month        INT NOT NULL,
  year         INT NOT NULL,
  working_days INT DEFAULT 0,
  present_days INT DEFAULT 0,
  absent_days  INT DEFAULT 0,
  ot_hours     NUMERIC(5,2) DEFAULT 0,
  basic        NUMERIC(10,2) DEFAULT 0,
  gross        NUMERIC(10,2) DEFAULT 0,
  deduction    NUMERIC(10,2) DEFAULT 0,
  pf_employee  NUMERIC(10,2) DEFAULT 0,
  pf_employer  NUMERIC(10,2) DEFAULT 0,
  esi          NUMERIC(10,2) DEFAULT 0,
  net          NUMERIC(10,2) DEFAULT 0,
  status       TEXT DEFAULT 'Processed',
  paid_date    DATE,
  paid_mode    TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

-- ─── AUDIT LOG ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  detail     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log(action);

-- ─── MWL API KEYS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mwl_api_keys (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  ae_title   TEXT DEFAULT '',
  center_id  INT REFERENCES centers(id),   -- v3.0: per-center key
  key_hash   TEXT NOT NULL UNIQUE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DASHBOARD WIDGETS (v3.0) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id                  SERIAL PRIMARY KEY,
  widget_code         TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT DEFAULT '',
  module              TEXT NOT NULL,
  required_permission TEXT DEFAULT '',   -- '' = any authenticated user
  default_roles       TEXT[] DEFAULT '{}',
  icon                TEXT DEFAULT 'bar-chart-2',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
--  SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- ─── CONFIG ───────────────────────────────────────────────────────────────
INSERT INTO config (key, value) VALUES
  ('practice_name',         'ARIS Diagnostic Centre'),
  ('fy',                    '2025-26'),
  ('currency',              '₹'),
  ('state',                 'Kerala'),
  ('state_code',            '32'),
  ('gst_enabled',           'true'),
  ('pan_no',                ''),
  ('invoice_footer',        'Thank you for choosing ARIS Diagnostic Centre. Report valid only with Radiologist signature.'),
  ('logo',                  ''),
  ('bill_header_color',     '#1a3a6b'),
  ('bill_accent_color',     '#e8f0fe'),
  ('bill_show_logo',        'true'),
  ('bill_tagline',          'Advanced Radiology & Imaging Services'),
  ('mwl_enabled',           'true'),
  ('mwl_worklist_days',     '1'),
  ('app_version',           '3.0.0'),
  ('asset_depreciation_fy', '2025-26'),
  ('contract_alert_days',   '30')
ON CONFLICT (key) DO NOTHING;

-- ─── CENTERS ──────────────────────────────────────────────────────────────
INSERT INTO centers (name, code, address, phone, email, gstin, ae_title) VALUES
  ('ARIS Kollam',     'KLM', 'Main Road, Kollam, Kerala - 691001',         '0474-2222222', 'kollam@arisdiagnostic.com',     '32AAAAA0000A1Z5', 'ARISKOLLAM'),
  ('ARIS Parippally', 'PRP', 'NH-66, Parippally, Kollam, Kerala - 691574', '0474-3333333', 'parippally@arisdiagnostic.com', '32AAAAA0000A1Z5', 'ARISPARIP')
ON CONFLICT (code) DO NOTHING;

-- ─── RADIOLOGISTS ─────────────────────────────────────────────────────────
INSERT INTO radiologists (type, name, qualification, center_id, payment_terms, contract_cost_per_study, monthly_retainer, modality_scope, contract_start_date, contract_end_date) VALUES
  ('Individual',    'Dr. Rajesh Varma',          'MD Radiology, FRCR', NULL, 'Per Study', 500,    0,      'MRI,CT,USG,X-Ray', '2025-04-01', '2026-03-31'),
  ('Individual',    'Dr. Anitha Krishnan',       'MBBS, DMRD',         1,    'Monthly',   0,      45000,  'USG',              '2025-04-01', '2026-03-31'),
  ('Teleradiology', 'TeleRad Solutions Pvt Ltd', '',                   NULL, 'Per Study', 800,    0,      'MRI,CT',           '2025-04-01', '2026-03-31'),
  ('Individual',    'Dr. Sujith Pillai',         'MD Radiology',       2,    'Per Study', 400,    0,      'X-Ray,USG',        '2025-04-01', '2026-03-31')
ON CONFLICT DO NOTHING;

-- ─── STUDIES ──────────────────────────────────────────────────────────────
INSERT INTO studies (code, name, modality, category, contrast, sac, price, gst_rate, duration, default_radiologist_id) VALUES
  ('MRI-001', 'MRI Brain Plain',             'MRI',   'Brain',         'Plain',    '999316', 4500, 0, 45, 1),
  ('MRI-002', 'MRI Brain Contrast',          'MRI',   'Brain',         'Contrast', '999316', 6000, 0, 60, 1),
  ('MRI-003', 'MRI LS Spine',                'MRI',   'Spine',         'Plain',    '999316', 5000, 0, 45, 1),
  ('MRI-004', 'MRI Cervical Spine',          'MRI',   'Spine',         'Plain',    '999316', 5000, 0, 45, 1),
  ('MRI-005', 'MRI Knee Joint',              'MRI',   'MSK',           'Plain',    '999316', 5000, 0, 40, 1),
  ('MRI-006', 'MRI Shoulder',                'MRI',   'MSK',           'Plain',    '999316', 5000, 0, 40, 1),
  ('MRI-007', 'MRI Abdomen',                 'MRI',   'Abdomen',       'Plain',    '999316', 6000, 0, 50, 1),
  ('MRI-008', 'MRI Whole Spine',             'MRI',   'Spine',         'Plain',    '999316', 9000, 0, 90, 1),
  ('CT-001',  'CT Brain Plain',              'CT',    'Brain',         'Plain',    '999316', 2500, 0, 20, 1),
  ('CT-002',  'CT Brain Contrast',           'CT',    'Brain',         'Contrast', '999316', 3500, 0, 25, 1),
  ('CT-003',  'HRCT Chest',                  'CT',    'Chest',         'Plain',    '999316', 3000, 0, 20, 1),
  ('CT-004',  'CT Abdomen & Pelvis',         'CT',    'Abdomen',       'Plain',    '999316', 3500, 0, 25, 1),
  ('CT-005',  'CT Chest + Abdomen Contrast', 'CT',    'Abdomen',       'Contrast', '999316', 6000, 0, 35, 1),
  ('CT-006',  'CT Angiography',              'CT',    'Cardiac',       'Contrast', '999316', 8000, 0, 30, 3),
  ('CT-007',  'CT KUB',                      'CT',    'Urinary',       'Plain',    '999316', 2500, 0, 15, 1),
  ('USG-001', 'USG Abdomen',                 'USG',   'Abdomen',       'N/A',      '999316',  700, 0, 20, 2),
  ('USG-002', 'USG Obstetric',               'USG',   'OB',            'N/A',      '999316',  800, 0, 20, 2),
  ('USG-003', 'USG Pelvis',                  'USG',   'Pelvis',        'N/A',      '999316',  700, 0, 20, 2),
  ('USG-004', 'USG Thyroid',                 'USG',   'Thyroid',       'N/A',      '999316',  600, 0, 15, 2),
  ('USG-005', 'USG Whole Abdomen + Pelvis',  'USG',   'Abdomen',       'N/A',      '999316', 1000, 0, 25, 2),
  ('USG-006', 'USG Guided FNAC',             'USG',   'Interventional','N/A',      '999316', 1500, 0, 30, 2),
  ('XR-001',  'X-Ray Chest PA',              'X-Ray', 'Chest',         'N/A',      '999316',  300, 0, 10, NULL),
  ('XR-002',  'X-Ray LS Spine AP/LAT',       'X-Ray', 'Spine',         'N/A',      '999316',  350, 0, 10, NULL),
  ('XR-003',  'X-Ray Knee AP/LAT',           'X-Ray', 'MSK',           'N/A',      '999316',  300, 0, 10, NULL),
  ('XR-004',  'X-Ray Pelvis AP',             'X-Ray', 'Pelvis',        'N/A',      '999316',  300, 0, 10, NULL),
  ('OTH-001', 'CD / DVD Copy',               'Other', 'Media',         'N/A',      '998433',  100,18,  5, NULL),
  ('OTH-002', 'Report Charges',              'Other', 'Service',       'N/A',      '999316',   50, 0,  0, NULL)
ON CONFLICT (code) DO NOTHING;

-- ─── REFERRING DOCTORS ────────────────────────────────────────────────────
INSERT INTO referring_doctors (center_id, first_name, last_name, qualification, specialization, clinic_name, phone) VALUES
  (NULL, 'Anil',    'Kumar',          'MBBS, MD',    'General Physician', 'Anil Kumar Clinic, Kollam',          '9400000001'),
  (NULL, 'Priya',   'Nair',           'MBBS, MS',    'Orthopaedics',      'Priya Ortho Centre, Kollam',         '9400000002'),
  (NULL, 'Rajan',   'Pillai',         'MBBS',        'General Physician', 'Rajan Medical Hall, Parippally',     '9400000003'),
  (NULL, 'Sreeja',  'Menon',          'MBBS, DGO',   'Gynaecology',       'Sreeja Women''s Clinic, Kollam',     '9400000004'),
  (NULL, 'Thomas',  'Mathew',         'MBBS, DNB',   'Neurology',         'Thomas Neuro Clinic, Kollam',        '9400000005'),
  (NULL, 'Sumitha', 'Das',            'MBBS, DCH',   'Paediatrics',       'Sumitha Child Care, Parippally',     '9400000006'),
  (NULL, 'Vijayan', 'EK',             'MBBS',        'General Physician', 'Vijayan Clinic, Parippally',         '9400000007'),
  (NULL, 'Bindhu',  'Ramakrishnan',   'MBBS, MD',    'Pulmonology',       'Bindhu Chest Clinic, Kollam',        '9400000008')
ON CONFLICT DO NOTHING;

-- ─── VENDORS ──────────────────────────────────────────────────────────────
INSERT INTO vendors (name, cat, gstin, phone, addr) VALUES
  ('Kerala State Electricity Board', 'Electricity',   '',                '0474-2444000', 'Kollam'),
  ('Property Owner - Kollam',        'Rent',          '',                '',             'Kollam'),
  ('Property Owner - Parippally',    'Rent',          '',                '',             'Parippally'),
  ('Siemens Healthineers',           'Maintenance',   '29CCCCC0000C1Z5', '1800-XXX-XXXX','Bangalore'),
  ('MedTech Consumables Ltd',        'Consumables',   '32BBBBB0000B1Z5', '0484-2333333', 'Ernakulam'),
  ('TeleRad Solutions Pvt Ltd',      'Teleradiology', '27DDDDD0000D1Z5', '022-XXXXXXXX', 'Mumbai'),
  ('Canon Medical Systems',          'Maintenance',   '27EEEEE0000E1Z5', '1800-YYY-YYYY','Bangalore'),
  ('GE Healthcare India',            'Maintenance',   '29FFFFF0000F1Z5', '080-XXXXXXXX', 'Bangalore')
ON CONFLICT DO NOTHING;

-- ─── BANK ACCOUNTS ────────────────────────────────────────────────────────
INSERT INTO bank_accounts (name, bank, acno, ifsc, type, center_id, balance) VALUES
  ('HDFC Kollam Current A/C',    'HDFC Bank',           '50100XXXXXXXX', 'HDFC0001234', 'Current', 1,      610000),
  ('SBI Parippally Current A/C', 'State Bank of India', '3310XXXXXXXX',  'SBIN0001234', 'Current', 2,      350000),
  ('Cash in Hand',               'Cash',                'CASH',          '',            'Cash',    NULL,    80000)
ON CONFLICT DO NOTHING;

-- ─── PERMISSIONS ──────────────────────────────────────────────────────────
INSERT INTO permissions (code, module, description) VALUES
  -- Billing
  ('BILL_VIEW',                 'Billing',     'View bills and patient invoices'),
  ('BILL_CREATE',               'Billing',     'Create new patient bills'),
  ('BILL_EDIT',                 'Billing',     'Edit existing bills'),
  ('BILL_VOID',                 'Billing',     'Void / cancel a bill'),
  ('BILL_DISCOUNT',             'Billing',     'Apply discounts to bills'),
  ('COLLECTION_VIEW',           'Billing',     'View payment collections'),
  ('COLLECTION_CREATE',         'Billing',     'Record payment collections'),
  -- Patients
  ('PATIENT_VIEW',              'Patient',     'View patient records'),
  ('PATIENT_EDIT',              'Patient',     'Edit patient demographics'),
  -- Studies / MWL
  ('STUDY_MASTER_VIEW',         'Study',       'View study master list'),
  ('STUDY_MASTER_EDIT',         'Study',       'Add/edit studies and tariffs'),
  ('MWL_VIEW',                  'Study',       'View MWL worklist'),
  ('MWL_STATUS_UPDATE',         'Study',       'Update MWL status'),
  ('MWL_CONFIG_MANAGE',         'Study',       'Manage MWL API keys per center'),
  -- Radiologist
  ('RADIOLOGIST_VIEW',          'Radiologist', 'View radiologist master'),
  ('RADIOLOGIST_EDIT',          'Radiologist', 'Add/edit radiologist records'),
  ('RADIOLOGIST_ASSIGN',        'Radiologist', 'Assign radiologist to a study'),
  ('RADIOLOGIST_BILLING_VIEW',  'Radiologist', 'View radiologist payable reports'),
  ('RADIOLOGIST_BILLING_CREATE','Radiologist', 'Generate radiologist payable batches'),
  -- Referring Doctors
  ('DOCTOR_MASTER_VIEW',        'Doctor',      'View referring doctor master'),
  ('DOCTOR_MASTER_EDIT',        'Doctor',      'Add/edit referring doctors'),
  -- Fixed Assets
  ('ASSET_VIEW',                'Assets',      'View fixed assets register'),
  ('ASSET_CREATE',              'Assets',      'Add new fixed assets'),
  ('ASSET_EDIT',                'Assets',      'Edit asset details'),
  ('ASSET_DISPOSE',             'Assets',      'Dispose or write off an asset'),
  ('ASSET_DEPRECIATION_POST',   'Assets',      'Post annual depreciation'),
  ('ASSET_CONTRACT_MANAGE',     'Assets',      'Manage asset service contracts'),
  ('ASSET_MAINTENANCE_LOG',     'Assets',      'Log maintenance records'),
  -- Finance
  ('PAYABLE_VIEW',              'Finance',     'View vendor payables'),
  ('PAYABLE_CREATE',            'Finance',     'Create vendor payable entries'),
  ('PAYABLE_APPROVE',           'Finance',     'Approve and mark payables paid'),
  ('BANK_VIEW',                 'Finance',     'View bank accounts and transactions'),
  ('BANK_EDIT',                 'Finance',     'Add bank transactions'),
  -- Reports
  ('REPORT_DAILY',              'Reports',     'View daily revenue report'),
  ('REPORT_MONTHLY',            'Reports',     'View monthly summary reports'),
  ('REPORT_GST',                'Reports',     'View GST reports'),
  ('REPORT_REFERRING_DOCTOR',   'Reports',     'View referring doctor report'),
  ('REPORT_RADIOLOGIST_PAYABLE','Reports',     'View radiologist payable report'),
  ('REPORT_ASSET',              'Reports',     'View fixed asset register report'),
  ('REPORT_AUDIT',              'Reports',     'View audit trail'),
  -- HR
  ('HR_VIEW',                   'HR',          'View employee records'),
  ('HR_EDIT',                   'HR',          'Add/edit employees'),
  ('PAYROLL_PROCESS',           'HR',          'Process and finalise payroll'),
  -- Admin / RBAC
  ('USER_MANAGE',               'Admin',       'Add/edit user accounts'),
  ('RBAC_MANAGE',               'Admin',       'Configure role and user permissions'),
  ('CENTER_CONFIG',             'Admin',       'Edit center/branch configuration'),
  ('CONFIG_MANAGE',             'Admin',       'Edit system configuration')
ON CONFLICT (code) DO NOTHING;

-- ─── ROLE PERMISSIONS — Default grants per role ───────────────────────────
-- superadmin: all permissions
INSERT INTO role_permissions (role, perm_code, granted)
SELECT 'superadmin', code, true FROM permissions
ON CONFLICT (role, perm_code) DO NOTHING;

-- admin: all except superadmin-exclusive
INSERT INTO role_permissions (role, perm_code, granted)
SELECT 'admin', code, true FROM permissions
WHERE code NOT IN ('CONFIG_MANAGE')  -- only superadmin can edit system config
ON CONFLICT (role, perm_code) DO NOTHING;
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('admin','CONFIG_MANAGE',false)
ON CONFLICT (role, perm_code) DO NOTHING;

-- receptionist
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('receptionist','BILL_VIEW',true),        ('receptionist','BILL_CREATE',true),
  ('receptionist','BILL_EDIT',true),        ('receptionist','BILL_VOID',false),
  ('receptionist','BILL_DISCOUNT',false),   ('receptionist','COLLECTION_VIEW',true),
  ('receptionist','COLLECTION_CREATE',true),('receptionist','PATIENT_VIEW',true),
  ('receptionist','PATIENT_EDIT',true),     ('receptionist','STUDY_MASTER_VIEW',true),
  ('receptionist','MWL_VIEW',true),         ('receptionist','MWL_STATUS_UPDATE',true),
  ('receptionist','DOCTOR_MASTER_VIEW',true),('receptionist','RADIOLOGIST_VIEW',true),
  ('receptionist','REPORT_DAILY',true)
ON CONFLICT (role, perm_code) DO NOTHING;

-- finance
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('finance','BILL_VIEW',true),             ('finance','COLLECTION_VIEW',true),
  ('finance','PATIENT_VIEW',true),
  ('finance','PAYABLE_VIEW',true),          ('finance','PAYABLE_CREATE',true),
  ('finance','PAYABLE_APPROVE',true),
  ('finance','BANK_VIEW',true),             ('finance','BANK_EDIT',true),
  ('finance','REPORT_DAILY',true),          ('finance','REPORT_MONTHLY',true),
  ('finance','REPORT_GST',true),            ('finance','REPORT_REFERRING_DOCTOR',true),
  ('finance','REPORT_RADIOLOGIST_PAYABLE',true), ('finance','REPORT_ASSET',true),
  ('finance','ASSET_VIEW',true),
  ('finance','RADIOLOGIST_BILLING_VIEW',true), ('finance','RADIOLOGIST_BILLING_CREATE',true),
  ('finance','DOCTOR_MASTER_VIEW',true)
ON CONFLICT (role, perm_code) DO NOTHING;

-- radiologist
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('radiologist','MWL_VIEW',true),           ('radiologist','MWL_STATUS_UPDATE',true),
  ('radiologist','BILL_VIEW',true),          ('radiologist','PATIENT_VIEW',true),
  ('radiologist','RADIOLOGIST_VIEW',true),   ('radiologist','RADIOLOGIST_ASSIGN',true),
  ('radiologist','STUDY_MASTER_VIEW',true)
ON CONFLICT (role, perm_code) DO NOTHING;

-- hr
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('hr','HR_VIEW',true),    ('hr','HR_EDIT',true),
  ('hr','PAYROLL_PROCESS',true), ('hr','REPORT_DAILY',true),
  ('hr','PATIENT_VIEW',true)
ON CONFLICT (role, perm_code) DO NOTHING;

-- operations (asset management, maintenance, vendor)
INSERT INTO role_permissions (role, perm_code, granted) VALUES
  ('operations','ASSET_VIEW',true),          ('operations','ASSET_EDIT',true),
  ('operations','ASSET_MAINTENANCE_LOG',true),('operations','ASSET_CONTRACT_MANAGE',true),
  ('operations','PAYABLE_VIEW',true),        ('operations','PAYABLE_CREATE',true),
  ('operations','REPORT_ASSET',true),
  ('operations','DOCTOR_MASTER_VIEW',true),  ('operations','RADIOLOGIST_VIEW',true),
  ('operations','STUDY_MASTER_VIEW',true)
ON CONFLICT (role, perm_code) DO NOTHING;

-- ─── DASHBOARD WIDGETS ────────────────────────────────────────────────────
INSERT INTO dashboard_widgets (widget_code, title, description, module, required_permission, default_roles, icon) VALUES
  ('DAILY_REVENUE',        'Today''s Revenue',       'Total billing collected today',                    'Billing',     'REPORT_DAILY',               ARRAY['admin','finance','superadmin'],                       'dollar-sign'),
  ('PENDING_COLLECTIONS',  'Pending Collections',    'Bills with outstanding balances',                  'Billing',     'COLLECTION_VIEW',            ARRAY['admin','finance','receptionist','superadmin'],        'alert-circle'),
  ('BILLS_TODAY',          'Bills Today',            'Number of bills generated today',                  'Billing',     'BILL_VIEW',                  ARRAY['admin','receptionist','superadmin'],                  'file-text'),
  ('PENDING_STUDIES',      'Pending Studies',        'MWL studies awaiting reporting',                   'Study',       'MWL_VIEW',                   ARRAY['admin','radiologist','receptionist','superadmin'],    'clock'),
  ('COMPLETED_STUDIES',    'Completed Studies',      'Studies completed today',                          'Study',       'MWL_VIEW',                   ARRAY['admin','radiologist','superadmin'],                   'check-circle'),
  ('CENTER_REVENUE',       'Revenue by Center',      'Revenue comparison between ARIS centers',          'Reports',     'REPORT_DAILY',               ARRAY['admin','finance','superadmin'],                       'bar-chart-2'),
  ('MONTHLY_TREND',        'Monthly Revenue Trend',  '12-month rolling revenue chart',                   'Reports',     'REPORT_MONTHLY',             ARRAY['admin','finance','superadmin'],                       'trending-up'),
  ('TOP_STUDIES',          'Top Studies Today',      'Most billed study types',                          'Reports',     'REPORT_DAILY',               ARRAY['admin','finance','superadmin'],                       'award'),
  ('ASSET_ALERTS',         'Asset Alerts',           'Assets under maintenance or warranty expiring',    'Assets',      'ASSET_VIEW',                 ARRAY['admin','operations','superadmin'],                    'tool'),
  ('CONTRACT_EXPIRY',      'Contracts Expiring',     'Service contracts expiring within 30 days',        'Assets',      'ASSET_CONTRACT_MANAGE',      ARRAY['admin','operations','finance','superadmin'],          'calendar'),
  ('DEPRECIATION_SUMMARY', 'Depreciation Summary',  'Current year depreciation totals by center',       'Assets',      'ASSET_VIEW',                 ARRAY['admin','finance','superadmin'],                       'trending-down'),
  ('RADIOLOGIST_QUEUE',    'Radiologist Queue',      'Pending studies per radiologist',                  'Radiologist', 'RADIOLOGIST_ASSIGN',         ARRAY['admin','radiologist','superadmin'],                   'users'),
  ('RADIOLOGIST_PAYABLE',  'Radiologist Payable',    'Unpaid radiologist amounts this month',            'Radiologist', 'RADIOLOGIST_BILLING_VIEW',   ARRAY['admin','finance','superadmin'],                       'credit-card'),
  ('REFERRING_DOCTOR',     'Top Referring Doctors',  'Doctors with most referrals this month',           'Doctor',      'REPORT_REFERRING_DOCTOR',    ARRAY['admin','finance','superadmin'],                       'user-check'),
  ('GST_SUMMARY',          'GST Summary',            'CGST + SGST liability current month',              'Finance',     'REPORT_GST',                 ARRAY['admin','finance','superadmin'],                       'percent'),
  ('PAYABLES_DUE',         'Payables Due',           'Vendor payments due this week',                    'Finance',     'PAYABLE_VIEW',               ARRAY['admin','finance','operations','superadmin'],          'inbox'),
  ('BANK_BALANCE',         'Bank Balance',           'Current balances across all accounts',             'Finance',     'BANK_VIEW',                  ARRAY['admin','finance','superadmin'],                       'briefcase'),
  ('EMPLOYEE_ATTENDANCE',  'Employee Attendance',    'Today''s attendance summary',                      'HR',          'HR_VIEW',                    ARRAY['admin','hr','superadmin'],                            'users'),
  ('AUDIT_RECENT',         'Recent Audit Activity',  'Last 10 system audit log entries',                 'Admin',       'REPORT_AUDIT',               ARRAY['admin','superadmin'],                                 'shield')
ON CONFLICT (widget_code) DO NOTHING;

-- ─── FIXED ASSETS ─────────────────────────────────────────────────────────
INSERT INTO fixed_assets (asset_code, center_id, vendor_id, asset_name, category, condition, serial_number, model_number, manufacturer, location, acquisition_date, acquisition_cost, installation_cost, salvage_value, depreciation_method, useful_life_years, wdv_rate, current_book_value, warranty_expiry_date) VALUES
  ('AST-KLM-001', 1, 4, '1.5T MRI Scanner',           'Equipment', 'New',         'MRI-SN-2022-001', 'MAGNETOM Essenza', 'Siemens Healthineers', 'MRI Suite',  '2022-06-15', 12500000, 350000, 500000, 'WDV', 10, 15.00, 7808721.56, '2025-06-14'),
  ('AST-KLM-002', 1, 7, '64-Slice CT Scanner',         'Equipment', 'New',         'CT-SN-2023-001',  'Aquilion 64',     'Canon Medical Systems','CT Suite',   '2023-01-10', 8200000,  280000, 300000, 'WDV', 10, 15.00, 6315415.00, '2026-01-09'),
  ('AST-KLM-003', 1, 7, 'Digital X-Ray DR System',    'Equipment', 'New',         'XR-SN-2021-001',  'CXDI-710C',       'Canon Medical Systems','X-Ray Room', '2021-09-01', 1800000,  120000, 100000, 'SLM', 8,  0.00,   872500.00, '2024-08-31'),
  ('AST-KLM-004', 1, 8, 'USG Machine (Radiology)',     'Equipment', 'New',         'USG-SN-2022-002', 'LOGIQ E10',       'GE Healthcare',        'USG Room',   '2022-03-01', 2500000,  80000,  150000, 'WDV', 8,  25.00, 1201171.87, '2025-02-28'),
  ('AST-PRP-001', 2, 7, '32-Slice CT Scanner',         'Equipment', 'Refurbished', 'CT-SN-2020-002',  'Aquilion 32',     'Canon Medical Systems','CT Suite',   '2020-07-01', 5500000,  200000, 250000, 'WDV', 10, 15.00, 3021425.94, '2023-06-30'),
  ('AST-PRP-002', 2, 8, 'USG Machine (Parippally)',    'Equipment', 'New',         'USG-SN-2023-003', 'LOGIQ P9',        'GE Healthcare',        'USG Room',   '2023-06-01', 1800000,  60000,  100000, 'WDV', 8,  25.00, 1139062.50, '2026-05-31'),
  ('AST-KLM-005', 1, NULL,'Reporting Workstation',      'IT',        'New',         'WS-SN-2023-001',  'Z4 G5',           'HP Enterprise',        'Report Room','2023-08-15',  280000,  0,       20000, 'SLM', 5,  0.00,   126000.00, '2026-08-14'),
  ('AST-KLM-006', 1, NULL,'UPS 30KVA',                  'Equipment', 'New',         'UPS-SN-2022-003', '30KVA Online',    'APC by Schneider',     'UPS Room',   '2022-05-01',  380000,  25000,   30000, 'SLM', 8,  0.00,   218437.50, '2025-04-30')
ON CONFLICT (asset_code) DO NOTHING;

-- ─── ASSET SERVICE CONTRACTS ──────────────────────────────────────────────
INSERT INTO asset_service_contracts (asset_id, vendor_id, contract_type, contract_ref_no, start_date, end_date, annual_cost, coverage_details, response_time_sla, renewal_reminder_days, status) VALUES
  (1, 4, 'AMC',              'SIE-AMC-2025-001', '2025-04-01', '2026-03-31', 850000, 'Parts + Labour for MRI including gradient coils and RF components',   '24 hours',          45, 'Active'),
  (2, 7, 'AMC',              'CAN-AMC-2025-001', '2025-04-01', '2026-03-31', 620000, 'Full parts and labour coverage for CT including X-ray tube',           '24 hours',          45, 'Active'),
  (2, 7, 'Software Support', 'CAN-SW-2025-001',  '2025-04-01', '2026-03-31',  85000, 'Software updates, clinical applications and remote support',           '4 hours',           30, 'Active'),
  (5, 4, 'SLA',              'SIE-SLA-2025-001', '2025-04-01', '2026-03-31', 420000, 'Labour only SLA for Parippally CT scanner',                            '4 hours',           30, 'Active'),
  (1, 4, 'AMC',              'SIE-AMC-2024-001', '2024-04-01', '2025-03-31', 780000, 'Previous year AMC for MRI Kollam',                                     '24 hours',          45, 'Expired')
ON CONFLICT DO NOTHING;

-- ─── ASSET MAINTENANCE RECORDS ────────────────────────────────────────────
INSERT INTO asset_maintenance_records (asset_id, service_contract_id, vendor_id, maintenance_type, date, description, labor_cost, parts_cost, other_cost, downtime_hours, performed_by, status) VALUES
  (1, 1, 4, 'Preventive',   '2025-10-15', 'Quarterly PM - MRI coil check, cooling system service, field uniformity check', 0,     0,    0, 4,  'Siemens Engineer - Ravi Kumar', 'Completed'),
  (2, 2, 7, 'Preventive',   '2025-11-20', 'Semi-annual PM - CT X-ray tube check, detector calibration, cooling system',    0,     0,    0, 6,  'Canon Engineer - Jithin Nair',  'Completed'),
  (1, 1, 4, 'Corrective',   '2025-12-05', 'Gradient coil temperature alarm - coolant top-up, alarm cleared',               25000, 8500, 0, 18, 'Siemens Engineer - Ravi Kumar', 'Completed'),
  (3, NULL,NULL,'Calibration','2025-09-01','Annual calibration and QA for DR - exposure linearity, resolution, SNR',        8000,  0, 2000, 2,  'In-house Biomedical',           'Completed'),
  (5, 4, 4, 'Preventive',   '2025-10-20', 'Quarterly PM for Parippally CT - detector calibration, filter check',           0,     0,    0, 5,  'Siemens Engineer - Suresh M',   'Completed')
ON CONFLICT DO NOTHING;

-- ─── DEPRECIATION SCHEDULES FY 2025-26 ───────────────────────────────────
INSERT INTO asset_depreciation_schedules (asset_id, fiscal_year, opening_value, depreciation_amount, closing_value, depreciation_rate, depreciation_posted) VALUES
  (1, '2025-26',  9186731.25, 1378009.69, 7808721.56, 15.00, true),
  (2, '2025-26',  7429900.00, 1114485.00, 6315415.00, 15.00, true),
  (3, '2025-26',  1085000.00,  212500.00,  872500.00, 12.50, true),
  (4, '2025-26',  1601562.50,  400390.63, 1201171.87, 25.00, true),
  (5, '2025-26',  3554618.75,  533192.81, 3021425.94, 15.00, true),
  (6, '2025-26',  1518750.00,  379687.50, 1139062.50, 25.00, true),
  (7, '2025-26',   178000.00,   52000.00,  126000.00, 20.00, true),
  (8, '2025-26',   263750.00,   45312.50,  218437.50, 16.67, true)
ON CONFLICT (asset_id, fiscal_year) DO NOTHING;

-- Users are created by seed.js with bcrypt hashing (never store plain-text passwords here).
