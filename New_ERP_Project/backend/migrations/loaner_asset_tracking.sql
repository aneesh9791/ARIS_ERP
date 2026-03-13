-- Loaner Asset Tracking System
-- Tracks loaner assets (like printers) provided against consumables (like film)
-- Creates asset-consumable relationship with device association

-- Extend expense items to support loaner asset association
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS supports_loaner_asset BOOLEAN DEFAULT false;
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS associated_loaner_asset_id INTEGER REFERENCES asset_master(id);
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS loaner_asset_condition_required VARCHAR(20) DEFAULT 'GOOD'; -- GOOD, FAIR, EXCELLENT
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS loaner_asset_deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS loaner_asset_agreement_required BOOLEAN DEFAULT false;
ALTER TABLE expense_items_master ADD COLUMN IF NOT EXISTS loaner_asset_return_days INTEGER DEFAULT 30;

-- Create loaner asset assignments table
CREATE TABLE IF NOT EXISTS loaner_asset_assignments (
    id SERIAL PRIMARY KEY,
    loaner_asset_id INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    consumable_item_id INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id INTEGER REFERENCES centers(id),
    department VARCHAR(100),
    assigned_to_person VARCHAR(100),
    assigned_to_user_id INTEGER REFERENCES users(id),
    assignment_date DATE NOT NULL,
    expected_return_date DATE,
    actual_return_date DATE,
    assignment_status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, RETURNED, OVERDUE, LOST, DAMAGED
    consumable_quantity_given DECIMAL(12,2) NOT NULL,
    consumable_unit_cost DECIMAL(10,2),
    consumable_total_cost DECIMAL(12,2),
    deposit_amount DECIMAL(10,2) DEFAULT 0,
    deposit_paid BOOLEAN DEFAULT false,
    deposit_refunded BOOLEAN DEFAULT false,
    deposit_refund_amount DECIMAL(10,2) DEFAULT 0,
    condition_at_assignment VARCHAR(20) DEFAULT 'GOOD',
    condition_at_return VARCHAR(20),
    damage_description TEXT,
    repair_cost DECIMAL(10,2) DEFAULT 0,
    replacement_cost DECIMAL(10,2) DEFAULT 0,
    agreement_signed BOOLEAN DEFAULT false,
    agreement_reference VARCHAR(50),
    notes TEXT,
    assigned_by INTEGER REFERENCES users(id),
    returned_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Create loaner asset movements table
CREATE TABLE IF NOT EXISTS loaner_asset_movements (
    id SERIAL PRIMARY KEY,
    loaner_asset_id INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES loaner_asset_assignments(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- ASSIGNED, RETURNED, TRANSFER, MAINTENANCE, REPAIR
    movement_date DATE NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    condition_before VARCHAR(20),
    condition_after VARCHAR(20),
    performed_by INTEGER REFERENCES users(id),
    supervised_by INTEGER REFERENCES users(id),
    purpose TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Create loaner asset maintenance table
CREATE TABLE IF NOT EXISTS loaner_asset_maintenance (
    id SERIAL PRIMARY KEY,
    loaner_asset_id INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    maintenance_type VARCHAR(20) NOT NULL, -- ROUTINE, REPAIR, CALIBRATION, CLEANING, UPGRADE
    maintenance_date DATE NOT NULL,
    performed_by VARCHAR(100),
    vendor_id INTEGER REFERENCES asset_vendors(id),
    cost DECIMAL(10,2) DEFAULT 0,
    downtime_hours DECIMAL(5,2) DEFAULT 0,
    maintenance_description TEXT,
    parts_replaced TEXT,
    next_maintenance_date DATE,
    performance_before_maintenance TEXT,
    performance_after_maintenance TEXT,
    maintenance_rating INTEGER CHECK (maintenance_rating >= 1 AND maintenance_rating <= 5),
    performed_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Create loaner asset agreements table
CREATE TABLE IF NOT EXISTS loaner_asset_agreements (
    id SERIAL PRIMARY KEY,
    agreement_number VARCHAR(50) NOT NULL UNIQUE,
    loaner_asset_id INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    consumable_item_id INTEGER REFERENCES expense_items_master(id) ON DELETE CASCADE,
    center_id INTEGER REFERENCES centers(id),
    assigned_to_person VARCHAR(100),
    assigned_to_user_id INTEGER REFERENCES users(id),
    agreement_type VARCHAR(20) DEFAULT 'STANDARD', -- STANDARD, PREMIUM, TEMPORARY
    agreement_start_date DATE NOT NULL,
    agreement_end_date DATE,
    auto_renewal BOOLEAN DEFAULT false,
    terms_and_conditions TEXT,
    responsibilities TEXT,
    liability_clause TEXT,
    insurance_required BOOLEAN DEFAULT false,
    insurance_policy_number VARCHAR(50),
    deposit_amount DECIMAL(10,2) DEFAULT 0,
    usage_restrictions TEXT,
    maintenance_responsibility VARCHAR(20) DEFAULT 'USER', -- USER, PROVIDER, SHARED
    replacement_terms TEXT,
    termination_conditions TEXT,
    signed_date DATE,
    signed_by INTEGER REFERENCES users(id),
    witness_name VARCHAR(100),
    witness_contact VARCHAR(100),
    agreement_status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, EXPIRED, TERMINATED, SUSPENDED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Create loaner asset performance tracking table
CREATE TABLE IF NOT EXISTS loaner_asset_performance (
    id SERIAL PRIMARY KEY,
    loaner_asset_id INTEGER REFERENCES asset_master(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES loaner_asset_assignments(id) ON DELETE CASCADE,
    evaluation_date DATE NOT NULL,
    performance_metrics JSONB, -- Various performance metrics in JSON format
    uptime_percentage DECIMAL(5,2),
    error_rate DECIMAL(5,2),
    user_satisfaction INTEGER CHECK (user_satisfaction >= 1 AND user_satisfaction <= 5),
    consumable_efficiency DECIMAL(5,2), -- Consumables used per output
    output_quality_rating INTEGER CHECK (output_quality_rating >= 1 AND output_quality_rating <= 5),
    reliability_score DECIMAL(5,2),
    maintenance_frequency INTEGER,
    issues_reported TEXT,
    feedback_comments TEXT,
    evaluated_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_loaner_asset_assignments_asset ON loaner_asset_assignments(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_assignments_consumable ON loaner_asset_assignments(consumable_item_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_assignments_center ON loaner_asset_assignments(center_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_assignments_status ON loaner_asset_assignments(assignment_status);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_assignments_date ON loaner_asset_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_movements_asset ON loaner_asset_movements(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_movements_type ON loaner_asset_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_maintenance_asset ON loaner_asset_maintenance(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_maintenance_date ON loaner_asset_maintenance(maintenance_date);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_agreements_asset ON loaner_asset_agreements(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_agreements_status ON loaner_asset_agreements(agreement_status);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_performance_asset ON loaner_asset_performance(loaner_asset_id);
CREATE INDEX IF NOT EXISTS idx_loaner_asset_performance_date ON loaner_asset_performance(evaluation_date);

-- Create views for comprehensive reporting
CREATE OR REPLACE VIEW loaner_asset_summary AS
SELECT 
    am.id as asset_id,
    am.asset_code,
    am.asset_name,
    am.asset_type,
    am.status as asset_status,
    COUNT(DISTINCT laa.id) as total_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_status = 'ACTIVE' THEN laa.id END) as active_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_status = 'OVERDUE' THEN laa.id END) as overdue_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_status = 'DAMAGED' THEN laa.id END) as damaged_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_status = 'LOST' THEN laa.id END) as lost_assignments,
    COALESCE(SUM(laa.deposit_amount), 0) as total_deposits_held,
    COALESCE(SUM(CASE WHEN laa.deposit_refunded = true THEN laa.deposit_refund_amount ELSE 0 END), 0) as total_deposits_refunded,
    COALESCE(SUM(lam.cost), 0) as total_maintenance_cost,
    COUNT(DISTINCT lam.id) as maintenance_count,
    AVG(lam.maintenance_rating) as avg_maintenance_rating,
    COUNT(DISTINCT laag.id) as active_agreements,
    COALESCE(AVG(lap.user_satisfaction), 0) as avg_user_satisfaction,
    COALESCE(AVG(lap.uptime_percentage), 0) as avg_uptime,
    MAX(laa.assignment_date) as last_assignment_date,
    MAX(lam.maintenance_date) as last_maintenance_date
FROM asset_master am
LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
LEFT JOIN loaner_asset_maintenance lam ON am.id = lam.loaner_asset_id AND lam.active = true
LEFT JOIN loaner_asset_agreements laag ON am.id = laag.loaner_asset_id AND laag.active = true
LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
WHERE am.active = true
GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type, am.status;

CREATE OR REPLACE VIEW consumable_loaner_asset_mapping AS
SELECT 
    eim.id as consumable_id,
    eim.item_code,
    eim.item_name,
    eim.current_stock,
    eim.minimum_stock_level,
    am.id as loaner_asset_id,
    am.asset_code as loaner_asset_code,
    am.asset_name as loaner_asset_name,
    am.asset_type,
    am.status as loaner_asset_status,
    COUNT(DISTINCT laa.id) as total_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_status = 'ACTIVE' THEN laa.id END) as active_assignments,
    COALESCE(SUM(laa.consumable_quantity_given), 0) as total_consumables_given,
    COALESCE(SUM(laa.consumable_total_cost), 0) as total_consumable_cost,
    COALESCE(AVG(lap.user_satisfaction), 0) as avg_user_satisfaction,
    CASE 
        WHEN am.id IS NOT NULL THEN true
        ELSE false
    END as has_loaner_asset
FROM expense_items_master eim
LEFT JOIN asset_master am ON eim.associated_loaner_asset_id = am.id AND am.active = true
LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
WHERE eim.active = true AND eim.supports_loaner_asset = true
GROUP BY eim.id, eim.item_code, eim.item_name, eim.current_stock, eim.minimum_stock_level, am.id, am.asset_code, am.asset_name, am.asset_type, am.status;

CREATE OR REPLACE VIEW loaner_asset_utilization AS
SELECT 
    am.id as asset_id,
    am.asset_code,
    am.asset_name,
    am.asset_type,
    COUNT(DISTINCT laa.id) as total_assignments,
    COUNT(DISTINCT CASE WHEN laa.assignment_date >= CURRENT_DATE - INTERVAL '30 days' THEN laa.id END) as assignments_last_30_days,
    COALESCE(SUM(laa.consumable_quantity_given), 0) as total_consumables_given,
    COALESCE(SUM(CASE WHEN laa.assignment_date >= CURRENT_DATE - INTERVAL '30 days' THEN laa.consumable_quantity_given ELSE 0 END), 0) as consumables_last_30_days,
    COALESCE(AVG(lap.user_satisfaction), 0) as avg_user_satisfaction,
    COALESCE(AVG(lap.uptime_percentage), 0) as avg_uptime_percentage,
    COALESCE(AVG(lap.consumable_efficiency), 0) as avg_consumable_efficiency,
    COUNT(DISTINCT lam.id) as maintenance_count,
    COUNT(DISTINCT CASE WHEN lam.maintenance_date >= CURRENT_DATE - INTERVAL '90 days' THEN lam.id END) as maintenance_last_90_days,
    COALESCE(SUM(lam.cost), 0) as total_maintenance_cost,
    MAX(laa.assignment_date) as last_assignment_date,
    MAX(lam.maintenance_date) as last_maintenance_date,
    CASE 
        WHEN COUNT(DISTINCT laa.id) > 10 THEN 'HIGH_UTILIZATION'
        WHEN COUNT(DISTINCT laa.id) > 5 THEN 'MEDIUM_UTILIZATION'
        WHEN COUNT(DISTINCT laa.id) > 0 THEN 'LOW_UTILIZATION'
        ELSE 'NO_UTILIZATION'
    END as utilization_level
FROM asset_master am
LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
LEFT JOIN loaner_asset_maintenance lam ON am.id = lam.loaner_asset_id AND lam.active = true
WHERE am.active = true
GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type;

-- Create functions for loaner asset management
CREATE OR REPLACE FUNCTION assign_loaner_asset(
    p_loaner_asset_id INTEGER,
    p_consumable_item_id INTEGER,
    p_center_id INTEGER,
    p_department VARCHAR,
    p_assigned_to_person VARCHAR,
    p_assigned_to_user_id INTEGER,
    p_consumable_quantity_given DECIMAL,
    p_consumable_unit_cost DECIMAL,
    p_deposit_amount DECIMAL DEFAULT 0,
    p_expected_return_days INTEGER DEFAULT 30,
    p_assigned_by INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_assignment_id INTEGER;
    v_assignment_reference VARCHAR;
    v_consumable_stock DECIMAL;
    v_loaner_asset_available BOOLEAN;
    v_agreement_required BOOLEAN;
BEGIN
    -- Check if loaner asset is available
    SELECT COUNT(*) = 0 INTO v_loaner_asset_available
    FROM loaner_asset_assignments laa
    WHERE laa.loaner_asset_id = p_loaner_asset_id
    AND laa.assignment_status = 'ACTIVE'
    AND laa.active = true;
    
    IF NOT v_loaner_asset_available THEN
        RAISE EXCEPTION 'Loaner asset is currently assigned and not available';
    END IF;
    
    -- Check consumable stock
    SELECT current_stock INTO v_consumable_stock
    FROM expense_items_master
    WHERE id = p_consumable_item_id AND active = true;
    
    IF v_consumable_stock < p_consumable_quantity_given THEN
        RAISE EXCEPTION 'Insufficient consumable stock. Available: %, Required: %', v_consumable_stock, p_consumable_quantity_given;
    END IF;
    
    -- Check if agreement is required
    SELECT loaner_asset_agreement_required INTO v_agreement_required
    FROM expense_items_master
    WHERE id = p_consumable_item_id AND active = true;
    
    -- Generate assignment reference
    v_assignment_reference := 'LA-' || to_char(CURRENT_DATE, 'YYYY-MM-DD') || '-' || 
                          LPAD(nextval('loaner_assignment_seq')::text, 4, '0');
    
    -- Create assignment
    INSERT INTO loaner_asset_assignments (
        loaner_asset_id, consumable_item_id, center_id, department,
        assigned_to_person, assigned_to_user_id, assignment_date,
        expected_return_date, assignment_status, consumable_quantity_given,
        consumable_unit_cost, consumable_total_cost, deposit_amount,
        condition_at_assignment, agreement_required, notes, assigned_by
    ) VALUES (
        p_loaner_asset_id, p_consumable_item_id, p_center_id, p_department,
        p_assigned_to_person, p_assigned_to_user_id, CURRENT_DATE,
        CURRENT_DATE + INTERVAL '1 day' * p_expected_return_days, 'ACTIVE',
        p_consumable_quantity_given, p_consumable_unit_cost,
        p_consumable_quantity_given * p_consumable_unit_cost, p_deposit_amount,
        'GOOD', v_agreement_required, p_notes, p_assigned_by
    ) RETURNING id INTO v_assignment_id;
    
    -- Record asset movement
    INSERT INTO loaner_asset_movements (
        loaner_asset_id, assignment_id, movement_type, movement_date,
        to_location, condition_before, condition_after, performed_by, purpose
    ) VALUES (
        p_loaner_asset_id, v_assignment_id, 'ASSIGNED', CURRENT_DATE,
        p_department || ' - ' || p_assigned_to_person, 'GOOD', 'GOOD',
        p_assigned_by, 'Assigned against consumable: ' || p_consumable_quantity_given || ' units'
    );
    
    -- Update consumable stock
    UPDATE expense_items_master
    SET current_stock = current_stock - p_consumable_quantity_given,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_consumable_item_id;
    
    -- Record consumable stock movement
    INSERT INTO expense_stock_movements (
        expense_item_id, center_id, movement_type, movement_date,
        reference_type, reference_id, quantity_before, quantity_change,
        quantity_after, unit_cost, total_cost, performed_by, reason
    ) VALUES (
        p_consumable_item_id, p_center_id, 'CONSUMPTION', CURRENT_DATE,
        'LOANER_ASSIGNMENT', v_assignment_id, v_consumable_stock,
        -p_consumable_quantity_given, v_consumable_stock - p_consumable_quantity_given,
        p_consumable_unit_cost, p_consumable_quantity_given * p_consumable_unit_cost,
        p_assigned_by, 'Consumables given for loaner asset assignment'
    );
    
    RETURN v_assignment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION return_loaner_asset(
    p_assignment_id INTEGER,
    p_returned_by INTEGER,
    p_condition_at_return VARCHAR DEFAULT 'GOOD',
    p_damage_description TEXT DEFAULT NULL,
    p_deposit_refund_amount DECIMAL DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_assignment RECORD;
    v_repair_cost DECIMAL := 0;
    v_replacement_cost DECIMAL := 0;
    v_deposit_to_refund DECIMAL;
BEGIN
    -- Get assignment details
    SELECT laa.* INTO v_assignment
    FROM loaner_asset_assignments laa
    WHERE laa.id = p_assignment_id AND laa.active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment not found';
    END IF;
    
    IF v_assignment.assignment_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'Assignment is not active';
    END IF;
    
    -- Calculate refund amount
    IF p_deposit_refund_amount IS NOT NULL THEN
        v_deposit_to_refund := p_deposit_refund_amount;
    ELSE
        v_deposit_to_refund := v_assignment.deposit_amount;
        
        -- Deduct repair costs if damaged
        IF p_condition_at_return IN ('DAMAGED', 'POOR') THEN
            v_repair_cost := v_assignment.repair_cost;
            v_deposit_to_refund := v_deposit_to_refund - v_repair_cost;
        END IF;
        
        -- Deduct replacement cost if lost or destroyed
        IF p_condition_at_return = 'LOST' THEN
            v_replacement_cost := v_assignment.replacement_cost;
            v_deposit_to_refund := v_deposit_to_refund - v_repair_cost;
        END IF;
        
        -- Ensure refund doesn't go negative
        v_deposit_to_refund := GREATEST(v_deposit_to_refund, 0);
    END IF;
    
    -- Update assignment
    UPDATE loaner_asset_assignments
    SET 
        actual_return_date = CURRENT_DATE,
        assignment_status = CASE 
            WHEN p_condition_at_return = 'LOST' THEN 'LOST'
            WHEN p_condition_at_return IN ('DAMAGED', 'POOR') THEN 'DAMAGED'
            ELSE 'RETURNED'
        END,
        condition_at_return = p_condition_at_return,
        damage_description = p_damage_description,
        repair_cost = v_repair_cost,
        replacement_cost = v_replacement_cost,
        deposit_refunded = CASE WHEN v_deposit_to_refund > 0 THEN true ELSE false END,
        deposit_refund_amount = v_deposit_to_refund,
        returned_by = p_returned_by,
        notes = COALESCE(notes, '') || ' | ' || COALESCE(p_notes, ''),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_assignment_id;
    
    -- Record asset movement
    INSERT INTO loaner_asset_movements (
        loaner_asset_id, assignment_id, movement_type, movement_date,
        from_location, condition_before, condition_after, performed_by, notes
    ) VALUES (
        v_assignment.loaner_asset_id, p_assignment_id, 'RETURNED', CURRENT_DATE,
        v_assignment.department || ' - ' || v_assignment.assigned_to_person,
        v_assignment.condition_at_assignment, p_condition_at_return,
        p_returned_by, 'Asset returned with condition: ' || p_condition_at_return
    );
    
    -- Update asset status if damaged or lost
    IF p_condition_at_return IN ('DAMAGED', 'POOR', 'LOST') THEN
        UPDATE asset_master
        SET status = CASE 
            WHEN p_condition_at_return = 'LOST' THEN 'LOST'
            ELSE 'UNDER_MAINTENANCE'
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = v_assignment.loaner_asset_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_overdue_loaner_assets()
RETURNS TABLE(
    assignment_id INTEGER,
    loaner_asset_id INTEGER,
    loaner_asset_name VARCHAR,
    assigned_to_person VARCHAR,
    days_overdue INTEGER,
    deposit_amount DECIMAL,
    contact_info VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        laa.id,
        laa.loaner_asset_id,
        am.asset_name,
        laa.assigned_to_person,
        DATEDIFF(CURRENT_DATE, laa.expected_return_date) as days_overdue,
        laa.deposit_amount,
        u.email || ' | ' || u.phone as contact_info
    FROM loaner_asset_assignments laa
    LEFT JOIN asset_master am ON laa.loaner_asset_id = am.id
    LEFT JOIN users u ON laa.assigned_to_user_id = u.id
    WHERE laa.assignment_status = 'ACTIVE'
    AND laa.expected_return_date < CURRENT_DATE
    AND laa.active = true
    ORDER BY days_overdue DESC;
END;
$$ LANGUAGE plpgsql;

-- Create sequences
CREATE SEQUENCE IF NOT EXISTS loaner_assignment_seq START 1;

-- Create trigger for automatic overdue checking
CREATE OR REPLACE FUNCTION trigger_check_overdue_assignments()
RETURNS TRIGGER AS $$
BEGIN
    -- This function can be called periodically to check overdue assignments
    -- For now, it's a placeholder for future automation
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update expense items to support loaner assets
UPDATE expense_items_master 
SET supports_loaner_asset = true 
WHERE category_id IN (
    SELECT id FROM expense_categories 
    WHERE category_name IN ('Medical Consumables', 'Laboratory Consumables')
);

-- Insert sample loaner asset associations
UPDATE expense_items_master 
SET associated_loaner_asset_id = (
    SELECT id FROM asset_master 
    WHERE asset_type = 'PRINTER' 
    AND asset_name ILIKE '%film%' 
    LIMIT 1
),
loaner_asset_deposit_amount = 5000.00,
loaner_asset_agreement_required = true,
loaner_asset_return_days = 30
WHERE item_code = 'FILM-DR-100';

-- Grant permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON loaner_asset_assignments TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON loaner_asset_movements TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON loaner_asset_maintenance TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON loaner_asset_agreements TO your_db_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON loaner_asset_performance TO your_db_user;

-- Grant select on views
-- GRANT SELECT ON loaner_asset_summary TO your_db_user;
-- GRANT SELECT ON consumable_loaner_asset_mapping TO your_db_user;
-- GRANT SELECT ON loaner_asset_utilization TO your_db_user;

COMMENT ON TABLE loaner_asset_assignments IS 'Tracks loaner assets assigned against consumables';
COMMENT ON TABLE loaner_asset_movements IS 'Complete movement history for loaner assets';
COMMENT ON TABLE loaner_asset_maintenance IS 'Maintenance records for loaner assets';
COMMENT ON TABLE loaner_asset_agreements IS 'Legal agreements for loaner asset assignments';
COMMENT ON TABLE loaner_asset_performance IS 'Performance tracking for loaner assets';
COMMENT ON COLUMN expense_items_master.supports_loaner_asset IS 'Indicates if consumable supports loaner asset assignment';
COMMENT ON COLUMN expense_items_master.associated_loaner_asset_id IS 'Links consumable to its associated loaner asset';
