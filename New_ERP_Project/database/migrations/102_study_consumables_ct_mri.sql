-- ============================================================
-- Migration 102: Study consumables — CT & MRI
-- ============================================================
-- Kerala radiology practice logic:
--
-- FILMS (Dry Thermal, box/100 sheets — qty stored as fraction of box)
--   8x10"  (id=58) — small joints: Knee, Ankle, Wrist, Shoulder, Elbow, Foot, TMJ, Orbit
--   10x12" (id=57) — standard CT + Brain/Spine/Head-Neck MRI
--   11x14" (id=56) — body MRI: Abdomen, Pelvis, Liver, Breast, Cardiac, MRCP, MRA, Fetal
--   14x17" (id=55) — large coverage: Whole Body, Whole Spine, CAP, Aortic
--   Plain studies:   CT 0.02 box (2 sheets) | MRI 0.04 box (4 sheets)
--   Contrast studies: CT 0.03 box (3 sheets) | MRI 0.05 box (5 sheets)
--   Complex/multi-phase: +1 sheet
--
-- TRAD-021 (id=66) — teleradiology platform credit, qty=1, ALL studies
--
-- CT CONTRAST consumables:
--   Standard CT contrast  : Iohexol 350mg (id=28) ×1, IV Cannula 20G (id=8) ×1,
--                           Extension Set (id=34) ×1, Stopcock (id=35) ×1,
--                           Syringe 20ml (id=11) ×2, Saline 100ml (id=47) ×1
--   Angiography / power   : Iohexol 350mg (id=28) ×2, Power Inj Syr (id=29) ×1,
--                           IV Cannula 18G (id=7) ×1, Extension Set (id=34) ×1,
--                           Saline 100ml (id=47) ×1
--
-- MRI CONTRAST consumables:
--   Standard MRI contrast : Gadolinium 10ml (id=26) ×1, IV Cannula 22G (id=32) ×1,
--                           Syringe 10ml (id=10) ×1, Saline 100ml (id=47) ×1
--   Large body MRI (Liver, Cardiac, Breast, Whole Body): Gadolinium ×2
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- PART 1: TRAD-021 — teleradiology credit for ALL CT & MRI
-- ──────────────────────────────────────────────────────────────
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 66, 1, 'Teleradiology platform charge per study'
FROM study_definitions sd
WHERE sd.modality IN ('CT','MRI') AND sd.active = true
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PART 2: FILMS — CT studies
-- ──────────────────────────────────────────────────────────────

