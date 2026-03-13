-- EMPLOYEE MASTER AND PAYROLL DATABASE SCHEMA (SIMPLE MODULE)

-- EMPLOYEES TABLE
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL UNIQUE,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  department VARCHAR(50) NOT NULL,
  position VARCHAR(100) NOT NULL,
  center_id INTEGER REFERENCES centers(id),
  basic_salary DECIMAL(10,2) NOT NULL,
  bank_account_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  pan_number VARCHAR(10) NOT NULL,
  aadhaar_number VARCHAR(12) NOT NULL,
  date_of_birth DATE NOT NULL,
  date_of_joining DATE NOT NULL,
  address TEXT NOT NULL,
  emergency_contact_name VARCHAR(100) NOT NULL,
  emergency_contact_phone VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true
);

-- ATTENDANCE TABLE
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT true,
  UNIQUE(employee_id, attendance_date)
);

-- Sample data for Kerala diagnostic centers

-- Sample employees
INSERT INTO employees (
  employee_id, employee_code, name, email, phone, department, position,
  center_id, basic_salary, bank_account_number, bank_name, ifsc_code,
  pan_number, aadhaar_number, date_of_birth, date_of_joining, address,
  emergency_contact_name, emergency_contact_phone, notes
) VALUES
('EMP123ABC', 'E001', 'Ravi Kumar', 'ravi.kumar@medical.com', '+91-484-1234567', 'RADIOLOGY', 'Senior Radiologist',
 1, 85000.00, '1234567890123456', 'State Bank of India', 'SBIN0000001',
  'AAAPK1234C', '123456789012', '1985-05-15', '2015-03-01',
  '123 Medical Complex, Kochi, Kerala', 'Radha Kumar', '+91-484-9876543', 'Experienced radiologist with 10+ years'),
('EMP456DEF', 'E002', 'Anjali Nair', 'anjali.nair@medical.com', '+91-484-2345678', 'RADIOLOGY', 'Junior Radiologist',
 1, 65000.00, '2345678901234567', 'HDFC Bank', 'HDFC0000001',
  'AAAPN5678C', '234567890123', '1990-08-20', '2018-06-15',
  '456 Imaging Center, Kochi, Kerala', 'Narayanan Nair', '+91-484-8765432', 'Junior radiologist'),
('EMP789GHI', 'E003', 'Priya Menon', 'priya.menon@medical.com', '+91-471-3456789', 'ADMINISTRATION', 'Center Manager',
 2, 75000.00, '3456789012345678', 'Federal Bank', 'FDRL0000001',
  'AAAPM9012C', '345678901234', '1988-12-10', '2016-09-20',
  '789 Hospital Road, Trivandrum, Kerala', 'Unni Menon', '+91-471-7654321', 'Center manager'),
('EMP012JKL', 'E004', 'Suresh Pillai', 'suresh.pillai@medical.com', '+91-495-4567890', 'TECHNICAL', 'Senior Technician',
 3, 45000.00, '4567890123456789', 'ICICI Bank', 'ICIC0000001',
  'AAAPS3456C', '456789012345', '1992-03-25', '2019-04-10',
  '012 Diagnostic Center, Calicut, Kerala', 'Lakshmi Pillai', '+91-495-6543210', 'Senior technician'),
('EMP345MNO', 'E005', 'Divya Krishnan', 'divya.krishnan@medical.com', '+91-487-5678901', 'NURSING', 'Head Nurse',
 4, 55000.00, '5678901234567890', 'Axis Bank', 'UTIB0000001',
  'AAAPD7890C', '567890123456', '1991-07-18', '2017-11-05',
  '345 Medical Plaza, Thrissur, Kerala', 'Krishnan Nair', '+91-487-0987654', 'Head nurse'),
('EMP678PQR', 'E006', 'Mohan Das', 'mohan.das@medical.com', '+91-484-6789012', 'LABORATORY', 'Lab Technician',
 1, 35000.00, '6789012345678901', 'Canara Bank', 'CNRB0000001',
  'AAAPL2345C', '678901234567', '1993-11-30', '2020-02-15',
  '678 Lab Complex, Kochi, Kerala', 'Saritha Das', '+91-484-1234567', 'Lab technician'),
