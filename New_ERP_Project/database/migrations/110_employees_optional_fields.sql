-- Migration 110: Make non-essential employee fields nullable
-- date_of_birth, address, emergency_contact_name/phone are optional at registration

ALTER TABLE employees
  ALTER COLUMN date_of_birth           DROP NOT NULL,
  ALTER COLUMN address                 DROP NOT NULL,
  ALTER COLUMN emergency_contact_name  DROP NOT NULL,
  ALTER COLUMN emergency_contact_phone DROP NOT NULL;
