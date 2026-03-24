-- 098: Replace study_center_pricing VIEW with a real table
-- The old view just read from study_master (one row per study, no true per-center pricing).
-- The new table allows multiple centers with different rates for the same study.

-- Step 1: Drop the old view
DROP VIEW IF EXISTS study_center_pricing;

-- Step 2: Create the real pricing table
CREATE TABLE study_center_pricing (
  id                  SERIAL PRIMARY KEY,
  study_definition_id INTEGER       NOT NULL REFERENCES study_definitions(id) ON DELETE CASCADE,
  center_id           INTEGER       NOT NULL REFERENCES centers(id)           ON DELETE CASCADE,
  base_rate           NUMERIC(10,2) NOT NULL DEFAULT 0,
  insurance_rate      NUMERIC(10,2) NOT NULL DEFAULT 0,
  self_pay_rate       NUMERIC(10,2) NOT NULL DEFAULT 0,
  active              BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (study_definition_id, center_id)
);

-- Step 3: Migrate existing rates from study_master into the new table
INSERT INTO study_center_pricing
  (study_definition_id, center_id, base_rate, insurance_rate, self_pay_rate, active, created_at, updated_at)
SELECT
  study_definition_id, center_id,
  COALESCE(base_rate, 0), COALESCE(insurance_rate, 0), COALESCE(self_pay_rate, 0),
  active, created_at, updated_at
FROM study_master
WHERE study_definition_id IS NOT NULL
ON CONFLICT (study_definition_id, center_id) DO NOTHING;

-- Verification:
-- SELECT COUNT(*) FROM study_center_pricing;
-- SELECT center_id, COUNT(*) FROM study_center_pricing GROUP BY center_id ORDER BY center_id;
