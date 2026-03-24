-- 048: Complete finance structure — corporate entity, contract rules, parties, subledger, dimensions

-- ── 1. corporate_entities ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corporate_entities (
  id             SERIAL PRIMARY KEY,
  entity_code    VARCHAR(20)  NOT NULL UNIQUE,
  entity_name    VARCHAR(200) NOT NULL,
  legal_name     VARCHAR(200),
  gstin          VARCHAR(15),
  pan            VARCHAR(10),
  address        TEXT,
  city           VARCHAR(100),
  state          VARCHAR(100),
  country        VARCHAR(100) DEFAULT 'India',
  email          VARCHAR(100),
  phone          VARCHAR(20),
  active         BOOLEAN      DEFAULT true,
  created_at     TIMESTAMP    DEFAULT NOW(),
  updated_at     TIMESTAMP    DEFAULT NOW()
);

INSERT INTO corporate_entities (entity_code, entity_name, legal_name)
VALUES ('FEENIX', 'Feenixtech', 'Feenixtech Private Limited')
ON CONFLICT (entity_code) DO NOTHING;

-- ── 2. Link centers to corporate entity ───────────────────────────────────
ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS corporate_entity_id INTEGER REFERENCES corporate_entities(id),
  ADD COLUMN IF NOT EXISTS start_date DATE;

UPDATE centers
SET corporate_entity_id = (SELECT id FROM corporate_entities WHERE entity_code = 'FEENIX')
WHERE corporate_entity_id IS NULL;

-- ── 3. parties — unified counterparty table ───────────────────────────────
CREATE TABLE IF NOT EXISTS parties (
  id              SERIAL PRIMARY KEY,
  party_code      VARCHAR(30)  NOT NULL UNIQUE,
  party_name      VARCHAR(200) NOT NULL,
  party_type      VARCHAR(30)  NOT NULL
    CHECK (party_type IN ('VENDOR','RADIOLOGIST','TELERADIOLOGY','LANDLORD','PARTNER','INSURER','OTHER')),
  vendor_id       INTEGER REFERENCES vendor_master(id),
  radiologist_id  INTEGER REFERENCES radiologist_master(id),
  gstin           VARCHAR(15),
  pan             VARCHAR(10),
  email           VARCHAR(100),
  phone           VARCHAR(20),
  address         TEXT,
  ap_account_id   INTEGER REFERENCES chart_of_accounts(id),
  bank_name       VARCHAR(100),
  bank_account_no VARCHAR(30),
  bank_ifsc       VARCHAR(15),
  active          BOOLEAN   DEFAULT true,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type);
CREATE INDEX IF NOT EXISTS idx_parties_vendor ON parties(vendor_id);
CREATE INDEX IF NOT EXISTS idx_parties_rad ON parties(radiologist_id);

-- Seed from vendor_master
INSERT INTO parties (party_code, party_name, party_type, vendor_id, gstin, ap_account_id)
SELECT
  'V-' || vm.vendor_code,
  vm.vendor_name,
  'VENDOR',
  vm.id,
  vm.gst_number,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113' LIMIT 1)
FROM vendor_master vm
ON CONFLICT (party_code) DO NOTHING;

-- Seed from radiologist_master
INSERT INTO parties (party_code, party_name, party_type, radiologist_id, ap_account_id)
SELECT
  'R-' || rm.radiologist_code,
  rm.radiologist_name,
  CASE rm.reporter_type WHEN 'TELERADIOLOGY' THEN 'TELERADIOLOGY' ELSE 'RADIOLOGIST' END,
  rm.id,
  (SELECT id FROM chart_of_accounts WHERE account_code = '2113' LIMIT 1)
FROM radiologist_master rm
ON CONFLICT (party_code) DO NOTHING;

