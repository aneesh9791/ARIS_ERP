-- Migration 087: Add gst_rate, hsn_code, sac_code to item_categories
-- GST rate is now standardised at category level; item_master.gst_rate
-- can override but defaults to its category's rate.

ALTER TABLE item_categories
  ADD COLUMN IF NOT EXISTS gst_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hsn_code   VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sac_code   VARCHAR(20)  DEFAULT NULL;

-- ── FIXED_ASSET – L1 defaults ────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=12 WHERE code='FA_MEDICAL_EQUIP';
UPDATE item_categories SET gst_rate=12 WHERE code='FA_MED_NEW';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_MED_REFURB';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_IT';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_FURNITURE';
UPDATE item_categories SET gst_rate=28 WHERE code='FA_VEHICLE';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_CIVIL';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_SOFTWARE';
UPDATE item_categories SET gst_rate=18 WHERE code='FA_APPLIANCE';

-- ── FIXED_ASSET – L2 Medical (new) ───────────────────────────────────────────
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_MRI_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_CT_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_XRAY_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='FA_ULTRA_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_MAMMO_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_FLUORO_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_DEXA_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_PETCT_NEW';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='FA_OTHER_MED_NEW';

-- ── FIXED_ASSET – L2 Medical (refurbished) ───────────────────────────────────
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_MRI_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_CT_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_XRAY_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9018' WHERE code='FA_ULTRA_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_MAMMO_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_FLUORO_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_DEXA_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9022' WHERE code='FA_PETCT_REFURB';
UPDATE item_categories SET gst_rate=18, hsn_code='9018' WHERE code='FA_OTHER_MED_REFURB';

-- ── FIXED_ASSET – L2 Medical (legacy FA_MEDICAL_EQUIP children) ─────────────
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_MRI';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_CT';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_XRAY_MACHINE';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='FA_ULTRASOUND';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_MAMMOGRAPHY';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_FLUORO';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_DEXA';
UPDATE item_categories SET gst_rate=12, hsn_code='9022' WHERE code='FA_PETCT';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='FA_OTHER_MED_EQUIP';

-- ── FIXED_ASSET – L2 IT ──────────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18, hsn_code='8471' WHERE code='FA_COMPUTER';
UPDATE item_categories SET gst_rate=18, hsn_code='8471' WHERE code='FA_PACS';
UPDATE item_categories SET gst_rate=18, hsn_code='8517' WHERE code='FA_NETWORK';
UPDATE item_categories SET gst_rate=18, hsn_code='8443' WHERE code='FA_PRINTER_SCAN';
UPDATE item_categories SET gst_rate=18, hsn_code='8504' WHERE code='FA_UPS';
UPDATE item_categories SET gst_rate=18, hsn_code='8471' WHERE code='FA_OTHER_IT';

-- ── FIXED_ASSET – L2 Furniture ───────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18, hsn_code='9403' WHERE code='FA_OFFICE_FURN';
UPDATE item_categories SET gst_rate=18, hsn_code='9402' WHERE code='FA_PATIENT_FURN';
UPDATE item_categories SET gst_rate=18, hsn_code='9403' WHERE code='FA_CABINET';
UPDATE item_categories SET gst_rate=18, hsn_code='9403' WHERE code='FA_OTHER_FURN';

-- ── FIXED_ASSET – L2 Vehicles ────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=28, hsn_code='8703' WHERE code='FA_CAR';
UPDATE item_categories SET gst_rate=28, hsn_code='8702' WHERE code='FA_VAN';
UPDATE item_categories SET gst_rate=12, hsn_code='8705' WHERE code='FA_AMBULANCE';
UPDATE item_categories SET gst_rate=28, hsn_code='8704' WHERE code='FA_OTHER_VEH';

-- ── FIXED_ASSET – L2 Civil ───────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18, sac_code='9954' WHERE code='FA_RENOVATION';
UPDATE item_categories SET gst_rate=18, sac_code='9954' WHERE code='FA_ELECTRICAL';
UPDATE item_categories SET gst_rate=18, sac_code='9954' WHERE code='FA_PLUMBING';
UPDATE item_categories SET gst_rate=18, hsn_code='8415' WHERE code='FA_HVAC';
UPDATE item_categories SET gst_rate=18, sac_code='9954' WHERE code='FA_OTHER_CIVIL';

-- ── FIXED_ASSET – L2 Software ────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18, sac_code='9973' WHERE code='FA_ERP_SW';
UPDATE item_categories SET gst_rate=18, sac_code='9973' WHERE code='FA_PACS_SW';
UPDATE item_categories SET gst_rate=18, sac_code='9973' WHERE code='FA_OTHER_SW';

-- ── FIXED_ASSET – L2 Appliances ──────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18, hsn_code='8415' WHERE code='FA_AC_UNIT';
UPDATE item_categories SET gst_rate=18, hsn_code='8418' WHERE code='FA_REFRIGERATOR';
UPDATE item_categories SET gst_rate=18, hsn_code='8421' WHERE code='FA_WATER_PURIFIER';
UPDATE item_categories SET gst_rate=18, hsn_code='8502' WHERE code='FA_GENERATOR';
UPDATE item_categories SET gst_rate=18             WHERE code='FA_OTHER_APPLIANCE';

