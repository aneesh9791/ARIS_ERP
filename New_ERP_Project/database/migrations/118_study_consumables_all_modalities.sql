-- ============================================================
-- Migration 118: Study consumables — films, IV contrast, oral contrast, report cover
-- All modalities: CT, MRI, XRAY, MAMMOGRAPHY
--
-- Production item_master IDs:
--   107 = Dry Thermal Film 14x17" (Box/100)  — large coverage
--   108 = Dry Thermal Film 11x14" (Box/100)  — body MRI, mammography
--   109 = Dry Thermal Film 10x12" (Box/100)  — standard CT, brain/spine MRI
--   110 = Dry Thermal Film 8x10"  (Box/100)  — small joints MRI, extremity XRAY
--    78 = Contrast Media Iohexol              — CT IV contrast
--    79 = IV Cannula 18G                      — power injection (angio CT)
--    80 = IV Cannula 20G                      — standard CT/MRI contrast
--    87 = Saline 0.9% 100ml                   — IV flush
--    90 = Syringe                             — draw & flush
--    91 = Y Tube                              — IV line for contrast
--   111 = Power Injector Syringe 200ml        — angiography CT
--    92 = Oral Contrast                       — CT abdomen/pelvis bowel prep
--   113 = CT Scan Report Cover               — all printed studies
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. REPORT COVER — all studies that produce a printed report
-- ════════════════════════════════════════════════════════════
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 113, 1, 'Report cover'
FROM study_definitions sd
WHERE sd.modality IN ('CT','MRI','XRAY','MAMMOGRAPHY')
  AND sd.active = true
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 2. FILMS — CT
-- 14x17": large-area scans (trunk, chest, abdomen, pelvis, whole spine)
-- 10x12": all other CT (head, neck, extremity, spine segments, angio)
-- Qty (fraction of 100-sheet box):
--   Standard plain:   0.02 (2 sheets)
--   Standard contrast: 0.03 (3 sheets)
--   Complex / multi-phase: 0.04 (4 sheets — extra sequences)
-- ════════════════════════════════════════════════════════════

-- CT 14x17" — large coverage (trunk / chest / abdomen / pelvis / whole spine)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 107,
  CASE
    WHEN sd.study_name ILIKE '%Chest Abdomen Pelvis%' THEN 0.05
    WHEN sd.study_type = 'Contrast' THEN 0.04
    ELSE 0.03
  END,
  'Dry Thermal Film 14x17" — large coverage'
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.active = true
  AND (  sd.study_name ILIKE '%Chest%'
      OR sd.study_name ILIKE '%Thorax%'
      OR sd.study_name ILIKE '%Abdomen%'
      OR sd.study_name ILIKE '%Pelvis%'
      OR sd.study_name ILIKE '%Whole Spine%'
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- CT 10x12" — all remaining CT (head, neck, extremity, angio, spine segments)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 109,
  CASE
    WHEN sd.study_name ILIKE ANY(ARRAY[
      '%Angiography%','%Aortic%','%Pulmonary Angio%',
      '%Triple Phase%','%Urography%','%Perfusion%'
    ]) THEN 0.04
    WHEN sd.study_type = 'Contrast' THEN 0.03
    ELSE 0.02
  END,
  'Dry Thermal Film 10x12"'
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.active = true
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id AND sc.item_master_id = 107
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 3. FILMS — MRI
-- 14x17": Whole Spine, Whole Body
-- 11x14": body MRI (Abdomen, Pelvis, Liver, Breast, Cardiac, MRCP, MRA, Fetal,
--                   Prostate, Rectum, Sacroiliac, Scrotum, Brachial Plexus)
-- 8x10":  small joints (Knee, Ankle, Shoulder, Wrist, Elbow, Foot, Hip Joint, TMJ)
-- 10x12": Brain, Spine segments, Pituitary, IAC, Neck, Orbit, DWI, Spectroscopy
-- Qty (fraction of 100-sheet box):
--   Small joint plain: 0.02 | contrast: 0.03
--   Standard plain: 0.04 | contrast: 0.05
--   Large body plain/contrast: 0.05
--   Whole spine/body: 0.06
-- ════════════════════════════════════════════════════════════

