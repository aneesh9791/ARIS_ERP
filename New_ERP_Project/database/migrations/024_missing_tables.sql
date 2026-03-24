-- Migration 024: Missing tables and column alignment
-- Adds scanners, invoices, api_call_logs tables and fixes column gaps
-- identified during backend route vs DB audit.

-- ============================================================
-- 1. PATIENTS: rename dob -> date_of_birth + add medical_history
-- ============================================================
ALTER TABLE patients RENAME COLUMN dob TO date_of_birth;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS medical_history TEXT;

-- ============================================================
-- 2. STUDIES: make auto-generated columns nullable so backend
--    inserts that omit accession_number / study_instance_uid work
-- ============================================================
ALTER TABLE studies
  ALTER COLUMN accession_number DROP NOT NULL,
  ALTER COLUMN study_instance_uid DROP NOT NULL;

ALTER TABLE studies
  ALTER COLUMN appointment_date DROP NOT NULL,
  ALTER COLUMN appointment_time DROP NOT NULL;

-- Add study_id (backend-facing business key, separate from PK id)
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS study_id VARCHAR(36) UNIQUE;

-- Alias columns matching backend field names
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(5),
  ADD COLUMN IF NOT EXISTS study_date DATE,
  ADD COLUMN IF NOT EXISTS completion_date DATE,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'ROUTINE',
  ADD COLUMN IF NOT EXISTS scanner_id VARCHAR(36);

-- Populate alias columns from existing data
UPDATE studies SET
  scheduled_date = appointment_date,
  scheduled_time = appointment_time,
  study_date     = appointment_date
WHERE scheduled_date IS NULL;

-- Keep alias columns in sync via trigger
CREATE OR REPLACE FUNCTION sync_study_date_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- sync appointment_date <-> scheduled_date <-> study_date on write
  IF NEW.appointment_date IS NOT NULL AND NEW.scheduled_date IS NULL THEN
    NEW.scheduled_date := NEW.appointment_date;
    NEW.study_date     := NEW.appointment_date;
  ELSIF NEW.scheduled_date IS NOT NULL AND NEW.appointment_date IS NULL THEN
    NEW.appointment_date := NEW.scheduled_date;
    NEW.study_date       := NEW.scheduled_date;
  END IF;
  IF NEW.appointment_time IS NOT NULL AND NEW.scheduled_time IS NULL THEN
    NEW.scheduled_time := NEW.appointment_time;
  ELSIF NEW.scheduled_time IS NOT NULL AND NEW.appointment_time IS NULL THEN
    NEW.appointment_time := NEW.scheduled_time;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_study_dates ON studies;
CREATE TRIGGER trg_sync_study_dates
  BEFORE INSERT OR UPDATE ON studies
  FOR EACH ROW EXECUTE FUNCTION sync_study_date_aliases();

-- ============================================================
-- 3. PATIENT_BILLS: add study_id FK
-- ============================================================
ALTER TABLE patient_bills
  ADD COLUMN IF NOT EXISTS study_id VARCHAR(36) REFERENCES studies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_bills_study_id ON patient_bills(study_id);
CREATE INDEX IF NOT EXISTS idx_patient_bills_patient_id ON patient_bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_bills_payment_status ON patient_bills(payment_status);

-- ============================================================
-- 4. SCANNERS table (required by scanners.js route)
-- ============================================================
CREATE TABLE IF NOT EXISTS scanners (
  id                     VARCHAR(36)  PRIMARY KEY,
  name                   VARCHAR(100) NOT NULL,
  scanner_type           VARCHAR(20)  NOT NULL CHECK (scanner_type IN
                           ('MRI','CT','XRAY','ULTRASOUND','MAMMOGRAPHY','PET','SPECT')),
  modality               VARCHAR(20),               -- matches center_modalities.modality
  manufacturer           VARCHAR(100) NOT NULL,
  model                  VARCHAR(100) NOT NULL,
  serial_number          VARCHAR(50)  NOT NULL UNIQUE,
  center_id              INTEGER      REFERENCES centers(id),
  installation_date      DATE,
  last_maintenance_date  DATE,
  next_maintenance_date  DATE,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','maintenance','offline')),
  capacity_daily         INTEGER      DEFAULT 20,
  specialties            JSONB        DEFAULT '[]',
  technical_specs        JSONB        DEFAULT '{}',
  warranty_expiry        DATE,
  created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  active                 BOOLEAN      DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_scanners_center_id    ON scanners(center_id);
CREATE INDEX IF NOT EXISTS idx_scanners_active        ON scanners(active);
CREATE INDEX IF NOT EXISTS idx_scanners_scanner_type  ON scanners(scanner_type);

-- Now add FK from studies.scanner_id -> scanners.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studies_scanner_id_fkey'
  ) THEN
    ALTER TABLE studies ADD CONSTRAINT studies_scanner_id_fkey
      FOREIGN KEY (scanner_id) REFERENCES scanners(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ============================================================
-- 5. INVOICES table (referenced by centers.js route)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL        PRIMARY KEY,
  invoice_number VARCHAR(50)   NOT NULL UNIQUE,
  center_id      INTEGER       REFERENCES centers(id),
  patient_id     VARCHAR(36)   REFERENCES patients(id),
  study_id       VARCHAR(36)   REFERENCES studies(id) ON DELETE SET NULL,
  amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','overdue','cancelled','draft')),
  invoice_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date       DATE,
  notes          TEXT,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  active         BOOLEAN       DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_invoices_center_id  ON invoices(center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_active     ON invoices(active);

-- ============================================================
-- 6. API_CALL_LOGS table (referenced by patients.js / studies.js)
--    patient_id must be VARCHAR(36) to match patients.id
-- ============================================================
CREATE TABLE IF NOT EXISTS api_call_logs (
  id             SERIAL       PRIMARY KEY,
  patient_id     VARCHAR(36)  REFERENCES patients(id) ON DELETE SET NULL,
  pid            VARCHAR(20),
  endpoint       TEXT,
  request_data   JSONB,
  response_code  INTEGER,
  success        BOOLEAN,
  error_message  TEXT,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_call_logs_patient_id ON api_call_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_pid        ON api_call_logs(pid);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_created_at ON api_call_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_call_logs_success    ON api_call_logs(success);
