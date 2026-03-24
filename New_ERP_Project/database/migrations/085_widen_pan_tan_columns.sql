-- Migration 085: Widen PAN/TAN columns from VARCHAR(10) to VARCHAR(20)
-- Indian PAN is 10 chars but users may enter with spaces/formatting; TAN also 10 chars
ALTER TABLE vendor_master       ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE asset_vendors       ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE centers             ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE company_info        ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE company_info        ALTER COLUMN tan        TYPE VARCHAR(20);
ALTER TABLE corporate_entities  ALTER COLUMN pan        TYPE VARCHAR(20);
ALTER TABLE employees           ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE insurance_providers ALTER COLUMN pan_number TYPE VARCHAR(20);
ALTER TABLE parties             ALTER COLUMN pan        TYPE VARCHAR(20);
ALTER TABLE radiologist_master  ALTER COLUMN pan_number TYPE VARCHAR(20);
