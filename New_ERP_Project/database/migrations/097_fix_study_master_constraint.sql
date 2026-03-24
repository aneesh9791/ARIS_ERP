-- 097: Fix study_master unique constraint + backfill study_definition_id
-- Problem: study_code has a unique constraint across all rows (all centers),
--          but migration 096 inserted rows without study_definition_id.
--          When pricing UI tries to INSERT for a second center it hits the constraint.
-- Fix:
--   1. Backfill study_definition_id for all rows where it is NULL (match on study_code)
--   2. Drop the broken per-study_code unique constraint
--   3. Add correct unique constraint on (study_definition_id, center_id)

-- ── Step 1: Backfill study_definition_id ─────────────────────────────────────
UPDATE study_master sm
SET study_definition_id = sd.id,
    updated_at = NOW()
FROM study_definitions sd
WHERE sm.study_code = sd.study_code
  AND sm.study_definition_id IS NULL;

-- ── Step 2: Drop old single-column unique constraint ─────────────────────────
ALTER TABLE study_master
  DROP CONSTRAINT IF EXISTS study_master_study_code_key;

-- ── Step 3: Add correct composite unique constraint ───────────────────────────
-- One pricing row per (study_definition, center) combination
ALTER TABLE study_master
  ADD CONSTRAINT study_master_def_center_key
  UNIQUE (study_definition_id, center_id);

-- ── Verification ──────────────────────────────────────────────────────────────
-- Run manually to confirm:
-- SELECT COUNT(*) FROM study_master WHERE study_definition_id IS NULL;  -- should be 0
-- \d study_master  -- should show study_master_def_center_key, no study_code key
