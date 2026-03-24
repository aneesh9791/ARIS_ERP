-- 095: Append Plain/Contrast suffix to study names for clear identification
-- Step 1: Fill in NULL study_type based on modality and name conventions
-- Step 2: Append " - Plain" or " - Contrast" to every study_name

-- ── Step 1: Infer study_type for entries where it is NULL ─────────────────

-- X-Ray: never uses contrast agent
UPDATE study_master
SET study_type = 'Plain', updated_at = NOW()
WHERE modality = 'XRAY'
  AND (study_type IS NULL OR study_type = '');

-- Ultrasound: never uses contrast agent in standard workflow
UPDATE study_master
SET study_type = 'Plain', updated_at = NOW()
WHERE modality = 'ULTRASOUND'
  AND (study_type IS NULL OR study_type = '');

-- Mammography: standard mammography is plain; Stereotactic Biopsy already set to Contrast
UPDATE study_master
SET study_type = 'Plain', updated_at = NOW()
WHERE modality = 'MAMMOGRAPHY'
  AND (study_type IS NULL OR study_type = '');

-- CT/MRI: Coronary Angiography always uses contrast
UPDATE study_master
SET study_type = 'Contrast', updated_at = NOW()
WHERE modality IN ('CT', 'MRI')
  AND (study_type IS NULL OR study_type = '')
  AND (study_name ILIKE '%coronary%' OR study_name ILIKE '%angiograph%');

-- CT/MRI: codes ending in _C or _CM are contrast studies
UPDATE study_master
SET study_type = 'Contrast', updated_at = NOW()
WHERE modality IN ('CT', 'MRI')
  AND (study_type IS NULL OR study_type = '')
  AND (study_code LIKE '%_C' OR study_code LIKE '%_CM');

-- CT/MRI: remaining NULL entries default to Plain
UPDATE study_master
SET study_type = 'Plain', updated_at = NOW()
WHERE modality IN ('CT', 'MRI')
  AND (study_type IS NULL OR study_type = '');

-- ── Step 2: Append " - Plain" or " - Contrast" to all study names ─────────
-- Guard: skip if suffix already present (safe to re-run)

UPDATE study_master
SET study_name  = study_name || ' - ' || study_type,
    updated_at  = NOW()
WHERE study_type IN ('Plain', 'Contrast')
  AND study_name NOT LIKE '% - Plain'
  AND study_name NOT LIKE '% - Contrast';

-- ── Step 3: Manual corrections for ambiguous code suffixes ───────────────
-- MN_MRI_SPINE_C: _C = Cervical (not Contrast); matches MRI_CSPINE which is Plain
UPDATE study_master
SET study_type = 'Plain',
    study_name = 'MRI Cervical Spine - Plain',
    updated_at = NOW()
WHERE study_code = 'MN_MRI_SPINE_C'
  AND study_type = 'Contrast';

-- ── Verification ──────────────────────────────────────────────────────────
-- Run this manually to confirm:
-- SELECT study_code, study_name, modality, study_type FROM study_master ORDER BY modality, study_name;
