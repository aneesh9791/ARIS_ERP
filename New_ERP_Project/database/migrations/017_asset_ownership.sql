-- Migration 017: Asset Ownership Classification Enhancement
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/backend/migrations/asset_ownership_classification.sql
-- Fix applied: ALTER TABLE ADD CONSTRAINT wrapped in DO block with duplicate_object catch
--   for chk_asset_ownership and chk_allocation_type (idempotent re-run safety).
-- Note: asset_summary_view is redefined here (supersedes 016 version) to include
--   ownership, booking, and pool information.

-- Extend asset_master for ownership classification
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS asset_ownership      VARCHAR(20) DEFAULT 'CENTER';
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS corporate_pool_id    INTEGER;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS shared_centers       INTEGER[];
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS allocation_type      VARCHAR(20) DEFAULT 'DEDICATED';
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS allocation_priority  INTEGER DEFAULT 1;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS booking_required     BOOLEAN DEFAULT false;
ALTER TABLE asset_master ADD COLUMN IF NOT EXISTS booking_calendar_id  VARCHAR(50);

-- CORPORATE ASSET POOLS TABLE
CREATE TABLE IF NOT EXISTS corporate_asset_pools (
    id                       SERIAL PRIMARY KEY,
    pool_name                VARCHAR(100) NOT NULL,
    pool_code                VARCHAR(20) NOT NULL UNIQUE,
    description              TEXT,
    pool_type                VARCHAR(30) NOT NULL, -- EQUIPMENT, SOFTWARE, INFRASTRUCTURE, VEHICLES
    management_center_id     INTEGER REFERENCES centers(id),
    total_assets             INTEGER DEFAULT 0,
    available_assets         INTEGER DEFAULT 0,
    utilization_threshold    DECIMAL(5,2) DEFAULT 80.00,
    booking_required         BOOLEAN DEFAULT true,
    approval_required        BOOLEAN DEFAULT false,
    auto_approval_threshold  INTEGER DEFAULT 0,
    created_by               INTEGER REFERENCES users(id),
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                   BOOLEAN DEFAULT true
);

-- ASSET ALLOCATIONS TABLE
CREATE TABLE IF NOT EXISTS asset_allocations (
    id                     SERIAL PRIMARY KEY,
    asset_id               INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    allocation_type        VARCHAR(20) NOT NULL, -- DEDICATED, SHARED, POOLED
    center_id              INTEGER REFERENCES centers(id),
    department             VARCHAR(100),
    allocated_to           VARCHAR(100),
    allocation_start_date  DATE NOT NULL,
    allocation_end_date    DATE,
    allocation_status      VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, ENDED, TRANSFERRED
    utilization_percentage DECIMAL(5,2) DEFAULT 0,
    last_utilized          DATE,
    notes                  TEXT,
    allocated_by           INTEGER REFERENCES users(id),
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                 BOOLEAN DEFAULT true
);

-- ASSET BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS asset_bookings (
    id                      SERIAL PRIMARY KEY,
    asset_id                INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    booking_reference       VARCHAR(50) NOT NULL UNIQUE,
    requested_by            INTEGER REFERENCES users(id),
    requesting_center_id    INTEGER REFERENCES centers(id),
    requesting_department   VARCHAR(100),
    booking_type            VARCHAR(20) NOT NULL, -- TEMPORARY, PROJECT_BASED, MAINTENANCE, TRAINING
    booking_start_date      DATE NOT NULL,
    booking_end_date        DATE NOT NULL,
    booking_start_time      TIME,
    booking_end_time        TIME,
    purpose                 TEXT NOT NULL,
    priority                VARCHAR(10) DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    booking_status          VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED
    approval_required       BOOLEAN DEFAULT false,
    approved_by             INTEGER REFERENCES users(id),
    approved_at             TIMESTAMP,
    rejection_reason        TEXT,
    actual_start_date       DATE,
    actual_end_date         DATE,
    utilization_hours       DECIMAL(8,2),
    feedback_rating         INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comments       TEXT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                  BOOLEAN DEFAULT true
);