-- MRI 14x17" — whole spine / whole body
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 107, 0.06, 'Dry Thermal Film 14x17" — long coverage'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND (sd.study_name ILIKE '%Whole Spine%' OR sd.study_name ILIKE '%Whole Body%')
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 11x14" — body MRI
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 108,
  CASE sd.study_type WHEN 'Contrast' THEN 0.05 ELSE 0.04 END,
  'Dry Thermal Film 11x14" — body MRI'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND (  sd.study_name ILIKE '%Abdomen%'
      OR sd.study_name ILIKE '%Pelvis%'
      OR sd.study_name ILIKE '%Liver%'
      OR sd.study_name ILIKE '%Breast%'
      OR sd.study_name ILIKE '%Cardiac%'
      OR sd.study_name ILIKE '%MRCP%'
      OR sd.study_name ILIKE '%MR Angiography%'
      OR sd.study_name ILIKE '%Fetal%'
      OR sd.study_name ILIKE '%Prostate%'
      OR sd.study_name ILIKE '%Rectum%'
      OR sd.study_name ILIKE '%Brachial Plexus%'
      OR sd.study_name ILIKE '%Sacroiliac%'
      OR sd.study_name ILIKE '%Scrotum%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id AND sc.item_master_id = 107
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 8x10" — small joints
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 110,
  CASE sd.study_type WHEN 'Contrast' THEN 0.03 ELSE 0.02 END,
  'Dry Thermal Film 8x10" — small joint'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND (  sd.study_name ILIKE '%Knee%'
      OR sd.study_name ILIKE '%Ankle%'
      OR sd.study_name ILIKE '%Shoulder%'
      OR sd.study_name ILIKE '%Wrist%'
      OR sd.study_name ILIKE '%Elbow%'
      OR sd.study_name ILIKE '%Foot%'
      OR sd.study_name ILIKE '%Temporomandibular%'
      OR sd.study_name ILIKE '%Hip Joint%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id AND sc.item_master_id IN (107, 108)
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- MRI 10x12" — Brain, Spine, Neck, Orbit, Pituitary, IAC, DWI, Spectroscopy (all remaining)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 109,
  CASE
    WHEN sd.study_name ILIKE ANY(ARRAY[
      '%Spectroscopy%','%Diffusion%','%Pituitary%','%Internal Auditory%'
    ]) THEN 0.05
    WHEN sd.study_type = 'Contrast' THEN 0.05
    ELSE 0.04
  END,
  'Dry Thermal Film 10x12"'
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.active = true
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id
      AND sc.item_master_id IN (107, 108, 110)
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 4. FILMS — X-RAY
-- 14x17": Chest, Spine (C/T/L), Pelvis, KUB, Abdomen, Skull
-- 10x12": Shoulder, Ribs, Hip, Knee, Humerus, Leg (Tibia-Fibula), PNS, Sacrum
-- 8x10":  Hand/Wrist, Ankle, Foot, Elbow, Forearm, Clavicle (extremities)
-- Qty: 0.01 = 1 sheet; 0.02 = 2 sheets (AP + lateral views)
-- ════════════════════════════════════════════════════════════

-- XRAY 14x17" — large-area views
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 107,
  CASE
    WHEN sd.study_name ILIKE '%Spine%' THEN 0.02  -- AP + lateral
    WHEN sd.study_name ILIKE '%Chest%' THEN 0.01  -- PA view
    ELSE 0.01
  END,
  'Dry Thermal Film 14x17"'
FROM study_definitions sd
WHERE sd.modality = 'XRAY' AND sd.active = true
  AND (  sd.study_name ILIKE '%Chest%'
      OR sd.study_name ILIKE '%Spine%'
      OR sd.study_name ILIKE '%Pelvis%'
      OR sd.study_name ILIKE '%KUB%'
      OR sd.study_name ILIKE '%Abdomen%'
      OR sd.study_name ILIKE '%Skull%'
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- XRAY 10x12" — medium-area views
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 109, 0.01, 'Dry Thermal Film 10x12"'
FROM study_definitions sd
WHERE sd.modality = 'XRAY' AND sd.active = true
  AND (  sd.study_name ILIKE '%Shoulder%'
      OR sd.study_name ILIKE '%Ribs%'
      OR sd.study_name ILIKE '%Hip%'
      OR sd.study_name ILIKE '%Knee%'
      OR sd.study_name ILIKE '%Humerus%'
      OR sd.study_name ILIKE '%Leg%'
      OR sd.study_name ILIKE '%Paranasal%'
      OR sd.study_name ILIKE '%Sacrum%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id AND sc.item_master_id = 107
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- XRAY 8x10" — small extremities (all remaining XRAY)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 110, 0.01, 'Dry Thermal Film 8x10"'
FROM study_definitions sd
WHERE sd.modality = 'XRAY' AND sd.active = true
  AND NOT EXISTS (
    SELECT 1 FROM study_consumables sc
    WHERE sc.study_definition_id = sd.id
      AND sc.item_master_id IN (107, 109)
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 5. FILMS — MAMMOGRAPHY (11x14" — standard mammography film size)
-- Bilateral: 4 views → 0.04 box
-- Tomosynthesis: multiple slices printed → 0.05 box
-- Biopsy: limited views → 0.02 box
-- Diagnostic/Screening: 2-4 views → 0.03 box
-- ════════════════════════════════════════════════════════════
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 108,
  CASE
    WHEN sd.study_name ILIKE '%Tomo%'     THEN 0.05
    WHEN sd.study_name ILIKE '%Bilateral%' THEN 0.04
    WHEN sd.study_name ILIKE '%Biopsy%'    THEN 0.02
    ELSE 0.03
  END,
  'Dry Thermal Film 11x14" — mammography'
FROM study_definitions sd
WHERE sd.modality = 'MAMMOGRAPHY' AND sd.active = true
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 6. IV CONTRAST — CT Contrast studies
-- Angiography / power-injected: Iohexol×2, Cannula 18G, Power Injector Syringe, Saline
-- Standard CT contrast: Iohexol×1, Cannula 20G, Y Tube, Syringe×2, Saline
-- ════════════════════════════════════════════════════════════

-- 6a. Angiography & power-injected (CTA Brain/Neck/Aorta, CTPA)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id,
  unnest(ARRAY[ 78,   79,  111,  87]),
  unnest(ARRAY[2.0, 1.0,  1.0, 1.0]),
  unnest(ARRAY[
    'Iohexol IV contrast — power injection (×2 bottles)',
    'IV Cannula 18G — power injection port',
    'Power Injector Syringe 200ml',
    'Saline 0.9% 100ml — flush'
  ])
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.study_type = 'Contrast' AND sd.active = true
  AND (  sd.study_name ILIKE '%Angiography%'
      OR sd.study_name ILIKE '%Aortic%'
      OR sd.study_name ILIKE '%Pulmonary Angio%'
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- 6b. Standard CT contrast (all other CT contrast)
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id,
  unnest(ARRAY[ 78,   80,   91,   90,   87]),
  unnest(ARRAY[1.0,  1.0,  1.0,  2.0,  1.0]),
  unnest(ARRAY[
    'Iohexol IV contrast',
    'IV Cannula 20G',
    'Y Tube — IV line',
    'Syringe — draw & flush (×2)',
    'Saline 0.9% 100ml — flush'
  ])
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.study_type = 'Contrast' AND sd.active = true
  AND NOT (  sd.study_name ILIKE '%Angiography%'
          OR sd.study_name ILIKE '%Aortic%'
          OR sd.study_name ILIKE '%Pulmonary Angio%'
  )
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 7. IV ACCESS — MRI Contrast studies
-- (Gadolinium not yet in item_master — add IV access disposables only)
-- ════════════════════════════════════════════════════════════
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id,
  unnest(ARRAY[ 80,   90,   87]),
  unnest(ARRAY[1.0,  1.0,  1.0]),
  unnest(ARRAY[
    'IV Cannula 20G — contrast access',
    'Syringe',
    'Saline 0.9% 100ml — flush'
  ])
FROM study_definitions sd
WHERE sd.modality = 'MRI' AND sd.study_type = 'Contrast' AND sd.active = true
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 8. ORAL CONTRAST — CT studies covering bowel (abdomen/pelvis)
-- NOT added for: Liver Triple Phase, Angiography, KUB
-- (KUB = plain scan for stones; Liver 3P = dedicated liver enhancement)
-- ════════════════════════════════════════════════════════════
INSERT INTO study_consumables (study_definition_id, item_master_id, default_qty, notes)
SELECT sd.id, 92, 1.0, 'Oral Contrast — bowel opacification'
FROM study_definitions sd
WHERE sd.modality = 'CT' AND sd.active = true
  AND (  sd.study_name ILIKE '%Abdomen%'
      OR sd.study_name ILIKE '%Pelvis%'
      OR sd.study_name ILIKE '%Chest Abdomen%'
      OR sd.study_name ILIKE '%Urography%'
  )
  AND sd.study_name NOT ILIKE '%Angiography%'
  AND sd.study_name NOT ILIKE '%Triple Phase%'
  AND sd.study_name NOT ILIKE '%KUB%'
ON CONFLICT (study_definition_id, item_master_id) DO NOTHING;

COMMIT;
