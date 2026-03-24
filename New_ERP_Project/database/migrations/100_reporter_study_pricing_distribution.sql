-- ============================================================
-- Migration 100: Reporter study pricing — realistic distribution
-- ============================================================
-- Distribution:
--   TELE002 Nighthawk (id=5)         → ALL CT studies (CT baseline)
--   TELE001 TeleRad Solutions (id=4) → ALL MRI studies (MRI baseline)
--   RAD001  Suresh Patel (id=1)      → Brain/Neuro CT + Brain/Spine MRI
--   RAD002  Meera Krishnan (id=2)    → Body CT (Chest/Abdomen) + Body MRI
--   RAD004  Daddy Girija (id=7)      → MSK CT + MSK MRI
--
-- Ensures every CT/MRI study has at least one contracted reporter.
-- Rates are what the center pays the reporter per study.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Step 1: Clear existing CT/MRI rates for all active reporters
-- ──────────────────────────────────────────────────────────────
DELETE FROM radiologist_study_rates
WHERE radiologist_id IN (1, 2, 4, 5, 7)
  AND study_id IN (
    SELECT id FROM study_master WHERE modality IN ('CT', 'MRI')
  );

-- ──────────────────────────────────────────────────────────────
-- Step 2: TELE002 Nighthawk — ALL CT studies
--   CT Plain ₹250 / CT Contrast ₹400
-- ──────────────────────────────────────────────────────────────
INSERT INTO radiologist_study_rates
  (radiologist_id, study_id, study_name, rate, created_at, updated_at)
SELECT
  5,
  sm.id,
  sm.study_name,
  CASE sm.study_type WHEN 'Contrast' THEN 400 ELSE 250 END,
  NOW(), NOW()
FROM study_master sm
WHERE sm.modality = 'CT' AND sm.active = true;

-- ──────────────────────────────────────────────────────────────
-- Step 3: TELE001 TeleRad Solutions — ALL MRI studies
--   MRI Plain ₹800 / MRI Contrast ₹1,200
-- ──────────────────────────────────────────────────────────────
INSERT INTO radiologist_study_rates
  (radiologist_id, study_id, study_name, rate, created_at, updated_at)
SELECT
  4,
  sm.id,
  sm.study_name,
  CASE sm.study_type WHEN 'Contrast' THEN 1200 ELSE 800 END,
  NOW(), NOW()
FROM study_master sm
WHERE sm.modality = 'MRI' AND sm.active = true;

-- ──────────────────────────────────────────────────────────────
-- Step 4: RAD001 Suresh Patel — Brain/Neuro specialist
--   CT: Brain, Angiography, Coronary, Pulmonary Angiography
--   MRI: Brain, Spine, Pituitary, IAC, MR Angiography, Neck, MRCP, Brachial Plexus
-- ──────────────────────────────────────────────────────────────
INSERT INTO radiologist_study_rates
  (radiologist_id, study_id, study_name, rate, created_at, updated_at)
SELECT
  1,
  sm.id,
  sm.study_name,
  CASE sm.study_type WHEN 'Contrast' THEN
    CASE sm.modality WHEN 'MRI' THEN 1500 ELSE 500 END
  ELSE
    CASE sm.modality WHEN 'MRI' THEN 1000 ELSE 300 END
  END,
  NOW(), NOW()
FROM study_master sm
WHERE sm.active = true
  AND (
    (sm.modality = 'CT' AND sm.study_name ILIKE ANY(ARRAY[
      '%Brain%', '%Angiography%', '%Coronary%', '%Aortic%', '%Pulmonary Angiography%'
    ]))
    OR
    (sm.modality = 'MRI' AND sm.study_name ILIKE ANY(ARRAY[
      '%Brain%', '%Cervical Spine%', '%Lumbar Spine%', '%Thoracic Spine%',
      '%Whole Spine%', '%Spine (Lumbar)%', '%Pituitary%',
      '%Internal Auditory Canal%', '%MR Angiography%', '%MRCP%',
      '%Brachial Plexus%', '%Neck%'
    ]))
  );

