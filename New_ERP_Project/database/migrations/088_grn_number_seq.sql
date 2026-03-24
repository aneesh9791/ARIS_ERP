-- Migration 088: Replace MAX(grn_number)+1 with a proper sequence
-- Eliminates race condition in concurrent GRN creation

-- Create sequence seeded from current maximum grn_number
-- grn_number format: GRN-YYYYMMDD-NNN  — extract the trailing NNN across all records
DO $$
DECLARE
  v_max INT;
BEGIN
  SELECT COALESCE(
    MAX(
      CAST(
        SPLIT_PART(grn_number, '-', 3)  -- 'GRN-20260315-007' → '007'
        AS INTEGER
      )
    ), 0
  )
  INTO v_max
  FROM purchase_receipts
  WHERE grn_number ~ '^GRN-\d{8}-\d+$';

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS grn_number_seq START WITH %s INCREMENT BY 1 NO CYCLE',
    v_max + 1
  );
END;
$$;

COMMENT ON SEQUENCE grn_number_seq IS
  'Monotonically increasing counter for GRN serial numbers (format: GRN-YYYYMMDD-{seq})';
