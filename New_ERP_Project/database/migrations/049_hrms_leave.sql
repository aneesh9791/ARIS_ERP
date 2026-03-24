-- 049: HRMS — Designations, Leave Management, Seed HR Departments

-- ── 1. Seed HR/Admin departments (skip if already exist) ─────────────────────
INSERT INTO departments (name, code, description, is_active)
VALUES
  ('Nursing',           'NRS', 'Nursing & Patient Care',           true),
  ('Administration',    'ADM', 'Administrative staff',             true),
  ('Information Technology', 'IT', 'IT & Systems',                 true),
  ('Finance & Accounts','FIN', 'Finance and Accounts',             true),
  ('Human Resources',   'HRD', 'HR Department',                    true),
  ('Operations',        'OPS', 'Operations Management',            true),
  ('Management',        'MGT', 'Senior Management',                true)
ON CONFLICT DO NOTHING;

-- ── 2. Designations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designations (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(20)  UNIQUE NOT NULL,
  name         VARCHAR(100) NOT NULL,
  department_id INT REFERENCES departments(id),
  grade        VARCHAR(20),
  sort_order   SMALLINT DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO designations (code, name, department_id, grade, sort_order) VALUES
  ('MD',      'Managing Director',          (SELECT id FROM departments WHERE code='MGT'), 'L10', 10),
  ('CEO',     'Chief Executive Officer',    (SELECT id FROM departments WHERE code='MGT'), 'L9',  20),
  ('COO',     'Chief Operating Officer',    (SELECT id FROM departments WHERE code='OPS'), 'L9',  30),
  ('CFO',     'Chief Financial Officer',    (SELECT id FROM departments WHERE code='FIN'), 'L9',  40),
  ('CTO',     'Chief Technology Officer',   (SELECT id FROM departments WHERE code='IT'),  'L9',  50),
  ('GM',      'General Manager',            NULL, 'L8', 60),
  ('AGM',     'Asst. General Manager',      NULL, 'L7', 70),
  ('MGR',     'Manager',                    NULL, 'L6', 80),
  ('DY_MGR',  'Deputy Manager',             NULL, 'L5', 90),
  ('EXEC',    'Executive',                  NULL, 'L4', 100),
  ('SR_EXEC', 'Senior Executive',           NULL, 'L4', 110),
  ('ASST',    'Assistant',                  NULL, 'L3', 120),
  ('SR_ASST', 'Senior Assistant',           NULL, 'L3', 130),
  ('RAD_DR',  'Radiologist',               (SELECT id FROM departments WHERE code='RAD'), 'L6', 140),
  ('SR_RAD',  'Senior Radiologist',        (SELECT id FROM departments WHERE code='RAD'), 'L7', 150),
  ('TECH',    'Radiography Technician',    (SELECT id FROM departments WHERE code='RAD'), 'L3', 160),
  ('SR_TECH', 'Senior Radiography Technician', (SELECT id FROM departments WHERE code='RAD'), 'L4', 170),
  ('NURSE',   'Nurse',                     (SELECT id FROM departments WHERE code='NRS'), 'L3', 180),
  ('SR_NURSE','Senior Nurse',              (SELECT id FROM departments WHERE code='NRS'), 'L4', 190),
  ('RECEP',   'Receptionist',              (SELECT id FROM departments WHERE code='ADM'), 'L2', 200),
  ('IT_ENG',  'IT Engineer',               (SELECT id FROM departments WHERE code='IT'),  'L4', 210),
  ('ACCTS',   'Accountant',               (SELECT id FROM departments WHERE code='FIN'), 'L3', 220),
  ('SR_ACCTS','Senior Accountant',        (SELECT id FROM departments WHERE code='FIN'), 'L4', 230),
  ('HR_EXEC', 'HR Executive',             (SELECT id FROM departments WHERE code='HRD'), 'L3', 240),
  ('OPS_EXEC','Operations Executive',     (SELECT id FROM departments WHERE code='OPS'), 'L3', 250)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Extend employees with FK columns (keep text columns for compat) ────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department_id  INT REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS designation_id INT REFERENCES designations(id),
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) NOT NULL DEFAULT 'FULL_TIME'
    CHECK (employment_type IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN'));

CREATE INDEX IF NOT EXISTS idx_employees_department_id  ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_designation_id ON employees(designation_id);

-- ── 4. Leave types ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(20)  UNIQUE NOT NULL,
  name              VARCHAR(100) NOT NULL,
  days_per_year     NUMERIC(5,1) NOT NULL DEFAULT 0,
  carry_forward     BOOLEAN NOT NULL DEFAULT false,
  max_carry_forward NUMERIC(5,1)  NOT NULL DEFAULT 0,
  paid              BOOLEAN NOT NULL DEFAULT true,
  requires_doc      BOOLEAN NOT NULL DEFAULT false,
  min_days          NUMERIC(4,1) NOT NULL DEFAULT 0.5,
  max_days          NUMERIC(5,1) NOT NULL DEFAULT 365,
  sort_order        SMALLINT DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO leave_types (code, name, days_per_year, carry_forward, max_carry_forward, paid, requires_doc, sort_order)
VALUES
  ('CL',  'Casual Leave',        12,  false, 0,  true,  false, 10),
  ('SL',  'Sick Leave',          12,  false, 0,  true,  true,  20),
  ('EL',  'Earned Leave',        15,  true,  30, true,  false, 30),
  ('ML',  'Maternity Leave',     182, false, 0,  true,  true,  40),
  ('PL',  'Paternity Leave',     15,  false, 0,  true,  false, 50),
  ('CO',  'Compensatory Off',    0,   true,  12, true,  false, 60),
  ('LWP', 'Leave Without Pay',   0,   false, 0,  false, false, 70)
ON CONFLICT (code) DO NOTHING;

-- ── 5. Leave balances (per employee, per type, per year) ─────────────────────
CREATE TABLE IF NOT EXISTS leave_balances (
  id               SERIAL PRIMARY KEY,
  employee_id      INT NOT NULL REFERENCES employees(id),
  leave_type_id    INT NOT NULL REFERENCES leave_types(id),
  year             SMALLINT NOT NULL,
  entitlement      NUMERIC(5,1) NOT NULL DEFAULT 0,
  used             NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_forward  NUMERIC(5,1) NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id, year);

-- ── 6. Leave requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id               SERIAL PRIMARY KEY,
  employee_id      INT NOT NULL REFERENCES employees(id),
  leave_type_id    INT NOT NULL REFERENCES leave_types(id),
  from_date        DATE NOT NULL,
  to_date          DATE NOT NULL,
  days             NUMERIC(4,1) NOT NULL,
  reason           TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approved_by      INT REFERENCES users(id),
  approved_at      TIMESTAMP,
  rejection_reason TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates    ON leave_requests(from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON leave_requests(status) WHERE active = true;
