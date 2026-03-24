-- 046: Add po_id and po_number to asset_register_view

DROP VIEW IF EXISTS asset_register_view;
CREATE VIEW asset_register_view AS
SELECT
  am.id,
  am.asset_code,
  am.asset_name,
  am.asset_type                                           AS category_code,
  at.name                                                 AS category_name,
  am.center_id,
  c.name                                                  AS center_name,
  am.manufacturer,
  am.model,
  am.serial_number,
  COALESCE(am.condition, 'NEW')                           AS condition,
  am.purchase_date                                        AS acquisition_date,
  am.purchase_cost                                        AS acquisition_value,
  COALESCE(am.salvage_value, 0)                           AS salvage_value,
  am.status,
  am.notes,
  am.active,
  am.po_id,
  po.po_number,
  po.vendor_name                                          AS po_vendor_name,
  -- Effective useful life from settings (overrides asset_types)
  COALESCE(ads.useful_life_years, at.useful_life_years, 5) AS useful_life_years,
  -- Annual depreciation (straight-line)
  CASE
    WHEN COALESCE(ads.useful_life_years, at.useful_life_years, 5) > 0
    THEN ROUND(
           (am.purchase_cost - COALESCE(am.salvage_value, 0))
           / COALESCE(ads.useful_life_years, at.useful_life_years, 5),
           2
         )
    ELSE 0
  END                                                     AS annual_depreciation,
  -- Years elapsed since purchase
  LEAST(
    DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
    COALESCE(ads.useful_life_years, at.useful_life_years, 5)
  )                                                       AS years_elapsed,
  -- Book value
  GREATEST(
    COALESCE(am.salvage_value, 0),
    am.purchase_cost - (
      CASE
        WHEN COALESCE(ads.useful_life_years, at.useful_life_years, 5) > 0
        THEN ROUND(
               (am.purchase_cost - COALESCE(am.salvage_value, 0))
               / COALESCE(ads.useful_life_years, at.useful_life_years, 5),
               2
             )
        ELSE 0
      END
      * LEAST(
          DATE_PART('year', AGE(CURRENT_DATE, am.purchase_date))::INTEGER,
          COALESCE(ads.useful_life_years, at.useful_life_years, 5)
        )
    )
  )                                                       AS book_value
FROM asset_master am
LEFT JOIN asset_types                  at  ON am.asset_type  = at.type_code
LEFT JOIN centers                       c  ON am.center_id   = c.id
LEFT JOIN asset_depreciation_settings  ads ON am.asset_type  = ads.category_code
LEFT JOIN procurement_orders           po  ON am.po_id       = po.id
WHERE am.active = true
  AND am.asset_type IN ('MODALITY','EQUIPMENT','SOFTWARE','FURNITURE','APPLIANCE','ELECTRONICS');
