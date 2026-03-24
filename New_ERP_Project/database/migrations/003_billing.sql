-- Migration 003: Billing - Bank Accounts, Bills, Payments, Vendors, Consumables, Expenses
-- Source: /Volumes/DATA HD/ARIS_ERP/New_ERP_Project/database/billing_schema.sql
-- Fix applied: Lines 311-316 missing opening parenthesis on consumable_master INSERT rows — corrected.

-- BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS bank_accounts (
    id              SERIAL PRIMARY KEY,
    account_name    VARCHAR(100) NOT NULL,
    account_number  VARCHAR(50) NOT NULL UNIQUE,
    bank_name       VARCHAR(100) NOT NULL,
    branch_name     VARCHAR(100) NOT NULL,
    ifsc_code       VARCHAR(11) NOT NULL,
    account_type    VARCHAR(20) NOT NULL,
    center_id       INTEGER REFERENCES centers(id),
    opening_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- PATIENT BILLS TABLE
CREATE TABLE IF NOT EXISTS patient_bills (
    id               SERIAL PRIMARY KEY,
    invoice_number   VARCHAR(50) NOT NULL UNIQUE,
    patient_id       VARCHAR(36) REFERENCES patients(id),
    center_id        INTEGER REFERENCES centers(id),
    bill_date        DATE NOT NULL,
    subtotal         DECIMAL(15,2) NOT NULL,
    discount_amount  DECIMAL(15,2) DEFAULT 0,
    discount_reason  VARCHAR(100),
    taxable_amount   DECIMAL(15,2) NOT NULL,
    cgst_rate        DECIMAL(5,4) DEFAULT 0.09,
    cgst_amount      DECIMAL(15,2) DEFAULT 0,
    sgst_rate        DECIMAL(5,4) DEFAULT 0.09,
    sgst_amount      DECIMAL(15,2) DEFAULT 0,
    igst_rate        DECIMAL(5,4) DEFAULT 0,
    igst_amount      DECIMAL(15,2) DEFAULT 0,
    total_gst        DECIMAL(15,2) DEFAULT 0,
    total_amount     DECIMAL(15,2) NOT NULL,
    payment_mode     VARCHAR(20) NOT NULL,
    payment_status   VARCHAR(20) DEFAULT 'PENDING',
    gst_applicable   BOOLEAN DEFAULT true,
    payment_details  TEXT,
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active           BOOLEAN DEFAULT true
);

-- BILL ITEMS TABLE (radiology-specific: references study_master)
CREATE TABLE IF NOT EXISTS bill_items (
    id             SERIAL PRIMARY KEY,
    bill_id        INTEGER REFERENCES patient_bills(id),
    study_code     VARCHAR(20) REFERENCES study_master(study_code),
    study_name     VARCHAR(100) NOT NULL,
    modality       VARCHAR(20) NOT NULL,
    rate           DECIMAL(10,2) NOT NULL,
    quantity       INTEGER DEFAULT 1,
    amount         DECIMAL(10,2) NOT NULL,
    gst_applicable BOOLEAN DEFAULT true,
    hsn_code       VARCHAR(8),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true
);

-- BILL PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS bill_payments (
    id                    SERIAL PRIMARY KEY,
    bill_id               INTEGER REFERENCES patient_bills(id),
    payment_mode          VARCHAR(20) NOT NULL,
    amount_paid           DECIMAL(15,2) NOT NULL,
    payment_date          DATE NOT NULL,
    payment_details       TEXT,
    transaction_reference VARCHAR(100),
    bank_account_id       INTEGER REFERENCES bank_accounts(id),
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- VENDOR MASTER TABLE
CREATE TABLE IF NOT EXISTS vendor_master (
    id                  SERIAL PRIMARY KEY,
    vendor_code         VARCHAR(20) NOT NULL UNIQUE,
    vendor_name         VARCHAR(100) NOT NULL,
    vendor_type         VARCHAR(20) NOT NULL,
    gst_number          VARCHAR(15),
    pan_number          VARCHAR(10),
    phone               VARCHAR(20),
    email               VARCHAR(100),
    address             TEXT NOT NULL,
    city                VARCHAR(100) NOT NULL,
    state               VARCHAR(100) NOT NULL,
    postal_code         VARCHAR(6),
    contact_person      VARCHAR(100),
    payment_terms       VARCHAR(50),
    bank_account_number VARCHAR(50),
    bank_name           VARCHAR(100),
    ifsc_code           VARCHAR(11),
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active              BOOLEAN DEFAULT true
);

-- VENDOR BILLS TABLE
CREATE TABLE IF NOT EXISTS vendor_bills (
    id             SERIAL PRIMARY KEY,
    vendor_code    VARCHAR(20) REFERENCES vendor_master(vendor_code),
    center_id      INTEGER REFERENCES centers(id),
    bill_number    VARCHAR(50) NOT NULL,
    bill_date      DATE NOT NULL,
    due_date       DATE NOT NULL,
    subtotal       DECIMAL(15,2) NOT NULL,
    cgst_amount    DECIMAL(15,2) DEFAULT 0,
    sgst_amount    DECIMAL(15,2) DEFAULT 0,
    igst_amount    DECIMAL(15,2) DEFAULT 0,
    total_amount   DECIMAL(15,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'PENDING',
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true
);

-- VENDOR BILL ITEMS TABLE
CREATE TABLE IF NOT EXISTS vendor_bill_items (
    id          SERIAL PRIMARY KEY,
    bill_id     INTEGER REFERENCES vendor_bills(id),
    item_name   VARCHAR(100) NOT NULL,
    description TEXT,
    quantity    DECIMAL(10,2) NOT NULL,
    rate        DECIMAL(10,2) NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    gst_rate    DECIMAL(5,4) DEFAULT 0,
    gst_amount  DECIMAL(10,2) DEFAULT 0,
    hsn_code    VARCHAR(8),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active      BOOLEAN DEFAULT true
);

-- VENDOR PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS vendor_payments (
    id                    SERIAL PRIMARY KEY,
    bill_id               INTEGER REFERENCES vendor_bills(id),
    payment_mode          VARCHAR(20) NOT NULL,
    amount_paid           DECIMAL(15,2) NOT NULL,
    payment_date          DATE NOT NULL,
    bank_account_id       INTEGER REFERENCES bank_accounts(id),
    transaction_reference VARCHAR(100),
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active                BOOLEAN DEFAULT true
);

-- CONSUMABLE MASTER TABLE
CREATE TABLE IF NOT EXISTS consumable_master (
    id            SERIAL PRIMARY KEY,
    item_code     VARCHAR(20) NOT NULL UNIQUE,
    item_name     VARCHAR(100) NOT NULL,
    category      VARCHAR(50) NOT NULL,
    unit          VARCHAR(20) NOT NULL,
    reorder_level INTEGER DEFAULT 10,
    gst_rate      DECIMAL(5,4) DEFAULT 0.18,
    hsn_code      VARCHAR(8),
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active        BOOLEAN DEFAULT true
);

-- CONSUMABLE STOCK TABLE
CREATE TABLE IF NOT EXISTS consumable_stock (
    id            SERIAL PRIMARY KEY,
    item_code     VARCHAR(20) REFERENCES consumable_master(item_code),
    center_id     INTEGER REFERENCES centers(id),
    current_stock DECIMAL(10,2) DEFAULT 0,
    last_updated  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active        BOOLEAN DEFAULT true,
    UNIQUE(item_code, center_id)
);

-- CONSUMABLE PURCHASES TABLE
CREATE TABLE IF NOT EXISTS consumable_purchases (
    id              SERIAL PRIMARY KEY,
    item_code       VARCHAR(20) REFERENCES consumable_master(item_code),
    center_id       INTEGER REFERENCES centers(id),
    vendor_code     VARCHAR(20) REFERENCES vendor_master(vendor_code),
    purchase_date   DATE NOT NULL,
    quantity        DECIMAL(10,2) NOT NULL,
    rate            DECIMAL(10,2) NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    gst_rate        DECIMAL(5,4) DEFAULT 0.18,
    gst_amount      DECIMAL(15,2) DEFAULT 0,
    total_amount    DECIMAL(15,2) NOT NULL,
    invoice_number  VARCHAR(50),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- CONSUMABLE USAGE TABLE
CREATE TABLE IF NOT EXISTS consumable_usage (
    id             SERIAL PRIMARY KEY,
    item_code      VARCHAR(20) REFERENCES consumable_master(item_code),
    center_id      INTEGER REFERENCES centers(id),
    usage_date     DATE NOT NULL,
    quantity_used  DECIMAL(10,2) NOT NULL,
    study_id       VARCHAR(36) REFERENCES studies(id),
    patient_id     VARCHAR(36) REFERENCES patients(id),
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active         BOOLEAN DEFAULT true
);

-- EXPENSES TABLE
CREATE TABLE IF NOT EXISTS expenses (
    id              SERIAL PRIMARY KEY,
    expense_number  VARCHAR(50) NOT NULL UNIQUE,
    center_id       INTEGER REFERENCES centers(id),
    category        VARCHAR(50) NOT NULL,
    subcategory     VARCHAR(50),
    description     TEXT NOT NULL,
    amount          DECIMAL(15,2) NOT NULL,
    gst_rate        DECIMAL(5,4) DEFAULT 0,
    gst_amount      DECIMAL(15,2) DEFAULT 0,
    total_amount    DECIMAL(15,2) NOT NULL,
    expense_date    DATE NOT NULL,
    payment_mode    VARCHAR(20) NOT NULL,
    vendor_code     VARCHAR(20) REFERENCES vendor_master(vendor_code),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    receipt_number  VARCHAR(50),
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- PAYABLES TABLE
CREATE TABLE IF NOT EXISTS payables (
    id              SERIAL PRIMARY KEY,
    payable_number  VARCHAR(50) NOT NULL UNIQUE,
    vendor_code     VARCHAR(20) REFERENCES vendor_master(vendor_code),
    center_id       INTEGER REFERENCES centers(id),
    bill_id         INTEGER REFERENCES vendor_bills(id),
    amount          DECIMAL(15,2) NOT NULL,
    due_date        DATE NOT NULL,
    status          VARCHAR(20) DEFAULT 'PENDING',
    payment_mode    VARCHAR(20),
    bank_account_id INTEGER REFERENCES bank_accounts(id),
    paid_amount     DECIMAL(15,2) DEFAULT 0,
    balance_amount  DECIMAL(15,2) NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active          BOOLEAN DEFAULT true
);

-- RECEIVABLES TABLE
CREATE TABLE IF NOT EXISTS receivables (
    id                  SERIAL PRIMARY KEY,
    receivable_number   VARCHAR(50) NOT NULL UNIQUE,
    patient_id          VARCHAR(36) REFERENCES patients(id),
    center_id           INTEGER REFERENCES centers(id),
    bill_id             INTEGER REFERENCES patient_bills(id),
    amount              DECIMAL(15,2) NOT NULL,
    due_date            DATE NOT NULL,
    status              VARCHAR(20) DEFAULT 'PENDING',
    payment_mode        VARCHAR(20),
    bank_account_id     INTEGER REFERENCES bank_accounts(id),
    collected_amount    DECIMAL(15,2) DEFAULT 0,
    balance_amount      DECIMAL(15,2) NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    active              BOOLEAN DEFAULT true
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_bills_center_date    ON patient_bills(center_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_center_date     ON vendor_bills(center_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_center_item ON consumable_stock(center_id, item_code);
CREATE INDEX IF NOT EXISTS idx_expenses_center_date         ON expenses(center_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id        ON bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_bill_id      ON vendor_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_center_id      ON bank_accounts(center_id);
CREATE INDEX IF NOT EXISTS idx_payables_due_date            ON payables(due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_due_date         ON receivables(due_date);

-- Sample data: bank accounts (Indian banks)
INSERT INTO bank_accounts (
    account_name, account_number, bank_name, branch_name, ifsc_code,
    account_type, center_id, opening_balance, current_balance
) VALUES
('Main Operating Account', '1234567890123456', 'State Bank of India', 'Kochi Main Branch',  'SBIN0000001', 'CURRENT', 1, 1000000.00, 1000000.00),
('Petty Cash Account',     '9876543210987654', 'Federal Bank',         'Ernakulam Branch',   'FDRL0000001', 'SAVINGS', 1,   50000.00,   50000.00),
('Salary Account',         '5678901234567890', 'ICICI Bank',           'Thrissur Branch',    'ICIC0000001', 'CURRENT', 1,  200000.00,  200000.00)
ON CONFLICT (account_number) DO NOTHING;

-- Sample data: consumable master (fix: opening parentheses added to rows 7-12)
INSERT INTO consumable_master (
    item_code, item_name, category, unit, reorder_level, gst_rate, hsn_code
) VALUES
('CONTRAST001', 'Omnipaque 300mg I/ml',  'CONTRAST_MEDIA', 'ml',     50,   0.18, '30049010'),
('CONTRAST002', 'Ultravist 300',          'CONTRAST_MEDIA', 'ml',     50,   0.18, '30049010'),
('FILM001',     'X-Ray Film 14x17',       'FILMS',          'piece',  100,  0.18, '30059010'),
('FILM002',     'CT Film 8x10',           'FILMS',          'piece',  200,  0.18, '30059010'),
('GLOVE001',    'Latex Gloves Medium',    'GLOVES',         'pair',   500,  0.18, '40151100'),
('GLOVE002',    'Nitrile Gloves Large',   'GLOVES',         'pair',   500,  0.18, '40151100'),
('NEEDLE001',   'Injection Needle 21G',   'NEEDLES',        'piece',  1000, 0.18, '90183100'),
('NEEDLE002',   'IV Cannula 20G',         'NEEDLES',        'piece',  500,  0.18, '90183100'),
('GAUZE001',    'Gauze Roll 10cm',        'GAUZE',          'piece',  200,  0.18, '30059010'),
('GAUZE002',    'Gauze Pad 5x5',          'GAUZE',          'piece',  500,  0.18, '30059010'),
('CATH001',     'Urinary Catheter 14FR',  'CATHETERS',      'piece',  100,  0.18, '90182000'),
('CATH002',     'IV Catheter 18G',        'CATHETERS',      'piece',  500,  0.18, '90182000')
ON CONFLICT (item_code) DO NOTHING;

-- Sample data: consumable stock
INSERT INTO consumable_stock (item_code, center_id, current_stock) VALUES
('CONTRAST001', 1,  200),
('CONTRAST002', 1,  150),
('FILM001',     1,  500),
('FILM002',     1, 1000),
('GLOVE001',    1, 2000),
('GLOVE002',    1, 1500),
('NEEDLE001',   1, 5000),
('NEEDLE002',   1, 3000),
('GAUZE001',    1, 1000),
('GAUZE002',    1, 2000),
('CATH001',     1,  500),
('CATH002',     1, 1000)
ON CONFLICT (item_code, center_id) DO NOTHING;

-- Sample data: vendors
INSERT INTO vendor_master (
    vendor_code, vendor_name, vendor_type, gst_number, pan_number,
    phone, email, address, city, state, postal_code, contact_person,
    payment_terms, bank_account_number, bank_name, ifsc_code
) VALUES
('VENDOR001', 'Medtronic Healthcare Pvt Ltd', 'CONSUMABLES', '29AAAPM1234C1ZV', 'AAAPM1234C',
 '+91-484-1234567', 'kerala@medtronic.com',   '123 Industrial Area, Kakkanad',     'Kochi',      'Kerala', '682030', 'Rahul Sharma',    '30 DAYS', '1234567890123456', 'HDFC Bank',   'HDFC0000001'),
('VENDOR002', 'GE Healthcare India',          'EQUIPMENT',   '29AAAGE1234C1ZV', 'AAAGE1234C',
 '+91-484-2345678', 'orders@gehealthcare.in', '456 Tech Park, Infopark',           'Kochi',      'Kerala', '682042', 'Priya Nair',      '45 DAYS', '2345678901234567', 'ICICI Bank',  'ICIC0000001'),
('VENDOR003', 'Siemens Healthineers',         'EQUIPMENT',   '29AAASI1234C1ZV', 'AAASI1234C',
 '+91-484-3456789', 'india@siemens.com',      '789 Business Hub, Technopark',      'Trivandrum', 'Kerala', '695581', 'Anil Kumar',      '60 DAYS', '3456789012345678', 'Axis Bank',   'UTIB0000001'),
('VENDOR004', 'Kerala Medical Supplies',      'CONSUMABLES', '29AAAKS1234C1ZV', 'AAAKS1234C',
 '+91-484-4567890', 'info@keralamedical.com', '321 Market Road, Calicut',          'Kozhikode',  'Kerala', '673001', 'Suresh Menon',    '15 DAYS', '4567890123456789', 'Federal Bank','FDRL0000001'),
('VENDOR005', 'Philips India Ltd',            'EQUIPMENT',   '29AAAPH1234C1ZV', 'AAAPH1234C',
 '+91-484-5678901', 'orders@philips.in',      '654 Medical Plaza, Thrissur',       'Thrissur',   'Kerala', '680001', 'Divya Krishnan',  '30 DAYS', '5678901234567890', 'Canara Bank', 'CNRB0000001')
ON CONFLICT (vendor_code) DO NOTHING;

-- Sample data: expenses
INSERT INTO expenses (
    expense_number, center_id, category, subcategory, description, amount,
    gst_rate, gst_amount, total_amount, expense_date, payment_mode, notes
) VALUES
('EXP001', 1, 'RENT',        'OFFICE_RENT',           'Monthly rent for diagnostic center',  50000.00, 0.00,  0.00,     50000.00, '2024-03-01', 'BANK_TRANSFER', 'Rent for March 2024'),
('EXP002', 1, 'UTILITIES',   'ELECTRICITY',           'Electricity bill for March',          15000.00, 0.05,  750.00,   15750.00, '2024-03-05', 'BANK_TRANSFER', 'KSEB electricity bill'),
('EXP003', 1, 'UTILITIES',   'WATER',                 'Water bill for March',                 2000.00, 0.18,  360.00,    2360.00, '2024-03-05', 'BANK_TRANSFER', 'Kerala Water Authority'),
('EXP004', 1, 'SALARIES',    'STAFF_SALARY',          'Staff salaries for March',            250000.00, 0.00,  0.00,    250000.00, '2024-03-31', 'BANK_TRANSFER', 'Monthly staff salaries'),
('EXP005', 1, 'MAINTENANCE', 'EQUIPMENT_MAINTENANCE', 'Annual MRI maintenance contract',     120000.00, 0.18, 21600.00, 141600.00, '2024-03-15', 'BANK_TRANSFER', 'Siemens maintenance contract'),
('EXP006', 1, 'MARKETING',   'ADVERTISEMENT',         'Local newspaper advertisement',         5000.00, 0.05,  250.00,    5250.00, '2024-03-10', 'CASH',          'Malayala Manam advertisement'),
('EXP007', 1, 'OFFICE',      'STATIONERY',            'Office stationery and supplies',        3500.00, 0.18,  630.00,    4130.00, '2024-03-08', 'CASH',          'Monthly stationery purchase'),
('EXP008', 1, 'INSURANCE',   'LIABILITY_INSURANCE',   'Professional liability insurance',     25000.00, 0.18, 4500.00,   29500.00, '2024-03-20', 'BANK_TRANSFER', 'Annual insurance premium')
ON CONFLICT (expense_number) DO NOTHING;
