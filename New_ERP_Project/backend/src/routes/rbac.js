const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');

const router = express.Router();

// RBAC MIDDLEWARE - Check user permissions
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get user's role and permissions
      const userQuery = `
        SELECT 
          u.id, u.name, u.email, u.role, u.center_id,
          ur.permissions, ur.is_corporate_role,
          c.name as center_name
        FROM users u
        LEFT JOIN user_roles ur ON u.role = ur.role
        LEFT JOIN centers c ON u.center_id = c.id
        WHERE u.id = $1 AND u.active = true
      `;

      const userResult = await pool.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const userPermissions = user.permissions || [];

      // Check if user has the required permission
      const hasPermission = userPermissions.includes(permission) || userPermissions.includes('ALL_ACCESS');

      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Add user info to request for further use
      req.user = user;
      req.userPermissions = userPermissions;

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// ROLE MANAGEMENT

// Get all roles
router.get('/roles', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    
    let whereClause = '1=1';
    if (active_only === 'true') {
      whereClause += ' AND ur.active = true';
    }

    const query = `
      SELECT 
        ur.*,
        COUNT(u.id) as user_count
      FROM user_roles ur
      LEFT JOIN users u ON ur.role = u.role AND u.active = true
      WHERE ${whereClause}
      GROUP BY ur.id
      ORDER BY ur.role
    `;

    const result = await pool.query(query);
    
    res.json({
      success: true,
      roles: result.rows,
      filters: {
        active_only
      }
    });

  } catch (error) {
    logger.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new role
router.post('/roles', [
  body('role').trim().isLength({ min: 2, max: 50 }),
  body('role_name').trim().isLength({ min: 3, max: 100 }),
  body('description').trim().isLength({ min: 5, max: 500 }),
  body('permissions').isArray(),
  body('dashboard_widgets').isArray(),
  body('report_access').isArray(),
  body('is_corporate_role').isBoolean(),
  body('can_access_all_centers').isBoolean(),
  body('allowed_centers').isArray(),
  body('notes').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      role,
      role_name,
      description,
      permissions,
      dashboard_widgets,
      report_access,
      is_corporate_role,
      can_access_all_centers,
      allowed_centers,
      notes
    } = req.body;

    // Check if role already exists
    const existingRole = await pool.query(
      'SELECT id FROM user_roles WHERE role = $1 AND active = true',
      [role]
    );

    if (existingRole.rows.length > 0) {
      return res.status(400).json({ error: 'Role already exists' });
    }

    // Validate permissions
    const validPermissions = await getValidPermissions();
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
    }

    const query = `
      INSERT INTO user_roles (
        role, role_name, description, permissions, dashboard_widgets, report_access,
        is_corporate_role, can_access_all_centers, allowed_centers, notes,
        created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), true
      )
    `;

    await pool.query(query, [
      role, role_name, description, JSON.stringify(permissions), 
      JSON.stringify(dashboard_widgets), JSON.stringify(report_access),
      is_corporate_role, can_access_all_centers, allowed_centers, notes
    ]);

    logger.info(`Role created: ${role} - ${role_name}`);

    res.status(201).json({
      message: 'Role created successfully',
      role: {
        role,
        role_name,
        description,
        permissions,
        dashboard_widgets,
        report_access,
        is_corporate_role,
        can_access_all_centers,
        allowed_centers,
        notes
      }
    });

  } catch (error) {
    logger.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role
router.put('/roles/:id', [
  body('role_name').trim().isLength({ min: 3, max: 100 }),
  body('description').trim().isLength({ min: 5, max: 500 }),
  body('permissions').isArray(),
  body('dashboard_widgets').isArray(),
  body('report_access').isArray(),
  body('is_corporate_role').isBoolean(),
  body('can_access_all_centers').isBoolean(),
  body('allowed_centers').isArray(),
  body('notes').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const {
      role_name,
      description,
      permissions,
      dashboard_widgets,
      report_access,
      is_corporate_role,
      can_access_all_centers,
      allowed_centers,
      notes
    } = req.body;

    // Check if role exists
    const existingRole = await pool.query(
      'SELECT id FROM user_roles WHERE id = $1 AND active = true',
      [id]
    );

    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Validate permissions
    const validPermissions = await getValidPermissions();
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
    }

    // Update role
    await pool.query(
      `UPDATE user_roles SET 
        role_name = $1, description = $2, permissions = $3, dashboard_widgets = $4,
        report_access = $5, is_corporate_role = $6, can_access_all_centers = $7,
        allowed_centers = $8, notes = $9, updated_at = NOW()
      WHERE id = $10 AND active = true`,
      [
        role_name, description, JSON.stringify(permissions), 
        JSON.stringify(dashboard_widgets), JSON.stringify(report_access),
        is_corporate_role, can_access_all_centers, allowed_centers, notes, id
      ]
    );

    logger.info(`Role updated: ID ${id} - ${role_name}`);

    res.json({
      message: 'Role updated successfully',
      role: {
        id,
        role_name,
        description,
        permissions,
        dashboard_widgets,
        report_access,
        is_corporate_role,
        can_access_all_centers,
        allowed_centers,
        notes
      }
    });

  } catch (error) {
    logger.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete role (soft delete)
router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if role exists
    const existingRole = await pool.query(
      'SELECT id FROM user_roles WHERE id = $1 AND active = true',
      [id]
    );

    if (existingRole.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if role is assigned to users
    const usersWithRole = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE role = (SELECT role FROM user_roles WHERE id = $1) AND active = true',
      [id]
    );

    if (parseInt(usersWithRole.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role assigned to users' });
    }

    // Soft delete role
    await pool.query(
      'UPDATE user_roles SET active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Role deleted: ${id}`);

    res.json({
      message: 'Role deleted successfully'
    });

  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PERMISSION MANAGEMENT

// Get all available permissions (flat list + grouped by module)
router.get('/permissions', async (req, res) => {
  try {
    const [permissions, groups] = await Promise.all([getValidPermissions(), getGroupedPermissions()]);
    res.json({ success: true, permissions, groups });
  } catch (error) {
    logger.error('Get permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard widgets
router.get('/dashboard-widgets', async (req, res) => {
  try {
    const widgets = await getValidDashboardWidgets();
    
    res.json({
      success: true,
      widgets
    });

  } catch (error) {
    logger.error('Get dashboard widgets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get report types
router.get('/report-types', async (req, res) => {
  try {
    const reportTypes = await getValidReportTypes();
    
    res.json({
      success: true,
      report_types: reportTypes
    });

  } catch (error) {
    logger.error('Get report types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// USER ROLE ASSIGNMENT

// Assign role to user
router.post('/users/:userId/assign-role', [
  body('role').trim().isLength({ min: 2, max: 50 }),
  body('center_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const { role, center_id } = req.body;

    // Check if user exists
    const userQuery = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND active = true',
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if role exists
    const roleQuery = await pool.query(
      'SELECT * FROM user_roles WHERE role = $1 AND active = true',
      [role]
    );

    if (roleQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const roleData = roleQuery.rows[0];

    // Validate center access
    if (!roleData.is_corporate_role && !roleData.can_access_all_centers && center_id) {
      if (!roleData.allowed_centers.includes(center_id)) {
        return res.status(400).json({ error: 'User does not have access to this center' });
      }
    }

    // Update user role
    await pool.query(
      'UPDATE users SET role = $1, center_id = $2, updated_at = NOW() WHERE id = $3 AND active = true',
      [role, center_id, userId]
    );

    logger.info(`Role assigned to user: ${userId} - ${role}`);

    res.json({
      message: 'Role assigned successfully',
      user_role: {
        user_id: userId,
        role,
        center_id,
        role_name: roleData.role_name,
        permissions: roleData.permissions,
        dashboard_widgets: roleData.dashboard_widgets,
        report_access: roleData.report_access
      }
    });

  } catch (error) {
    logger.error('Assign role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user permissions
router.get('/users/:userId/permissions', async (req, res) => {
  try {
    const { userId } = req.params;

    const query = `
      SELECT 
        u.id, u.name, u.email, u.role, u.center_id,
        ur.role_name, ur.permissions, ur.dashboard_widgets, ur.report_access,
        ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
        c.name as center_name
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE u.id = $1 AND u.active = true
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        role_name: user.role_name,
        center_id: user.center_id,
        center_name: user.center_name,
        permissions: user.permissions || [],
        dashboard_widgets: user.dashboard_widgets || [],
        report_access: user.report_access || [],
        is_corporate_role: user.is_corporate_role,
        can_access_all_centers: user.can_access_all_centers,
        allowed_centers: user.allowed_centers || []
      }
    });

  } catch (error) {
    logger.error('Get user permissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DASHBOARD ACCESS

// Get user dashboard configuration
router.get('/dashboard/config', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query = `
      SELECT 
        u.id, u.name, u.role, u.center_id,
        ur.dashboard_widgets, ur.report_access,
        ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers,
        c.name as center_name
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      WHERE u.id = $1 AND u.active = true
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get available centers for user
    let availableCenters = [];
    if (user.is_corporate_role || user.can_access_all_centers) {
      const centersQuery = 'SELECT id, name FROM centers WHERE active = true ORDER BY name';
      const centersResult = await pool.query(centersQuery);
      availableCenters = centersResult.rows;
    } else if (user.allowed_centers && user.allowed_centers.length > 0) {
      const centersQuery = 'SELECT id, name FROM centers WHERE id = ANY($1) AND active = true ORDER BY name';
      const centersResult = await pool.query(centersQuery, [user.allowed_centers]);
      availableCenters = centersResult.rows;
    } else if (user.center_id) {
      const centersQuery = 'SELECT id, name FROM centers WHERE id = $1 AND active = true';
      const centersResult = await pool.query(centersQuery, [user.center_id]);
      availableCenters = centersResult.rows;
    }

    res.json({
      success: true,
      dashboard_config: {
        user_id: user.id,
        user_name: user.name,
        role: user.role,
        center_id: user.center_id,
        center_name: user.center_name,
        dashboard_widgets: user.dashboard_widgets || [],
        report_access: user.report_access || [],
        available_centers: availableCenters,
        is_corporate_role: user.is_corporate_role,
        can_access_all_centers: user.can_access_all_centers
      }
    });

  } catch (error) {
    logger.error('Get dashboard config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REPORT ACCESS CONTROL

// Check if user can access report
router.get('/reports/:reportType/check-access', async (req, res) => {
  try {
    const userId = req.user?.id;
    const { reportType } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query = `
      SELECT ur.report_access
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reportAccess = result.rows[0].report_access || [];
    const hasAccess = reportAccess.includes(reportType) || reportAccess.includes('ALL_REPORTS');

    res.json({
      success: true,
      has_access: hasAccess,
      report_type: reportType
    });

  } catch (error) {
    logger.error('Check report access error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CENTER ACCESS CONTROL

// Get user's accessible centers
router.get('/centers/accessible', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const query = `
      SELECT 
        u.id, u.name, u.role, u.center_id,
        ur.is_corporate_role, ur.can_access_all_centers, ur.allowed_centers
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      WHERE u.id = $1 AND u.active = true
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    let accessibleCenters = [];

    if (user.is_corporate_role || user.can_access_all_centers) {
      const centersQuery = 'SELECT id, name, city, state FROM centers WHERE active = true ORDER BY name';
      const centersResult = await pool.query(centersQuery);
      accessibleCenters = centersResult.rows;
    } else if (user.allowed_centers && user.allowed_centers.length > 0) {
      const centersQuery = 'SELECT id, name, city, state FROM centers WHERE id = ANY($1) AND active = true ORDER BY name';
      const centersResult = await pool.query(centersQuery, [user.allowed_centers]);
      accessibleCenters = centersResult.rows;
    } else if (user.center_id) {
      const centersQuery = 'SELECT id, name, city, state FROM centers WHERE id = $1 AND active = true';
      const centersResult = await pool.query(centersQuery, [user.center_id]);
      accessibleCenters = centersResult.rows;
    }

    res.json({
      success: true,
      accessible_centers: accessibleCenters,
      user_info: {
        user_id: user.id,
        user_name: user.name,
        role: user.role,
        is_corporate_role: user.is_corporate_role,
        can_access_all_centers: user.can_access_all_centers
      }
    });

  } catch (error) {
    logger.error('Get accessible centers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RBAC STATISTICS

// Get RBAC statistics
router.get('/statistics', async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_roles,
        COUNT(CASE WHEN is_corporate_role = true THEN 1 END) as corporate_roles,
        COUNT(CASE WHEN can_access_all_centers = true THEN 1 END) as all_center_roles,
        COUNT(u.id) as total_users,
        COUNT(DISTINCT u.center_id) as centers_with_users
      FROM user_roles ur
      LEFT JOIN users u ON ur.role = u.role AND u.active = true
      WHERE ur.active = true
    `;

    const result = await pool.query(query);

    // Get role distribution
    const roleDistributionQuery = `
      SELECT 
        ur.role, ur.role_name, ur.is_corporate_role,
        COUNT(u.id) as user_count
      FROM user_roles ur
      LEFT JOIN users u ON ur.role = u.role AND u.active = true
      WHERE ur.active = true
      GROUP BY ur.role, ur.role_name, ur.is_corporate_role
      ORDER BY user_count DESC
    `;

    const roleDistributionResult = await pool.query(roleDistributionQuery);

    res.json({
      success: true,
      statistics: result.rows[0],
      role_distribution: roleDistributionResult.rows
    });

  } catch (error) {
    logger.error('Get RBAC statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Maps permission prefix → group label (order matters for display)
const PERM_GROUP_LABELS = {
  USER:        'User Management',
  PATIENT:     'Patient Management',
  PHYSICIAN:   'Patient Management',
  STUDY:       'Study Management',
  RADIOLOGY:   'Radiology Reporting',
  RADIOLOGIST: 'Radiologist',
  BILLING:     'Billing',
  BILL:        'Billing',
  INSURANCE:   'Insurance',
  SERVICE:     'Service Management',
  CENTER:      'Center Management',
  EMPLOYEE:    'HR & Payroll',
  PAYROLL:     'HR & Payroll',
  VENDOR:      'Vendor & AP',
  INVENTORY:   'Inventory & Procurement',
  PR:          'Inventory & Procurement',
  PO:          'Inventory & Procurement',
  GRN:         'Inventory & Procurement',
  ASSET:       'Assets',
  LOANER:      'Assets',
  SCANNER:     'Equipment & Scanners',
  JE:          'Finance',
  COA:         'Finance',
  PETTY:       'Finance',
  GST:         'GST Management',
  EXPENSE:     'Expense Tracking',
  EQUITY:      'Equity & Capital',
  MWL:         'DICOM MWL Gateway',
  MASTER:      'Master Data',
  WHATSAPP:    'WhatsApp Integration',
  REPORTS:     'Reports',
  DASHBOARD:   'Dashboard',
  SYSTEM:      'System',
  ALL:         'System',
};

// Derives the group label for a permission string
function permGroup(perm) {
  const prefix = perm.split('_')[0];
  return PERM_GROUP_LABELS[prefix] || 'Other';
}

// All permissions that must always appear in the role editor, even if no role has them yet.
// Add new module permissions here when a new module is built.
const KNOWN_PERMISSIONS = [
  // Patient & Study
  'PATIENT_VIEW','PATIENT_CREATE','PATIENT_EDIT','PATIENT_DELETE',
  'STUDY_VIEW','STUDY_CREATE','STUDY_EDIT',
  'RADIOLOGY_VIEW','RADIOLOGY_REPORT','RADIOLOGY_APPROVE',
  'RADIOLOGIST_VIEW','RADIOLOGIST_CREATE','RADIOLOGIST_EDIT',
  // Billing & Finance
  'BILLING_VIEW','BILLING_CREATE','BILLING_EDIT','BILLING_DELETE','BILLING_REFUND',
  'BILL_VIEW','BILL_CREATE','BILL_EDIT',
  'INSURANCE_VIEW','INSURANCE_CREATE','INSURANCE_EDIT',
  'JE_VIEW','JE_CREATE','JE_EDIT','JE_APPROVE','JE_POST',
  'COA_VIEW','COA_CREATE','COA_EDIT',
  'PETTY_CASH_VIEW','PETTY_CASH_CREATE','PETTY_CASH_APPROVE',
  'GST_VIEW','GST_RECONCILE',
  'EXPENSE_VIEW','EXPENSE_CREATE','EXPENSE_APPROVE',
  'EQUITY_VIEW','EQUITY_CREATE',
  // MWL Gateway
  'MWL_VIEW','MWL_MANAGE',
  // HR & Payroll
  'EMPLOYEE_VIEW','EMPLOYEE_CREATE','EMPLOYEE_EDIT',
  'PAYROLL_VIEW','PAYROLL_CREATE','PAYROLL_APPROVE',
  // Assets & Inventory
  'ASSET_VIEW','ASSET_CREATE','ASSET_EDIT',
  'ASSET_MAINTENANCE_VIEW','ASSET_MAINTENANCE_CREATE',
  'LOANER_VIEW','LOANER_CREATE',
  'INVENTORY_VIEW','INVENTORY_CREATE','INVENTORY_EDIT',
  'PO_VIEW','PO_CREATE','PO_APPROVE',
  'PR_VIEW','PR_CREATE',
  'GRN_VIEW','GRN_CREATE',
  // Center & Vendor
  'CENTER_VIEW','CENTER_CREATE','CENTER_EDIT',
  'VENDOR_VIEW','VENDOR_CREATE','VENDOR_EDIT',
  // Service & Physician
  'SERVICE_VIEW','SERVICE_CREATE','SERVICE_EDIT',
  'PHYSICIAN_VIEW','PHYSICIAN_CREATE','PHYSICIAN_EDIT',
  // Scanner & Equipment
  'SCANNER_VIEW','SCANNER_CREATE','SCANNER_EDIT',
  // Master Data, Reports & System
  'MASTER_DATA_VIEW','MASTER_DATA_CREATE','MASTER_DATA_EDIT',
  'REPORTS_VIEW','REPORTS_EXPORT',
  'DASHBOARD_VIEW',
  'WHATSAPP_VIEW','WHATSAPP_SEND',
  'USER_VIEW','USER_CREATE','USER_EDIT','USER_DELETE','USER_ASSIGN_ROLE',
  'SYSTEM_ADMIN','ALL_ACCESS',
];

// Helper functions
async function getValidPermissions() {
  // Pull all distinct permissions from active roles in the DB
  const { rows } = await pool.query(`
    SELECT DISTINCT jsonb_array_elements_text(permissions) AS perm
    FROM user_roles
    WHERE active = true AND jsonb_typeof(permissions) = 'array'
    ORDER BY perm
  `);
  const dbPerms = new Set(rows.map(r => r.perm));
  // Merge with KNOWN_PERMISSIONS so new module perms always appear in the editor
  for (const p of KNOWN_PERMISSIONS) dbPerms.add(p);
  return Array.from(dbPerms).sort();
}

// Returns permissions grouped by module for the UI
async function getGroupedPermissions() {
  const perms = await getValidPermissions();
  const groupMap = {};
  for (const perm of perms) {
    const label = permGroup(perm);
    if (!groupMap[label]) groupMap[label] = [];
    groupMap[label].push(perm);
  }
  // Return as ordered array matching PERM_GROUP_LABELS order
  const seen = new Set();
  const ordered = [];
  for (const label of Object.values(PERM_GROUP_LABELS)) {
    if (!seen.has(label) && groupMap[label]) {
      seen.add(label);
      ordered.push({ label, perms: groupMap[label] });
    }
  }
  // Append any groups not covered by the map
  for (const [label, perms] of Object.entries(groupMap)) {
    if (!seen.has(label)) ordered.push({ label, perms });
  }
  return ordered;
}

async function getValidDashboardWidgets() {
  return [
    // Clinical Widgets
    'PATIENT_COUNT', 'STUDY_COUNT', 'PENDING_REPORTS', 'COMPLETED_REPORTS',
    'RADIOLOGIST_WORKLOAD', 'MODALITY_BREAKDOWN',
    
    // Financial Widgets
    'REVENUE_SUMMARY', 'BILLING_SUMMARY', 'PAYMENT_STATUS', 'EXPENSE_SUMMARY',
    'PROFIT_LOSS', 'REVENUE_CHART',
    
    // Operational Widgets
    'CENTER_UTILIZATION', 'SCANNER_UTILIZATION', 'STAFF_ATTENDANCE',
    'INVENTORY_STATUS', 'VENDOR_PAYMENTS', 'MAINTENANCE_SCHEDULE',
    
    // Administrative Widgets
    'USER_ACTIVITY', 'SYSTEM_STATUS', 'AUDIT_LOGS', 'COMPLIANCE_STATUS',
    'LICENSING_STATUS', 'TRAINING_STATUS',
    
    // All Widgets
    'ALL_WIDGETS'
  ];
}

async function getValidReportTypes() {
  return [
    // Patient Reports
    'PATIENT_DEMOGRAPHICS', 'PATIENT_HISTORY', 'PATIENT_BILLING',
    'PATIENT_INSURANCE', 'PATIENT_REFERRALS',
    
    // Clinical Reports
    'STUDY_REPORTS', 'RADIOLOGIST_PERFORMANCE', 'MODALITY_UTILIZATION',
    'REPORTING_TAT', 'QUALITY_METRICS',
    
    // Financial Reports
    'REVENUE_REPORT', 'BILLING_REPORT', 'PAYMENT_REPORT', 'EXPENSE_REPORT',
    'PROFIT_LOSS_REPORT', 'TAX_REPORT',
    
    // Employee Reports
    'EMPLOYEE_ATTENDANCE', 'EMPLOYEE_PAYROLL', 'EMPLOYEE_PERFORMANCE',
    'STAFF_SALARY', 'STAFF_BENEFITS',
    
    // Inventory Reports
    'INVENTORY_STOCK', 'INVENTORY_PURCHASE', 'INVENTORY_CONSUMPTION',
    'VENDOR_REPORT', 'SUPPLY_CHAIN',
    
    // Administrative Reports
    'USER_ACTIVITY_REPORT', 'SYSTEM_USAGE_REPORT', 'COMPLIANCE_REPORT',
    'AUDIT_REPORT', 'SECURITY_REPORT',
    
    // All Reports
    'ALL_REPORTS'
  ];
}

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

// GET all users with role info
router.get('/users', async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    const where = active_only === 'true' ? 'WHERE u.active = true' : '';
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.name,
             u.phone, u.role, u.center_id, u.active, u.last_login, u.created_at,
             ur.role_name, c.name AS center_name
      FROM users u
      LEFT JOIN user_roles ur ON u.role = ur.role
      LEFT JOIN centers c ON u.center_id = c.id
      ${where}
      ORDER BY COALESCE(u.name, u.username)
    `);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create user
router.post('/users', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').trim().isLength({ min: 2, max: 50 }).withMessage('Role is required'),
  body('first_name').optional({ checkFalsy: true }).trim(),
  body('last_name').optional({ checkFalsy: true }).trim(),
  body('phone').optional({ checkFalsy: true }).trim(),
  body('center_id').optional({ checkFalsy: true }).isInt(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, first_name, last_name, role, center_id, phone } = req.body;

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const roleCheck = await pool.query(
      'SELECT role FROM user_roles WHERE role = $1 AND active = true', [role]
    );
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Role not found' });
    }

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 12);
    const name = [first_name, last_name].filter(Boolean).join(' ') || username;

    const result = await pool.query(`
      INSERT INTO users (username, email, password_hash, first_name, last_name, name, phone, role, center_id, active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
      RETURNING id, username, email, first_name, last_name, name, role, center_id, active
    `, [username, email, password_hash, first_name || null, last_name || null, name,
        phone || null, role, center_id || null]);

    logger.info('User created:', { username, email, role });
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update user
router.put('/users/:id', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('role').trim().isLength({ min: 2, max: 50 }).withMessage('Role is required'),
  body('first_name').optional({ checkFalsy: true }).trim(),
  body('last_name').optional({ checkFalsy: true }).trim(),
  body('phone').optional({ checkFalsy: true }).trim(),
  body('center_id').optional({ checkFalsy: true }).isInt(),
  body('active').isBoolean(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { email, first_name, last_name, role, center_id, phone, active } = req.body;

    const dupCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use by another user' });
    }

    const roleCheck = await pool.query(
      'SELECT role FROM user_roles WHERE role = $1 AND active = true', [role]
    );
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Role not found' });
    }

    const name = [first_name, last_name].filter(Boolean).join(' ');

    const result = await pool.query(`
      UPDATE users
      SET email=$1, first_name=$2, last_name=$3, name=NULLIF($4,''), phone=$5,
          role=$6, center_id=$7, active=$8, updated_at=NOW()
      WHERE id=$9
      RETURNING id, username, email, first_name, last_name, name, role, center_id, active
    `, [email, first_name || null, last_name || null, name, phone || null,
        role, center_id || null, active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('User updated:', { id, email, role });
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST reset user password
router.post('/users/:id/reset-password', [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { password } = req.body;
    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'UPDATE users SET password_hash=$1, failed_login_attempts=0, locked_until=NULL, updated_at=NOW() WHERE id=$2 RETURNING id',
      [password_hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    logger.info('Password reset for user:', { id });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE user (soft delete)
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE users SET active=false, updated_at=NOW() WHERE id=$1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    logger.info('User soft-deleted:', { id });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.checkPermission = checkPermission;
