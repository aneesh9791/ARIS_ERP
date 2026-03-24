-- Migration 067: RCM GST account mappings for tele-radiology services
-- Under Reverse Charge Mechanism (RCM), the recipient (diagnostic center) pays
-- GST directly to the government. Standard rate: 18% IGST for inter-state services.
--
-- JE on accrual: DR ITC Input (1134)  CR IGST Payable (2123)
-- JE on payment to govt: DR IGST Payable (2123)  CR Bank

-- Insert RCM GST mappings using account codes (resolve to IDs)
INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'RCM_GST', 'TELE_RADIOLOGY_IGST',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1134' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2123' AND is_active = true LIMIT 1),
  'RCM GST (IGST 18%) on tele-radiology services — DR ITC Input (1134) CR IGST Payable (2123)'
WHERE NOT EXISTS (
  SELECT 1 FROM finance_account_mappings WHERE event_type = 'RCM_GST' AND sub_type = 'TELE_RADIOLOGY_IGST'
);

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'RCM_GST', 'TELE_RADIOLOGY_CGST',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1134' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2121' AND is_active = true LIMIT 1),
  'RCM GST (CGST 9%) on tele-radiology services — DR ITC Input (1134) CR CGST Payable (2121)'
WHERE NOT EXISTS (
  SELECT 1 FROM finance_account_mappings WHERE event_type = 'RCM_GST' AND sub_type = 'TELE_RADIOLOGY_CGST'
);

INSERT INTO finance_account_mappings (event_type, sub_type, debit_account_id, credit_account_id, description)
SELECT
  'RCM_GST', 'TELE_RADIOLOGY_SGST',
  (SELECT id FROM chart_of_accounts WHERE account_code = '1134' AND is_active = true LIMIT 1),
  (SELECT id FROM chart_of_accounts WHERE account_code = '2122' AND is_active = true LIMIT 1),
  'RCM GST (SGST 9%) on tele-radiology services — DR ITC Input (1134) CR SGST Payable (2122)'
WHERE NOT EXISTS (
  SELECT 1 FROM finance_account_mappings WHERE event_type = 'RCM_GST' AND sub_type = 'TELE_RADIOLOGY_SGST'
);
