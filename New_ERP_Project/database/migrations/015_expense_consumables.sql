-- Migration 015: Expense Consumables and Stationaries Tracking
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/expense_consumables_tracking.sql
-- Fix applied: expense_item_vendors and expense_purchase_orders reference asset_vendors(id).
--   A minimal stub for asset_vendors is created here (IF NOT EXISTS) so FK constraints resolve.
--   Migration 016 uses CREATE TABLE IF NOT EXISTS for the full definition — no conflict.
-- Fix applied: generate_reorder_recommendations removed reference to eim.center_id
--   (expense_items_master has no center_id column).
-- Fix applied: expense_items_summary view alias collision — expense_consumption aliased as ec2,
--   COUNT(DISTINCT ec2.id) corrected to COUNT(DISTINCT ec2.id) using ec2 alias.

-- Minimal asset_vendors stub so FK constraints in this migration resolve.
-- Migration 016 will add remaining columns via ALTER TABLE.
CREATE TABLE IF NOT EXISTS asset_vendors (
    id           SERIAL PRIMARY KEY,
    vendor_code  VARCHAR(20) NOT NULL UNIQUE,
    vendor_name  VARCHAR(255) NOT NULL,
    active       BOOLEAN DEFAULT true
);

-- EXPENSE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS expense_categories (
    id                   SERIAL PRIMARY KEY,
    category_code        VARCHAR(20) NOT NULL UNIQUE,
    category_name        VARCHAR(100) NOT NULL,
    category_type        VARCHAR(20) NOT NULL, -- CONSUMABLE, STATIONARY, EQUIPMENT, SERVICE
    description          TEXT,
    parent_category_id   INTEGER REFERENCES expense_categories(id),
    reorder_level_method VARCHAR(20) DEFAULT 'MANUAL', -- MANUAL, AUTO, BASED_ON_USAGE
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active               BOOLEAN DEFAULT true
);

-- EXPENSE ITEMS MASTER TABLE
CREATE TABLE IF NOT EXISTS expense_items_master (
    id                        SERIAL PRIMARY KEY,
    item_code                 VARCHAR(20) NOT NULL UNIQUE,
    item_name                 VARCHAR(100) NOT NULL,
    category_id               INTEGER REFERENCES expense_categories(id),
    description               TEXT,
    unit_of_measure           VARCHAR(20) NOT NULL, -- PIECES, BOXES, BOTTLES, PACKETS, KGS, LITERS, SETS
    standard_package_size     INTEGER DEFAULT 1,
    current_stock             DECIMAL(12,2) DEFAULT 0,
    minimum_stock_level       DECIMAL(12,2) DEFAULT 0,
    maximum_stock_level       DECIMAL(12,2) DEFAULT 0,
    reorder_quantity          DECIMAL(12,2) DEFAULT 0,
    average_monthly_consumption DECIMAL(12,2) DEFAULT 0,
    last_consumption_date     DATE,
    days_of_supply            INTEGER DEFAULT 30,
    storage_location          VARCHAR(100),
    storage_requirements      TEXT,
    expiry_tracking           BOOLEAN DEFAULT false,
    shelf_life_months         INTEGER,
    hazardous_material        BOOLEAN DEFAULT false,
    safety_instructions       TEXT,
    barcode                   VARCHAR(50),
    qr_code                   VARCHAR(100),
    item_image                VARCHAR(500),
    specification_sheet       VARCHAR(500),
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                    BOOLEAN DEFAULT true
);

-- EXPENSE ITEM VENDORS TABLE (vendor-expense item linkage)
CREATE TABLE IF NOT EXISTS expense_item_vendors (
    id                   SERIAL PRIMARY KEY,
    expense_item_id      INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    vendor_id            INTEGER REFERENCES asset_vendors(id) ON DELETE CASCADE,
    vendor_sku           VARCHAR(50),
    vendor_item_name     VARCHAR(100),
    unit_price           DECIMAL(10,2),
    bulk_pricing         JSONB,
    lead_time_days       INTEGER DEFAULT 7,
    minimum_order_quantity INTEGER DEFAULT 1,
    packaging_type       VARCHAR(50),
    quality_rating       INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    delivery_rating      INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
    service_rating       INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
    contract_price       BOOLEAN DEFAULT false,
    contract_start_date  DATE,
    contract_end_date    DATE,
    last_purchase_date   DATE,
    total_purchases      DECIMAL(12,2) DEFAULT 0,
    preferred_vendor     BOOLEAN DEFAULT false,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active               BOOLEAN DEFAULT true,
    UNIQUE(expense_item_id, vendor_id)
);

