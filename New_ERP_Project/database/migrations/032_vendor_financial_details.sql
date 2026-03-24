-- Migration 032: Add GST, PAN and bank/payment details to asset_vendors

ALTER TABLE asset_vendors
  ADD COLUMN IF NOT EXISTS gstin        VARCHAR(15),
  ADD COLUMN IF NOT EXISTS pan_number   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bank_name    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_branch  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS account_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ifsc_code    VARCHAR(11),
  ADD COLUMN IF NOT EXISTS upi_id       VARCHAR(100);
