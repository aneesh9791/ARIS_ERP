-- Migration 027: RAD-Reporting – per-study rates and name split

-- 1. Add first_name / last_name to radiologist_master
ALTER TABLE radiologist_master
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100);

-- Backfill for radiologists: split radiologist_name on first space
UPDATE radiologist_master
SET
  first_name = SPLIT_PART(radiologist_name, ' ', 1),
  last_name  = TRIM(SUBSTRING(radiologist_name FROM POSITION(' ' IN radiologist_name) + 1))
WHERE reporter_type = 'RADIOLOGIST' AND first_name IS NULL;

-- For teleradiology companies, store company name in first_name (no split)
UPDATE radiologist_master
SET first_name = radiologist_name, last_name = ''
WHERE reporter_type = 'TELERADIOLOGY' AND first_name IS NULL;

-- 2. Create per-study rates table
CREATE TABLE IF NOT EXISTS radiologist_study_rates (
  id             SERIAL PRIMARY KEY,
  radiologist_id INTEGER NOT NULL REFERENCES radiologist_master(id) ON DELETE CASCADE,
  study_id       INTEGER NOT NULL REFERENCES study_master(id),
  study_name     VARCHAR(200) NOT NULL,
  rate           DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE(radiologist_id, study_id)
);

CREATE INDEX IF NOT EXISTS idx_rad_study_rates_rad_id ON radiologist_study_rates(radiologist_id);