('EMP901STU', 'E007', 'Arun Kumar', 'arun.kumar@medical.com', '+91-471-7890123', 'RECEPTION', 'Receptionist',
 2, 25000.00, '7890123456789012', 'Bank of Baroda', 'BARB0TRISS',
  'AAAPR6789C', '789012345678', '1995-06-12', '2021-01-10',
  '901 Front Office, Trivandrum, Kerala', 'Kavitha Kumar', '+91-471-2345678', 'Front office reception'),
('EMP234VWX', 'E008', 'Lakshmi Ramesh', 'lakshmi.ramesh@medical.com', '+91-495-8901234', 'ACCOUNTS', 'Accountant',
 3, 40000.00, '8901234567890123', 'Punjab National Bank', 'PUNB067890',
  'AAAPA1234C', '890123456789', '1990-09-08', '2019-07-22',
  '234 Accounts Office, Calicut, Kerala', 'Ramesh Krishnan', '+91-495-3456789', 'Accounts department'),
('EMP567YZA', 'E009', 'Vinod Thomas', 'vinod.thomas@medical.com', '+91-487-9012345', 'MAINTENANCE', 'Maintenance Engineer',
 4, 30000.00, '9012345678901234', 'Union Bank of India', 'UBIN056789',
  'AAAPV4567C', '901234567890', '1989-04-15', '2020-09-30',
  '567 Technical Block, Thrissur, Kerala', 'Thomas Thomas', '+91-487-5678901', 'Maintenance engineer'),
('EMP890BCD', 'E010', 'Anita Pillai', 'anita.pillai@medical.com', '+91-484-0123456', 'HOUSEKEEPING', 'Housekeeping Supervisor',
 1, 22000.00, '0123456789012345', 'UCO Bank', 'UCOB0000123',
  'AAAPH8901C', '012345678901', '1994-08-22', '2021-06-15',
  '890 Service Area, Kochi, Kerala', 'Pillai Chandran', '+91-484-7890123', 'Housekeeping supervisor');

-- Sample attendance records for current month
INSERT INTO attendance (employee_id, attendance_date, status, notes) VALUES
(1, '2024-03-01', 'PRESENT', 'Regular duty'),
(1, '2024-03-02', 'PRESENT', 'Regular duty'),
(1, '2024-03-03', 'PRESENT', 'Regular duty'),
(1, '2024-03-04', 'ABSENT', 'Medical leave'),
(1, '2024-03-05', 'PRESENT', 'Regular duty'),
(1, '2024-03-06', 'PRESENT', 'Regular duty'),
(1, '2024-03-07', 'HALF_DAY', 'Half day due to personal work'),
(1, '2024-03-08', 'PRESENT', 'Regular duty'),
(1, '2024-03-09', 'PRESENT', 'Regular duty'),
(1, '2024-03-10', 'PRESENT', 'Regular duty'),

(2, '2024-03-01', 'PRESENT', 'Regular duty'),
(2, '2024-03-02', 'PRESENT', 'Regular duty'),
(2, '2024-03-03', 'PRESENT', 'Regular duty'),
(2, '2024-03-04', 'PRESENT', 'Regular duty'),
(2, '2024-03-05', 'LEAVE', 'Annual leave'),
(2, '2024-03-06', 'PRESENT', 'Regular duty'),
(2, '2024-03-07', 'PRESENT', 'Regular duty'),
(2, '2024-03-08', 'PRESENT', 'Regular duty'),
(2, '2024-03-09', 'PRESENT', 'Regular duty'),
(2, '2024-03-10', 'PRESENT', 'Regular duty'),

(3, '2024-03-01', 'PRESENT', 'Regular duty'),
(3, '2024-03-02', 'PRESENT', 'Regular duty'),
(3, '2024-03-03', 'PRESENT', 'Regular duty'),
(3, '2024-03-04', 'PRESENT', 'Regular duty'),
(3, '2024-03-05', 'PRESENT', 'Regular duty'),
(3, '2024-03-06', 'PRESENT', 'Regular duty'),
(3, '2024-03-07', 'PRESENT', 'Regular duty'),
(3, '2024-03-08', 'PRESENT', 'Regular duty'),
(3, '2024-03-09', 'PRESENT', 'Regular duty'),
(3, '2024-03-10', 'PRESENT', 'Regular duty'),

