const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const financeService = require('../services/financeService');
const { authorize } = require('../middleware/auth');

const router = express.Router();

const HR_WRITE      = ['SUPER_ADMIN', 'CENTER_MANAGER', 'HR_MANAGER'];
const PAYROLL_ADMIN = ['SUPER_ADMIN', 'CENTER_MANAGER'];

/**
 * Compute contractual working days in a given month.
 * weeklyOffs = number of off days per week (any day — not tied to Sat/Sun).
 * Uses proportional formula: daysInMonth × (7 - weeklyOffs) / 7, rounded.
 */
function computeWorkingDays(year, month, weeklyOffs = 1) {
  const daysInMonth = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this month
  const workPerWeek = Math.max(1, 7 - Math.min(weeklyOffs, 6));
  return Math.round(daysInMonth * workPerWeek / 7) || 1;
}

// Allows HR_WRITE roles OR users with LEAVE_APPLY permission
const allowLeaveApply = (req, res, next) => {
  const perms = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
  if (HR_WRITE.includes(req.user?.role) || perms.includes('ALL_ACCESS') || perms.includes('LEAVE_APPLY')) return next();
  return res.status(403).json({ success: false, message: 'Insufficient permissions', error: 'INSUFFICIENT_PERMISSIONS' });
};

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
router.post('/employees', authorize(HR_WRITE), [
  body('employee_code').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 20 }),
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 10 }).withMessage('Phone must be exactly 10 digits'),
  body('department').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('department_id').optional({ nullable: true }).isInt(),
  body('designation_id').optional({ nullable: true }).isInt(),
  body('employment_type').optional().isIn(['FULL_TIME','PART_TIME','CONTRACT','INTERN']),
  body('position').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('center_id').isInt(),
  body('basic_salary').isDecimal({ min: 0 }),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('pan_number').trim().isLength({ min: 10, max: 10 }),
  body('aadhaar_number').trim().isLength({ min: 12, max: 12 }),
  body('date_of_birth').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('date_of_joining').isISO8601().toDate(),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('emergency_contact_name').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('emergency_contact_phone').optional({ checkFalsy: true }).trim().isLength({ max: 10 }),
  body('notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, phone,
      department = null, department_id = null, designation_id = null,
      employment_type = 'FULL_TIME', position = null,
      center_id, basic_salary,
      bank_account_number, bank_name, ifsc_code,
      pan_number, aadhaar_number,
      date_of_birth = null, date_of_joining, address = null,
      emergency_contact_name = null, emergency_contact_phone = null, notes,
    } = req.body;

    // Auto-generate employee_code if not provided
    let employee_code = req.body.employee_code?.trim();
    if (!employee_code) {
      const countRes = await pool.query('SELECT COUNT(*) FROM employees');
      const seq = parseInt(countRes.rows[0].count) + 1;
      employee_code = 'EMP' + String(seq).padStart(3, '0');
    }

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

    const { weekly_offs = 1 } = req.body;

    const query = `
      INSERT INTO employees (
        employee_id, employee_code, name, email, phone, department, position,
        department_id, designation_id, employment_type,
        center_id, basic_salary, bank_account_number, bank_name, ifsc_code,
        pan_number, aadhaar_number, date_of_birth, date_of_joining, address,
        emergency_contact_name, emergency_contact_phone, notes, weekly_offs,
        created_at, updated_at, active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
        NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      employeeId, employee_code, name, email, phone,
      department || '', position || '',
      department_id || null, designation_id || null, employment_type,
      center_id, basic_salary, bank_account_number, bank_name, ifsc_code,
      pan_number, aadhaar_number, date_of_birth, date_of_joining, address,
      emergency_contact_name, emergency_contact_phone, notes, parseInt(weekly_offs) || 1,
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
router.put('/employees/:id', authorize(HR_WRITE), [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('phone').trim().isLength({ min: 10, max: 10 }).withMessage('Phone must be exactly 10 digits'),
  body('department').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('department_id').optional({ nullable: true }).isInt(),
  body('designation_id').optional({ nullable: true }).isInt(),
  body('employment_type').optional().isIn(['FULL_TIME','PART_TIME','CONTRACT','INTERN']),
  body('position').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('center_id').isInt(),
  body('basic_salary').isDecimal({ min: 0 }),
  body('bank_account_number').trim().isLength({ min: 10, max: 50 }),
  body('bank_name').trim().isLength({ min: 3, max: 100 }),
  body('ifsc_code').trim().isLength({ min: 11, max: 11 }),
  body('pan_number').trim().isLength({ min: 10, max: 10 }),
  body('aadhaar_number').trim().isLength({ min: 12, max: 12 }),
  body('date_of_birth').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('date_of_joining').isISO8601().toDate(),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('emergency_contact_name').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('emergency_contact_phone').optional({ checkFalsy: true }).trim().isLength({ max: 10 }),
  body('notes').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name, email, phone,
      department = null, department_id = null, designation_id = null,
      employment_type = 'FULL_TIME', position = null,
      center_id, basic_salary,
      bank_account_number, bank_name, ifsc_code,
      pan_number, aadhaar_number,
      date_of_birth, date_of_joining, address,
      emergency_contact_name, emergency_contact_phone, notes,
      weekly_offs = 1,
    } = req.body;

    const existingEmployee = await pool.query(
      'SELECT id FROM employees WHERE id = $1 AND active = true', [id]
    );
    if (existingEmployee.rows.length === 0)
      return res.status(404).json({ error: 'Employee not found' });

    await pool.query(
      `UPDATE employees SET
        name=$1, email=$2, phone=$3, department=$4, position=$5,
        department_id=$6, designation_id=$7, employment_type=$8,
        center_id=$9, basic_salary=$10, bank_account_number=$11, bank_name=$12,
        ifsc_code=$13, pan_number=$14, aadhaar_number=$15, date_of_birth=$16,
        date_of_joining=$17, address=$18, emergency_contact_name=$19,
        emergency_contact_phone=$20, notes=$21, weekly_offs=$22, updated_at=NOW()
      WHERE id=$23 AND active=true`,
      [
        name, email, phone, department || '', position || '',
        department_id || null, designation_id || null, employment_type,
        center_id, basic_salary, bank_account_number, bank_name,
        ifsc_code, pan_number, aadhaar_number, date_of_birth,
        date_of_joining, address, emergency_contact_name,
        emergency_contact_phone, notes, parseInt(weekly_offs) || 1, id,
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
router.delete('/employees/:id', authorize(HR_WRITE), async (req, res) => {
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
router.post('/attendance', authorize(HR_WRITE), [
  body('employee_id').isInt(),
  body('attendance_date').isISO8601().toDate(),
  body('status').isIn(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'WEEKEND']),
  body('notes').optional().trim().isLength({ min: 2, max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employee_id, attendance_date, status, notes } = req.body;

    // Fetch employee (need weekly_offs for contract enforcement)
    const empRow = await pool.query(
      'SELECT id, weekly_offs FROM employees WHERE id = $1 AND active = true',
      [employee_id]
    );
    if (empRow.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Enforce WEEKEND contract limit
    if (status === 'WEEKEND') {
      const weeklyOffs = parseInt(empRow.rows[0].weekly_offs) || 1;
      const d = new Date(attendance_date);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const contractedOffDays = Math.round(daysInMonth * weeklyOffs / 7);
      const { rows: wRows } = await pool.query(
        `SELECT COUNT(*) FROM attendance
         WHERE employee_id = $1 AND status = 'WEEKEND' AND active = true
           AND DATE_TRUNC('month', attendance_date) = DATE_TRUNC('month', $2::date)`,
        [employee_id, attendance_date]
      );
      if (parseInt(wRows[0].count) >= contractedOffDays) {
        return res.status(400).json({
          error: `Weekend limit reached — contract allows ${contractedOffDays} off day(s) this month (${wRows[0].count} already marked).`
        });
      }
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
router.put('/attendance/:id', authorize(HR_WRITE), [
  body('status').isIn(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'WEEKEND']),
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
        COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_days,
        COUNT(CASE WHEN a.status = 'WEEKEND' THEN 1 END) as weekend_days
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
router.post('/payroll/calculate', authorize(HR_WRITE), [
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
      esi_percentage = 0.75,
      professional_tax = 200
    } = req.body;

    // Get employees for the center
    const employeesQuery = `
      SELECT 
        e.*,
        COUNT(a.id) as total_days,
        COUNT(CASE WHEN a.status = 'PRESENT'  THEN 1 END) as present_days,
        COUNT(CASE WHEN a.status = 'ABSENT'   THEN 1 END) as absent_days,
        COUNT(CASE WHEN a.status = 'LEAVE'    THEN 1 END) as leave_days,
        COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_days,
        COUNT(CASE WHEN a.status = 'WEEKEND'  THEN 1 END) as weekend_days
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
      // Working days = total days in month minus contracted weekly-off days
      const workingDaysInMonth = computeWorkingDays(year, month, parseInt(employee.weekly_offs ?? 1));
      const basicSalary = parseFloat(employee.basic_salary) * basic_salary_multiplier;
      const hra = basicSalary * (hra_percentage / 100);
      const da = basicSalary * (da_percentage / 100);
      const grossSalary = basicSalary + hra + da;

      // Prorate: present + 0.5×half_day + leave + weekend (contracted off days are paid)
      const paidDays = parseFloat(employee.present_days || 0)
                     + parseFloat(employee.half_day_days || 0) * 0.5
                     + parseFloat(employee.leave_days   || 0)
                     + parseFloat(employee.weekend_days || 0);
      const attendanceRatio = workingDaysInMonth > 0 ? Math.min(paidDays / workingDaysInMonth, 1) : 1;

      const proRatedGrossSalary = parseFloat((grossSalary * attendanceRatio).toFixed(2));

      // PF: 12% of basic, employee share capped at ₹1,800/month (12% of ₹15,000 ceiling)
      const pf = parseFloat(Math.min(basicSalary * (pf_percentage / 100), 1800).toFixed(2));
      // ESI: 0.75% of gross (employee share) — applicable only if gross ≤ ₹21,000
      const esi = proRatedGrossSalary <= 21000
        ? parseFloat((proRatedGrossSalary * (esi_percentage / 100)).toFixed(2))
        : 0;
      const profTax = parseFloat(professional_tax);
      const totalDeductions = parseFloat((pf + esi + profTax).toFixed(2));

      const netSalary = parseFloat((proRatedGrossSalary - totalDeductions).toFixed(2));

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
          weekend_days: employee.weekend_days,
          attendance_percentage: Math.round((paidDays / workingDaysInMonth) * 100)
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

    const summary = {
      total_employees: payrollCalculations.length,
      total_gross_salary: payrollCalculations.reduce((sum, emp) => sum + emp.earnings.prorated_gross_salary, 0),
      total_deductions: payrollCalculations.reduce((sum, emp) => sum + emp.deductions.total_deductions, 0),
      total_net_salary: payrollCalculations.reduce((sum, emp) => sum + emp.net_salary, 0)
    };

    // Persist each employee calculation to payroll_register (DRAFT)
    for (const calc of payrollCalculations) {
      await pool.query(
        `INSERT INTO payroll_register
           (employee_id, pay_period_year, pay_period_month,
            basic_salary, hra, da, gross_salary,
            pf_deduction, esi_deduction, professional_tax, tds_deduction,
            total_deductions, net_salary,
            working_days, present_days, leave_days,
            status, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'DRAFT',$17,NOW(),NOW())
         ON CONFLICT (employee_id, pay_period_year, pay_period_month)
         DO UPDATE SET
           basic_salary     = EXCLUDED.basic_salary,
           hra              = EXCLUDED.hra,
           da               = EXCLUDED.da,
           gross_salary     = EXCLUDED.gross_salary,
           pf_deduction     = EXCLUDED.pf_deduction,
           esi_deduction    = EXCLUDED.esi_deduction,
           professional_tax = EXCLUDED.professional_tax,
           tds_deduction    = EXCLUDED.tds_deduction,
           total_deductions = EXCLUDED.total_deductions,
           net_salary       = EXCLUDED.net_salary,
           working_days     = EXCLUDED.working_days,
           present_days     = EXCLUDED.present_days,
           leave_days       = EXCLUDED.leave_days,
           updated_at       = NOW()`,
        [
          calc.employee_id, year, month,
          calc.earnings.basic_salary, calc.earnings.hra, calc.earnings.da,
          calc.earnings.prorated_gross_salary,
          calc.deductions.pf, calc.deductions.esi, calc.deductions.professional_tax, 0,
          calc.deductions.total_deductions, calc.net_salary,
          workingDaysInMonth, calc.attendance_summary.present_days, calc.attendance_summary.leave_days,
          req.user?.id
        ]
      );
    }

    res.json({
      success: true,
      payroll: {
        center_id, month, year,
        parameters: {
          basic_salary_multiplier, hra_percentage, da_percentage,
          pf_percentage, esi_percentage, professional_tax
        },
        calculations: payrollCalculations,
        summary
      }
    });

  } catch (error) {
    logger.error('Calculate payroll error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /payroll/approve ─ Approve payroll run and post Finance JE ───────────
router.post('/payroll/approve', authorize(PAYROLL_ADMIN), [
  body('center_id').isInt(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2020, max: 2100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { center_id, month, year } = req.body;

    // Get all DRAFT payroll records for this period + center
    const { rows } = await pool.query(
      `SELECT pr.*, e.name AS employee_name, e.center_id,
              COALESCE(UPPER(e.department), 'GENERAL') AS resolved_category
       FROM payroll_register pr
       JOIN employees e ON e.id = pr.employee_id
       WHERE e.center_id = $1 AND pr.pay_period_year = $2 AND pr.pay_period_month = $3
         AND pr.status = 'DRAFT'`,
      [center_id, year, month]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'No DRAFT payroll records found for this period. Run calculation first.' });
    }

    const totalGross   = rows.reduce((s, r) => s + parseFloat(r.gross_salary),     0);
    const totalNet     = rows.reduce((s, r) => s + parseFloat(r.net_salary),       0);
    const employeePF   = rows.reduce((s, r) => s + parseFloat(r.pf_deduction),     0);
    const employeeESI  = rows.reduce((s, r) => s + parseFloat(r.esi_deduction),    0);
    const totalProfTax = rows.reduce((s, r) => s + parseFloat(r.professional_tax || 0), 0);
    const totalTDS     = rows.reduce((s, r) => s + parseFloat(r.tds_deduction || 0), 0);
    // Employer PF = 12% of basic (same ceiling as employee) = mirrors employeePF
    const totalPF      = employeePF;
    // Employer ESI = 3.25% of gross; employee ESI = 0.75% of gross → ratio 3.25/0.75
    const totalESI     = parseFloat((employeeESI * (3.25 / 0.75)).toFixed(2));
    const periodLabel  = `${year}-${String(month).padStart(2,'0')}`;

    // Build per-category gross breakdown for GL segregation
    const categoryMap = {};
    for (const r of rows) {
      const cat = r.resolved_category;
      categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(r.gross_salary);
    }
    const byCategory = Object.entries(categoryMap).map(([category, gross]) => ({ category, gross }));

    // Post finance JE
    let jeId = null;
    let jeWarning = null;
    try {
      const je = await financeService.postPayrollJE(
        { totalGross, totalNet, totalPF, totalESI, employeePF, employeeESI, totalTDS, totalProfTax, byCategory, periodLabel },
        req.user?.id,
        center_id
      );
      jeId = je?.id || null;
      if (!jeId) jeWarning = 'Finance JE was not posted (GL mappings may be missing). Payroll is approved but accounting entry is pending.';
    } catch (jeErr) {
      logger.error('Finance JE failed for payroll approve:', { period: periodLabel, error: jeErr.message });
      jeWarning = `Finance JE failed: ${jeErr.message}. Payroll is approved but accounting entry is pending.`;
    }

    // Update status to APPROVED regardless — payroll ops are independent of Finance JE
    await pool.query(
      `UPDATE payroll_register
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW(),
           journal_entry_id = COALESCE($2, journal_entry_id), updated_at = NOW()
       WHERE employee_id IN (
         SELECT id FROM employees WHERE center_id = $3
       ) AND pay_period_year = $4 AND pay_period_month = $5 AND status = 'DRAFT'`,
      [req.user?.id, jeId, center_id, year, month]
    );

    logger.info(`Payroll approved for period ${periodLabel}, center ${center_id}${jeWarning ? ' (JE pending)' : ''}`);
    res.json({
      success: true,
      message: `Payroll approved for ${periodLabel}`,
      je_warning: jeWarning || null,
      summary: { total_employees: rows.length, total_gross: totalGross, total_net: totalNet, journal_entry_id: jeId }
    });

  } catch (error) {
    logger.error('Approve payroll error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /payroll/register ─ List persisted payroll records ───────────────────
router.get('/payroll/register', async (req, res) => {
  try {
    const { center_id, month, year, status } = req.query;
    const conditions = ['1=1'];
    const params = [];
    if (center_id) { params.push(center_id); conditions.push(`e.center_id = $${params.length}`); }
    if (year)      { params.push(year);      conditions.push(`pr.pay_period_year = $${params.length}`); }
    if (month)     { params.push(month);     conditions.push(`pr.pay_period_month = $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`pr.status = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT pr.*, e.name AS employee_name, e.employee_code, e.department, e.position,
              c.name AS center_name
       FROM payroll_register pr
       JOIN employees e ON e.id = pr.employee_id
       LEFT JOIN centers c ON c.id = e.center_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pr.pay_period_year DESC, pr.pay_period_month DESC, e.name`,
      params
    );
    res.json({ success: true, records: rows });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get payroll statistics
router.get('/payroll/statistics', async (req, res) => {
  try {
    const { center_id, month, year } = req.query;
    
    const currentMonth = month || new Date().getMonth() + 1;
    const currentYear = year || new Date().getFullYear();
    
    const queryParams = [];
    let centerFilter = '';
    if (center_id) {
      queryParams.push(parseInt(center_id, 10));
      centerFilter = `AND e.center_id = $${queryParams.length}`;
    }

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

    const result = await pool.query(query, queryParams);

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

// ── GET /departments ── DB-driven department list ─────────────────────────────
router.get('/departments', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, code FROM departments WHERE is_active = true ORDER BY name`
    );
    res.json({ success: true, departments: rows });
  } catch (err) {
    logger.error('Get departments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /designations ─────────────────────────────────────────────────────────
router.get('/designations', async (req, res) => {
  try {
    const { department_id } = req.query;
    const params = [];
    let where = 'active = true';
    if (department_id) { params.push(department_id); where += ` AND (department_id = $1 OR department_id IS NULL)`; }
    const { rows } = await pool.query(
      `SELECT id, code, name, department_id, grade FROM designations WHERE ${where} ORDER BY sort_order, name`,
      params
    );
    res.json({ success: true, designations: rows });
  } catch (err) {
    logger.error('Get designations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /leave-types ──────────────────────────────────────────────────────────
router.get('/leave-types', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, name, days_per_year, carry_forward, max_carry_forward,
              paid, requires_doc, min_days, max_days
       FROM leave_types WHERE active = true ORDER BY sort_order, name`
    );
    res.json({ success: true, leave_types: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /leave-balances ───────────────────────────────────────────────────────
router.get('/leave-balances', async (req, res) => {
  try {
    const { employee_id, year = new Date().getFullYear() } = req.query;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const { rows } = await pool.query(
      `SELECT lb.*, lt.code, lt.name AS leave_type_name, lt.paid,
              (lb.entitlement + lb.carried_forward - lb.used) AS balance
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.employee_id = $1 AND lb.year = $2
       ORDER BY lt.sort_order`,
      [employee_id, year]
    );
    res.json({ success: true, balances: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /leave-balances/init ── Initialise yearly balances for all employees ─
router.post('/leave-balances/init', authorize(HR_WRITE), async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.body;
    const result = await pool.query(
      `INSERT INTO leave_balances (employee_id, leave_type_id, year, entitlement, used, carried_forward)
       SELECT e.id, lt.id, $1, lt.days_per_year, 0,
         COALESCE((
           SELECT LEAST(prev.entitlement + prev.carried_forward - prev.used, lt.max_carry_forward)
           FROM leave_balances prev
           WHERE prev.employee_id = e.id AND prev.leave_type_id = lt.id
             AND prev.year = $1 - 1 AND lt.carry_forward = true
         ), 0)
       FROM employees e CROSS JOIN leave_types lt
       WHERE e.active = true AND lt.active = true AND lt.days_per_year > 0
       ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING
       RETURNING id`,
      [year]
    );
    res.json({ success: true, created: result.rowCount, year });
  } catch (err) {
    logger.error('Leave balance init error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /leave-requests ───────────────────────────────────────────────────────
router.get('/leave-requests', async (req, res) => {
  try {
    const { employee_id, status, center_id, from_date, to_date } = req.query;
    const conds = ['lr.active = true'];
    const params = [];
    if (employee_id) { params.push(employee_id); conds.push(`lr.employee_id = $${params.length}`); }
    if (status)      { params.push(status);      conds.push(`lr.status = $${params.length}`); }
    if (center_id)   { params.push(center_id);   conds.push(`e.center_id = $${params.length}`); }
    if (from_date)   { params.push(from_date);   conds.push(`lr.to_date >= $${params.length}`); }
    if (to_date)     { params.push(to_date);     conds.push(`lr.from_date <= $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT lr.*, e.name AS employee_name, e.employee_code, e.department,
              c.name AS center_name, lt.code AS leave_code, lt.name AS leave_type_name,
              u.name AS approved_by_name
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       LEFT JOIN centers c ON c.id = e.center_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users u ON u.id = lr.approved_by
       WHERE ${conds.join(' AND ')}
       ORDER BY lr.created_at DESC`,
      params
    );
    res.json({ success: true, requests: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /leave-requests ──────────────────────────────────────────────────────
router.post('/leave-requests', allowLeaveApply, [
  body('employee_id').isInt({ min: 1 }),
  body('leave_type_id').isInt({ min: 1 }),
  body('from_date').isDate(),
  body('to_date').isDate(),
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { employee_id, leave_type_id, from_date, to_date, reason } = req.body;
    const from = new Date(from_date), to = new Date(to_date);
    if (to < from) return res.status(400).json({ error: 'to_date must be ≥ from_date' });

    // Calculate days (simple calendar days, weekends excluded)
    let days = 0, cur = new Date(from);
    while (cur <= to) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days += 1;
      cur.setDate(cur.getDate() + 1);
    }
    if (days === 0) return res.status(400).json({ error: 'No working days in selected range' });

    // Check for overlapping approved/pending requests
    const overlap = await pool.query(
      `SELECT id FROM leave_requests
       WHERE employee_id = $1 AND active = true AND status IN ('PENDING','APPROVED')
         AND from_date <= $3 AND to_date >= $2`,
      [employee_id, from_date, to_date]
    );
    if (overlap.rows.length) return res.status(409).json({ error: 'Overlapping leave request exists' });

    const { rows } = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [employee_id, leave_type_id, from_date, to_date, days, reason || null]
    );
    logger.info('Leave request created', { employee_id, days, leave_type_id });
    res.status(201).json({ success: true, request: rows[0] });
  } catch (err) {
    logger.error('Leave request POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /leave-requests/:id/approve ──────────────────────────────────────────
router.put('/leave-requests/:id/approve', authorize(HR_WRITE), async (req, res) => {
  try {
    const { id } = req.params;
    const lr = await pool.query(
      `SELECT lr.*, lt.days_per_year FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.id = $1 AND lr.active = true`, [id]
    );
    if (!lr.rows.length) return res.status(404).json({ error: 'Leave request not found' });
    if (lr.rows[0].status !== 'PENDING') return res.status(400).json({ error: 'Only PENDING requests can be approved' });

    const year = new Date(lr.rows[0].from_date).getFullYear();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE leave_requests SET status='APPROVED', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [req.user?.id || null, id]
      );
      // Update balance — on conflict just add the used days; on insert use days_per_year as entitlement
      await client.query(
        `INSERT INTO leave_balances (employee_id, leave_type_id, year, entitlement, used, carried_forward)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (employee_id, leave_type_id, year)
         DO UPDATE SET used = leave_balances.used + EXCLUDED.used, updated_at = NOW()`,
        [lr.rows[0].employee_id, lr.rows[0].leave_type_id, year, lr.rows[0].days_per_year, lr.rows[0].days]
      );
      // Mark attendance as LEAVE for approved days
      let cur = new Date(lr.rows[0].from_date), end = new Date(lr.rows[0].to_date);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          const dateStr = cur.toLocaleDateString('en-CA');
          await client.query(
            `INSERT INTO attendance (employee_id, attendance_date, status, notes)
             VALUES ($1, $2, 'LEAVE', $3)
             ON CONFLICT (employee_id, attendance_date) DO UPDATE SET status='LEAVE', notes=$3, updated_at=NOW()`,
            [lr.rows[0].employee_id, dateStr, `Leave request #${id}`]
          );
        }
        cur.setDate(cur.getDate() + 1);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    logger.info('Leave approved', { id, approver: req.user?.id });
    res.json({ success: true, message: 'Leave approved' });
  } catch (err) {
    logger.error('Leave approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /leave-requests/:id/reject ────────────────────────────────────────────
router.put('/leave-requests/:id/reject', authorize(HR_WRITE), [
  body('rejection_reason').trim().isLength({ min: 3, max: 500 }),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const result = await pool.query(
      `UPDATE leave_requests SET status='REJECTED', rejection_reason=$1, approved_by=$2, approved_at=NOW(), updated_at=NOW()
       WHERE id=$3 AND active=true AND status='PENDING' RETURNING id`,
      [rejection_reason, req.user?.id || null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pending leave request not found' });
    res.json({ success: true, message: 'Leave rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /leave-requests/:id/cancel ────────────────────────────────────────────
router.put('/leave-requests/:id/cancel', authorize(HR_WRITE), async (req, res) => {
  try {
    const { id } = req.params;
    const lr = await pool.query(
      `SELECT * FROM leave_requests WHERE id=$1 AND active=true`, [id]
    );
    if (!lr.rows.length) return res.status(404).json({ error: 'Leave request not found' });
    if (!['PENDING','APPROVED'].includes(lr.rows[0].status))
      return res.status(400).json({ error: 'Cannot cancel this request' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE leave_requests SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [id]
      );
      // Reverse balance if was approved
      if (lr.rows[0].status === 'APPROVED') {
        const year = new Date(lr.rows[0].from_date).getFullYear();
        await client.query(
          `UPDATE leave_balances SET used = GREATEST(0, used - $1), updated_at=NOW()
           WHERE employee_id=$2 AND leave_type_id=$3 AND year=$4`,
          [lr.rows[0].days, lr.rows[0].employee_id, lr.rows[0].leave_type_id, year]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ success: true, message: 'Leave cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
