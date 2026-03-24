-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 034: Procurement Module
-- PR → Approval (L1: Center Admin, L2: Director) → PO
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Approval Matrix ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_matrix (
  id         SERIAL PRIMARY KEY,
  center_id  INTEGER REFERENCES centers(id) ON DELETE CASCADE, -- NULL = all centers
  level      INTEGER NOT NULL CHECK (level IN (1, 2)),          -- 1=Center Admin, 2=Director
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (center_id, level, user_id)
);

-- ── Purchase Requisitions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id               SERIAL PRIMARY KEY,
  pr_number        VARCHAR(30) NOT NULL UNIQUE,
  title            VARCHAR(200) NOT NULL,
  justification    TEXT NOT NULL,
  center_id        INTEGER NOT NULL REFERENCES centers(id),
  requested_by     INTEGER NOT NULL REFERENCES users(id),
  department       VARCHAR(100),
  required_by      DATE,
  priority         VARCHAR(10) DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status           VARCHAR(20) DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','SUBMITTED','L1_APPROVED','APPROVED','REJECTED','CANCELLED')),
  total_estimated  DECIMAL(14,2) DEFAULT 0,
  rejection_reason TEXT,
  rejected_by      INTEGER REFERENCES users(id),
  rejected_at      TIMESTAMP,
  notes            TEXT,
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ── PR Line Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pr_items (
  id               SERIAL PRIMARY KEY,
  pr_id            INTEGER NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  item_master_id   INTEGER REFERENCES item_master(id),
  item_code        VARCHAR(50),
  item_name        VARCHAR(200) NOT NULL,
  category         VARCHAR(50),
  uom              VARCHAR(20) DEFAULT 'PCS',
  quantity         DECIMAL(10,2) NOT NULL,
  estimated_rate   DECIMAL(12,2) DEFAULT 0,
  estimated_amount DECIMAL(12,2) DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ── Approval Audit Trail ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_approvals (
  id          SERIAL PRIMARY KEY,
  pr_id       INTEGER NOT NULL REFERENCES purchase_requisitions(id),
  approver_id INTEGER NOT NULL REFERENCES users(id),
  level       INTEGER NOT NULL,
  action      VARCHAR(20) NOT NULL CHECK (action IN ('APPROVED','REJECTED','RECALLED')),
  comments    TEXT,
  acted_at    TIMESTAMP DEFAULT NOW()
);

-- ── Procurement Purchase Orders ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_orders (
  id               SERIAL PRIMARY KEY,
  po_number        VARCHAR(30) NOT NULL UNIQUE,
  pr_id            INTEGER REFERENCES purchase_requisitions(id),
  vendor_name      VARCHAR(200) NOT NULL,
  vendor_address   TEXT,
  vendor_gstin     VARCHAR(20),
  vendor_email     VARCHAR(255),
  vendor_phone     VARCHAR(20),
  center_id        INTEGER NOT NULL REFERENCES centers(id),
  created_by       INTEGER NOT NULL REFERENCES users(id),
  delivery_address TEXT,
  delivery_date    DATE,
  payment_terms    VARCHAR(100) DEFAULT 'Net 30',
  status           VARCHAR(20) DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','ISSUED','ACKNOWLEDGED','COMPLETED','CANCELLED')),
  subtotal         DECIMAL(14,2) DEFAULT 0,
  gst_amount       DECIMAL(14,2) DEFAULT 0,
  total_amount     DECIMAL(14,2) DEFAULT 0,
  notes            TEXT,
  terms_conditions TEXT DEFAULT 'Goods to be supplied as per specifications. Subject to quality inspection on receipt.',
  active           BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ── PO Line Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_order_items (
  id             SERIAL PRIMARY KEY,
  po_id          INTEGER NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE,
  item_master_id INTEGER REFERENCES item_master(id),
  item_code      VARCHAR(50),
  item_name      VARCHAR(200) NOT NULL,
  description    TEXT,
  uom            VARCHAR(20) DEFAULT 'PCS',
  quantity       DECIMAL(10,2) NOT NULL,
  unit_rate      DECIMAL(12,2) NOT NULL,
  gst_rate       DECIMAL(5,2) DEFAULT 0,
  gst_amount     DECIMAL(12,2) DEFAULT 0,
  amount         DECIMAL(12,2) DEFAULT 0,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── In-App Notifications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT,
  pr_id      INTEGER REFERENCES purchase_requisitions(id),
  po_id      INTEGER REFERENCES procurement_orders(id),
  is_read    BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pr_center       ON purchase_requisitions(center_id);
CREATE INDEX IF NOT EXISTS idx_pr_status       ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_pr_requested_by ON purchase_requisitions(requested_by);
CREATE INDEX IF NOT EXISTS idx_po_proc_center  ON procurement_orders(center_id);
CREATE INDEX IF NOT EXISTS idx_po_proc_pr      ON procurement_orders(pr_id);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON procurement_notifications(user_id, is_read);

-- ── PR number generator ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_pr_number()
RETURNS TEXT AS $$
DECLARE seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(pr_number FROM 'PR-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO seq FROM purchase_requisitions
   WHERE pr_number LIKE 'PR-' || TO_CHAR(NOW(), 'YYYY') || '-%';
  RETURN 'PR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── PO number generator ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-\d{4}-(\d+)') AS INT)), 0) + 1
    INTO seq FROM procurement_orders
   WHERE po_number LIKE 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-%';
  RETURN 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── Seed approval matrix with admin users as L2 directors ────────────────────
INSERT INTO approval_matrix (center_id, level, user_id)
SELECT NULL, 2, id FROM users WHERE role = 'admin' AND active = true
ON CONFLICT DO NOTHING;