-- ── STOCK – L1 ───────────────────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=12, hsn_code='3006' WHERE code='ST_CONTRAST';
UPDATE item_categories SET gst_rate= 5, hsn_code='3004' WHERE code='ST_DRUG';
UPDATE item_categories SET gst_rate= 5, hsn_code='3004' WHERE code='ST_PHARMA';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='ST_SYRINGE';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='ST_CANNULA';
UPDATE item_categories SET gst_rate=18, hsn_code='4015' WHERE code='ST_PPE';
UPDATE item_categories SET gst_rate=12, hsn_code='3824' WHERE code='ST_US_GEL';
UPDATE item_categories SET gst_rate=18, hsn_code='8523' WHERE code='ST_CD_DVD';
UPDATE item_categories SET gst_rate=12, hsn_code='4820' WHERE code='ST_STATIONERY';
UPDATE item_categories SET gst_rate=18, hsn_code='8443' WHERE code='ST_TONER';
UPDATE item_categories SET gst_rate=12, hsn_code='4820' WHERE code='ST_REPORT_COVER';
UPDATE item_categories SET gst_rate=18, hsn_code='4811' WHERE code='ST_THERMAL_PAPER';
UPDATE item_categories SET gst_rate=18             WHERE code='ST_OTHER_OFFICE';
UPDATE item_categories SET gst_rate=12, hsn_code='9018' WHERE code='ST_OTHER_CLIN';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='ST_TELERAD_CREDITS';

-- ── STOCK – L2 Spare parts ───────────────────────────────────────────────────
UPDATE item_categories SET gst_rate=18 WHERE code='ST_SPARE';
UPDATE item_categories SET gst_rate=18, hsn_code='8479' WHERE code='ST_EQUIP_SPARE';
UPDATE item_categories SET gst_rate=18, hsn_code='8538' WHERE code='ST_ELEC_PART';
UPDATE item_categories SET gst_rate=18             WHERE code='ST_OTHER_SPARE';

-- ── EXPENSE – L1 (services) ──────────────────────────────────────────────────
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_SALARY';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_PF_ESI';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_LOAN_INTEREST';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_EQUIP_FIN_INT';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_LATE_PENALTY';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_PRIOR_PERIOD';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_DONATIONS';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_ELECTRICITY';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_WATER';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_VEHICLE_FUEL';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_CLINICAL';
UPDATE item_categories SET gst_rate= 0 WHERE code='EX_INSURANCE';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_TELERADIOLOGY';
UPDATE item_categories SET gst_rate=18, sac_code='9994' WHERE code='EX_HOUSEKEEPING';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_SECURITY';
UPDATE item_categories SET gst_rate=18, sac_code='9954' WHERE code='EX_FACILITY_MAINT';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_LEGAL';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_AUDIT';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_REGULATORY';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_COMPLIANCE';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_MEMBERSHIPS';
UPDATE item_categories SET gst_rate=18, sac_code='9961' WHERE code='EX_ADVERTISING';
UPDATE item_categories SET gst_rate=18, sac_code='9961' WHERE code='EX_BRANDING';
UPDATE item_categories SET gst_rate=18, sac_code='9961' WHERE code='EX_EVENTS';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_ERP_SW';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_PACS_MAINT';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_IT_HW_MAINT';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_CYBERSECURITY';
UPDATE item_categories SET gst_rate=18             WHERE code='EX_IT_CONSUMABLES';
UPDATE item_categories SET gst_rate=18, sac_code='9994' WHERE code='EX_WASTE_DISPOSAL';
UPDATE item_categories SET gst_rate=18, sac_code='9963' WHERE code='EX_PATIENT_RELATIONS';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_GENERATOR';
UPDATE item_categories SET gst_rate=12, hsn_code='4901' WHERE code='EX_PRINTING';
UPDATE item_categories SET gst_rate= 5, sac_code='9965' WHERE code='EX_COURIER';
UPDATE item_categories SET gst_rate=18, sac_code='9984' WHERE code='EX_TELEPHONE';
UPDATE item_categories SET gst_rate=18, sac_code='9964' WHERE code='EX_TRAVEL';
UPDATE item_categories SET gst_rate=18, sac_code='9963' WHERE code='EX_MEALS';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_EQUIP_LEASE';
UPDATE item_categories SET gst_rate=18             WHERE code='EX_RAD_SAFETY';
UPDATE item_categories SET gst_rate=18, sac_code='9992' WHERE code='EX_STAFF_TRAINING';
UPDATE item_categories SET gst_rate=18, sac_code='9985' WHERE code='EX_RECRUITMENT';
UPDATE item_categories SET gst_rate=18             WHERE code='EX_PATIENT_ACQ';
UPDATE item_categories SET gst_rate=18, sac_code='9983' WHERE code='EX_BANK_CHARGES';

-- Sync item_master.gst_rate for items where gst_rate=0 (never explicitly set)
-- Items that already have a non-zero rate keep their existing rate
UPDATE item_master im
SET gst_rate = ic.gst_rate
FROM item_categories ic
WHERE ic.id = im.category_id
  AND im.gst_rate = 0
  AND ic.gst_rate > 0;
