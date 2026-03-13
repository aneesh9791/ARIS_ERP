const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/payroll.log' })
  ]
});

// EMPLOYEE MASTER AND PAYROLL MODULE

// Get all employees
router.get('/employees', async (req, res) => {
  try {
    const { center_id, department, active_only = 'true', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (center_id) {
      whereClause += ' AND e.center_id = $1';
      queryParams.push(center_id);
    }

    if (department) {
      whereClause += ' AND e.department = $' + (queryParams.length + 1);
      queryParams.push(department);
    }

    if (active_only === 'true') {
      whereClause += ' AND e.active = true';
    }

    const query = `
      SELECT 
        e.*,
        c.name as center_name,
        COUNT(a.id) as total_attendance,
        COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_days
      FROM employees e
      LEFT JOIN centers c ON e.center_id = c.id
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
      WHERE ${whereClause}
      GROUP BY e.id, c.name
      ORDER BY e.name
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM employees e 
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const employees = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      employees,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        center_id,
        department,
        active_only
      }
    });

  } catch (error) {
    logger.error('Get employees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new employee
router.post('/employees', [
  body('employee_code').trim().isLength({ min: 2, max: 20 }),
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('department').trim().isLength({ min: 2, max: 50 }),
  body('position').trim().isLength({ min: 2, max: 100 }),
  body('center_id').isInt(),
  body('basic_salary').isDecimal({ min: 0 }),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('pan_number').trim().isLength({ min: 10, max: 10 }),
  body('aadhaar_number').trim().isLength({ min: 12, max: 12 }),
  body('date_of_birth').isISO8601().toDate(),
  body('date_of_joining').isISO8601().toDate(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('emergency_contact_name').trim().isLength({ min: 3, max: 100 }),
  body('emergency_contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      employee_code,
      name,
      email,
      phone,
      department,
      position,
      center_id,
      basic_salary,
      bank_account_number,
      bank_name,
      ifsc_code,
      pan_number,
      aadhaar_number,
      date_of_birth,
      date_of_joining,
      address,
      emergency_contact_name,
      emergency_contact_phone,
      notes
    } = req.body;

    // Check if employee code already exists
    const existingEmployee = await pool.query(
      'SELECT id FROM employees WHERE employee_code = $1 AND active = true',
      [employee_code]
    );

    if (existingEmployee.rows.length > 0) {
      return res.status(400).json({ error: 'Employee code already exists' });
    }

    // Generate employee ID
    const employeeId = 'EMP' + Date.now().toString(36).substr(2, 9).toUpperCase();

    const query = `
      INSERT INTO employees (
        employee_id, employee_code, name, email, phone, department, position,
        center_id, basic_salary, bank_account_number, bank_name, ifsc_code,
        pan_number, aadhaar_number, date_of_birth, date_of_joining, address,
        emergency_contact_name, emergency_contact_phone, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      employeeId, employee_code, name, email, phone, department, position,
      center_id, basic_salary, bank_account_number, bank_name, ifsc_code,
      pan_number, aadhaar_number, date_of_birth, date_of_joining, address,
      emergency_contact_name, emergency_contact_phone, notes
    ]);

    logger.info(`Employee created: ${name} (${employee_code})`);

    res.status(201).json({
      message: 'Employee created successfully',
      employee: {
        employee_id: employeeId,
        employee_code,
        name,
        email,
        phone,
        department,
        position,
        center_id,
        basic_salary,
        bank_account_number,
        bank_name,
        ifsc_code,
        pan_number,
        aadhaar_number,
        date_of_birth,
        date_of_joining,
        address,
        emergency_contact_name,
        emergency_contact_phone,
        notes
      }
    });

  } catch (error) {
    logger.error('Create employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update employee
router.put('/employees/:id', [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('department').trim().isLength({ min: 2, max: 50 }),
  body('position').trim().isLength({ min: 2, max: 100 }),
  body('center_id').isInt(),
  body('basic_salary').isDecimal({ min: 0 }),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('pan_number').trim().isLength({ min: 10, max: 10 }),
  body('aadhaar_number').trim().isLength({ min: 12, max: 12 }),
  body('date_of_birth').isISO8601().toDate(),
  body('date_of_joining').isISO8601().toDate(),
  body('address').trim().isLength({ min: 10, max: 500 }),
  body('emergency_contact_name').trim().isLength({ min: 3, max: 100 }),
  body('emergency_contact_phone').trim().isLength({ min: 10, max: 20 }),
  body('notes').optional().trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name,
      email,
      phone,
      department,
      position,
      center_id,
      basic_salary,
      bank_account_number,
      bank_name,
      ifsc_code,
      pan_number,
      aadhaar_number,
      date_of_birth,
      date_of_joining,
      address,
      emergency_contact_name,
      emergency_contact_phone,
      notes
    } = req.body;

    // Check if employee exists
    const existingEmployee = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND active = true',
      [id]
    );

    if (existingEmployee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Update employee
    await pool.query(
      `UPDATE employees SET 
        name = $1, email = $2, phone = $3, department = $4, position = $5,
        center_id = $6, basic_salary = $7, bank_account_number = $8, bank_name = $9,
        ifsc_code = $10, pan_number = $11, aadhaar_number = $12, date_of_birth = $13,
        date_of_joining = $14, address = $15, emergency_contact_name = $16,
        emergency_contact_phone = $17, notes = $18, updated_at = NOW()
      WHERE id = $19 AND active = true`,
      [
        name, email, phone, department, position, center_id, basic_salary,
        bank_account_number, bank_name, ifsc_code, pan_number, aadhaar_number,
        date_of_birth, date_of_joining, address, emergency_contact_name,
        emergency_contact_phone, notes, id
      ]
    );

    logger.info(`Employee updated: ${name} (ID: ${id})`);

    res.json({
      message: 'Employee updated successfully',
      employee: {
        id,
        name,
        email,
        phone,
        department,
        position,
        center_id,
        basic_salary,
        bank_account_number,
        bank_name,
        ifsc_code,
        pan_number,
        aadhaar_number,
        date_of_birth,
        date_of_joining,
        address,
        emergency_contact_name,
        emergency_contact_phone,
        notes
      }
    });

  } catch (error) {
    logger.error('Update employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete employee (soft delete)
router.delete('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if employee exists
    const existingEmployee = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND active = true',
      [id]
    );

    if (existingEmployee.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Soft delete employee
    await pool.query(
      'UPDATE employees SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Employee deleted: ${id}`);

    res.json({
      message: 'Employee deleted successfully'
    });

  } catch (error) {
    logger.error('Delete employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ATTENDANCE MARKING

// Mark attendance
router.post('/attendance', [
  body('employee_id').isInt(),
  body('attendance_date').isISO8601().toDate(),
  body('status').isIn(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY']),
  body('notes').optional().trim().isLength({ min: 2, max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      employee_id,
      attendance_date,
      status,
      notes
    } = req.body;

    // Check if employee exists
    const employeeQuery = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND active = true',
      [employee_id]
    );

    if (employeeQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check if attendance already marked for this date
    const existingAttendance = await pool.query(
      'SELECT id FROM attendance WHERE employee_id = $1 AND attendance_date = $2 AND active = true',
      [employee_id, attendance_date]
    );

    if (existingAttendance.rows.length > 0) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }

    // Mark attendance
    const query = `
      INSERT INTO attendance (
        employee_id, attendance_date, status, notes, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, NOW(), NOW(), true
      ) RETURNING id
    `;

    const result = await pool.query(query, [employee_id, attendance_date, status, notes]);

    logger.info(`Attendance marked: Employee ${employee_id} - ${status} on ${attendance_date}`);

    res.status(201).json({
      message: 'Attendance marked successfully',
      attendance: {
        id: result.rows[0].id,
        employee_id,
        attendance_date,
        status,
        notes
      }
    });

  } catch (error) {
    logger.error('Mark attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update attendance
router.put('/attendance/:id', [
  body('status').isIn(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY']),
  body('notes').optional().trim().isLength({ min: 2, max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    // Check if attendance exists
    const existingAttendance = await pool.query(
      'SELECT id FROM attendance WHERE id = $1 AND active = true',
      [id]
    );

    if (existingAttendance.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    // Update attendance
    await pool.query(
      'UPDATE attendance SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3 AND active = true',
      [status, notes, id]
    );

    logger.info(`Attendance updated: ${id} - Status: ${status}`);

    res.json({
      message: 'Attendance updated successfully',
      attendance: {
        id,
        status,
        notes
      }
    });

  } catch (error) {
    logger.error('Update attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get attendance records
router.get('/attendance', async (req, res) => {
  try {
    const { employee_id, center_id, department, start_date, end_date, status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    if (employee_id) {
      whereClause += ' AND a.employee_id = $1';
      queryParams.push(employee_id);
    }

    if (center_id) {
      whereClause += ' AND e.center_id = $' + (queryParams.length + 1);
      queryParams.push(center_id);
    }

    if (department) {
      whereClause += ' AND e.department = $' + (queryParams.length + 1);
      queryParams.push(department);
    }

    if (status) {
      whereClause += ' AND a.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    if (start_date && end_date) {
      whereClause += ' AND a.attendance_date >= $' + (queryParams.length + 1) + ' AND a.attendance_date <= $' + (queryParams.length + 2);
      queryParams.push(start_date, end_date);
    }

    const query = `
      SELECT 
        a.*,
        e.employee_code,
        e.name as employee_name,
        e.department,
        e.position,
        c.name as center_name
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id AND e.active = true
      LEFT JOIN centers c ON e.center_id = c.id
      WHERE ${whereClause} AND a.active = true
      ORDER BY a.attendance_date DESC, e.name
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await pool.query(query, [...queryParams, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id AND e.active = true
      WHERE ${whereClause} AND a.active = true
    `;
    const countResult = await pool.query(countQuery, queryParams);

    const attendanceRecords = result.rows;
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      attendance: attendanceRecords,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        employee_id,
        center_id,
        department,
        start_date,
        end_date,
        status
      }
    });

  } catch (error) {
    logger.error('Get attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get attendance summary for a month
router.get('/attendance/summary', async (req, res) => {
  try {
    const { center_id, department, month, year } = req.query;
    
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    
    let whereClause = '1=1';
    let queryParams = [currentMonth, currentYear];

    if (center_id) {
      whereClause += ' AND e.center_id = $' + (queryParams.length + 1);
      queryParams.push(center_id);
    }

    if (department) {
      whereClause += ' AND e.department = $' + (queryParams.length + 1);
      queryParams.push(department);
    }

    const query = `
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
        AND a.attendance_date >= DATE_TRUNC('month', MAKE_DATE($2, $1, 1))
        AND a.attendance_date < DATE_TRUNC('month', MAKE_DATE($2, $1, 1)) + INTERVAL '1 month'
        AND a.active = true
      WHERE e.active = true AND ${whereClause}
      GROUP BY e.id, e.employee_code, e.name, e.department, e.position, c.name
      ORDER BY e.name
    `;

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      summary: result.rows,
      filters: {
        center_id,
        department,
        month: currentMonth,
        year: currentYear
      }
    });

  } catch (error) {
    logger.error('Get attendance summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PAYROLL CALCULATION

// Calculate payroll for a month
router.post('/payroll/calculate', [
  body('center_id').isInt(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2020, max: 2100 }),
  body('basic_salary_multiplier').isDecimal({ min: 0, max: 2 }),
  body('hra_percentage').isDecimal({ min: 0, max: 100 }),
  body('da_percentage').isDecimal({ min: 0, max: 100 }),
  body('pf_percentage').isDecimal({ min: 0, max: 12 }),
  body('esi_percentage').isDecimal({ min: 0, max: 2 }),
  body('professional_tax').isDecimal({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      center_id,
      month,
      year,
      basic_salary_multiplier = 1,
      hra_percentage = 40,
      da_percentage = 10,
      pf_percentage = 12,
      esi_percentage = 1.75,
      professional_tax = 200
    } = req.body;

    // Get employees for the center
    const employeesQuery = `
      SELECT 
        e.*,
        COUNT(a.id) as total_days,
        COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_days,
        COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_days
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id 
        AND a.attendance_date >= DATE_TRUNC('month', MAKE_DATE($2, $1, 1))
        AND a.attendance_date < DATE_TRUNC('month', MAKE_DATE($2, $1, 1)) + INTERVAL '1 month'
        AND a.active = true
      WHERE e.center_id = $3 AND e.active = true
      GROUP BY e.id
      ORDER BY e.name
    `;

    const employeesResult = await pool.query(employeesQuery, [month, year, center_id]);

    const payrollCalculations = employeesResult.rows.map(employee => {
      const basicSalary = employee.basic_salary * basic_salary_multiplier;
      const hra = basicSalary * (hra_percentage / 100);
      const da = basicSalary * (da_percentage / 100);
      const grossSalary = basicSalary + hra + da;
      
      // Calculate working days (considering weekends and holidays)
      const workingDaysInMonth = 22; // Simplified calculation
      const actualWorkingDays = employee.present_days + (employee.half_day_days * 0.5);
      const attendanceRatio = actualWorkingDays / workingDaysInMonth;
      
      const proRatedGrossSalary = grossSalary * attendanceRatio;
      
      const pf = Math.min(basicSalary * (pf_percentage / 100), 15000); // PF capped at 15000
      const esi = proRatedGrossSalary * (esi_percentage / 100);
      const totalDeductions = pf + esi + professional_tax;
      
      const netSalary = proRatedGrossSalary - totalDeductions;

      return {
        employee_id: employee.id,
        employee_code: employee.employee_code,
        employee_name: employee.name,
        department: employee.department,
        position: employee.position,
        attendance_summary: {
          total_days: employee.total_days,
          present_days: employee.present_days,
          absent_days: employee.absent_days,
          leave_days: employee.leave_days,
          half_day_days: employee.half_day_days,
          attendance_percentage: Math.round((actualWorkingDays / workingDaysInMonth) * 100)
        },
        earnings: {
          basic_salary: basicSalary,
          hra: hra,
          da: da,
          gross_salary: grossSalary,
          prorated_gross_salary: proRatedGrossSalary
        },
        deductions: {
          pf: pf,
          esi: esi,
          professional_tax: professional_tax,
          total_deductions: totalDeductions
        },
        net_salary: netSalary
      };
    });

    res.json({
      success: true,
      payroll: {
        center_id,
        month,
        year,
        parameters: {
          basic_salary_multiplier,
          hra_percentage,
          da_percentage,
          pf_percentage,
          esi_percentage,
          professional_tax
        },
        calculations: payrollCalculations,
        summary: {
          total_employees: payrollCalculations.length,
          total_gross_salary: payrollCalculations.reduce((sum, emp) => sum + emp.earnings.prorated_gross_salary, 0),
          total_deductions: payrollCalculations.reduce((sum, emp) => sum + emp.deductions.total_deductions, 0),
          total_net_salary: payrollCalculations.reduce((sum, emp) => sum + emp.net_salary, 0)
        }
      }
    });

  } catch (error) {
    logger.error('Calculate payroll error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payroll statistics
router.get('/payroll/statistics', async (req, res) => {
  try {
    const { center_id, month, year } = req.query;
    
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    
    let centerFilter = center_id ? `AND e.center_id = ${center_id}` : '';

    const query = `
      SELECT 
        COUNT(e.id) as total_employees,
        COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_today,
        COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_today,
        COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_today,
        COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_today,
        SUM(e.basic_salary) as total_basic_salary,
        AVG(e.basic_salary) as avg_basic_salary,
        MAX(e.basic_salary) as max_basic_salary,
        MIN(e.basic_salary) as min_basic_salary
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = CURRENT_DATE AND a.active = true
      WHERE e.active = true ${centerFilter}
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      statistics: result.rows[0],
      filters: {
        center_id,
        month: currentMonth,
        year: currentYear
      }
    });

  } catch (error) {
    logger.error('Get payroll statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