-- EXPENSE CONSUMPTION TRACKING TABLE
CREATE TABLE IF NOT EXISTS expense_consumption (
    id                  SERIAL PRIMARY KEY,
    expense_item_id     INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id           INTEGER REFERENCES centers(id),
    department          VARCHAR(100),
    consumption_date    DATE NOT NULL,
    consumption_type    VARCHAR(20) NOT NULL, -- USAGE, WASTAGE, DAMAGE, THEFT, EXPIRY
    quantity_consumed   DECIMAL(12,2) NOT NULL,
    unit_of_measure     VARCHAR(20),
    batch_number        VARCHAR(50),
    expiry_date         DATE,
    consumed_by         INTEGER REFERENCES users(id),
    approved_by         INTEGER REFERENCES users(id),
    purpose_of_use      TEXT,
    cost_per_unit       DECIMAL(10,2),
    total_cost          DECIMAL(12,2),
    reference_document  VARCHAR(50),
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active              BOOLEAN DEFAULT true
);

-- EXPENSE PURCHASE ORDERS TABLE
CREATE TABLE IF NOT EXISTS expense_purchase_orders (
    id                     SERIAL PRIMARY KEY,
    order_number           VARCHAR(50) NOT NULL UNIQUE,
    vendor_id              INTEGER REFERENCES asset_vendors(id),
    center_id              INTEGER REFERENCES centers(id),
    order_date             DATE NOT NULL,
    expected_delivery_date DATE,
    actual_delivery_date   DATE,
    order_status           VARCHAR(20) DEFAULT 'PENDING',
                           -- PENDING, APPROVED, ORDERED, PARTIAL_DELIVERED, DELIVERED, CANCELLED
    priority               VARCHAR(10) DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    payment_terms          VARCHAR(50),
    delivery_terms         TEXT,
    total_amount           DECIMAL(12,2) NOT NULL,
    tax_amount             DECIMAL(12,2) DEFAULT 0,
    discount_amount        DECIMAL(12,2) DEFAULT 0,
    net_amount             DECIMAL(12,2) NOT NULL,
    currency               VARCHAR(3) DEFAULT 'INR',
    ordered_by             INTEGER REFERENCES users(id),
    approved_by            INTEGER REFERENCES users(id),
    approved_at            TIMESTAMP,
    notes                  TEXT,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                 BOOLEAN DEFAULT true
);

