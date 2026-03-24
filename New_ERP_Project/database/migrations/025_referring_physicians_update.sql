-- Migration 025: Add first_name, last_name, status columns to referring_physician_master
-- These columns support the new Referring Physician Master UI

ALTER TABLE referring_physician_master
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS status     VARCHAR(20) DEFAULT 'active';

-- Backfill first_name / last_name from physician_name where not yet set
UPDATE referring_physician_master
SET
  first_name = TRIM(split_part(physician_name, ' ', 1)),
  last_name  = TRIM(SUBSTR(physician_name, LENGTH(split_part(physician_name, ' ', 1)) + 2))
WHERE (first_name IS NULL OR first_name = '')
  AND physician_name IS NOT NULL AND physician_name <> '';

-- Sync status with active flag
UPDATE referring_physician_master
SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END
WHERE status IS NULL;
