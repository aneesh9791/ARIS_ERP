-- ============================================================
-- Migration 042: Study Definitions — Global Study Catalog
-- Separates the "what is this study" (study_definitions)
-- from "what does this study cost at a center" (study_master).
--
-- study_definitions  → global catalog: code, name, type, modality
-- study_master       → center pricing: study_definition_id FK + center_id + rates
-- ============================================================

-- ── 1. Create global study catalog table ─────────────────────
CREATE TABLE IF NOT EXISTS study_definitions (
  id           SERIAL PRIMARY KEY,
  study_code   VARCHAR(50)  UNIQUE NOT NULL,
  study_name   VARCHAR(200) NOT NULL,
  study_type   VARCHAR(50)  NOT NULL DEFAULT 'Plain',
  modality     VARCHAR(50)  NOT NULL,
  description  TEXT,
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_definitions_modality ON study_definitions(modality);
CREATE INDEX IF NOT EXISTS idx_study_definitions_active   ON study_definitions(active);

-- ── 2. Migrate existing study_master rows into study_definitions ─
-- Pick the most recent row per study_code (DISTINCT ON + ORDER BY)
INSERT INTO study_definitions (study_code, study_name, study_type, modality)
SELECT DISTINCT ON (study_code)
  study_code,
  study_name,
  COALESCE(NULLIF(TRIM(study_type), ''), 'Plain'),
  COALESCE(NULLIF(TRIM(modality),   ''), 'GENERAL')
FROM study_master
WHERE study_code IS NOT NULL
  AND TRIM(study_code) != ''
ORDER BY study_code, updated_at DESC NULLS LAST
ON CONFLICT (study_code) DO NOTHING;

-- ── 3. Add study_definition_id FK to study_master ─────────────
ALTER TABLE study_master
  ADD COLUMN IF NOT EXISTS study_definition_id INT
    REFERENCES study_definitions(id) ON DELETE SET NULL;

-- ── 4. Back-fill study_definition_id for existing rows ─────────
UPDATE study_master sm
SET study_definition_id = sd.id
FROM study_definitions sd
WHERE sm.study_code = sd.study_code
  AND sm.study_definition_id IS NULL;

-- ── 5. study_center_pricing view (convenience) ─────────────────
-- Joining study_definitions + study_master for frontend queries
CREATE OR REPLACE VIEW study_center_pricing AS
SELECT
  sm.id,
  sm.study_definition_id,
  sd.study_code,
  sd.study_name,
  sd.study_type,
  sd.modality,
  sm.center_id,
  c.name              AS center_name,
  sm.base_rate,
  sm.insurance_rate,
  sm.self_pay_rate,
  sm.active,
  sm.created_at,
  sm.updated_at
FROM study_master sm
JOIN study_definitions sd ON sd.id = sm.study_definition_id
LEFT JOIN centers c ON c.id = sm.center_id;
