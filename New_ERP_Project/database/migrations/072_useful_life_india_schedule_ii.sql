-- Migration 072: Useful Life — India Companies Act 2013, Schedule II
--
-- Sets useful_life_years on all Fixed Asset COA accounts and item categories
-- following Schedule II of the Companies Act 2013 (straight-line method).
--
-- Reference: Companies Act 2013, Schedule II, Part C
-- ┌──────────────────────────────────────────────┬───────────┐
-- │ Asset Class                                  │ Useful Life│
-- ├──────────────────────────────────────────────┼───────────┤
-- │ Buildings (RCC, other than factory)          │ 60 yrs    │
-- │ Buildings (factory)                          │ 30 yrs    │
-- │ Electrical fittings & installations          │ 10 yrs    │
-- │ Plant & Machinery (general)                  │ 15 yrs    │
-- │ Medical/Radiology equipment (P&M – health)   │ 13 yrs    │
-- │ Computers & data processing units            │  3 yrs    │
-- │ Servers & networks                           │  6 yrs    │
-- │ Furniture & fittings                         │ 10 yrs    │
-- │ Motor vehicles (cars, vans, ambulances)      │  8 yrs    │
-- │ Office equipment                             │  5 yrs    │
-- │ Software (intangible)                        │  3 yrs    │
-- │ Specialised software (PACS/RIS)              │  5 yrs    │
-- │ AC / Electrical appliances (P&M)             │ 10 yrs    │
-- │ Generator / DG set (P&M)                     │ 15 yrs    │
-- └──────────────────────────────────────────────┴───────────┘
--
-- Note: Radiology centres in Kerala follow the 13-year medical equipment life
-- for new equipment. Refurbished equipment is conservatively depreciated over
-- 7 years to reflect reduced remaining useful life.

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — COA account useful_life_years (parent / fallback rates)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1210  Medical & Radiology Equipment → 13 yrs (Schedule II: P&M – health services)
UPDATE chart_of_accounts SET useful_life_years = 13
WHERE account_code = '1210' AND is_active = true;

-- 1220  IT Equipment & Computers → 6 yrs (blended fallback; sub-categories override)
UPDATE chart_of_accounts SET useful_life_years = 6
WHERE account_code = '1220' AND is_active = true;

-- 1230  Furniture & Fixtures → 10 yrs (Schedule II: furniture & fittings)
UPDATE chart_of_accounts SET useful_life_years = 10
WHERE account_code = '1230' AND is_active = true;

-- 1240  Vehicles → 8 yrs (Schedule II: motor vehicles) — already correct
UPDATE chart_of_accounts SET useful_life_years = 8
WHERE account_code = '1240' AND is_active = true;

-- 1250  Leasehold Improvements → 30 yrs (Schedule II: factory buildings / civil works)
UPDATE chart_of_accounts SET useful_life_years = 30
WHERE account_code = '1250' AND is_active = true;

-- 1260  Office Equipment → 5 yrs (Schedule II: office equipment) — already correct
UPDATE chart_of_accounts SET useful_life_years = 5
WHERE account_code = '1260' AND is_active = true;

