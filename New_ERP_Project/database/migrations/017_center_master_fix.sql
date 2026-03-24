-- Migration 017: Center Master Fix - Add contract_type and status columns
-- This migration adds the missing columns for the simple Center Master form

-- Add contract_type column
ALTER TABLE centers ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50);

-- Add status column (separate from active flag)
ALTER TABLE centers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Update existing centers to have default status
UPDATE centers SET status = 'active' WHERE status IS NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_centers_contract_type ON centers(contract_type);
CREATE INDEX IF NOT EXISTS idx_centers_status ON centers(status);

-- Add comments
COMMENT ON COLUMN centers.contract_type IS 'Contract type: lease, revenue_share, others';
COMMENT ON COLUMN centers.status IS 'Center status: active, inactive';
