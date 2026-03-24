-- Migration 039: Rename contract_type → business_model on centers table
-- Expands options from (lease, revenue_share, others) to a proper enum set
-- matching the scan-center business models tracked in finance mappings.

-- 1. Rename the column
ALTER TABLE centers RENAME COLUMN contract_type TO business_model;

-- 2. Normalise existing data to new UPPER_CASE values
UPDATE centers SET business_model =
  CASE business_model
    WHEN 'lease'         THEN 'EQUIPMENT_LEASE'
    WHEN 'revenue_share' THEN 'REVENUE_SHARE'
    WHEN 'others'        THEN 'OWNED'
    ELSE                      business_model   -- preserve if already correct
  END
WHERE business_model IS NOT NULL;

-- 3. Add CHECK constraint for valid values
ALTER TABLE centers
  ADD CONSTRAINT chk_center_business_model
  CHECK (business_model IN (
    'OWNED',            -- company-owned center, all equipment owned outright
    'EQUIPMENT_LEASE',  -- MRI/CT/X-ray leased, center premises owned/rented
    'REVENUE_SHARE',    -- % of collections paid to host hospital/clinic
    'MIN_GUARANTEE',    -- fixed monthly minimum paid to host facility
    'FRANCHISE',        -- operating under a franchise agreement
    'JOINT_VENTURE'     -- shared ownership with a partner entity
  ) OR business_model IS NULL);

-- 4. Rename the index to match new column name
DROP INDEX IF EXISTS idx_centers_contract_type;
CREATE INDEX IF NOT EXISTS idx_centers_business_model ON centers(business_model);

-- 5. Update column comment
COMMENT ON COLUMN centers.business_model IS
  'Business model: OWNED | EQUIPMENT_LEASE | REVENUE_SHARE | MIN_GUARANTEE | FRANCHISE | JOINT_VENTURE';
