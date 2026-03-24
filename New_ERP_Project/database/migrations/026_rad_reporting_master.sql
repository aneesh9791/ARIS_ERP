-- Migration 026: Extend radiologist_master for RAD-Reporting Master
-- Adds reporter_type (RADIOLOGIST / TELERADIOLOGY), status, and per-modality rates

ALTER TABLE radiologist_master
  ADD COLUMN IF NOT EXISTS reporter_type VARCHAR(20) DEFAULT 'RADIOLOGIST',
  ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS rate_xray     DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_ct       DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_mri      DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_usg      DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_mammo    DECIMAL(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_fluoro   DECIMAL(8,2) DEFAULT 0;

-- Backfill reporter_type from existing type column
UPDATE radiologist_master
SET reporter_type = CASE
  WHEN type IN ('teleradiology', 'external') THEN 'TELERADIOLOGY'
  ELSE 'RADIOLOGIST'
END
WHERE reporter_type = 'RADIOLOGIST';

-- Backfill status from active flag
UPDATE radiologist_master
SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END;

-- Backfill per-modality rates from per_study_rate as baseline
UPDATE radiologist_master
SET
  rate_xray   = COALESCE(per_study_rate, 0),
  rate_ct     = COALESCE(per_study_rate, 0),
  rate_mri    = COALESCE(per_study_rate, 0),
  rate_usg    = COALESCE(per_study_rate, 0),
  rate_mammo  = COALESCE(per_study_rate, 0),
  rate_fluoro = COALESCE(per_study_rate, 0)
WHERE rate_xray = 0 AND per_study_rate > 0;

-- Add constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_reporter_type'
  ) THEN
    ALTER TABLE radiologist_master
      ADD CONSTRAINT chk_reporter_type
      CHECK (reporter_type IN ('RADIOLOGIST', 'TELERADIOLOGY'));
  END IF;
END $$;
