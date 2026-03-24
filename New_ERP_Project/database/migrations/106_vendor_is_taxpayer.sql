-- ============================================================
-- 106_vendor_is_taxpayer.sql
-- Add is_taxpayer flag to vendor_master
-- When false: GST is not calculated on POs or AP for this vendor
-- ============================================================

ALTER TABLE vendor_master
  ADD COLUMN IF NOT EXISTS is_taxpayer BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN vendor_master.is_taxpayer IS
  'true = GST-registered vendor (GSTIN required, GST calculated on POs).
   false = unregistered/composition vendor — no GST on purchases.';

-- Back-fill: vendors with a GSTIN are taxpayers; those without are not
UPDATE vendor_master
   SET is_taxpayer = CASE WHEN gst_number IS NOT NULL AND gst_number <> '' THEN true ELSE false END
 WHERE true;