-- ──────────────────────────────────────────────────────────────
-- Step 5: RAD002 Meera Krishnan — Body imaging specialist
--   CT: Chest, Abdomen, Pelvis, KUB, Urography, Liver, Orbit
--   MRI: Abdomen, Pelvis, Liver, Breast, Cardiac, Prostate, Rectum, Fetal, Scrotum, Orbit
-- ──────────────────────────────────────────────────────────────
INSERT INTO radiologist_study_rates
  (radiologist_id, study_id, study_name, rate, created_at, updated_at)
SELECT
  2,
  sm.id,
  sm.study_name,
  CASE sm.study_type WHEN 'Contrast' THEN
    CASE sm.modality WHEN 'MRI' THEN 1500 ELSE 500 END
  ELSE
    CASE sm.modality WHEN 'MRI' THEN 1000 ELSE 300 END
  END,
  NOW(), NOW()
FROM study_master sm
WHERE sm.active = true
  AND (
    (sm.modality = 'CT' AND sm.study_name ILIKE ANY(ARRAY[
      '%Chest%', '%Abdomen%', '%Pelvis%', '%KUB%', '%Urography%',
      '%Liver%', '%Orbit%', '%Neck%'
    ]))
    OR
    (sm.modality = 'MRI' AND sm.study_name ILIKE ANY(ARRAY[
      '%Abdomen%', '%Pelvis%', '%Liver%', '%Breast%', '%Cardiac%',
      '%Prostate%', '%Rectum%', '%Fetal%', '%Scrotum%', '%Orbit%',
      '%Sacroiliac%'
    ]))
  );

-- ──────────────────────────────────────────────────────────────
-- Step 6: RAD004 Daddy Girija — MSK specialist
--   CT: Spine, Hip, Knee, Temporal, PNS, Larynx, Facial, Nasopharynx, Neck
--   MRI: Knee, Shoulder, Hip, Ankle, Wrist, Elbow, Foot, Whole Body, TMJ, Sacroiliac
-- ──────────────────────────────────────────────────────────────
INSERT INTO radiologist_study_rates
  (radiologist_id, study_id, study_name, rate, created_at, updated_at)
SELECT
  7,
  sm.id,
  sm.study_name,
  CASE sm.study_type WHEN 'Contrast' THEN
    CASE sm.modality WHEN 'MRI' THEN 1500 ELSE 500 END
  ELSE
    CASE sm.modality WHEN 'MRI' THEN 1000 ELSE 300 END
  END,
  NOW(), NOW()
FROM study_master sm
WHERE sm.active = true
  AND (
    (sm.modality = 'CT' AND sm.study_name ILIKE ANY(ARRAY[
      '%Spine%', '%Hip%', '%Knee%', '%Temporal%', '%Paranasal%',
      '%Larynx%', '%Facial%', '%Nasopharynx%', '%Neck%'
    ]))
    OR
    (sm.modality = 'MRI' AND sm.study_name ILIKE ANY(ARRAY[
      '%Knee%', '%Shoulder%', '%Hip%', '%Ankle%', '%Wrist%',
      '%Elbow%', '%Foot%', '%Whole Body%', '%Temporomandibular%',
      '%Sacroiliac%', '%Whole Spine%'
    ]))
  );

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
SELECT rm.radiologist_name, rm.reporter_type, sm.modality,
       COUNT(*) AS priced_studies
FROM radiologist_study_rates rsr
JOIN radiologist_master rm ON rm.id = rsr.radiologist_id
JOIN study_master sm        ON sm.id = rsr.study_id
WHERE rm.active = true AND sm.modality IN ('CT','MRI')
GROUP BY rm.radiologist_name, rm.reporter_type, sm.modality
ORDER BY rm.reporter_type, rm.radiologist_name, sm.modality;

-- Studies with ZERO reporter pricing (should be 0)
SELECT sm.modality, COUNT(*) AS uncovered_studies
FROM study_master sm
WHERE sm.modality IN ('CT','MRI') AND sm.active = true
  AND NOT EXISTS (
    SELECT 1 FROM radiologist_study_rates rsr
    JOIN radiologist_master rm ON rm.id = rsr.radiologist_id
    WHERE rsr.study_id = sm.id AND rm.active = true
  )
GROUP BY sm.modality;
