const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/dashboard-reports.log' })
  ]
});

// VISUALLY RICH DASHBOARD

// Get dashboard data with filters
router.get('/dashboard', async (req, res) => {
  try {
    const { 
      center_id, 
      date_from, 
      date_to, 
      modality, 
      radiologist_id,
      department,
      period = '30' 
    } = req.query;

    // Get user's accessible centers
    const userQuery = `
      SELECT u.id, u.name, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
             ur.dashboard_widgets
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;
    const userResult = await pool.query(userQuery, [req.session.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const accessibleCenters = await getAccessibleCenters(user);

    // Build date filter
    let dateFilter = '';
    if (date_from && date_to) {
      dateFilter = `AND DATE(s.created_at) BETWEEN '${date_from}' AND '${date_to}'`;
    } else if (period === '7') {
      dateFilter = 'AND s.created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
    } else if (period === '30') {
      dateFilter = 'AND s.created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
    } else if (period === '90') {
      dateFilter = 'AND s.created_at >= CURRENT_DATE - INTERVAL \'90 days\'';
    } else if (period === '365') {
      dateFilter = 'AND s.created_at >= CURRENT_DATE - INTERVAL \'365 days\'';
    }

    // Build center filter
    let centerFilter = '';
    if (center_id) {
      centerFilter = `AND s.center_id = ${center_id}`;
    } else if (!user.is_corporate_role && !user.can_access_all_centers) {
      centerFilter = `AND s.center_id = ${user.center_id}`;
    }

    // Build modality filter
    let modalityFilter = '';
    if (modality) {
      modalityFilter = `AND sm.modality = '${modality}'`;
    }

    // Build radiologist filter
    let radiologistFilter = '';
    if (radiologist_id) {
      radiologistFilter = `AND s.radiologist_code = '${radiologist_id}'`;
    }

    // Get dashboard widgets based on user role
    const widgets = user.dashboard_widgets || [];

    const dashboardData = {};

    // Patient Statistics Widget
    if (widgets.includes('PATIENT_COUNT') || widgets.includes('ALL_WIDGETS')) {
      const patientQuery = `
        SELECT 
          COUNT(*) as total_patients,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_patients,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_patients,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month_patients,
          COUNT(CASE WHEN has_insurance = true THEN 1 END) as insured_patients,
          COUNT(CASE WHEN has_insurance = false THEN 1 END) as uninsured_patients
        FROM patients 
        WHERE active = true ${centerFilter ? `AND center_id = ANY(ARRAY[${centerFilter.replace('AND s.center_id = ', '')}])` : ''}
      `;
      const patientResult = await pool.query(patientQuery);
      dashboardData.patient_stats = patientResult.rows[0];
    }

    // Study Statistics Widget
    if (widgets.includes('STUDY_COUNT') || widgets.includes('ALL_WIDGETS')) {
      const studyQuery = `
        SELECT 
          COUNT(*) as total_studies,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_studies,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_studies,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month_studies,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_studies,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_studies,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_studies
        FROM studies s
        WHERE s.active = true ${dateFilter} ${centerFilter} ${modalityFilter} ${radiologistFilter}
      `;
      const studyResult = await pool.query(studyQuery);
      dashboardData.study_stats = studyResult.rows[0];
    }

    // Revenue Statistics Widget
    if (widgets.includes('REVENUE_SUMMARY') || widgets.includes('ALL_WIDGETS')) {
      const revenueQuery = `
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(paid_amount), 0) as paid_amount,
          COALESCE(SUM(pending_amount), 0) as pending_amount,
          COUNT(*) as total_bills,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_bills,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bills
        FROM patient_bills pb
        WHERE pb.active = true ${dateFilter} ${centerFilter}
      `;
      const revenueResult = await pool.query(revenueQuery);
      dashboardData.revenue_stats = revenueResult.rows[0];
    }

    // Modality Breakdown Widget
    if (widgets.includes('MODALITY_BREAKDOWN') || widgets.includes('ALL_WIDGETS')) {
      const modalityQuery = `
        SELECT 
          sm.modality,
          COUNT(*) as study_count,
          COALESCE(SUM(pb.total_amount), 0) as revenue
        FROM studies s
        LEFT JOIN study_master sm ON s.study_code = sm.study_code
        LEFT JOIN patient_bills pb ON s.patient_id = pb.patient_id AND pb.active = true
        WHERE s.active = true ${dateFilter} ${centerFilter} ${radiologistFilter}
        GROUP BY sm.modality
        ORDER BY study_count DESC
      `;
      const modalityResult = await pool.query(modalityQuery);
      dashboardData.modality_breakdown = modalityResult.rows;
    }

    // Radiologist Workload Widget
    if (widgets.includes('RADIOLOGIST_WORKLOAD') || widgets.includes('ALL_WIDGETS')) {
      const radiologistQuery = `
        SELECT 
          rm.name as radiologist_name,
          rm.radiologist_code,
          COUNT(*) as study_count,
          COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
          COUNT(CASE WHEN s.status = 'pending' THEN 1 END) as pending_studies,
          COALESCE(SUM(s.reporting_rate), 0) as total_earnings
        FROM studies s
        LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
        WHERE s.active = true ${dateFilter} ${centerFilter} ${modalityFilter}
        GROUP BY rm.name, rm.radiologist_code
        ORDER BY study_count DESC
        LIMIT 10
      `;
      const radiologistResult = await pool.query(radiologistQuery);
      dashboardData.radiologist_workload = radiologistResult.rows;
    }

    // Center Utilization Widget
    if (widgets.includes('CENTER_UTILIZATION') || widgets.includes('ALL_WIDGETS')) {
      const centerUtilizationQuery = `
        SELECT 
          c.name as center_name,
          c.city,
          COUNT(*) as study_count,
          COUNT(DISTINCT s.patient_id) as patient_count,
          COALESCE(SUM(pb.total_amount), 0) as revenue
        FROM centers c
        LEFT JOIN studies s ON c.id = s.center_id AND s.active = true ${dateFilter} ${modalityFilter} ${radiologistFilter}
        LEFT JOIN patient_bills pb ON s.patient_id = pb.patient_id AND pb.active = true
        WHERE c.active = true
        GROUP BY c.id, c.name, c.city
        ORDER BY study_count DESC
      `;
      const centerUtilizationResult = await pool.query(centerUtilizationQuery);
      dashboardData.center_utilization = centerUtilizationResult.rows;
    }

    // Monthly Trend Widget
    if (widgets.includes('REVENUE_CHART') || widgets.includes('ALL_WIDGETS')) {
      const trendQuery = `
        SELECT 
          DATE_TRUNC('month', s.created_at) as month,
          COUNT(*) as study_count,
          COUNT(DISTINCT s.patient_id) as patient_count,
          COALESCE(SUM(pb.total_amount), 0) as revenue
        FROM studies s
        LEFT JOIN patient_bills pb ON s.patient_id = pb.patient_id AND pb.active = true
        WHERE s.active = true 
          AND s.created_at >= CURRENT_DATE - INTERVAL '12 months'
          ${centerFilter} ${modalityFilter} ${radiologistFilter}
        GROUP BY DATE_TRUNC('month', s.created_at)
        ORDER BY month DESC
        LIMIT 12
      `;
      const trendResult = await pool.query(trendQuery);
      dashboardData.monthly_trend = trendResult.rows.reverse();
    }

    // Staff Attendance Widget
    if (widgets.includes('STAFF_ATTENDANCE') || widgets.includes('ALL_WIDGETS')) {
      const attendanceQuery = `
        SELECT 
          COUNT(*) as total_employees,
          COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_today,
          COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_today,
          COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_today,
          COUNT(CASE WHEN a.attendance_date = CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as active_last_week
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = CURRENT_DATE
        WHERE e.active = true ${centerFilter}
      `;
      const attendanceResult = await pool.query(attendanceQuery);
      dashboardData.staff_attendance = attendanceResult.rows[0];
    }

    res.json({
      success: true,
      dashboard_data: dashboardData,
      user_info: {
        name: user.name,
        role: user.role,
        role_name: user.role_name,
        employee_type: user.is_corporate_role ? 'Corporate' : 
                      (user.can_access_all_centers ? 'Team-Based' : 'Center-Specific'),
        accessible_centers: accessibleCenters
      },
      filters: {
        center_id,
        date_from,
        date_to,
        modality,
        radiologist_id,
        period
      }
    });

  } catch (error) {
    logger.error('Get dashboard data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard filters data
router.get('/dashboard/filters', async (req, res) => {
  try {
    const userQuery = `
      SELECT u.id, u.name, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;
    const userResult = await pool.query(userQuery, [req.session.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const accessibleCenters = await getAccessibleCenters(user);

    // Get available modalities
    const modalityQuery = `
      SELECT DISTINCT modality 
      FROM study_master 
      WHERE active = true 
      ORDER BY modality
    `;
    const modalityResult = await pool.query(modalityQuery);

    // Get available radiologists
    const radiologistQuery = `
      SELECT radiologist_code, name, type 
      FROM radiologist_master 
      WHERE active = true 
      ORDER BY name
    `;
    const radiologistResult = await pool.query(radiologistQuery);

    // Get available departments
    const departmentQuery = `
      SELECT DISTINCT department 
      FROM employees 
      WHERE active = true 
      ORDER BY department
    `;
    const departmentResult = await pool.query(departmentQuery);

    res.json({
      success: true,
      filters: {
        centers: accessibleCenters,
        modalities: modalityResult.rows,
        radiologists: radiologistResult.rows,
        departments: departmentResult.rows
      }
    });

  } catch (error) {
    logger.error('Get dashboard filters error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// COMPREHENSIVE REPORTS SYSTEM

// Get reports list
router.get('/reports', async (req, res) => {
  try {
    const userQuery = `
      SELECT u.id, u.name, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.report_access
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;
    const userResult = await pool.query(userQuery, [req.session.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const reportAccess = user.report_access || [];

    const allReports = [
      {
        id: 'PATIENT_DEMOGRAPHICS',
        name: 'Patient Demographics Report',
        description: 'Detailed patient information and demographics',
        category: 'Patient',
        icon: 'users',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'PATIENT_HISTORY',
        name: 'Patient History Report',
        description: 'Patient visit and treatment history',
        category: 'Patient',
        icon: 'history',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'STUDY_REPORTS',
        name: 'Study Reports Summary',
        description: 'Comprehensive study and reporting statistics',
        category: 'Clinical',
        icon: 'x-ray',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'RADIOLOGIST_PERFORMANCE',
        name: 'Radiologist Performance Report',
        description: 'Individual radiologist performance metrics',
        category: 'Clinical',
        icon: 'user-md',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'MODALITY_UTILIZATION',
        name: 'Modality Utilization Report',
        description: 'Equipment and modality usage statistics',
        category: 'Clinical',
        icon: 'camera',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'BILLING_REPORT',
        name: 'Billing and Revenue Report',
        description: 'Detailed billing and revenue analysis',
        category: 'Financial',
        icon: 'file-invoice-dollar',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'PAYMENT_REPORT',
        name: 'Payment Collection Report',
        description: 'Payment collection and status report',
        category: 'Financial',
        icon: 'credit-card',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'EXPENSE_REPORT',
        name: 'Expense Report',
        description: 'Detailed expense analysis',
        category: 'Financial',
        icon: 'money-bill-wave',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'EMPLOYEE_ATTENDANCE',
        name: 'Employee Attendance Report',
        description: 'Staff attendance and payroll report',
        category: 'Employee',
        icon: 'calendar-check',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'EMPLOYEE_PAYROLL',
        name: 'Employee Payroll Report',
        description: 'Detailed payroll and salary report',
        category: 'Employee',
        icon: 'money-check-alt',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'INVENTORY_REPORT',
        name: 'Inventory Status Report',
        description: 'Current inventory and stock levels',
        category: 'Inventory',
        icon: 'boxes',
        formats: ['PDF', 'Excel']
      },
      {
        id: 'VENDOR_REPORT',
        name: 'Vendor Performance Report',
        description: 'Vendor performance and billing report',
        category: 'Inventory',
        icon: 'truck',
        formats: ['PDF', 'Excel']
      }
    ];

    // Filter reports based on user access
    const accessibleReports = allReports.filter(report => 
      reportAccess.includes(report.id) || reportAccess.includes('ALL_REPORTS')
    );

    res.json({
      success: true,
      reports: accessibleReports,
      user_info: {
        name: user.name,
        role: user.role,
        role_name: user.role_name,
        report_access: reportAccess
      }
    });

  } catch (error) {
    logger.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate report with filters
router.post('/reports/generate', [
  body('report_id').trim().isLength({ min: 1 }),
  body('format').isIn(['PDF', 'Excel']),
  body('filters').optional().isObject(),
  body('date_from').optional().isISO8601().toDate(),
  body('date_to').optional().isISO8601().toDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { report_id, format, filters = {}, date_from, date_to } = req.body;

    // Check user access to this report
    const userQuery = `
      SELECT u.id, u.name, u.role, u.center_id,
             ur.role_name, ur.is_corporate_role, ur.can_access_all_centers, ur.report_access
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;
    const userResult = await pool.query(userQuery, [req.session.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const reportAccess = user.report_access || [];

    if (!reportAccess.includes(report_id) && !reportAccess.includes('ALL_REPORTS')) {
      return res.status(403).json({ error: 'Insufficient permissions to access this report' });
    }

    // Generate report based on type
    let reportData;
    switch (report_id) {
      case 'PATIENT_DEMOGRAPHICS':
        reportData = await generatePatientDemographicsReport(user, filters, date_from, date_to);
        break;
      case 'STUDY_REPORTS':
        reportData = await generateStudyReportsReport(user, filters, date_from, date_to);
        break;
      case 'BILLING_REPORT':
        reportData = await generateBillingReport(user, filters, date_from, date_to);
        break;
      case 'RADIOLOGIST_PERFORMANCE':
        reportData = await generateRadiologistPerformanceReport(user, filters, date_from, date_to);
        break;
      case 'MODALITY_UTILIZATION':
        reportData = await generateModalityUtilizationReport(user, filters, date_from, date_to);
        break;
      case 'EMPLOYEE_ATTENDANCE':
        reportData = await generateEmployeeAttendanceReport(user, filters, date_from, date_to);
        break;
      default:
        return res.status(400).json({ error: 'Report type not supported' });
    }

    // Generate file based on format
    let fileBuffer, fileName, mimeType;
    if (format === 'PDF') {
      const pdfResult = await generatePDFReport(report_id, reportData);
      fileBuffer = pdfResult.buffer;
      fileName = pdfResult.fileName;
      mimeType = 'application/pdf';
    } else if (format === 'Excel') {
      const excelResult = await generateExcelReport(report_id, reportData);
      fileBuffer = excelResult.buffer;
      fileName = excelResult.fileName;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    // Log report generation
    logger.info(`Report generated: ${report_id} by ${user.name} (${format})`);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);

  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
async function getAccessibleCenters(user) {
  let centerQuery;
  if (user.is_corporate_role || user.can_access_all_centers) {
    centerQuery = 'SELECT id, name, city, state FROM centers WHERE active = true ORDER BY name';
  } else if (user.allowed_centers && user.allowed_centers.length > 0) {
    centerQuery = `SELECT id, name, city, state FROM centers WHERE id = ANY(ARRAY[${user.allowed_centers.join(',')}]) AND active = true ORDER BY name`;
  } else if (user.center_id) {
    centerQuery = `SELECT id, name, city, state FROM centers WHERE id = ${user.center_id} AND active = true`;
  } else {
    return [];
  }

  const centerResult = await pool.query(centerQuery);
  return centerResult.rows;
}

async function generatePatientDemographicsReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE p.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(p.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND p.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND p.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  const query = `
    SELECT 
      p.id, p.name, p.email, p.phone, p.gender, p.date_of_birth, p.address,
      p.city, p.state, p.postal_code, p.has_insurance, p.insurance_provider_id,
      p.referring_physician_code, p.created_at,
      ip.name as insurance_provider_name,
      rp.name as referring_physician_name,
      c.name as center_name,
      COUNT(s.id) as study_count,
      COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
      COALESCE(SUM(pb.total_amount), 0) as total_billed_amount
    FROM patients p
    LEFT JOIN insurance_providers ip ON p.insurance_provider_id = ip.id
    LEFT JOIN referring_physicians rp ON p.referring_physician_code = rp.code
    LEFT JOIN centers c ON p.center_id = c.id
    LEFT JOIN studies s ON p.id = s.patient_id AND s.active = true
    LEFT JOIN patient_bills pb ON p.id = pb.patient_id AND pb.active = true
    ${whereClause}
    GROUP BY p.id, ip.name, rp.name, c.name
    ORDER BY p.name
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Patient Demographics Report',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generateStudyReportsReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE s.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(s.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  // Add modality filter
  if (filters.modality) {
    whereClause += ` AND sm.modality = $${queryParams.length + 1}`;
    queryParams.push(filters.modality);
  }

  // Add radiologist filter
  if (filters.radiologist_id) {
    whereClause += ` AND s.radiologist_code = $${queryParams.length + 1}`;
    queryParams.push(filters.radiologist_id);
  }

  const query = `
    SELECT 
      s.id, s.study_code, s.patient_id, s.status, s.created_at, s.report_date,
      s.radiologist_code, s.reporting_rate,
      p.name as patient_name,
      p.phone as patient_phone,
      sm.modality, sm.study_name,
      rm.name as radiologist_name,
      rm.type as radiologist_type,
      c.name as center_name,
      pb.total_amount as bill_amount,
      pb.status as bill_status
    FROM studies s
    LEFT JOIN patients p ON s.patient_id = p.id
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
    LEFT JOIN centers c ON s.center_id = c.id
    LEFT JOIN patient_bills pb ON s.patient_id = pb.patient_id AND pb.active = true
    ${whereClause}
    ORDER BY s.created_at DESC
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Study Reports Summary',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generateBillingReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE pb.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(pb.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND pb.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND pb.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  const query = `
    SELECT 
      pb.id, pb.invoice_number, pb.patient_id, pb.total_amount, pb.paid_amount,
      pb.pending_amount, pb.status, pb.created_at, pb.due_date,
      p.name as patient_name,
      p.phone as patient_phone,
      p.has_insurance,
      ip.name as insurance_provider_name,
      c.name as center_name,
      COUNT(s.id) as study_count,
      STRING_AGG(sm.modality, ', ') as modalities
    FROM patient_bills pb
    LEFT JOIN patients p ON pb.patient_id = p.id
    LEFT JOIN insurance_providers ip ON p.insurance_provider_id = ip.id
    LEFT JOIN centers c ON pb.center_id = c.id
    LEFT JOIN studies s ON p.id = s.patient_id AND s.active = true
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    ${whereClause}
    GROUP BY pb.id, p.name, p.phone, p.has_insurance, ip.name, c.name
    ORDER BY pb.created_at DESC
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Billing and Revenue Report',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generateRadiologistPerformanceReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE s.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(s.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  const query = `
    SELECT 
      rm.radiologist_code, rm.name as radiologist_name, rm.type as radiologist_type,
      rm.specialty, rm.contact_phone, rm.email,
      COUNT(s.id) as total_studies,
      COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
      COUNT(CASE WHEN s.status = 'pending' THEN 1 END) as pending_studies,
      COUNT(CASE WHEN s.status = 'in_progress' THEN 1 END) as in_progress_studies,
      COALESCE(SUM(s.reporting_rate), 0) as total_earnings,
      COALESCE(AVG(s.reporting_rate), 0) as avg_rate_per_study,
      COUNT(DISTINCT s.patient_id) as unique_patients,
      STRING_AGG(DISTINCT sm.modality, ', ') as modalities_reported,
      c.name as center_name
    FROM radiologist_master rm
    LEFT JOIN studies s ON rm.radiologist_code = s.radiologist_code
    LEFT JOIN study_master sm ON s.study_code = sm.study_code
    LEFT JOIN centers c ON s.center_id = c.id
    ${whereClause}
    GROUP BY rm.radiologist_code, rm.name, rm.type, rm.specialty, rm.contact_phone, rm.email, c.name
    ORDER BY total_studies DESC
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Radiologist Performance Report',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generateModalityUtilizationReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE s.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(s.created_at) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND s.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  const query = `
    SELECT 
      sm.modality, sm.study_name,
      COUNT(s.id) as total_studies,
      COUNT(DISTINCT s.patient_id) as unique_patients,
      COUNT(DISTINCT s.radiologist_code) as radiologists_count,
      COALESCE(SUM(pb.total_amount), 0) as total_revenue,
      COALESCE(AVG(pb.total_amount), 0) as avg_revenue_per_study,
      COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
      COUNT(CASE WHEN s.status = 'pending' THEN 1 END) as pending_studies,
      c.name as center_name
    FROM study_master sm
    LEFT JOIN studies s ON sm.study_code = s.study_code
    LEFT JOIN patient_bills pb ON s.patient_id = pb.patient_id AND pb.active = true
    LEFT JOIN centers c ON s.center_id = c.id
    ${whereClause}
    GROUP BY sm.modality, sm.study_name, c.name
    ORDER BY total_studies DESC
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Modality Utilization Report',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generateEmployeeAttendanceReport(user, filters, date_from, date_to) {
  let whereClause = 'WHERE e.active = true';
  let queryParams = [];

  // Add date filter
  if (date_from && date_to) {
    whereClause += ` AND DATE(a.attendance_date) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
    queryParams.push(date_from, date_to);
  }

  // Add center filter
  if (filters.center_id) {
    whereClause += ` AND e.center_id = $${queryParams.length + 1}`;
    queryParams.push(filters.center_id);
  } else if (!user.is_corporate_role && !user.can_access_all_centers) {
    whereClause += ` AND e.center_id = $${queryParams.length + 1}`;
    queryParams.push(user.center_id);
  }

  const query = `
    SELECT 
      e.id, e.employee_code, e.name, e.department, e.position,
      COUNT(a.id) as total_days,
      COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_days,
      COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_days,
      COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_days,
      COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) as half_day_days,
      ROUND(
        (COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) + 
         COUNT(CASE WHEN a.status = 'HALF_DAY' THEN 1 END) * 0.5) / 
        NULLIF(COUNT(a.id), 0) * 100, 2
      ) as attendance_percentage,
      e.basic_salary,
      c.name as center_name
    FROM employees e
    LEFT JOIN attendance a ON e.id = a.employee_id
    LEFT JOIN centers c ON e.center_id = c.id
    ${whereClause}
    GROUP BY e.id, e.employee_code, e.name, e.department, e.position, e.basic_salary, c.name
    ORDER BY e.name
  `;

  const result = await pool.query(query, queryParams);
  return {
    title: 'Employee Attendance Report',
    generated_by: user.name,
    generated_at: new Date(),
    filters: { date_from, date_to, ...filters },
    data: result.rows
  };
}

async function generatePDFReport(reportId, reportData) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${reportData.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2c3e50; }
        .header p { color: #7f8c8d; }
        .filters { background: #f8f9fa; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
        .filters h3 { margin-top: 0; color: #495057; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .table th { background-color: #f2f2f2; font-weight: bold; }
        .table tr:nth-child(even) { background-color: #f9f9f9; }
        .summary { background: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .summary h3 { margin-top: 0; color: #1976d2; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${reportData.title}</h1>
        <p>Generated by: ${reportData.generated_by} on ${reportData.generated_at.toLocaleString()}</p>
      </div>
      
      <div class="filters">
        <h3>Filters Applied</h3>
        <p>Date Range: ${reportData.filters.date_from || 'All'} to ${reportData.filters.date_to || 'All'}</p>
        <p>Center: ${reportData.filters.center_id || 'All'}</p>
        <p>Modality: ${reportData.filters.modality || 'All'}</p>
      </div>
      
      <div class="summary">
        <h3>Summary</h3>
        <p>Total Records: ${reportData.data.length}</p>
      </div>
      
      <table class="table">
        <thead>
          <tr>
            ${Object.keys(reportData.data[0] || {}).map(key => `<th>${key.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${reportData.data.map(row => `
            <tr>
              ${Object.values(row).map(value => `<td>${value || '-'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  await page.setContent(html);
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    }
  });

  await browser.close();

  return {
    buffer: pdfBuffer,
    fileName: `${reportData.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  };
}

async function generateExcelReport(reportId, reportData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(reportData.title);

  // Add headers
  const headers = Object.keys(reportData.data[0] || {});
  worksheet.addRow(headers.map(h => h.replace(/_/g, ' ').toUpperCase()));

  // Add data
  reportData.data.forEach(row => {
    worksheet.addRow(Object.values(row));
  });

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3F2FD' }
  };

  // Auto-fit columns
  worksheet.columns.forEach(column => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    fileName: `${reportData.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
  };
}

module.exports = router;