-- ASSET TRANSFERS TABLE
CREATE TABLE IF NOT EXISTS asset_transfers (
    id                    SERIAL PRIMARY KEY,
    asset_id              INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    transfer_reference    VARCHAR(50) NOT NULL UNIQUE,
    from_center_id        INTEGER REFERENCES centers(id),
    to_center_id          INTEGER REFERENCES centers(id),
    transfer_type         VARCHAR(20) NOT NULL, -- PERMANENT, TEMPORARY, ROTATION
    transfer_reason       TEXT NOT NULL,
    transfer_date         DATE NOT NULL,
    expected_return_date  DATE,
    actual_return_date    DATE,
    transfer_status       VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, IN_TRANSIT, COMPLETED, CANCELLED
    approved_by           INTEGER REFERENCES users(id),
    approved_at           TIMESTAMP,
    condition_at_transfer TEXT,
    condition_at_return   TEXT,
    transferred_by        VARCHAR(100),
    received_by           VARCHAR(100),
    created_by            INTEGER REFERENCES users(id),
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- Sequences (for booking and transfer reference generation)
CREATE SEQUENCE IF NOT EXISTS asset_booking_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS asset_transfer_seq START 1;

-- Add CHECK constraints (idempotent)
DO $$
BEGIN
    ALTER TABLE asset_master ADD CONSTRAINT chk_asset_ownership
        CHECK (asset_ownership IN ('CENTER', 'CORPORATE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE asset_master ADD CONSTRAINT chk_allocation_type
        CHECK (allocation_type IN ('DEDICATED', 'SHARED', 'POOLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asset_master_ownership      ON asset_master(asset_ownership);
CREATE INDEX IF NOT EXISTS idx_asset_master_corporate_pool ON asset_master(corporate_pool_id);
CREATE INDEX IF NOT EXISTS idx_asset_master_shared_centers ON asset_master USING GIN(shared_centers);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_asset     ON asset_allocations(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_center    ON asset_allocations(center_id);
CREATE INDEX IF NOT EXISTS idx_asset_allocations_status    ON asset_allocations(allocation_status);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_asset        ON asset_bookings(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_center       ON asset_bookings(requesting_center_id);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_dates        ON asset_bookings(booking_start_date, booking_end_date);
CREATE INDEX IF NOT EXISTS idx_asset_bookings_status       ON asset_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_asset       ON asset_transfers(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_centers     ON asset_transfers(from_center_id, to_center_id);
CREATE INDEX IF NOT EXISTS idx_corporate_pools_center      ON corporate_asset_pools(management_center_id);

-- Views
CREATE OR REPLACE VIEW center_asset_inventory AS
SELECT
    c.id   AS center_id,
    c.name AS center_name,
    COUNT(CASE WHEN am.asset_ownership = 'CENTER'    AND am.center_id = c.id                            THEN 1 END) AS center_owned_assets,
    COUNT(CASE WHEN am.asset_ownership = 'CORPORATE' AND c.id = ANY(am.shared_centers)                  THEN 1 END) AS shared_corporate_assets,
    COUNT(CASE WHEN am.asset_ownership = 'CORPORATE' AND am.id IN (
        SELECT aa.asset_id FROM asset_allocations aa
        WHERE aa.center_id = c.id AND aa.allocation_status = 'ACTIVE'
    ) THEN 1 END) AS allocated_corporate_assets,
    COALESCE(SUM(CASE WHEN am.asset_ownership = 'CENTER'    AND am.center_id = c.id              THEN am.purchase_cost END), 0) AS center_asset_value,
    COALESCE(SUM(CASE WHEN am.asset_ownership = 'CORPORATE' AND c.id = ANY(am.shared_centers)   THEN am.purchase_cost END), 0) AS shared_asset_value,
    COUNT(CASE WHEN am.asset_ownership = 'CENTER'    AND am.center_id = c.id AND am.status = 'ACTIVE' THEN 1 END) AS active_center_assets,
    COUNT(CASE WHEN am.asset_ownership = 'CORPORATE' AND am.status = 'ACTIVE' AND c.id = ANY(am.shared_centers) THEN 1 END) AS active_shared_assets
FROM centers c
LEFT JOIN asset_master am ON (am.center_id = c.id OR c.id = ANY(am.shared_centers)) AND am.active = true
WHERE c.active = true
GROUP BY c.id, c.name;

CREATE OR REPLACE VIEW corporate_asset_utilization AS
SELECT
    am.id         AS asset_id,
    am.asset_code,
    am.asset_name,
    am.asset_type,
    cap.pool_name,
    COUNT(ab.id)                                                                                          AS total_bookings,
    COUNT(CASE WHEN ab.booking_status = 'COMPLETED' THEN 1 END)                                         AS completed_bookings,
    COUNT(CASE WHEN ab.booking_start_date >= CURRENT_DATE - INTERVAL '30 days'
               AND ab.booking_status = 'COMPLETED' THEN 1 END)                                           AS bookings_last_30_days,
    COALESCE(SUM(ab.utilization_hours), 0)                                                               AS total_utilization_hours,
    COALESCE(AVG(ab.feedback_rating), 0)                                                                 AS average_feedback,
    COUNT(DISTINCT ab.requesting_center_id)                                                              AS centers_served,
    MAX(ab.booking_end_date)                                                                             AS last_booking_date
FROM asset_master am
LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
LEFT JOIN asset_bookings ab ON am.id = ab.asset_id AND ab.active = true
WHERE am.asset_ownership = 'CORPORATE' AND am.active = true
GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type, cap.pool_name;

-- Supersedes asset_summary_view from 016 — includes ownership and pool info
DROP VIEW IF EXISTS asset_summary_view;
CREATE OR REPLACE VIEW asset_summary_view AS
SELECT
    am.*,
    c.name                                  AS center_name,
    at.name                                 AS asset_type_name,
    at.depreciation_method,
    at.useful_life_years,
    COUNT(amm.id)                           AS maintenance_count,
    CASE
        WHEN am.asset_ownership = 'CENTER'    THEN 'Center Owned'
        WHEN am.asset_ownership = 'CORPORATE' THEN 'Corporate Pool'
        ELSE 'Unknown'
    END                                     AS ownership_description,
    CASE
        WHEN am.asset_ownership = 'CORPORATE' THEN cap.pool_name
        ELSE NULL
    END                                     AS pool_name,
    CASE
        WHEN am.asset_ownership = 'CORPORATE' THEN array_length(am.shared_centers, 1)
        ELSE 0
    END                                     AS shared_centers_count,
    COUNT(DISTINCT ab.id)                   AS total_bookings,
    COUNT(DISTINCT CASE WHEN ab.booking_status = 'COMPLETED' THEN ab.id END) AS completed_bookings
FROM asset_master am
LEFT JOIN centers               c   ON am.center_id = c.id
LEFT JOIN asset_types           at  ON am.asset_type = at.type_code
LEFT JOIN asset_maintenance     amm ON am.id = amm.asset_id AND amm.active = true
LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
LEFT JOIN asset_bookings        ab  ON am.id = ab.asset_id AND ab.active = true
WHERE am.active = true
GROUP BY am.id, c.name, at.name, at.depreciation_method, at.useful_life_years, cap.pool_name;

-- Functions
CREATE OR REPLACE FUNCTION check_asset_availability(
    p_asset_id   INTEGER,
    p_start_date DATE,
    p_end_date   DATE
) RETURNS BOOLEAN AS $$
DECLARE
    v_conflict_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_conflict_count
    FROM asset_bookings ab
    WHERE ab.asset_id = p_asset_id
      AND ab.active = true
      AND ab.booking_status IN ('APPROVED', 'PENDING')
      AND (ab.booking_start_date <= p_end_date AND ab.booking_end_date >= p_start_date);

    RETURN v_conflict_count = 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_asset_allocation_details(p_asset_id INTEGER)
RETURNS TABLE(
    allocation_type        VARCHAR,
    center_id              INTEGER,
    center_name            VARCHAR,
    department             VARCHAR,
    allocated_to           VARCHAR,
    allocation_status      VARCHAR,
    utilization_percentage DECIMAL,
    last_utilized          DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        aa.allocation_type,
        aa.center_id,
        c.name AS center_name,
        aa.department,
        aa.allocated_to,
        aa.allocation_status,
        aa.utilization_percentage,
        aa.last_utilized
    FROM asset_allocations aa
    LEFT JOIN centers c ON aa.center_id = c.id
    WHERE aa.asset_id = p_asset_id
      AND aa.active = true
      AND aa.allocation_status = 'ACTIVE'
    ORDER BY aa.allocation_start_date DESC;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_asset_booking(
    p_asset_id               INTEGER,
    p_requested_by           INTEGER,
    p_requesting_center_id   INTEGER,
    p_requesting_department  VARCHAR,
    p_booking_type           VARCHAR,
    p_booking_start_date     DATE,
    p_booking_end_date       DATE,
    p_booking_start_time     TIME,
    p_booking_end_time       TIME,
    p_purpose                TEXT,
    p_priority               VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    v_booking_id     INTEGER;
    v_booking_ref    VARCHAR;
    v_auto_approve   BOOLEAN := false;
    v_asset_details  RECORD;
BEGIN
    SELECT am.asset_ownership, am.booking_required, am.corporate_pool_id, cap.auto_approval_threshold
    INTO v_asset_details
    FROM asset_master am
    LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
    WHERE am.id = p_asset_id AND am.active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found or inactive';
    END IF;

    IF v_asset_details.asset_ownership = 'CENTER' THEN
        RAISE EXCEPTION 'Center-owned assets cannot be booked through corporate pool';
    END IF;

    IF NOT v_asset_details.booking_required THEN
        RAISE EXCEPTION 'This asset does not require booking';
    END IF;

    IF NOT check_asset_availability(p_asset_id, p_booking_start_date, p_booking_end_date) THEN
        RAISE EXCEPTION 'Asset is not available for the requested dates';
    END IF;

    v_booking_ref := 'BK-' || to_char(CURRENT_DATE, 'YYYY-MM-DD') || '-' ||
                     LPAD(nextval('asset_booking_seq')::text, 4, '0');

    IF v_asset_details.auto_approval_threshold > 0 THEN
        v_auto_approve :=
            EXTRACT(EPOCH FROM (p_booking_end_date + p_booking_end_time
                                - (p_booking_start_date + p_booking_start_time))) / 3600
            <= v_asset_details.auto_approval_threshold;
    END IF;

    INSERT INTO asset_bookings (
        asset_id, booking_reference, requested_by, requesting_center_id,
        requesting_department, booking_type, booking_start_date, booking_end_date,
        booking_start_time, booking_end_time, purpose, priority,
        booking_status, approval_required
    ) VALUES (
        p_asset_id, v_booking_ref, p_requested_by, p_requesting_center_id,
        p_requesting_department, p_booking_type, p_booking_start_date, p_booking_end_date,
        p_booking_start_time, p_booking_end_time, p_purpose, p_priority,
        CASE WHEN v_auto_approve THEN 'APPROVED' ELSE 'PENDING' END,
        NOT v_auto_approve
    ) RETURNING id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_corporate_pool_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE corporate_asset_pools
        SET total_assets = (
                SELECT COUNT(*)
                FROM asset_master
                WHERE corporate_pool_id = NEW.corporate_pool_id AND active = true
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.corporate_pool_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE corporate_asset_pools
        SET total_assets = (
                SELECT COUNT(*)
                FROM asset_master
                WHERE corporate_pool_id = OLD.corporate_pool_id AND active = true
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.corporate_pool_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_corporate_pool_stats ON asset_master;
CREATE TRIGGER trigger_update_corporate_pool_stats
    AFTER INSERT OR UPDATE OR DELETE ON asset_master
    FOR EACH ROW EXECUTE FUNCTION update_corporate_pool_stats();

CREATE OR REPLACE FUNCTION transfer_asset(
    p_asset_id             INTEGER,
    p_from_center_id       INTEGER,
    p_to_center_id         INTEGER,
    p_transfer_type        VARCHAR,
    p_transfer_reason      TEXT,
    p_transfer_date        DATE,
    p_created_by           INTEGER,
    p_expected_return_date DATE DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_transfer_id   INTEGER;
    v_transfer_ref  VARCHAR;
    v_asset_details RECORD;
BEGIN
    SELECT asset_code, asset_name, asset_ownership, center_id
    INTO v_asset_details
    FROM asset_master
    WHERE id = p_asset_id AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found or inactive';
    END IF;

    IF v_asset_details.asset_ownership = 'CENTER' AND v_asset_details.center_id != p_from_center_id THEN
        RAISE EXCEPTION 'Asset does not belong to the specified source center';
    END IF;

    IF v_asset_details.asset_ownership = 'CENTER' AND p_transfer_type != 'PERMANENT' THEN
        RAISE EXCEPTION 'Center-owned assets can only be permanently transferred';
    END IF;

    v_transfer_ref := 'TR-' || to_char(CURRENT_DATE, 'YYYY-MM-DD') || '-' ||
                      LPAD(nextval('asset_transfer_seq')::text, 4, '0');

    INSERT INTO asset_transfers (
        asset_id, transfer_reference, from_center_id, to_center_id,
        transfer_type, transfer_reason, transfer_date, expected_return_date,
        transfer_status, created_by
    ) VALUES (
        p_asset_id, v_transfer_ref, p_from_center_id, p_to_center_id,
        p_transfer_type, p_transfer_reason, p_transfer_date, p_expected_return_date,
        'PENDING', p_created_by
    ) RETURNING id INTO v_transfer_id;

    IF v_asset_details.asset_ownership = 'CENTER' AND p_transfer_type = 'PERMANENT' THEN
        UPDATE asset_master
        SET center_id = p_to_center_id, updated_at = CURRENT_TIMESTAMP
        WHERE id = p_asset_id;
    END IF;

    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- Sample data: corporate asset pools
INSERT INTO corporate_asset_pools (pool_name, pool_code, pool_type, management_center_id, booking_required) VALUES
('Medical Equipment Pool',  'MED-EQUIP',   'EQUIPMENT',      1, true),
('IT Infrastructure Pool',  'IT-INFRA',    'INFRASTRUCTURE', 1, false),
('Software License Pool',   'SOFT-LIC',    'SOFTWARE',       1, false),
('Vehicle Fleet Pool',      'VEH-FLEET',   'VEHICLES',       1, true),
('Emergency Equipment Pool','EMERG-EQUIP', 'EQUIPMENT',      1, true)
ON CONFLICT (pool_code) DO NOTHING;

-- Ensure existing assets have proper ownership classification
UPDATE asset_master
SET asset_ownership = 'CENTER'
WHERE asset_ownership IS NULL OR asset_ownership = '';
