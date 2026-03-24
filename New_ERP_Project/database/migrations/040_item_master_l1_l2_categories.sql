-- Migration 040: Add L1/L2 category hierarchy to item_master
-- L1 = broad group (e.g. Clinical Consumables)
-- L2 = specific sub-category (existing `category` column, renamed conceptually)
-- Also aligns category values with the new scan-center specific names.

-- 1. Add l1_category column
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS l1_category VARCHAR(50);

-- 2. Rename/update old category values to new scan-center specific names
--    (old values from 029_item_master.sql → new values)
UPDATE item_master SET category = 'SYRINGE_NEEDLE'   WHERE category = 'MEDICAL_CONSUMABLE';
UPDATE item_master SET category = 'XRAY_FILM'        WHERE category = 'FILM_MEDIA';
UPDATE item_master SET category = 'STATIONERY'       WHERE category = 'STATIONERY';  -- unchanged
UPDATE item_master SET category = 'GENERAL'          WHERE category IN ('ADMINISTRATIVE','PRINTING','HOUSEKEEPING') AND item_type = 'NON_STOCK';

-- 3. Populate l1_category based on l2 (category)
UPDATE item_master SET l1_category =
  CASE category
    -- STOCK — Clinical Consumables
    WHEN 'CONTRAST_MEDIA'   THEN 'CLINICAL_CONSUMABLE'
    WHEN 'SYRINGE_NEEDLE'   THEN 'CLINICAL_CONSUMABLE'
    WHEN 'CANNULA_IV'       THEN 'CLINICAL_CONSUMABLE'
    WHEN 'PPE_DISPOSABLE'   THEN 'CLINICAL_CONSUMABLE'
    -- STOCK — Imaging Media
    WHEN 'XRAY_FILM'        THEN 'IMAGING_MEDIA'
    WHEN 'CD_DVD_MEDIA'     THEN 'IMAGING_MEDIA'
    WHEN 'REPORT_COVER'     THEN 'IMAGING_MEDIA'
    -- STOCK — Facility & Maintenance
    WHEN 'SPARE_PART'       THEN 'FACILITY_MAINTENANCE'
    WHEN 'ELECTRICAL'       THEN 'FACILITY_MAINTENANCE'
    WHEN 'HOUSEKEEPING'     THEN 'FACILITY_MAINTENANCE'
    -- STOCK — Office
    WHEN 'STATIONERY'       THEN 'OFFICE'
    WHEN 'TONER_INK'        THEN 'OFFICE'
    -- NON_STOCK — Clinical Services
    WHEN 'RADIOLOGY_FEES'   THEN 'CLINICAL_SERVICE'
    WHEN 'TELERADIOLOGY'    THEN 'CLINICAL_SERVICE'
    WHEN 'AMC_SERVICE'      THEN 'CLINICAL_SERVICE'
    WHEN 'SOFTWARE_SAAS'    THEN 'CLINICAL_SERVICE'
    -- NON_STOCK — Facility & Lease
    WHEN 'REVENUE_SHARE'    THEN 'FACILITY_LEASE'
    WHEN 'MIN_GUARANTEE'    THEN 'FACILITY_LEASE'
    WHEN 'EQUIPMENT_LEASE'  THEN 'FACILITY_LEASE'
    -- NON_STOCK — Patient Acquisition
    WHEN 'PATIENT_AGENT'    THEN 'PATIENT_ACQUISITION'
    WHEN 'DOCTOR_REFERRAL'  THEN 'PATIENT_ACQUISITION'
    -- Fallback
    ELSE 'GENERAL'
  END;

-- 4. Add index for L1 lookups
CREATE INDEX IF NOT EXISTS idx_item_master_l1 ON item_master(l1_category);
CREATE INDEX IF NOT EXISTS idx_item_master_l1_l2 ON item_master(l1_category, category);

-- 5. Comments
COMMENT ON COLUMN item_master.l1_category IS 'L1 broad group: CLINICAL_CONSUMABLE | IMAGING_MEDIA | FACILITY_MAINTENANCE | OFFICE | CLINICAL_SERVICE | FACILITY_LEASE | PATIENT_ACQUISITION | GENERAL';
COMMENT ON COLUMN item_master.category    IS 'L2 specific sub-category within the L1 group';