-- CT 14x17" — large-coverage studies (Whole Body, CAP, Aortic Angio)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 55,
  CASE sd.study_type WHEN 'Contrast' THEN 0.04 ELSE 0.03 END,
  'Dry Thermal Film 14x17" — large coverage'
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.active = true
  AND sd.study_name ILIKE ANY(ARRAY[
    '%Whole Body%', '%Chest Abdomen Pelvis%', '%Aortic%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- CT 10x12" — all other CT studies
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 57,
  CASE
    WHEN sd.study_name ILIKE ANY(ARRAY['%HRCT%','%Thorax%','%Perfusion%',
         '%Coronary%','%Triple Phase%','%Urography%','%Pulmonary Angio%']) THEN
      CASE sd.study_type WHEN 'Contrast' THEN 0.04 ELSE 0.03 END
    WHEN sd.study_type = 'Contrast' THEN 0.03
    ELSE 0.02
  END,
  'Dry Thermal Film 10x12"'
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.active = true
  AND sd.study_name NOT ILIKE ANY(ARRAY[
    '%Whole Body%', '%Chest Abdomen Pelvis%', '%Aortic%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PART 3: FILMS — MRI studies
-- ──────────────────────────────────────────────────────────────

-- MRI 14x17" — whole body / whole spine (long coverage)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 55,
  CASE sd.study_type WHEN 'Contrast' THEN 0.06 ELSE 0.06 END,
  'Dry Thermal Film 14x17" — whole body/spine'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND sd.study_name ILIKE ANY(ARRAY['%Whole Body%','%Whole Spine%'])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 11x14" — body MRI (Abdomen, Pelvis, Liver, Breast, Cardiac, MRCP, MRA, Fetal, Brachial)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 56,
  CASE sd.study_type WHEN 'Contrast' THEN 0.05 ELSE 0.04 END,
  'Dry Thermal Film 11x14" — body MRI'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND sd.study_name NOT ILIKE ANY(ARRAY['%Whole Body%','%Whole Spine%'])
  AND sd.study_name ILIKE ANY(ARRAY[
    '%Abdomen%','%Pelvis%','%Liver%','%Breast%','%Cardiac%',
    '%MRCP%','%MR Angiography%','%Fetal%','%Brachial Plexus%',
    '%Prostate%','%Rectum%','%Scrotum%','%Sacroiliac%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 8x10" — small joints (Knee, Ankle, Shoulder, Wrist, Elbow, Foot, TMJ, Orbit)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 58,
  CASE sd.study_type WHEN 'Contrast' THEN 0.03 ELSE 0.02 END,
  'Dry Thermal Film 8x10" — small joint'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND sd.study_name ILIKE ANY(ARRAY[
    '%Knee%','%Ankle%','%Shoulder%','%Wrist%','%Elbow%',
    '%Foot%','%Temporomandibular%','%Orbit%','%Hip Joint%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 10x12" — Brain, Spine segments, Pituitary, IAC, Neck, Spectroscopy, DWI,
--              and any MRI not already covered above
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 57,
  CASE
    WHEN sd.study_name ILIKE ANY(ARRAY[
      '%Spectroscopy%','%Diffusion%','%Perfusion%','%Pituitary%',
      '%Internal Auditory%','%Spine (Lumbar)%'
    ]) THEN
      CASE sd.study_type WHEN 'Contrast' THEN 0.05 ELSE 0.05 END
    WHEN sd.study_type = 'Contrast' THEN 0.05
    ELSE 0.04
  END,
  'Dry Thermal Film 10x12"'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  -- Exclude studies already assigned a film above
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id
      AND sc.item_master_id IN (55, 56, 58)
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PART 4: CT CONTRAST consumables
-- ──────────────────────────────────────────────────────────────

-- 4a. Angiography & power-injected studies:
--     Iohexol 350mg ×2, Power Injector Syringe ×1, Cannula 18G ×1,
--     Extension Set ×1, Saline 100ml ×1
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, unnest(ARRAY[28,  29,   7,   34,  47]),
              unnest(ARRAY[2.0, 1.0, 1.0, 1.0, 1.0]),
              unnest(ARRAY[
                'Iohexol 350mg/ml — power injection (×2 vials)',
                'Power Injector Syringe 200ml',
                'IV Cannula 18G — power injection port',
                'IV Extension Set',
                'Saline 0.9% 100ml — flush'
              ])
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.study_type = 'Contrast' AND sd.active = true
  AND sd.study_name ILIKE ANY(ARRAY[
    '%Angiography%','%Coronary%','%Aortic%','%Pulmonary Angio%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- 4b. Standard CT contrast (all other CT contrast studies):
--     Iohexol 350mg ×1, Cannula 20G ×1, Extension Set ×1,
--     Stopcock ×1, Syringe 20ml ×2, Saline 100ml ×1
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, unnest(ARRAY[28,   8,   34,  35,   11,  47]),
              unnest(ARRAY[1.0, 1.0, 1.0, 1.0, 2.0, 1.0]),
              unnest(ARRAY[
                'Iohexol 350mg/ml 100ml — IV contrast',
                'IV Cannula 20G',
                'IV Extension Set',
                'Three-Way Stopcock',
                'Syringe 20ml — draw contrast + flush',
                'Saline 0.9% 100ml — flush'
              ])
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.study_type = 'Contrast' AND sd.active = true
  AND sd.study_name NOT ILIKE ANY(ARRAY[
    '%Angiography%','%Coronary%','%Aortic%','%Pulmonary Angio%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- PART 5: MRI CONTRAST consumables
-- ──────────────────────────────────────────────────────────────

-- 5a. Large body MRI contrast (Liver, Cardiac, Breast, Whole Body):
--     Gadolinium ×2, Cannula 22G ×1, Syringe 10ml ×2, Saline ×1
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, unnest(ARRAY[26,  32,  10,   47]),
              unnest(ARRAY[2.0, 1.0, 2.0, 1.0]),
              unnest(ARRAY[
                'Gadolinium Contrast 10ml — double dose large body',
                'IV Cannula 22G',
                'Syringe 10ml — draw Gd + flush',
                'Saline 0.9% 100ml — flush'
              ])
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.study_type = 'Contrast' AND sd.active = true
  AND sd.study_name ILIKE ANY(ARRAY[
    '%Liver%','%Cardiac%','%Breast%','%Whole Body%','%Prostate%','%Rectum%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- 5b. Standard MRI contrast (all other MRI contrast studies):
--     Gadolinium ×1, Cannula 22G ×1, Syringe 10ml ×1, Saline ×1
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, unnest(ARRAY[26,  32,  10,   47]),
              unnest(ARRAY[1.0, 1.0, 1.0, 1.0]),
              unnest(ARRAY[
                'Gadolinium Contrast 10ml',
                'IV Cannula 22G',
                'Syringe 10ml — draw Gd + flush',
                'Saline 0.9% 100ml — flush'
              ])
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.study_type = 'Contrast' AND sd.active = true
  AND sd.study_name NOT ILIKE ANY(ARRAY[
    '%Liver%','%Cardiac%','%Breast%','%Whole Body%','%Prostate%','%Rectum%'
  ])
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- Verification summary
-- ──────────────────────────────────────────────────────────────
SELECT
  sd.modality,
  sd.study_type,
  COUNT(DISTINCT sd.id)            AS studies,
  COUNT(sc.id)                     AS total_consumable_lines,
  ROUND(AVG(consumable_count), 1)  AS avg_items_per_study
FROM study_definitions sd
JOIN study_consumables sc ON sc.study_definition_id = sd.id
JOIN (
  SELECT study_definition_id, COUNT(*) AS consumable_count
  FROM study_consumables GROUP BY study_definition_id
) cc ON cc.study_definition_id = sd.id
WHERE sd.modality IN ('CT','MRI') AND sd.active = true
GROUP BY sd.modality, sd.study_type
ORDER BY sd.modality, sd.study_type;

-- Sample: show consumables for one CT Contrast and one MRI Contrast study
SELECT sd.study_name, im.item_name, sc.default_qty, im.uom
FROM study_consumables sc
JOIN study_definitions sd ON sd.id = sc.study_definition_id
JOIN item_master im        ON im.id = sc.item_master_id
WHERE sd.id = (SELECT id FROM study_definitions WHERE study_name = 'CT Brain - Contrast' AND active=true LIMIT 1)
ORDER BY sc.id;

SELECT sd.study_name, im.item_name, sc.default_qty, im.uom
FROM study_consumables sc
JOIN study_definitions sd ON sd.id = sc.study_definition_id
JOIN item_master im        ON im.id = sc.item_master_id
WHERE sd.id = (SELECT id FROM study_definitions WHERE study_name ILIKE 'MRI Brain - Contrast' AND active=true LIMIT 1)
ORDER BY sc.id;
