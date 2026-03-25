-- Migration 108: Apply GL account mappings to item_categories
-- Uses account_code to resolve GL IDs (safe across different environments)
-- Run this on the PRODUCTION database to fix "no GL mapped" display.
--
-- Strategy: UPDATE item_categories using a JOIN on chart_of_accounts.account_code
-- so this is idempotent and environment-agnostic.

BEGIN;

-- STOCK categories
UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1151' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5132' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'ST_SPARE';

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1152' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5111' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2111' AND is_active = true LIMIT 1)
WHERE code = 'ST_CONTRAST';

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1151' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5112' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2111' AND is_active = true LIMIT 1)
WHERE code IN ('ST_SYRINGE', 'ST_CANNULA', 'ST_PPE');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1151' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5115' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2111' AND is_active = true LIMIT 1)
WHERE code IN ('ST_US_GEL', 'ST_OTHER_CLIN');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1155' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5114' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2111' AND is_active = true LIMIT 1)
WHERE code IN ('ST_DRUG', 'ST_PHARMA');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1153' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5113' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code IN ('ST_CD_DVD', 'ST_REPORT_COVER', 'ST_THERMAL_PAPER');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1154' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5410' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code IN ('ST_STATIONERY', 'ST_OTHER_OFFICE');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1154' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5730' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'ST_TONER';

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1156' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5123' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'ST_TELERAD_CREDITS';

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1158' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5361' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-STOCK';

-- STOCK L2 sub-categories
UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1151' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5132' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('ST_EQUIP_SPARE', 'ST_OTHER_SPARE');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1151' AND is_active = true LIMIT 1),
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5365' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'ST_ELEC_PART';

-- FIXED_ASSET categories (Medical Equipment)
UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  ap_account_id  = NULL
WHERE code = 'FA_MEDICAL_EQUIP';

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1210' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_MED_NEW','FA_MED_REFURB',
               'FA_MRI','FA_CT','FA_XRAY_MACHINE','FA_ULTRASOUND','FA_MAMMOGRAPHY',
               'FA_FLUORO','FA_DEXA','FA_PETCT','FA_OTHER_MED_EQUIP',
               'FA_MAMMO_NEW','FA_PETCT_NEW','FA_DEXA_NEW','FA_XRAY_NEW','FA_ULTRA_NEW',
               'FA_FLUORO_NEW','FA_OTHER_MED_NEW','FA_MRI_NEW','FA_CT_NEW',
               'FA_ULTRA_REFURB','FA_PETCT_REFURB','FA_FLUORO_REFURB','FA_MAMMO_REFURB',
               'FA_DEXA_REFURB','FA_XRAY_REFURB','FA_CT_REFURB','FA_OTHER_MED_REFURB','FA_MRI_REFURB');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1220' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_IT','FA_COMPUTER','FA_PACS','FA_NETWORK','FA_PRINTER_SCAN','FA_UPS','FA_OTHER_IT');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1230' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_FURNITURE','FA_OFFICE_FURN','FA_PATIENT_FURN','FA_CABINET','FA_OTHER_FURN');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1240' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_VEHICLE','FA_CAR','FA_VAN','FA_AMBULANCE','FA_OTHER_VEH');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1250' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code IN ('FA_CIVIL','FA_RENOVATION','FA_ELECTRICAL','FA_PLUMBING','FA_HVAC','FA_OTHER_CIVIL','BLD-CAPEX');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1310' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_SOFTWARE','FA_ERP_SW','FA_PACS_SW','FA_OTHER_SW');

UPDATE item_categories SET
  asset_gl_id    = (SELECT id FROM chart_of_accounts WHERE account_code = '1270' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code IN ('FA_APPLIANCE','FA_GENERATOR','FA_AC_UNIT','FA_OTHER_APPLIANCE','FA_WATER_PURIFIER','FA_REFRIGERATOR');

-- EXPENSE categories
UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5115' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2111' AND is_active = true LIMIT 1)
WHERE code = 'EX_CLINICAL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5520' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_PATIENT_ACQ';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5123' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_TELERADIOLOGY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5133' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_RAD_SAFETY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5310' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_EQUIP_LEASE';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5320' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2114' AND is_active = true LIMIT 1)
WHERE code = 'EX_ELECTRICITY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5330' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2114' AND is_active = true LIMIT 1)
WHERE code = 'EX_WATER';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5380' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_GENERATOR';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5340' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_HOUSEKEEPING';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5350' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_SECURITY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5360' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'EX_FACILITY_MAINT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5370' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_WASTE_DISPOSAL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5420' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_PRINTING';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5430' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_COURIER';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5440' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2114' AND is_active = true LIMIT 1)
WHERE code = 'EX_TELEPHONE';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5450' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_TRAVEL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5460' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_VEHICLE_FUEL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5470' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_MEALS';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5510' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_ADVERTISING';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5530' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_PATIENT_RELATIONS';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5540' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_BRANDING';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5550' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_EVENTS';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5710' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_ERP_SW';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5720' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_PACS_MAINT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5730' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_IT_HW_MAINT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5740' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_CYBERSECURITY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5750' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2112' AND is_active = true LIMIT 1)
WHERE code = 'EX_IT_CONSUMABLES';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5610' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_LEGAL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5620' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_AUDIT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5630' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_REGULATORY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5640' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_COMPLIANCE';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5650' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_MEMBERSHIPS';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5660' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_INSURANCE';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5810' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_BANK_CHARGES';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5820' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_LOAN_INTEREST';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5830' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_EQUIP_FIN_INT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5840' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_LATE_PENALTY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5210' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2131' AND is_active = true LIMIT 1)
WHERE code = 'EX_SALARY';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5240' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2132' AND is_active = true LIMIT 1)
WHERE code = 'EX_PF_ESI';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5270' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_STAFF_TRAINING';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5280' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_RECRUITMENT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5993' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_DONATIONS';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5995' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2113' AND is_active = true LIMIT 1)
WHERE code = 'EX_PRIOR_PERIOD';

-- Building Expense L2 sub-categories
UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5361' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-CIVIL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5362' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-TILES';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5363' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-PAINT';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5364' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-PLUMB';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5365' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-ELEC';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5366' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-CARP';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5367' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-CEIL';

UPDATE item_categories SET
  expense_gl_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '5368' AND is_active = true LIMIT 1),
  ap_account_id  = (SELECT id FROM chart_of_accounts WHERE account_code = '2115' AND is_active = true LIMIT 1)
WHERE code = 'BLD-LABOUR';

-- Verify: show count of categories still missing all GL mappings after this migration
DO $$
DECLARE v_unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unmapped
  FROM item_categories
  WHERE active = true
    AND asset_gl_id IS NULL
    AND expense_gl_id IS NULL
    AND ap_account_id IS NULL;
  RAISE NOTICE 'Categories still with no GL mapping after migration: %', v_unmapped;
END $$;

COMMIT;
