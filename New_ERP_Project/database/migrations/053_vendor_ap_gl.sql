-- ============================================================
-- Migration 053: Vendor AP/GL Integration
-- Adds AP account to vendor_master, GL account to bill items,
-- and JE tracking to bills and payments for proper double-entry.
-- ============================================================

-- 1. Add ap_account_id to vendor_master
ALTER TABLE vendor_master
  ADD COLUMN IF NOT EXISTS ap_account_id INTEGER REFERENCES chart_of_accounts(id);

-- Default all existing vendors to AP – Service Providers (2113)
UPDATE vendor_master
SET ap_account_id = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' LIMIT 1)
WHERE ap_account_id IS NULL;

-- 2. Add GL account + ITC flag to vendor_bill_items
ALTER TABLE vendor_bill_items
  ADD COLUMN IF NOT EXISTS gl_account_id INTEGER REFERENCES chart_of_accounts(id);

-- 3. Add GL tracking fields to vendor_bills
ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS itc_claimable    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);

-- 4. Add payment GL tracking to vendor_payments
ALTER TABLE vendor_payments
  ADD COLUMN IF NOT EXISTS bank_account_id  INTEGER REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES journal_entries(id);

-- Default existing cash payments → 1111, all others → 1112
UPDATE vendor_payments vp
SET bank_account_id = (
  CASE vp.payment_mode
    WHEN 'CASH' THEN (SELECT id FROM chart_of_accounts WHERE account_code = '1111' LIMIT 1)
    ELSE             (SELECT id FROM chart_of_accounts WHERE account_code = '1112' LIMIT 1)
  END
)
WHERE vp.bank_account_id IS NULL;

-- 5. Sync existing vendors into parties table with correct ap_account_id
INSERT INTO parties (party_code, party_name, party_type, vendor_id, gstin, ap_account_id)
SELECT
  'V-' || vm.vendor_code,
  vm.vendor_name,
  'VENDOR',
  vm.id,
  vm.gst_number,
  vm.ap_account_id
FROM vendor_master vm
ON CONFLICT (party_code) DO UPDATE SET
  party_name    = EXCLUDED.party_name,
  ap_account_id = EXCLUDED.ap_account_id;