-- EXPENSE PURCHASE ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS expense_purchase_order_items (
    id                    SERIAL PRIMARY KEY,
    purchase_order_id     INTEGER REFERENCES expense_purchase_orders(id) ON DELETE CASCADE,
    expense_item_id       INTEGER REFERENCES expense_items_master(id),
    vendor_sku            VARCHAR(50),
    quantity_ordered      DECIMAL(12,2) NOT NULL,
    unit_price            DECIMAL(10,2) NOT NULL,
    discount_percentage   DECIMAL(5,2) DEFAULT 0,
    tax_percentage        DECIMAL(5,2) DEFAULT 0,
    total_amount          DECIMAL(12,2) NOT NULL,
    quantity_delivered    DECIMAL(12,2) DEFAULT 0,
    quantity_pending      DECIMAL(12,2) GENERATED ALWAYS AS (quantity_ordered - quantity_delivered) STORED,
    batch_number          VARCHAR(50),
    expiry_date           DATE,
    delivery_date         DATE,
    quality_check_status  VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PASSED, FAILED, REJECTED
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- EXPENSE STOCK MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS expense_stock_movements (
    id              SERIAL PRIMARY KEY,
    expense_item_id INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id       INTEGER REFERENCES centers(id),
    movement_type   VARCHAR(20) NOT NULL, -- PURCHASE, CONSUMPTION, ADJUSTMENT, TRANSFER, RETURN, DAMAGE
    movement_date   DATE NOT NULL,
    reference_type  VARCHAR(20), -- PURCHASE_ORDER, CONSUMPTION, ADJUSTMENT, TRANSFER
    reference_id    INTEGER,
    quantity_before DECIMAL(12,2) NOT NULL,
    quantity_change DECIMAL(12,2) NOT NULL,
    quantity_after  DECIMAL(12,2) NOT NULL,
    unit_cost       DECIMAL(10,2),
    total_cost      DECIMAL(12,2),
    batch_number    VARCHAR(50),
    expiry_date     DATE,
    performed_by    INTEGER REFERENCES users(id),
    approved_by     INTEGER REFERENCES users(id),
    reason          TEXT,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- EXPENSE STOCK ALERTS TABLE
CREATE TABLE IF NOT EXISTS expense_stock_alerts (
    id                        SERIAL PRIMARY KEY,
    expense_item_id           INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id                 INTEGER REFERENCES centers(id),
    alert_type                VARCHAR(20) NOT NULL, -- LOW_STOCK, OUT_OF_STOCK, EXPIRY_WARNING, EXPIRED, REORDER_RECOMMENDED
    alert_level               VARCHAR(10) NOT NULL, -- INFO, WARNING, CRITICAL, EMERGENCY
    current_stock             DECIMAL(12,2),
    minimum_stock             DECIMAL(12,2),
    days_of_supply            INTEGER,
    recommended_order_quantity DECIMAL(12,2),
    estimated_cost            DECIMAL(12,2),
    alert_message             TEXT,
    alert_sent                BOOLEAN DEFAULT false,
    alert_sent_date           TIMESTAMP,
    acknowledged              BOOLEAN DEFAULT false,
    acknowledged_by           INTEGER REFERENCES users(id),
    acknowledged_at           TIMESTAMP,
    resolved                  BOOLEAN DEFAULT false,
    resolved_by               INTEGER REFERENCES users(id),
    resolved_at               TIMESTAMP,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                    BOOLEAN DEFAULT true
);

-- EXPENSE CONSUMPTION FORECASTS TABLE
CREATE TABLE IF NOT EXISTS expense_consumption_forecasts (
    id                      SERIAL PRIMARY KEY,
    expense_item_id         INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id               INTEGER REFERENCES centers(id),
    forecast_period_start   DATE NOT NULL,
    forecast_period_end     DATE NOT NULL,
    forecast_type           VARCHAR(20) NOT NULL, -- WEEKLY, MONTHLY, QUARTERLY, YEARLY
    average_daily_consumption DECIMAL(12,2),
    predicted_consumption   DECIMAL(12,2),
    actual_consumption      DECIMAL(12,2),
    variance_percentage     DECIMAL(5,2),
    confidence_level        INTEGER CHECK (confidence_level >= 0 AND confidence_level <= 100),
    factors_considered      TEXT,
    forecast_method         VARCHAR(50), -- MOVING_AVERAGE, EXPONENTIAL_SMOOTHING, REGRESSION
    generated_by            INTEGER REFERENCES users(id),
    generated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                  BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_items_master_category     ON expense_items_master(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_master_stock        ON expense_items_master(current_stock, minimum_stock_level);
CREATE INDEX IF NOT EXISTS idx_expense_items_master_active       ON expense_items_master(active);
CREATE INDEX IF NOT EXISTS idx_expense_item_vendors_item         ON expense_item_vendors(expense_item_id);
CREATE INDEX IF NOT EXISTS idx_expense_item_vendors_vendor       ON expense_item_vendors(vendor_id);
CREATE INDEX IF NOT EXISTS idx_expense_item_vendors_preferred    ON expense_item_vendors(preferred_vendor, active);
CREATE INDEX IF NOT EXISTS idx_expense_consumption_item_date     ON expense_consumption(expense_item_id, consumption_date);
CREATE INDEX IF NOT EXISTS idx_expense_consumption_center_date   ON expense_consumption(center_id, consumption_date);
CREATE INDEX IF NOT EXISTS idx_expense_purchase_orders_vendor    ON expense_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_expense_purchase_orders_status    ON expense_purchase_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_expense_stock_movements_item_date ON expense_stock_movements(expense_item_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_expense_stock_movements_type      ON expense_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_expense_stock_alerts_item_center  ON expense_stock_alerts(expense_item_id, center_id);
CREATE INDEX IF NOT EXISTS idx_expense_stock_alerts_type         ON expense_stock_alerts(alert_type, alert_level);

-- Views
-- Fix: alias collision resolved — expense_consumption uses alias ec2; expense_categories uses ec.
-- Fix: COUNT(DISTINCT ec2.id) was COUNT(DISTINCT ec.id) in original which shadowed category alias.
CREATE OR REPLACE VIEW expense_items_summary AS
SELECT
    eim.*,
    ec.category_name,
    ec.category_type,
    av.vendor_name   AS preferred_vendor,
    eiv.unit_price   AS preferred_price,
    eiv.lead_time_days AS preferred_lead_time,
    CASE
        WHEN eim.current_stock <= 0                           THEN 'OUT_OF_STOCK'
        WHEN eim.current_stock <= eim.minimum_stock_level     THEN 'LOW_STOCK'
        WHEN eim.current_stock <= (eim.minimum_stock_level * 1.5) THEN 'REORDER_RECOMMENDED'
        ELSE 'ADEQUATE'
    END AS stock_status,
    CASE
        WHEN eim.current_stock > 0 AND eim.average_monthly_consumption > 0
        THEN FLOOR(eim.current_stock / (eim.average_monthly_consumption / 30))
        ELSE 0
    END AS days_of_supply_remaining,
    COUNT(DISTINCT eiv2.vendor_id) AS vendor_count,
    COUNT(DISTINCT ec2.id)         AS total_consumptions
FROM expense_items_master eim
LEFT JOIN expense_categories      ec   ON eim.category_id = ec.id
LEFT JOIN expense_item_vendors    eiv  ON eim.id = eiv.expense_item_id AND eiv.preferred_vendor = true AND eiv.active = true
LEFT JOIN asset_vendors           av   ON eiv.vendor_id = av.id
LEFT JOIN expense_item_vendors    eiv2 ON eim.id = eiv2.expense_item_id AND eiv2.active = true
LEFT JOIN expense_consumption     ec2  ON eim.id = ec2.expense_item_id  AND ec2.active = true
WHERE eim.active = true
GROUP BY eim.id, ec.category_name, ec.category_type, av.vendor_name, eiv.unit_price, eiv.lead_time_days;

CREATE OR REPLACE VIEW expense_consumption_analysis AS
SELECT
    ec.expense_item_id,
    eim.item_code,
    eim.item_name,
    ec.center_id,
    c.name  AS center_name,
    ec.department,
    ec.consumption_date,
    ec.consumption_type,
    ec.quantity_consumed,
    ec.total_cost,
    ec.consumed_by,
    u.name  AS consumed_by_name,
    ec.purpose_of_use,
    eim.unit_of_measure,
    eim.average_monthly_consumption,
    CASE
        WHEN ec.quantity_consumed > (eim.average_monthly_consumption / 30) * 2 THEN 'HIGH_USAGE'
        WHEN ec.quantity_consumed > (eim.average_monthly_consumption / 30)     THEN 'NORMAL_USAGE'
        ELSE 'LOW_USAGE'
    END AS usage_level
FROM expense_consumption ec
LEFT JOIN expense_items_master eim ON ec.expense_item_id = eim.id
LEFT JOIN centers c                ON ec.center_id = c.id
LEFT JOIN users u                  ON ec.consumed_by = u.id
WHERE ec.active = true;

CREATE OR REPLACE VIEW expense_vendor_performance AS
SELECT
    av.id            AS vendor_id,
    av.vendor_name,
    COUNT(DISTINCT eiv.expense_item_id)                                           AS items_supplied,
    COUNT(DISTINCT epo.id)                                                        AS total_orders,
    COALESCE(SUM(epo.net_amount), 0)                                              AS total_business,
    COALESCE(AVG(eiv.quality_rating), 0)                                          AS avg_quality_rating,
    COALESCE(AVG(eiv.delivery_rating), 0)                                         AS avg_delivery_rating,
    COALESCE(AVG(eiv.service_rating), 0)                                          AS avg_service_rating,
    COALESCE(AVG(eiv.lead_time_days), 0)                                          AS avg_lead_time,
    COUNT(DISTINCT CASE WHEN eiv.preferred_vendor = true THEN eiv.expense_item_id END) AS preferred_items,
    COUNT(DISTINCT CASE WHEN epo.order_status = 'DELIVERED' THEN epo.id END)      AS delivered_orders,
    COUNT(DISTINCT CASE WHEN epo.order_status = 'DELAYED'   THEN epo.id END)      AS delayed_orders
FROM asset_vendors av
LEFT JOIN expense_item_vendors eiv ON av.id = eiv.vendor_id  AND eiv.active = true
LEFT JOIN expense_purchase_orders epo ON av.id = epo.vendor_id AND epo.active = true
WHERE av.active = true
GROUP BY av.id, av.vendor_name;

-- Functions

CREATE OR REPLACE FUNCTION update_stock_movement(
    p_expense_item_id INTEGER,
    p_center_id       INTEGER,
    p_movement_type   VARCHAR,
    p_quantity_change DECIMAL,
    p_reference_type  VARCHAR DEFAULT NULL,
    p_reference_id    INTEGER DEFAULT NULL,
    p_performed_by    INTEGER DEFAULT NULL,
    p_reason          TEXT    DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_current_stock DECIMAL;
    v_new_stock     DECIMAL;
    v_unit_cost     DECIMAL;
    v_item_details  RECORD;
BEGIN
    SELECT current_stock, unit_of_measure
    INTO v_current_stock, v_item_details.unit_of_measure
    FROM expense_items_master
    WHERE id = p_expense_item_id AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense item not found';
    END IF;

    v_new_stock := v_current_stock + p_quantity_change;

    IF p_movement_type = 'PURCHASE' THEN
        SELECT epoi.unit_price INTO v_unit_cost
        FROM expense_purchase_order_items epoi
        JOIN expense_purchase_orders epo ON epoi.purchase_order_id = epo.id
        WHERE epoi.expense_item_id = p_expense_item_id
          AND epo.id = p_reference_id
          AND epoi.active = true
        LIMIT 1;
    END IF;

    UPDATE expense_items_master
    SET current_stock = v_new_stock,
        last_consumption_date = CASE
            WHEN p_movement_type = 'CONSUMPTION' THEN CURRENT_DATE
            ELSE last_consumption_date
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_expense_item_id;

    INSERT INTO expense_stock_movements (
        expense_item_id, center_id, movement_type, movement_date,
        reference_type, reference_id, quantity_before, quantity_change,
        quantity_after, unit_cost, total_cost, performed_by, reason
    ) VALUES (
        p_expense_item_id, p_center_id, p_movement_type, CURRENT_DATE,
        p_reference_type, p_reference_id, v_current_stock, p_quantity_change,
        v_new_stock, v_unit_cost,
        COALESCE(v_unit_cost, 0) * ABS(p_quantity_change),
        p_performed_by, p_reason
    );

    IF v_new_stock <= 0 THEN
        INSERT INTO expense_stock_alerts (
            expense_item_id, center_id, alert_type, alert_level,
            current_stock, minimum_stock, days_of_supply, alert_message
        ) VALUES (
            p_expense_item_id, p_center_id, 'OUT_OF_STOCK', 'EMERGENCY',
            v_new_stock, 0, 0,
            'Item is out of stock and needs immediate replenishment'
        );
    ELSIF v_new_stock <= (SELECT minimum_stock_level FROM expense_items_master WHERE id = p_expense_item_id) THEN
        INSERT INTO expense_stock_alerts (
            expense_item_id, center_id, alert_type, alert_level,
            current_stock, minimum_stock, days_of_supply,
            recommended_order_quantity, estimated_cost, alert_message
        ) VALUES (
            p_expense_item_id, p_center_id, 'LOW_STOCK', 'CRITICAL',
            v_new_stock,
            (SELECT minimum_stock_level FROM expense_items_master WHERE id = p_expense_item_id),
            0,
            (SELECT reorder_quantity FROM expense_items_master WHERE id = p_expense_item_id),
            (SELECT eim.reorder_quantity * eiv.unit_price
             FROM expense_items_master eim
             JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id
             WHERE eim.id = p_expense_item_id AND eiv.preferred_vendor = true
             LIMIT 1),
            'Stock level is below minimum and requires immediate reordering'
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_average_consumption(
    p_expense_item_id INTEGER,
    p_months          INTEGER DEFAULT 3
) RETURNS DECIMAL AS $$
DECLARE
    v_avg_consumption DECIMAL;
BEGIN
    SELECT COALESCE(AVG(quantity_consumed), 0)
    INTO v_avg_consumption
    FROM expense_consumption
    WHERE expense_item_id = p_expense_item_id
      AND consumption_date >= CURRENT_DATE - INTERVAL '1 month' * p_months
      AND active = true;

    UPDATE expense_items_master
    SET average_monthly_consumption = v_avg_consumption,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_expense_item_id;

    RETURN v_avg_consumption;
END;
$$ LANGUAGE plpgsql;

-- Fix: removed reference to eim.center_id (expense_items_master has no center_id column).
--   p_center_id parameter is retained for API compatibility but filtering by center is skipped
--   at the item level (consumption/stock tables have center_id for center-level filtering).
CREATE OR REPLACE FUNCTION generate_reorder_recommendations(p_center_id INTEGER DEFAULT NULL)
RETURNS TABLE(
    expense_item_id    INTEGER,
    item_name          VARCHAR,
    current_stock      DECIMAL,
    minimum_stock      DECIMAL,
    recommended_quantity DECIMAL,
    estimated_cost     DECIMAL,
    preferred_vendor   VARCHAR,
    urgency_level      VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        eim.id,
        eim.item_name,
        eim.current_stock,
        eim.minimum_stock_level,
        eim.reorder_quantity,
        eim.reorder_quantity * eiv.unit_price,
        av.vendor_name,
        CASE
            WHEN eim.current_stock <= 0                           THEN 'EMERGENCY'
            WHEN eim.current_stock <= eim.minimum_stock_level     THEN 'URGENT'
            WHEN eim.current_stock <= (eim.minimum_stock_level * 1.5) THEN 'HIGH'
            ELSE 'NORMAL'
        END AS urgency_level
    FROM expense_items_master eim
    LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id
                                       AND eiv.preferred_vendor = true
                                       AND eiv.active = true
    LEFT JOIN asset_vendors av ON eiv.vendor_id = av.id
    WHERE eim.active = true
      AND eim.current_stock <= (eim.minimum_stock_level * 1.5)
      AND eim.reorder_quantity > 0
    ORDER BY
        CASE
            WHEN eim.current_stock <= 0                       THEN 1
            WHEN eim.current_stock <= eim.minimum_stock_level THEN 2
            ELSE 3
        END,
        eim.item_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_update_consumption_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_average_consumption(NEW.expense_item_id);

    PERFORM update_stock_movement(
        NEW.expense_item_id,
        NEW.center_id,
        'CONSUMPTION',
        -NEW.quantity_consumed,
        'CONSUMPTION',
        NEW.id,
        NEW.consumed_by,
        'Daily consumption: ' || COALESCE(NEW.purpose_of_use, 'N/A')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_consumption_update ON expense_consumption;
CREATE TRIGGER trigger_consumption_update
    AFTER INSERT ON expense_consumption
    FOR EACH ROW EXECUTE FUNCTION trigger_update_consumption_stats();

-- Sample data
INSERT INTO expense_categories (category_code, category_name, category_type, description) VALUES
('MED-CONSUM',       'Medical Consumables',    'CONSUMABLE', 'Medical consumables like syringes, gloves, masks'),
('LAB-CONSUM',       'Laboratory Consumables',  'CONSUMABLE', 'Lab reagents, test kits, slides'),
('OFF-STAT',         'Office Stationaries',     'STATIONARY', 'Office stationaries, pens, paper, files'),
('CLEAN-CONSUM',     'Cleaning Consumables',    'CONSUMABLE', 'Cleaning supplies, disinfectants, tissues'),
('FOOD-CONSUM',      'Food & Beverages',        'CONSUMABLE', 'Patient meals, refreshments, water'),
('MED-EQUIP',        'Medical Equipment',       'EQUIPMENT',  'Small medical equipment and devices'),
('OFF-EQUIP',        'Office Equipment',        'EQUIPMENT',  'Office equipment and electronics'),
('MAINT-SERVICE',    'Maintenance Services',    'SERVICE',    'Maintenance and repair services'),
('UTIL-SERVICE',     'Utility Services',        'SERVICE',    'Electricity, water, internet, phone'),
('TRANSPORT-SERVICE','Transport Services',      'SERVICE',    'Ambulance, patient transport services')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO expense_items_master (
    item_code, item_name, category_id, description, unit_of_measure,
    current_stock, minimum_stock_level, maximum_stock_level, reorder_quantity,
    average_monthly_consumption, storage_location
) VALUES
('SYRINGE-5ML',   'Syringe 5ml',          1, 'Disposable syringe 5ml with needle', 'PIECES',  1000, 200, 2000, 500, 800, 'Medical Store'),
('GLOVES-LATEX',  'Latex Gloves Large',   1, 'Disposable latex gloves size large', 'BOXES',     50,  10,  100,  25,  40, 'Medical Store'),
('MASK-SURGICAL', 'Surgical Mask',        1, 'Disposable surgical mask',            'BOXES',    200,  50,  500, 100, 150, 'Medical Store'),
('PEN-BALL',      'Ball Pen Blue',        3, 'Blue ball point pen',                 'PACKETS',  100,  20,  200,  50,  60, 'Stationery Store'),
('PAPER-A4',      'A4 Paper',             3, 'A4 size white paper 500 sheets',      'PACKETS',   20,   5,   50,  10,  15, 'Stationery Store'),
('HAND-SANITIZER','Hand Sanitizer 500ml', 4, 'Alcohol-based hand sanitizer',        'BOTTLES',   30,  10,  100,  20,  25, 'Reception'),
('DISINFECTANT',  'Disinfectant Liquid 1L',4,'Multi-surface disinfectant',          'BOTTLES',   15,   5,   50,  10,  12, 'Housekeeping')
ON CONFLICT (item_code) DO NOTHING;

-- Note: expense_item_vendors sample INSERTs reference vendor_id 1, 2, 3.
-- These rows will succeed only if asset_vendors has rows with id 1, 2, 3 (inserted by migration 016).
-- Run migration 016 before inserting these rows in production, or insert asset_vendors rows first.
INSERT INTO expense_item_vendors (expense_item_id, vendor_id, vendor_sku, unit_price, lead_time_days, preferred_vendor) VALUES
(1, 1, 'SYR-5ML-001', 5.50,   3, true),
(2, 1, 'GLV-LRG-001', 150.00, 2, true),
(3, 1, 'MSK-001',     25.00,  2, true),
(4, 2, 'PEN-BL-001',  2.50,   5, true),
(5, 2, 'PAP-A4-001',  200.00, 3, true),
(6, 3, 'HSN-500-001', 75.00,  1, true),
(7, 3, 'DIS-1L-001',  120.00, 2, true)
ON CONFLICT (expense_item_id, vendor_id) DO NOTHING;