(4, '2024-03-01', 'PRESENT', 'Regular duty'),
(4, '2024-03-02', 'PRESENT', 'Regular duty'),
(4, '2024-03-03', 'ABSENT', 'Sick leave'),
(4, '2024-03-04', 'PRESENT', 'Regular duty'),
(4, '2024-03-05', 'PRESENT', 'Regular duty'),
(4, '2024-03-06', 'PRESENT', 'Regular duty'),
(4, '2024-03-07', 'PRESENT', 'Regular duty'),
(4, '2024-03-08', 'HALF_DAY', 'Half day due to appointment'),
(4, '2024-03-09', 'PRESENT', 'Regular duty'),
(4, '2024-03-10', 'PRESENT', 'Regular duty'),

(5, '2024-03-01', 'PRESENT', 'Regular duty'),
(5, '2024-03-02', 'PRESENT', 'Regular duty'),
(5, '2024-03-03', 'PRESENT', 'Regular duty'),
(5, '2024-03-04', 'PRESENT', 'Regular duty'),
(5, '2024-03-05', 'PRESENT', 'Regular duty'),
(5, '2024-03-06', 'LEAVE', 'Personal leave'),
(5, '2024-03-07', 'PRESENT', 'Regular duty'),
(5, '2024-03-08', 'PRESENT', 'Regular duty'),
(5, '2024-03-09', 'PRESENT', 'Regular duty'),
(5, '2024-03-10', 'PRESENT', 'Regular duty');

-- Create indexes for performance
CREATE INDEX idx_employees_center_id ON employees(center_id);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_active ON employees(active);
CREATE INDEX idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_attendance_status ON attendance(status);
CREATE INDEX idx_attendance_active ON attendance(active);

-- Create function to get attendance summary
CREATE OR REPLACE FUNCTION get_attendance_summary(p_center_id INTEGER DEFAULT NULL, p_month INTEGER DEFAULT NULL, p_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  employee_id INTEGER,
  employee_code VARCHAR(20),
  employee_name VARCHAR(100),
  department VARCHAR(50),
  position VARCHAR(100),
  center_name VARCHAR(100),
  total_days INTEGER,
  present_days INTEGER,
  absent_days INTEGER,
  leave_days INTEGER,
  half_day_days INTEGER,
  attendance_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as employee_id,
    e.employee_code,
    e.name as employee_name,
    e.department,
    e.position,
    c.name as center_name,
    COUNT(a.id) as total_days,
    COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
    COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
    COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_days,
    COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_days,
    ROUND(
      (COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) + 
       COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) * 0.5) / 
      NULLIF(COUNT(a.id), 0) * 100, 2
    ) as attendance_percentage
  FROM employees e
  LEFT JOIN centers c ON e.center_id = c.id
  LEFT JOIN attendance a ON e.id = a.employee_id 
    AND a.attendance_date >= DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1))
    AND a.attendance_date < DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month'
    AND a.active = true
  WHERE e.active = true AND (p_center_id IS NULL OR e.center_id = p_center_id)
  GROUP BY e.id, e.employee_code, e.name, e.department, e.position, c.name
  ORDER BY e.name;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate payroll
