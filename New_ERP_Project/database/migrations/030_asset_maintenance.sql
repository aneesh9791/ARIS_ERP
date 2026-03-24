-- Migration 030: Asset Maintenance Management
-- Full lifecycle cost tracking for assets:
--   - Maintenance contracts (AMC, CMC, SLA, CMS, WARRANTY, CALIBRATION)
--   - Maintenance event logs (Preventive, Corrective, Breakdown, Calibration)
--   - Spare parts consumed per maintenance event
--   - Lifecycle cost view: acquisition + contract + repair + parts

-- ─── 1. Maintenance Contracts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance_contracts (
  id                       SERIAL PRIMARY KEY,
  asset_id                 INTEGER       NOT NULL REFERENCES asset_master(id),
  contract_type            VARCHAR(20)   NOT NULL
    CHECK (contract_type IN ('AMC','CMC','SLA','CMS','WARRANTY','EXTENDED_WARRANTY','CALIBRATION')),
  contract_number          VARCHAR(50),
  vendor_name              VARCHAR(200)  NOT NULL,
  vendor_contact           VARCHAR(100),
  vendor_email             VARCHAR(150),
  start_date               DATE          NOT NULL,
  end_date                 DATE          NOT NULL,
  contract_value           DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- SLA / uptime terms (relevant for SLA & CMC)
  response_time_hours      INTEGER,        -- guaranteed first response (hrs)
  resolution_time_hours    INTEGER,        -- guaranteed fix time (hrs)
  uptime_guarantee_pct     DECIMAL(5,2),   -- e.g. 99.5
  penalty_per_hour         DECIMAL(10,2) DEFAULT 0,
  -- Coverage flags
  parts_included           BOOLEAN       DEFAULT false,
  labor_included           BOOLEAN       DEFAULT true,
  onsite_support           BOOLEAN       DEFAULT true,
  remote_support           BOOLEAN       DEFAULT true,
  preventive_visits_yr     INTEGER       DEFAULT 0,
  -- Details
  coverage_scope           TEXT,
  notes                    TEXT,
  active                   BOOLEAN       NOT NULL DEFAULT true,
  created_at               TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amc_asset   ON asset_maintenance_contracts(asset_id);
CREATE INDEX IF NOT EXISTS idx_amc_dates   ON asset_maintenance_contracts(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_amc_type    ON asset_maintenance_contracts(contract_type);

-- ─── 2. Maintenance Event Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
  id                   SERIAL PRIMARY KEY,
  asset_id             INTEGER       NOT NULL REFERENCES asset_master(id),
  contract_id          INTEGER       REFERENCES asset_maintenance_contracts(id),
  maintenance_type     VARCHAR(20)   NOT NULL
    CHECK (maintenance_type IN ('PREVENTIVE','CORRECTIVE','BREAKDOWN','CALIBRATION','INSPECTION','UPGRADE')),
  reference_number     VARCHAR(50),
  reported_date        DATE          NOT NULL,
  start_date           DATE,
  completion_date      DATE,
  downtime_hours       DECIMAL(6,2)  DEFAULT 0,
  -- Responsible party
  technician_name      VARCHAR(100),
  vendor_name          VARCHAR(150),
  -- Description
  problem_description  TEXT,
  work_performed       TEXT,
  observations         TEXT,
  next_service_date    DATE,
  -- Costs (auto-updated by trigger / set on save)
  labor_cost           DECIMAL(12,2) DEFAULT 0,
  parts_cost           DECIMAL(12,2) DEFAULT 0,
  other_cost           DECIMAL(12,2) DEFAULT 0,
  total_cost           DECIMAL(12,2) GENERATED ALWAYS AS
                         (COALESCE(labor_cost,0) + COALESCE(parts_cost,0) + COALESCE(other_cost,0)) STORED,
  status               VARCHAR(20)   NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  active               BOOLEAN       NOT NULL DEFAULT true,
  created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_asset  ON asset_maintenance_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_aml_dates  ON asset_maintenance_logs(reported_date, completion_date);
CREATE INDEX IF NOT EXISTS idx_aml_status ON asset_maintenance_logs(status);

-- ─── 3. Spare Parts Used per Maintenance Event ────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance_parts (
  id                  SERIAL PRIMARY KEY,
  maintenance_log_id  INTEGER       NOT NULL REFERENCES asset_maintenance_logs(id) ON DELETE CASCADE,
  item_master_id      INTEGER       REFERENCES item_master(id), -- optional link to stock
  part_code           VARCHAR(50),
  part_name           VARCHAR(200)  NOT NULL,
  quantity            DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_cost           DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cost          DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes               TEXT,
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_amp_log  ON asset_maintenance_parts(maintenance_log_id);

-- ─── 4. Auto-update parts_cost on log when parts change ───────────────────────
CREATE OR REPLACE FUNCTION sync_maintenance_parts_cost()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE asset_maintenance_logs
  SET parts_cost = (
    SELECT COALESCE(SUM(total_cost), 0)
    FROM asset_maintenance_parts
    WHERE maintenance_log_id = COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.maintenance_log_id, OLD.maintenance_log_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parts_cost_ins ON asset_maintenance_parts;
DROP TRIGGER IF EXISTS trg_parts_cost_del ON asset_maintenance_parts;
CREATE TRIGGER trg_parts_cost_ins AFTER INSERT OR UPDATE ON asset_maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION sync_maintenance_parts_cost();
CREATE TRIGGER trg_parts_cost_del AFTER DELETE ON asset_maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION sync_maintenance_parts_cost();

-- ─── 5. Lifecycle Cost View ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW asset_lifecycle_cost_view AS
SELECT
  am.id                                                           AS asset_id,
  am.asset_code,
  am.asset_name,
  am.asset_type,
  am.center_id,
  c.name                                                          AS center_name,
  am.purchase_cost                                                AS acquisition_cost,
  am.purchase_date                                                AS acquisition_date,
  -- Contract costs (sum of all active contracts)
  COALESCE(SUM(DISTINCT amc.contract_value) FILTER (WHERE amc.id IS NOT NULL), 0)
                                                                  AS total_contract_cost,
  -- Maintenance / repair costs (completed events)
  COALESCE(SUM(aml.total_cost) FILTER (WHERE aml.id IS NOT NULL AND aml.status = 'COMPLETED'), 0)
                                                                  AS total_maintenance_cost,
  COALESCE(SUM(aml.labor_cost) FILTER (WHERE aml.id IS NOT NULL AND aml.status = 'COMPLETED'), 0)
                                                                  AS total_labor_cost,
  COALESCE(SUM(aml.parts_cost) FILTER (WHERE aml.id IS NOT NULL AND aml.status = 'COMPLETED'), 0)
                                                                  AS total_parts_cost,
  -- Counts
  COUNT(DISTINCT amc.id)                                          AS contract_count,
  COUNT(DISTINCT aml.id) FILTER (WHERE aml.id IS NOT NULL)        AS maintenance_count,
  COUNT(DISTINCT aml.id) FILTER (WHERE aml.status = 'OPEN' OR aml.status = 'IN_PROGRESS')
                                                                  AS open_tickets,
  COALESCE(SUM(aml.downtime_hours) FILTER (WHERE aml.id IS NOT NULL), 0)
                                                                  AS total_downtime_hours,
  -- Last service
  MAX(aml.completion_date) FILTER (WHERE aml.status = 'COMPLETED')
                                                                  AS last_service_date,
  -- Next contract expiry
  MIN(amc.end_date) FILTER (WHERE amc.end_date >= CURRENT_DATE AND amc.active = true)
                                                                  AS nearest_contract_expiry,
  -- Total lifecycle cost
  am.purchase_cost
    + COALESCE(SUM(DISTINCT amc.contract_value) FILTER (WHERE amc.id IS NOT NULL), 0)
    + COALESCE(SUM(aml.total_cost) FILTER (WHERE aml.id IS NOT NULL AND aml.status = 'COMPLETED'), 0)
                                                                  AS total_lifecycle_cost
FROM asset_master am
LEFT JOIN centers c
       ON am.center_id = c.id
LEFT JOIN asset_maintenance_contracts amc
       ON am.id = amc.asset_id AND amc.active = true
LEFT JOIN asset_maintenance_logs aml
       ON am.id = aml.asset_id AND aml.active = true
WHERE am.active = true
GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type,
         am.center_id, c.name, am.purchase_cost, am.purchase_date;