-- ── 4. party_ledgers — subledger ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS party_ledgers (
  id               SERIAL PRIMARY KEY,
  party_id         INTEGER      NOT NULL REFERENCES parties(id),
  journal_entry_id INTEGER      NOT NULL REFERENCES journal_entries(id),
  journal_line_id  INTEGER      REFERENCES journal_entry_lines(id),
  center_id        INTEGER      REFERENCES centers(id),
  transaction_date DATE         NOT NULL,
  document_number  VARCHAR(50),
  narration        TEXT,
  debit_amount     NUMERIC(15,2) DEFAULT 0,
  credit_amount    NUMERIC(15,2) DEFAULT 0,
  source_module    VARCHAR(50),
  source_ref       VARCHAR(100),
  created_at       TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_party_ledgers_party   ON party_ledgers(party_id);
CREATE INDEX IF NOT EXISTS idx_party_ledgers_je      ON party_ledgers(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_party_ledgers_center  ON party_ledgers(center_id);
CREATE INDEX IF NOT EXISTS idx_party_ledgers_date    ON party_ledgers(transaction_date);

-- ── 5. center_contract_rules ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS center_contract_rules (
  id                    SERIAL PRIMARY KEY,
  center_id             INTEGER      NOT NULL REFERENCES centers(id),
  contract_model        VARCHAR(20)  NOT NULL
    CHECK (contract_model IN ('LEASE','REVENUE_SHARE','HYBRID','CUSTOM')),
  effective_from        DATE         NOT NULL,
  effective_to          DATE,
  fixed_fee_amount      NUMERIC(12,2) DEFAULT 0,
  revenue_share_percent NUMERIC(5,2)  DEFAULT 0,
  share_basis           VARCHAR(20)   DEFAULT 'GROSS_BILL'
    CHECK (share_basis IN ('GROSS_BILL','NET_BILL','COLLECTION')),
  minimum_guarantee     NUMERIC(12,2) DEFAULT 0,
  settlement_frequency  VARCHAR(20)   DEFAULT 'MONTHLY'
    CHECK (settlement_frequency IN ('MONTHLY','QUARTERLY','ANNUAL')),
  expense_account_id    INTEGER REFERENCES chart_of_accounts(id),
  payable_party_id      INTEGER REFERENCES parties(id),
  notes                 TEXT,
  active                BOOLEAN   DEFAULT true,
  created_by            INTEGER   REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_ccr_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_ccr_center    ON center_contract_rules(center_id);
CREATE INDEX IF NOT EXISTS idx_ccr_effective ON center_contract_rules(center_id, effective_from);

-- Migrate existing inline contract data from centers
INSERT INTO center_contract_rules
  (center_id, contract_model, effective_from, revenue_share_percent, minimum_guarantee, expense_account_id)
SELECT
  c.id,
  CASE c.business_model
    WHEN 'REVENUE_SHARE' THEN 'REVENUE_SHARE'
    WHEN 'HYBRID'        THEN 'HYBRID'
    ELSE 'LEASE'
  END,
  COALESCE(c.created_at::date, CURRENT_DATE),
  COALESCE(c.revenue_share_pct, 0),
  COALESCE(c.min_guarantee_amount, 0),
  (SELECT id FROM chart_of_accounts WHERE account_code = '5310' LIMIT 1)
FROM centers c
WHERE c.active = true
ON CONFLICT DO NOTHING;

-- ── 6. Add dimensions to journal_entry_lines ──────────────────────────────
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS party_id             INTEGER REFERENCES parties(id),
  ADD COLUMN IF NOT EXISTS study_instance_id    VARCHAR(36),  -- FK to studies.id (UUID)
  ADD COLUMN IF NOT EXISTS center_id            INTEGER REFERENCES centers(id),
  ADD COLUMN IF NOT EXISTS reporting_entity_id  INTEGER REFERENCES radiologist_master(id),
  ADD COLUMN IF NOT EXISTS source_ref           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS narration            TEXT;

CREATE INDEX IF NOT EXISTS idx_jel_party    ON journal_entry_lines(party_id);
CREATE INDEX IF NOT EXISTS idx_jel_study    ON journal_entry_lines(study_instance_id);
CREATE INDEX IF NOT EXISTS idx_jel_center   ON journal_entry_lines(center_id);

-- ── 7. radiologist_study_rates — add center + effective dates ─────────────
ALTER TABLE radiologist_study_rates DROP CONSTRAINT IF EXISTS radiologist_study_rates_radiologist_id_study_id_key;

ALTER TABLE radiologist_study_rates
  ADD COLUMN IF NOT EXISTS center_id      INTEGER REFERENCES centers(id),
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to   DATE,
  ADD COLUMN IF NOT EXISTS notes          TEXT;

-- New unique: one rate per reporter + study + center(null=global) + start date
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsr_unique
  ON radiologist_study_rates(radiologist_id, study_id, COALESCE(center_id, 0), effective_from);

-- ── 8. studies — add reporting finance tracking ───────────────────────────
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS reporting_je_id       INTEGER REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reporting_payable_id  INTEGER,
  ADD COLUMN IF NOT EXISTS reporting_posted_at   TIMESTAMP;

-- ── 9. journal_entries — idempotency key ─────────────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS posting_key VARCHAR(150);

CREATE UNIQUE INDEX IF NOT EXISTS idx_je_posting_key
  ON journal_entries(posting_key) WHERE posting_key IS NOT NULL;

-- ── 10. financial_periods — fix to monthly (1–12) ────────────────────────
ALTER TABLE financial_periods DROP CONSTRAINT IF EXISTS financial_periods_period_number_check;
ALTER TABLE financial_periods
  ADD CONSTRAINT financial_periods_period_number_check
    CHECK (period_number >= 1 AND period_number <= 12);
