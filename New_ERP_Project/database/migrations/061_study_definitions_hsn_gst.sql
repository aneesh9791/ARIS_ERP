-- Migration 061: Add HSN/SAC and GST fields to study_definitions
-- study_definitions is the canonical catalog; study_master (billing) inherits from it.

ALTER TABLE study_definitions
  ADD COLUMN IF NOT EXISTS sac_code       VARCHAR(8),
  ADD COLUMN IF NOT EXISTS hsn_code       VARCHAR(8),
  ADD COLUMN IF NOT EXISTS gst_rate       NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_applicable BOOLEAN      NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN study_definitions.sac_code       IS 'GST SAC code — 999316 for diagnostic imaging (radiology)';
COMMENT ON COLUMN study_definitions.hsn_code       IS 'HSN code if goods component exists (rare for pure diagnostic services)';
COMMENT ON COLUMN study_definitions.gst_rate       IS 'GST rate as decimal (0 = exempt, 0.05 = 5%, 0.18 = 18%)';
COMMENT ON COLUMN study_definitions.gst_applicable IS 'True = taxable; False = exempt (most diagnostic imaging is exempt under SAC 9993)';

-- Default all existing studies to exempt (standard for diagnostic imaging)
UPDATE study_definitions SET gst_rate = 0, gst_applicable = FALSE WHERE sac_code IS NULL;
