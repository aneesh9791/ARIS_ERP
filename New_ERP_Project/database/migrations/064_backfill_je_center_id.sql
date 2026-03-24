-- Migration 064: Backfill journal_entries.center_id from journal_entry_lines
--
-- Auto-posted JEs (from financeService.createAndPostJE) were writing center_id
-- only to journal_entry_lines but not to the journal_entries header.
-- This migration backfills the header for all existing auto-posted JEs.
--
-- Logic: for each JE with a NULL center_id, take the center_id from the first
-- journal_entry_line that has one (all lines in a single JE belong to the same center).

UPDATE journal_entries je
SET    center_id = (
         SELECT jel.center_id
         FROM   journal_entry_lines jel
         WHERE  jel.journal_entry_id = je.id
           AND  jel.center_id IS NOT NULL
         LIMIT  1
       ),
       updated_at = NOW()
WHERE  je.center_id IS NULL
  AND  EXISTS (
         SELECT 1
         FROM   journal_entry_lines jel
         WHERE  jel.journal_entry_id = je.id
           AND  jel.center_id IS NOT NULL
       );

-- Report how many rows were updated (informational)
DO $$
DECLARE updated_count INT;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Migration 064: backfilled center_id on % journal_entries', updated_count;
END $$;