CREATE OR REPLACE FUNCTION calculate_payroll(
  p_center_id INTEGER,
  p_month INTEGER,
  p_year INTEGER,
  p_basic_multiplier DECIMAL DEFAULT 1.0,
  p_hra_percentage DECIMAL DEFAULT 40,
  p_da_percentage DECIMAL DEFAULT 10,
  p_pf_percentage DECIMAL DEFAULT 12,
  p_esi_percentage DECIMAL DEFAULT 1.75,
  p_professional_tax DECIMAL DEFAULT 200
) RETURNS TABLE (
  employee_id INTEGER,
  employee_code VARCHAR(20),
  employee_name VARCHAR(100),
  department VARCHAR(50),
  position VARCHAR(100),
  basic_salary DECIMAL(10,2),
  hra DECIMAL(10,2),
  da DECIMAL(10,2),
  gross_salary DECIMAL(10,2),
  prorated_gross_salary DECIMAL(10,2),
  pf DECIMAL(10,2),
  esi DECIMAL(10,2),
  professional_tax DECIMAL(10,2),
  total_deductions DECIMAL(10,2),
  net_salary DECIMAL(10,2),
  attendance_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH attendance_data AS (
    SELECT 
      e.id,
      e.employee_code,
      e.name,
      e.department,
      e.position,
      e.basic_salary,
      COUNT(a.id) as total_days,
      COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
      COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
      COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_days,
      COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_days
    FROM employees e
    LEFT JOIN attendance a ON e.id = a.employee_id 
      AND a.attendance_date >= DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1))
      AND a.attendance_date < DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month'
      AND a.active = true
    WHERE e.center_id = p_center_id AND e.active = true
    GROUP BY e.id, e.employee_code, e.name, e.department, e.position, e.basic_salary
  )
  SELECT 
    ad.id as employee_id,
    ad.employee_code,
    ad.name as employee_name,
    ad.department,
    ad.position,
    (ad.basic_salary * p_basic_multiplier) as basic_salary,
    (ad.basic_salary * p_basic_multiplier * p_hra_percentage / 100) as hra,
    (ad.basic_salary * p_basic_multiplier * p_da_percentage / 100) as da,
    (ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) as gross_salary,
    ((ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) * 
     ((ad.present_days + ad.half_day_days * 0.5) / 22)) as prorated_gross_salary,
    LEAST(ad.basic_salary * p_basic_multiplier * p_pf_percentage / 100, 15000) as pf,
    ((ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) * 
     ((ad.present_days + ad.half_day_days * 0.5) / 22) * p_esi_percentage / 100) as esi,
    p_professional_tax as professional_tax,
    LEAST(ad.basic_salary * p_basic_multiplier * p_pf_percentage / 100, 15000) + 
    ((ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) * 
     ((ad.present_days + ad.half_day_days * 0.5) / 22) * p_esi_percentage / 100) + p_professional_tax as total_deductions,
    ((ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) * 
     ((ad.present_days + ad.half_day_days * 0.5) / 22)) - 
    (LEAST(ad.basic_salary * p_basic_multiplier * p_pf_percentage / 100, 15000) + 
     ((ad.basic_salary * p_basic_multiplier * (1 + p_hra_percentage / 100 + p_da_percentage / 100)) * 
      ((ad.present_days + ad.half_day_days * 0.5) / 22) * p_esi_percentage / 100) + p_professional_tax) as net_salary,
    ROUND(((ad.present_days + ad.half_day_days * 0.5) / 22) * 100, 2) as attendance_percentage
  FROM attendance_data ad;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent duplicate attendance marking
CREATE OR REPLACE FUNCTION prevent_duplicate_attendance()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM attendance 
    WHERE employee_id = NEW.employee_id 
      AND attendance_date = NEW.attendance_date 
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Attendance already marked for this employee and date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_prevent_duplicate_attendance
  BEFORE INSERT ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_attendance();

-- Create view for employee dashboard
CREATE OR REPLACE VIEW employee_dashboard AS
SELECT 
  'EMPLOYEE_DASHBOARD' as dashboard_type,
  (SELECT COUNT(*) FROM employees WHERE active = true) as total_employees,
  (SELECT COUNT(*) FROM employees WHERE active = true AND center_id = 1) as kochi_employees,
  (SELECT COUNT(*) FROM employees WHERE active = true AND center_id = 2) as trivandrum_employees,
  (SELECT COUNT(*) FROM employees WHERE active = true AND center_id = 3) as calicut_employees,
  (SELECT COUNT(*) FROM employees WHERE active = true AND center_id = 4) as thrissur_employees,
  (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND active = true) as present_today,
  (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND status = 'PRESENT' AND active = true) as present_count,
  (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND status = 'ABSENT' AND active = true) as absent_count,
  (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND status = 'LEAVE' AND active = true) as leave_count,
  (SELECT COUNT(*) FROM attendance WHERE attendance_date = CURRENT_DATE AND status = 'HALF_DAY' AND active = true) as half_day_count,
  CURRENT_TIMESTAMP as last_updated;

-- Create function to mark bulk attendance
CREATE OR REPLACE FUNCTION mark_bulk_attendance(
  p_center_id INTEGER,
  p_attendance_date DATE,
  p_default_status VARCHAR(20) DEFAULT 'PRESENT'
) RETURNS INTEGER AS $$
DECLARE
  marked_count INTEGER := 0;
BEGIN
  INSERT INTO attendance (employee_id, attendance_date, status)
  SELECT e.id, p_attendance_date, p_default_status
  FROM employees e
  WHERE e.center_id = p_center_id 
    AND e.active = true
    AND NOT EXISTS (
      SELECT 1 FROM attendance a 
      WHERE a.employee_id = e.id 
        AND a.attendance_date = p_attendance_date 
        AND a.active = true
    );
  
  GET DIAGNOSTICS marked_count = ROW_COUNT;
  
  RETURN marked_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error marking bulk attendance: %', SQLERRM;
    RETURN 0;
END;
$$ LANGUAGE plpgsql;
