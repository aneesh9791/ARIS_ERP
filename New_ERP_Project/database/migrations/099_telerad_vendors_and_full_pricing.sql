-- ============================================================
-- Migration 099: Teleradiology vendor master + full study pricing
-- ============================================================
-- Part 1: Create vendor master entries for teleradiology companies
-- Part 2: Link radiologist_master rows to their vendor codes
-- Part 3: Fill all missing study_center_pricing gaps with standard rates
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- PART 1: Vendor master entries for teleradiology companies
-- ──────────────────────────────────────────────────────────────

-- Fix NGH-189: update to SERVICE type and fill missing details
UPDATE vendor_master SET
  vendor_type     = 'SERVICE',
  gst_number      = '27AAACN1890G1ZT',
  pan_number      = 'AAACN1890G',
  address         = '501, Titanium Square, Thaltej, SG Road',
  city            = 'Ahmedabad',
  state           = 'Gujarat',
  postal_code     = '380054',
  contact_person  = 'Vikram Nair',
  payment_terms   = 'Net 30',
  bank_account_number = '50200112233445',
  bank_name       = 'ICICI Bank',
  ifsc_code       = 'ICIC0003201',
  email           = 'billing@nighthawkradiology.in',
  ap_account_id   = 10,
  updated_at      = NOW()
WHERE vendor_code = 'NGH-189';

-- TeleRad Solutions Pvt Ltd → vendor code TRS-001
INSERT INTO vendor_master (
  vendor_code, vendor_name, vendor_type,
  gst_number, pan_number,
  phone, email,
  address, city, state, postal_code,
  contact_person, payment_terms,
  bank_account_number, bank_name, ifsc_code,
  ap_account_id, active, created_at, updated_at
) VALUES (
  'TRS-001', 'TeleRad Solutions Pvt Ltd', 'SERVICE',
  '29AABCT4321H1ZP', 'AABCT4321H',
  '+91 80001 00001', 'billing@telerad-solutions.com',
  '12, Tech Park, Electronic City, Phase 1', 'Bengaluru', 'Karnataka', '560100',
  'Rajiv Menon', 'Net 30',
  '50100234567890', 'HDFC Bank', 'HDFC0001234',
  10, true, NOW(), NOW()
)
ON CONFLICT (vendor_code) DO NOTHING;