-- 1270  Office & Electrical Appliances → 10 yrs (Schedule II: P&M – electrical)
UPDATE chart_of_accounts SET useful_life_years = 10
WHERE account_code = '1270' AND is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — L1 item category fallback rates
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_MED_NEW',    13),   -- Medical Equipment – New       (13 yrs)
  ('FA_MED_REFURB',  7),   -- Medical Equipment – Refurb    ( 7 yrs, conservative)
  ('FA_IT',          6),   -- IT Equipment                  ( 6 yrs blended)
  ('FA_FURNITURE',  10),   -- Furniture & Fixtures          (10 yrs)
  ('FA_APPLIANCE',  10),   -- Appliances                    (10 yrs)
  ('FA_VEHICLE',     8),   -- Vehicles                      ( 8 yrs)
  ('FA_CIVIL',      30),   -- Building & Civil Works        (30 yrs)
  ('FA_SOFTWARE',    3)    -- Software & Licences           ( 3 yrs)
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — L2 item category specific rates
--             (required wherever sub-category differs from L1 parent or COA)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Medical Equipment – New (L2) ─────────────────────────────────────────────
-- Must be explicit so Refurbished L2 items don't fall back to COA 1210 = 13 yrs
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_CT_NEW',          13),
  ('FA_MRI_NEW',         13),
  ('FA_XRAY_NEW',        13),
  ('FA_ULTRA_NEW',       13),
  ('FA_MAMMO_NEW',       13),
  ('FA_FLUORO_NEW',      13),
  ('FA_DEXA_NEW',        13),
  ('FA_PETCT_NEW',       13),
  ('FA_OTHER_MED_NEW',   13)
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Medical Equipment – Refurbished (L2) ─────────────────────────────────────
-- 7 yrs — critical override; without this they'd fall back to COA 1210 = 13 yrs
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_CT_REFURB',          7),
  ('FA_MRI_REFURB',         7),
  ('FA_XRAY_REFURB',        7),
  ('FA_ULTRA_REFURB',       7),
  ('FA_MAMMO_REFURB',       7),
  ('FA_FLUORO_REFURB',      7),
  ('FA_DEXA_REFURB',        7),
  ('FA_PETCT_REFURB',       7),
  ('FA_OTHER_MED_REFURB',   7)
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── IT Equipment (L2) ────────────────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_COMPUTER',     3),   -- Schedule II: computers & data processing = 3 yrs
  ('FA_PACS',         6),   -- PACS/RIS hardware = server class = 6 yrs
  ('FA_NETWORK',      6),   -- Switches, routers, access points = 6 yrs
  ('FA_UPS',          6),   -- UPS & battery systems = 6 yrs (P&M – electrical)
  ('FA_PRINTER_SCAN', 5),   -- Printers / scanners = office equipment = 5 yrs
  ('FA_OTHER_IT',     5)    -- Miscellaneous IT = 5 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Software (L2) ────────────────────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_ERP_SW',   3),   -- Schedule II: intangibles / software = 3 yrs
  ('FA_PACS_SW',  5),   -- PACS/RIS software — specialised, longer shelf life
  ('FA_OTHER_SW', 3)    -- All other software = 3 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Building & Civil Works (L2) ──────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_RENOVATION',  10),  -- Renovation/interior works — amortised over 10 yrs
  ('FA_ELECTRICAL',  10),  -- Schedule II: electrical fittings = 10 yrs
  ('FA_HVAC',        10),  -- HVAC as P&M — electrical = 10 yrs
  ('FA_PLUMBING',    15),  -- Plumbing & sanitation (civil embedded) = 15 yrs
  ('FA_OTHER_CIVIL', 30)   -- Other permanent civil works = 30 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Vehicles (L2) ────────────────────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_CAR',       8),   -- Schedule II: motor cars = 8 yrs
  ('FA_VAN',       8),   -- Vans / minibuses = 8 yrs
  ('FA_AMBULANCE', 8),   -- Ambulance = 8 yrs
  ('FA_OTHER_VEH', 8)    -- Other vehicles = 8 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Furniture & Fixtures (L2) ────────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_OFFICE_FURN',  10),  -- Schedule II: furniture & fittings = 10 yrs
  ('FA_PATIENT_FURN', 10),  -- Patient beds, trolleys = 10 yrs
  ('FA_CABINET',      10),  -- Cabinets & shelving = 10 yrs
  ('FA_OTHER_FURN',   10)   -- Other furniture = 10 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ── Appliances (L2) ──────────────────────────────────────────────────────────
UPDATE item_categories SET useful_life_years = v.yrs, updated_at = NOW()
FROM (VALUES
  ('FA_AC_UNIT',          10),  -- AC unit (P&M – electrical) = 10 yrs
  ('FA_REFRIGERATOR',     10),  -- Refrigerator / freezer = 10 yrs
  ('FA_WATER_PURIFIER',    5),  -- Water purifier / RO = 5 yrs (short life)
  ('FA_GENERATOR',        15),  -- DG set / generator (P&M – general) = 15 yrs
  ('FA_OTHER_APPLIANCE',  10)   -- Other appliances = 10 yrs
) AS v(code, yrs)
WHERE item_categories.code = v.code;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Verify (informational)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM item_categories
  WHERE item_type = 'FIXED_ASSET' AND active = true AND useful_life_years IS NULL;

  IF missing_count > 0 THEN
    RAISE WARNING 'Migration 072: % FIXED_ASSET item categories still have NULL useful_life_years', missing_count;
  ELSE
    RAISE NOTICE 'Migration 072 complete: all FIXED_ASSET categories have useful_life_years set (Companies Act 2013, Schedule II)';
  END IF;
END $$;
