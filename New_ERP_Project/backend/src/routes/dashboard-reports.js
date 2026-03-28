const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const puppeteer = require('puppeteer-core');
const ExcelJS = require('exceljs');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('DASHBOARD_VIEW'));

// VISUALLY RICH DASHBOARD

// ── GET /stats — lightweight KPI endpoint ─────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const results = await Promise.allSettled([
      pool.query(`SELECT COUNT(*) FROM patients WHERE DATE(created_at) = CURRENT_DATE`),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM billing WHERE DATE(created_at) = CURRENT_DATE AND payment_status != 'CANCELLED'`),
      pool.query(`SELECT COUNT(*) FROM studies WHERE status IN ('PENDING','IN_PROGRESS') AND active = true`),
      pool.query(`SELECT COUNT(*) FROM centers WHERE active = true`),
      pool.query(`SELECT COUNT(*) FROM procurement_orders WHERE status IN ('DRAFT','PENDING','APPROVED','ISSUED') AND active = true`),
      pool.query(`SELECT COUNT(*) FROM item_master WHERE item_type='STOCK' AND active=true AND current_stock <= reorder_level AND reorder_level > 0`),
      pool.query(`SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'`),
      pool.query(`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM billing WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE) AND payment_status != 'CANCELLED'`),
    ]);

    const safe = (r) => {
      if (r.status === 'fulfilled' && r.value.rows[0]) {
        return parseInt(r.value.rows[0].count || 0);
      }
      return 0;
    };
    const safeFloat = (r) => {
      if (r.status === 'fulfilled' && r.value.rows[0]) {
        return parseFloat(r.value.rows[0].revenue || 0);
      }
      return 0;
    };

    res.json({
      success: true,
      today_patients:  safe(results[0]),
      revenue_today:   safeFloat(results[1]),
      pending_reports: safe(results[2]),
      active_centers:  safe(results[3]),
      pending_pos:     safe(results[4]),
      low_stock_items: safe(results[5]),
      pending_leaves:  safe(results[6]),
      monthly_revenue: safeFloat(results[7]),
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const userResult = await pool.query(userQuery, [req.user.id]);

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
    // Empty / null widgets → load everything (used by the Reports page)
    const widgets = user.dashboard_widgets || [];
    const showAll = widgets.length === 0 || widgets.includes('ALL_WIDGETS');

    const dashboardData = {};

    // Patient Statistics Widget
    if (showAll || widgets.includes('PATIENT_COUNT')) {
      const patientQuery = `
        SELECT
          COUNT(*) as total_patients,
          COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_patients,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_patients,
          COUNT(CASE WHEN DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as month_patients,
          COUNT(CASE WHEN has_insurance = true THEN 1 END) as insured_patients,
          COUNT(CASE WHEN has_insurance = false THEN 1 END) as uninsured_patients
        FROM patients
        WHERE active = true ${centerFilter.replace(/s\.center_id/g, 'center_id')}
      `;
      const patientResult = await pool.query(patientQuery);
      dashboardData.patient_stats = patientResult.rows[0];
    }

    // Study Statistics Widget
    if (showAll || widgets.includes('STUDY_COUNT')) {
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
    if (showAll || widgets.includes('REVENUE_SUMMARY')) {
      const revenueQuery = `
        SELECT
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0) as paid_amount,
          COALESCE(SUM(CASE WHEN payment_status = 'BILLED' THEN total_amount ELSE 0 END), 0) as pending_amount,
          COUNT(*) as total_bills,
          COUNT(CASE WHEN payment_status = 'PAID' THEN 1 END) as paid_bills,
          COUNT(CASE WHEN payment_status = 'BILLED' THEN 1 END) as pending_bills
        FROM patient_bills pb
        WHERE pb.active = true
          ${dateFilter.replace(/s\.created_at/g, 'pb.created_at')}
          ${centerFilter.replace(/s\.center_id/g, 'pb.center_id')}
      `;
      const revenueResult = await pool.query(revenueQuery);
      dashboardData.revenue_stats = revenueResult.rows[0];
    }

    // Modality Breakdown Widget
    if (showAll || widgets.includes('MODALITY_BREAKDOWN')) {
      // Build bill-level date/center filters (patient_bills uses pb.bill_date / pb.center_id)
      let billDateFilter = '';
      if (date_from && date_to) {
        billDateFilter = `AND pb.bill_date BETWEEN '${date_from}' AND '${date_to}'`;
      } else if (period === '7') {
        billDateFilter = "AND pb.bill_date >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (period === '30') {
        billDateFilter = "AND pb.bill_date >= CURRENT_DATE - INTERVAL '30 days'";
      } else if (period === '90') {
        billDateFilter = "AND pb.bill_date >= CURRENT_DATE - INTERVAL '90 days'";
      } else if (period === '365') {
        billDateFilter = "AND pb.bill_date >= CURRENT_DATE - INTERVAL '365 days'";
      }
      let billCenterFilter = '';
      if (center_id) {
        billCenterFilter = `AND pb.center_id = ${center_id}`;
      } else if (!user.is_corporate_role && !user.can_access_all_centers) {
        billCenterFilter = `AND pb.center_id = ${user.center_id}`;
      }

      const modalityQuery = `
        SELECT
          COALESCE(bi.modality, 'Unknown') AS modality,
          COUNT(*) AS study_count,
          COALESCE(SUM(bi.amount), 0) AS revenue
        FROM bill_items bi
        JOIN patient_bills pb ON pb.id = bi.bill_id AND pb.active = true
        WHERE bi.active = true
          AND pb.payment_status = 'PAID'
          ${billDateFilter} ${billCenterFilter}
        GROUP BY COALESCE(bi.modality, 'Unknown')
        ORDER BY study_count DESC
      `;
      const modalityResult = await pool.query(modalityQuery);
      dashboardData.modality_breakdown = modalityResult.rows;
    }

    // Radiologist Workload Widget
    if (showAll || widgets.includes('RADIOLOGIST_WORKLOAD')) {
      const radiologistQuery = `
        SELECT
          rm.radiologist_name,
          rm.radiologist_code,
          COUNT(*) as study_count,
          COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_studies,
          COUNT(CASE WHEN s.status = 'pending' THEN 1 END) as pending_studies,
          COALESCE(SUM(s.reporting_rate), 0) as total_earnings
        FROM studies s
        LEFT JOIN radiologist_master rm ON s.radiologist_code = rm.radiologist_code
        WHERE s.active = true ${dateFilter} ${centerFilter} ${modalityFilter}
        GROUP BY rm.radiologist_name, rm.radiologist_code
        ORDER BY study_count DESC
        LIMIT 10
      `;
      const radiologistResult = await pool.query(radiologistQuery);
      dashboardData.radiologist_workload = radiologistResult.rows;
    }

    // Center Utilization Widget
    if (showAll || widgets.includes('CENTER_UTILIZATION')) {
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
    if (showAll || widgets.includes('REVENUE_CHART')) {
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
    if (showAll || widgets.includes('STAFF_ATTENDANCE')) {
      const attendanceQuery = `
        SELECT 
          COUNT(*) as total_employees,
          COUNT(CASE WHEN a.status = 'PRESENT' THEN 1 END) as present_today,
          COUNT(CASE WHEN a.status = 'ABSENT' THEN 1 END) as absent_today,
          COUNT(CASE WHEN a.status = 'LEAVE' THEN 1 END) as leave_today,
          COUNT(CASE WHEN a.attendance_date = CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as active_last_week
        FROM employees e
        LEFT JOIN attendance a ON e.id = a.employee_id AND a.attendance_date = CURRENT_DATE
        WHERE e.active = true ${centerFilter.replace(/s\.center_id/g, 'e.center_id')}
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
    const userResult = await pool.query(userQuery, [req.user.id]);

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
    const userResult = await pool.query(userQuery, [req.user.id]);

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
    const userResult = await pool.query(userQuery, [req.user.id]);

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
      rm.radiologist_name,
      rm.type as radiologist_type,
      c.name as center_name,
      pb.total_amount as bill_amount,
      pb.payment_status as bill_status
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
      pb.id, pb.invoice_number, pb.patient_id, pb.total_amount,
      pb.payment_status, pb.created_at,
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
      rm.radiologist_code, rm.radiologist_name, rm.type as radiologist_type,
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
    GROUP BY rm.radiologist_code, rm.radiologist_name, rm.type, rm.specialty, rm.contact_phone, rm.contact_email, c.name
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
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
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
    fileName: `${reportData.title.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-CA')}.pdf`
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
    fileName: `${reportData.title.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-CA')}.xlsx`
  };
}

// ── GET /bi-summary — all data for the BI Dashboard in one call ───────────────
router.get('/bi-summary', async (req, res) => {
  try {
    const [kpiRes, dailyRes, modalityRes, centerRes, radCostRes, alertsRes, monthStudiesRes, ebitdaRes] =
      await Promise.all([

        // 1. KPIs — revenue/patients for today, yesterday, this month, last month
        pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN bill_date = CURRENT_DATE                                         THEN total_amount END), 0) AS today_revenue,
            COALESCE(SUM(CASE WHEN bill_date = CURRENT_DATE - 1                                     THEN total_amount END), 0) AS yesterday_revenue,
            COALESCE(SUM(CASE WHEN DATE_TRUNC('month', bill_date) = DATE_TRUNC('month', CURRENT_DATE)                          THEN total_amount END), 0) AS month_revenue,
            COALESCE(SUM(CASE WHEN DATE_TRUNC('month', bill_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')     THEN total_amount END), 0) AS last_month_revenue,
            COUNT(DISTINCT CASE WHEN bill_date = CURRENT_DATE                                       THEN patient_id END) AS today_patients,
            COUNT(DISTINCT CASE WHEN bill_date = CURRENT_DATE - 1                                   THEN patient_id END) AS yesterday_patients,
            COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', bill_date) = DATE_TRUNC('month', CURRENT_DATE) THEN patient_id END) AS month_patients,
            -- for collection rate: billed (PAID + BILLED) vs paid only, this month
            COALESCE(SUM(CASE WHEN DATE_TRUNC('month', bill_date) = DATE_TRUNC('month', CURRENT_DATE) AND payment_status IN ('PAID','BILLED') THEN total_amount END), 0) AS month_total_billed
          FROM patient_bills
          WHERE active = true AND payment_status IN ('PAID', 'BILLED')
        `),

        // 2. Daily revenue — last 30 days
        pool.query(`
          SELECT
            TO_CHAR(bill_date, 'DD Mon') AS day,
            COALESCE(SUM(total_amount), 0) AS revenue,
            COUNT(*)                       AS bills
          FROM patient_bills
          WHERE active = true AND payment_status = 'PAID'
            AND bill_date >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY bill_date
          ORDER BY bill_date
        `),

        // 3. Modality mix — last 30 days
        pool.query(`
          SELECT
            COALESCE(NULLIF(NULLIF(bi.modality, 'N/A'), ''), 'Other') AS modality,
            COUNT(*)                        AS studies,
            COALESCE(SUM(bi.amount), 0)     AS revenue
          FROM bill_items bi
          JOIN patient_bills pb ON pb.id = bi.bill_id AND pb.active = true
          WHERE bi.active = true AND pb.payment_status = 'PAID'
            AND pb.bill_date >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY COALESCE(NULLIF(NULLIF(bi.modality, 'N/A'), ''), 'Other')
          ORDER BY revenue DESC
        `),

        // 4. Center performance — last 30 days
        pool.query(`
          SELECT
            c.name                             AS center,
            COUNT(pb.id)                       AS bills,
            COALESCE(SUM(pb.total_amount), 0)  AS revenue
          FROM patient_bills pb
          JOIN centers c ON c.id = pb.center_id
          WHERE pb.active = true AND pb.payment_status = 'PAID'
            AND pb.bill_date >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY c.id, c.name
          ORDER BY revenue DESC
        `),

        // 5. Radiologist cost — this month
        pool.query(`
          SELECT
            COALESCE(SUM(CASE WHEN DATE_TRUNC('month', COALESCE(report_date, created_at::date)) = DATE_TRUNC('month', CURRENT_DATE)
                              THEN reporting_rate END), 0) AS month_rad_cost,
            COALESCE(SUM(reporting_rate), 0)               AS total_rad_cost
          FROM studies
          WHERE active = true AND reporting_rate IS NOT NULL AND reporting_rate > 0
        `),

        // 6. Alerts
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM item_master         WHERE item_type='STOCK' AND active=true AND current_stock <= reorder_level AND reorder_level > 0) AS low_stock,
            (SELECT COUNT(*) FROM procurement_orders  WHERE status IN ('DRAFT','PENDING','APPROVED','ISSUED') AND active = true) AS pending_pos,
            (SELECT COUNT(*) FROM leave_requests      WHERE status = 'PENDING') AS pending_leaves,
            (SELECT COUNT(*) FROM studies             WHERE active=true AND radiologist_code IS NOT NULL
                                                        AND exam_workflow_status NOT IN ('REPORT_COMPLETED')
                                                        AND created_at >= CURRENT_DATE - INTERVAL '14 days') AS pending_reports
        `),

        // 7. Studies this month (from bill_items — accurate count)
        pool.query(`
          SELECT COUNT(*) AS month_studies
          FROM bill_items bi
          JOIN patient_bills pb ON pb.id = bi.bill_id
          WHERE bi.active = true AND pb.active = true AND pb.payment_status = 'PAID'
            AND pb.bill_date >= DATE_TRUNC('month', CURRENT_DATE)
        `),

        // 8. EBITDA components — staff, overheads, consumables, depreciation (MTD)
        pool.query(`
          SELECT
            -- Staff cost: approved/paid payroll this month
            (SELECT COALESCE(SUM(gross_salary), 0) FROM payroll_register
             WHERE pay_period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)
               AND pay_period_month = EXTRACT(MONTH FROM CURRENT_DATE)
               AND status IN ('PAID','APPROVED')) AS staff_cost,

            -- Overhead: all operational expenses this month
            (SELECT COALESCE(SUM(total_amount), 0) FROM expenses
             WHERE active = true
               AND DATE_TRUNC('month', expense_date) = DATE_TRUNC('month', CURRENT_DATE)) AS overhead_cost,

            -- Consumables: stock issued to studies this month (STOCK_OUT movements)
            (SELECT COALESCE(SUM(ABS(quantity) * unit_cost), 0) FROM inventory_movements
             WHERE movement_type = 'STOCK_OUT'
               AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)) AS consumables_cost,

            -- Depreciation: posted depreciation runs this month
            (SELECT COALESCE(SUM(depreciation_amount), 0) FROM asset_depreciation_runs
             WHERE period_year  = EXTRACT(YEAR  FROM CURRENT_DATE)
               AND period_month = EXTRACT(MONTH FROM CURRENT_DATE)) AS depreciation
        `),
      ]);

    const kpi          = kpiRes.rows[0];
    const radCost      = radCostRes.rows[0];
    const alerts       = alertsRes.rows[0];
    const monthStudies = monthStudiesRes.rows[0];
    const ebitdaComp   = ebitdaRes.rows[0];

    const monthRevenue     = parseFloat(kpi.month_revenue)          || 0;
    const lastMonthRevenue = parseFloat(kpi.last_month_revenue)     || 0;
    const monthTotalBilled = parseFloat(kpi.month_total_billed)     || 0;
    const todayRevenue     = parseFloat(kpi.today_revenue)          || 0;
    const yesterdayRevenue = parseFloat(kpi.yesterday_revenue)      || 0;
    const monthRadCost     = parseFloat(radCost.month_rad_cost)     || 0;
    const staffCost        = parseFloat(ebitdaComp.staff_cost)      || 0;
    const overheadCost     = parseFloat(ebitdaComp.overhead_cost)   || 0;
    const consumablesCost  = parseFloat(ebitdaComp.consumables_cost)|| 0;
    const depreciation     = parseFloat(ebitdaComp.depreciation)    || 0;

    const grossProfit  = monthRevenue - monthRadCost;
    const totalOpex    = monthRadCost + staffCost + overheadCost + consumablesCost;
    const ebitda       = monthRevenue - totalOpex;
    const ebit         = ebitda - depreciation;

    const pct = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

    res.json({
      success: true,
      kpis: {
        today_revenue:        todayRevenue,
        yesterday_revenue:    yesterdayRevenue,
        today_revenue_change: pct(todayRevenue, yesterdayRevenue),
        today_patients:       parseInt(kpi.today_patients)         || 0,
        yesterday_patients:   parseInt(kpi.yesterday_patients)     || 0,
        month_revenue:        monthRevenue,
        last_month_revenue:   lastMonthRevenue,
        month_revenue_change: pct(monthRevenue, lastMonthRevenue),
        month_patients:       parseInt(kpi.month_patients)         || 0,
        month_studies:        parseInt(monthStudies.month_studies)  || 0,
        collection_rate:      monthTotalBilled > 0 ? Math.round((monthRevenue / monthTotalBilled) * 100) : 100,
        gross_profit:         grossProfit,
        gross_margin:         monthRevenue > 0 ? Math.round((grossProfit  / monthRevenue) * 100) : 0,
        ebitda,
        ebitda_margin:        monthRevenue > 0 ? Math.round((ebitda       / monthRevenue) * 100) : 0,
        ebit,
        ebit_margin:          monthRevenue > 0 ? Math.round((ebit         / monthRevenue) * 100) : 0,
      },
      pnl: {
        revenue:       monthRevenue,
        rad_cost:      monthRadCost,
        staff_cost:    staffCost,
        overhead_cost: overheadCost,
        consumables:   consumablesCost,
        total_opex:    totalOpex,
        gross_profit:  grossProfit,
        ebitda,
        depreciation,
        ebit,
      },
      daily_trend:        dailyRes.rows.map(r  => ({ day: r.day, revenue: parseFloat(r.revenue), bills: parseInt(r.bills) })),
      modality_mix:       modalityRes.rows.map(r => ({ modality: r.modality, studies: parseInt(r.studies), revenue: parseFloat(r.revenue) })),
      center_performance: centerRes.rows.map(r  => ({ center: r.center, bills: parseInt(r.bills), revenue: parseFloat(r.revenue) })),
      alerts: {
        low_stock:       parseInt(alerts.low_stock)       || 0,
        pending_pos:     parseInt(alerts.pending_pos)     || 0,
        pending_leaves:  parseInt(alerts.pending_leaves)  || 0,
        pending_reports: parseInt(alerts.pending_reports) || 0,
      },
    });
  } catch (error) {
    logger.error('BI summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