-- DigiRad Remote Reporting → vendor code DRR-002
INSERT INTO vendor_master (
  vendor_code, vendor_name, vendor_type,
  gst_number, pan_number,
  phone, email,
  address, city, state, postal_code,
  contact_person, payment_terms,
  bank_account_number, bank_name, ifsc_code,
  ap_account_id, active, created_at, updated_at
) VALUES (
  'DRR-002', 'DigiRad Remote Reporting Pvt Ltd', 'SERVICE',
  '27AABCD5678G1ZY', 'AABCD5678G',
  '+91 22 4000 1234', 'accounts@digirad-reporting.com',
  '456, Digital Hub, Bandra Kurla Complex', 'Mumbai', 'Maharashtra', '400051',
  'Priya Sharma', 'Net 30',
  '50100987654321', 'ICICI Bank', 'ICIC0001256',
  10, true, NOW(), NOW()
)
ON CONFLICT (vendor_code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PART 2: Link radiologist_master → vendor_master
-- ──────────────────────────────────────────────────────────────

UPDATE radiologist_master SET vendor_code = 'TRS-001', updated_at = NOW()
WHERE radiologist_code = 'TELE001' AND (vendor_code IS NULL OR vendor_code = '');

UPDATE radiologist_master SET vendor_code = 'DRR-002', updated_at = NOW()
WHERE radiologist_code = 'TELE003' AND (vendor_code IS NULL OR vendor_code = '');

-- Ensure TELE002 (Nighthawk) link is set
UPDATE radiologist_master SET vendor_code = 'NGH-189', updated_at = NOW()
WHERE radiologist_code = 'TELE002' AND (vendor_code IS NULL OR vendor_code != 'NGH-189');

-- ──────────────────────────────────────────────────────────────
-- PART 3: Fill missing study_center_pricing
-- Strategy: use the existing price from any other center as
-- reference; if none exists, apply standard rate by modality
-- + study_type from the lookup below.
-- ──────────────────────────────────────────────────────────────

-- Standard fallback rates by modality + study_type
-- (used only when NO existing price exists for that study anywhere)
-- CT Plain:        ₹600    CT Contrast:     ₹1,200
-- MRI Plain:       ₹2,500  MRI Contrast:    ₹3,200
-- XRAY Plain:      ₹300    XRAY Contrast:   ₹500
-- MAMMOGRAPHY:     ₹600    PET:             ₹8,000
-- ULTRASOUND:      ₹500    FLUOROSCOPY:     ₹800

INSERT INTO study_center_pricing
  (study_definition_id, center_id, base_rate, insurance_rate, self_pay_rate, active, created_at, updated_at)
SELECT
  sd.id   AS study_definition_id,
  c.id    AS center_id,

  -- Use existing price from another centre, else fallback standard rate
  COALESCE(
    (SELECT scp2.base_rate
       FROM study_center_pricing scp2
      WHERE scp2.study_definition_id = sd.id
        AND scp2.active = true
        AND scp2.center_id != c.id
      ORDER BY scp2.id LIMIT 1),
    -- Standard fallback
    CASE sd.modality
      WHEN 'CT' THEN
        CASE sd.study_type
          WHEN 'Plain'    THEN 600
          WHEN 'Contrast' THEN 1200
          ELSE 800
        END
      WHEN 'MRI' THEN
        CASE sd.study_type
          WHEN 'Plain'    THEN 2500
          WHEN 'Contrast' THEN 3200
          ELSE 2800
        END
      WHEN 'XRAY' THEN
        CASE sd.study_type
          WHEN 'Plain'    THEN 300
          WHEN 'Contrast' THEN 500
          ELSE 300
        END
      WHEN 'MAMMOGRAPHY' THEN 600
      WHEN 'ULTRASOUND'  THEN 500
      WHEN 'FLUOROSCOPY' THEN 800
      WHEN 'PET'         THEN 8000
      ELSE 500
    END
  )  AS base_rate,

  -- insurance_rate = 90% of base_rate (rounded to nearest 50)
  ROUND(COALESCE(
    (SELECT scp2.base_rate
       FROM study_center_pricing scp2
      WHERE scp2.study_definition_id = sd.id
        AND scp2.active = true
        AND scp2.center_id != c.id
      ORDER BY scp2.id LIMIT 1),
    CASE sd.modality
      WHEN 'CT'          THEN CASE sd.study_type WHEN 'Plain' THEN 600 WHEN 'Contrast' THEN 1200 ELSE 800 END
      WHEN 'MRI'         THEN CASE sd.study_type WHEN 'Plain' THEN 2500 WHEN 'Contrast' THEN 3200 ELSE 2800 END
      WHEN 'XRAY'        THEN CASE sd.study_type WHEN 'Plain' THEN 300 WHEN 'Contrast' THEN 500 ELSE 300 END
      WHEN 'MAMMOGRAPHY' THEN 600
      WHEN 'ULTRASOUND'  THEN 500
      WHEN 'FLUOROSCOPY' THEN 800
      WHEN 'PET'         THEN 8000
      ELSE 500
    END
  ) * 0.9 / 50) * 50  AS insurance_rate,

  -- self_pay_rate = same as base_rate
  COALESCE(
    (SELECT scp2.base_rate
       FROM study_center_pricing scp2
      WHERE scp2.study_definition_id = sd.id
        AND scp2.active = true
        AND scp2.center_id != c.id
      ORDER BY scp2.id LIMIT 1),
    CASE sd.modality
      WHEN 'CT'          THEN CASE sd.study_type WHEN 'Plain' THEN 600 WHEN 'Contrast' THEN 1200 ELSE 800 END
      WHEN 'MRI'         THEN CASE sd.study_type WHEN 'Plain' THEN 2500 WHEN 'Contrast' THEN 3200 ELSE 2800 END
      WHEN 'XRAY'        THEN CASE sd.study_type WHEN 'Plain' THEN 300 WHEN 'Contrast' THEN 500 ELSE 300 END
      WHEN 'MAMMOGRAPHY' THEN 600
      WHEN 'ULTRASOUND'  THEN 500
      WHEN 'FLUOROSCOPY' THEN 800
      WHEN 'PET'         THEN 8000
      ELSE 500
    END
  )  AS self_pay_rate,

  true   AS active,
  NOW()  AS created_at,
  NOW()  AS updated_at

FROM centers c
JOIN center_modalities cm  ON cm.center_id  = c.id  AND cm.active = true
JOIN study_definitions  sd ON sd.modality   = cm.modality AND sd.active = true
LEFT JOIN study_center_pricing scp
       ON scp.study_definition_id = sd.id
      AND scp.center_id = c.id
      AND scp.active = true
WHERE c.active = true
  AND c.corporate_entity_id IS NOT NULL
  AND scp.id IS NULL   -- only rows with NO existing price
ON CONFLICT (study_definition_id, center_id) DO NOTHING;

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- Summary verification
-- ──────────────────────────────────────────────────────────────
SELECT 'Vendor master — teleradiology vendors' AS section,
       vendor_code, vendor_name, vendor_type, city
FROM vendor_master
WHERE vendor_code IN ('TRS-001', 'DRR-002', 'NGH-189')
ORDER BY vendor_code;

SELECT 'Reporter → vendor links' AS section,
       radiologist_code, reporter_type, radiologist_name, vendor_code
FROM radiologist_master
WHERE reporter_type = 'TELERADIOLOGY'
ORDER BY radiologist_code;

SELECT 'Pricing coverage after migration' AS section,
       c.name AS center,
       cm.modality,
       COUNT(sd.id) AS total_studies,
       COUNT(scp.id) AS priced,
       COUNT(sd.id) - COUNT(scp.id) AS still_missing
FROM centers c
JOIN center_modalities cm ON cm.center_id = c.id AND cm.active = true
JOIN study_definitions sd ON sd.modality = cm.modality AND sd.active = true
LEFT JOIN study_center_pricing scp
       ON scp.study_definition_id = sd.id AND scp.center_id = c.id AND scp.active = true
WHERE c.active = true AND c.corporate_entity_id IS NOT NULL
GROUP BY c.name, cm.modality
ORDER BY c.name, cm.modality;
