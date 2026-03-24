-- ============================================================
-- 104_centers_ae_title.sql
-- Add DICOM AE Title to centers table (required by MWL Gateway)
-- Also adds referring_physician_code to studies if missing
-- ============================================================

-- DICOM Application Entity Title — uniquely identifies the modality / station.
-- Format: up to 16 uppercase alphanumeric chars + underscore, e.g. ARIS_CT1
ALTER TABLE centers
  ADD COLUMN IF NOT EXISTS ae_title VARCHAR(16);

-- Back-fill AE title from center code where available (e.g. ARIS_C001 → ARISC001)
UPDATE centers
  SET ae_title = UPPER(REGEXP_REPLACE(code, '[^A-Za-z0-9_]', '', 'g'))
WHERE ae_title IS NULL
  AND code IS NOT NULL;

-- Ensure referring_physician_code exists on studies table
-- (some environments may have run 002_masters without this column if schema drift)
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS referring_physician_code VARCHAR(20)
    REFERENCES referring_physician_master(physician_code);

-- Index for MWL gateway ae_title lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_centers_ae_title ON centers(ae_title) WHERE ae_title IS NOT NULL;

-- Index on studies.referring_physician_code for the MWL LEFT JOIN
CREATE INDEX IF NOT EXISTS idx_studies_referring_physician ON studies(referring_physician_code);

-- ── Ensure studies.center_id is always set ──────────────────────────────────
-- MWL gateway joins centers on center_id; NULL values silently drop from results.
-- This backfill uses the linked patient's center_id as fallback.
UPDATE studies s
  SET center_id = p.center_id
FROM patients p
WHERE s.patient_id = p.id
  AND s.center_id IS NULL
  AND p.center_id IS NOT NULL;

-- Helpful comment on ae_title column
COMMENT ON COLUMN centers.ae_title IS
  'DICOM Application Entity Title — used by MWL Gateway to identify the performing station (max 16 chars, uppercase)';
