const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('LOANER_VIEW'));

// Loaner Asset Tracking Class
class LoanerAssetTracking {
  // Get loaner asset summary
  static async getLoanerAssetSummary(filters = {}) {
    try {
      const { asset_type, asset_status, center_id, page = 1, limit = 50 } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (asset_type) {
        whereClause += ` AND am.asset_type = $${paramIndex++}`;
        queryParams.push(asset_type);
      }

      if (asset_status) {
        whereClause += ` AND am.status = $${paramIndex++}`;
        queryParams.push(asset_status);
      }

      if (center_id) {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM loaner_asset_assignments laa 
          WHERE laa.loaner_asset_id = am.id AND laa.center_id = $${paramIndex}
        )`;
        queryParams.push(center_id);
      }

      const offset = (page - 1) * limit;

      const query = `
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
          MAX(lam.maintenance_date) as last_maintenance_date,
          CASE 
            WHEN COUNT(DISTINCT CASE WHEN laa.assignment_status = 'ACTIVE' THEN laa.id END) > 0 THEN 'ASSIGNED'
            WHEN COUNT(DISTINCT CASE WHEN laa.assignment_status = 'DAMAGED' THEN laa.id END) > 0 THEN 'UNDER_MAINTENANCE'
            WHEN COUNT(DISTINCT CASE WHEN laa.assignment_status = 'LOST' THEN laa.id END) > 0 THEN 'LOST'
            ELSE 'AVAILABLE'
          END as current_status
        FROM asset_master am
        LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
        LEFT JOIN loaner_asset_maintenance lam ON am.id = lam.loaner_asset_id AND lam.active = true
        LEFT JOIN loaner_asset_agreements laag ON am.id = laag.loaner_asset_id AND laag.active = true
        LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
        WHERE am.active = true AND ${whereClause}
        GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type, am.status
        ORDER BY am.asset_name
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT am.id) as total
        FROM asset_master am
        LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
        WHERE am.active = true AND ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, queryParams.slice(0, -2))
      ]);

      return {
        assets: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting loaner asset summary:', error);
      throw error;
    }
  }

  // Get consumable-loaner asset mapping
  static async getConsumableLoanerMapping(filters = {}) {
    try {
      const { category_id, has_loaner_asset, page = 1, limit = 50 } = filters;

      let whereClause = 'eim.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (category_id) {
        whereClause += ` AND eim.category_id = $${paramIndex++}`;
        queryParams.push(category_id);
      }

      if (has_loaner_asset !== undefined) {
        if (has_loaner_asset === 'true') {
          whereClause += ` AND am.id IS NOT NULL`;
        } else {
          whereClause += ` AND am.id IS NULL`;
        }
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          eim.id as consumable_id,
          eim.item_code,
          eim.item_name,
          eim.current_stock,
          eim.minimum_stock_level,
          eim.maximum_stock_level,
          eim.supports_loaner_asset,
          eim.loaner_asset_deposit_amount,
          eim.loaner_asset_agreement_required,
          eim.loaner_asset_return_days,
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
          END as has_loaner_asset,
          CASE 
            WHEN am.id IS NOT NULL AND am.status = 'AVAILABLE' THEN 'AVAILABLE'
            WHEN am.id IS NOT NULL AND am.status = 'ASSIGNED' THEN 'ASSIGNED'
            WHEN am.id IS NOT NULL AND am.status = 'UNDER_MAINTENANCE' THEN 'MAINTENANCE'
            WHEN am.id IS NOT NULL AND am.status = 'LOST' THEN 'UNAVAILABLE'
            ELSE 'N/A'
          END as loaner_asset_status_text
        FROM expense_items_master eim
        LEFT JOIN asset_master am ON eim.associated_loaner_asset_id = am.id AND am.active = true
        LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
        LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
        WHERE ${whereClause}
        GROUP BY eim.id, eim.item_code, eim.item_name, eim.current_stock, eim.minimum_stock_level, eim.maximum_stock_level, eim.supports_loaner_asset, eim.loaner_asset_deposit_amount, eim.loaner_asset_agreement_required, eim.loaner_asset_return_days, am.id, am.asset_code, am.asset_name, am.asset_type, am.status
        ORDER BY eim.item_name
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting consumable loaner mapping:', error);
      throw error;
    }
  }

  // Assign loaner asset
  static async assignLoanerAsset(assignmentData) {
    try {
      const {
        loaner_asset_id,
        consumable_item_id,
        center_id,
        department,
        assigned_to_person,
        assigned_to_user_id,
        consumable_quantity_given,
        consumable_unit_cost,
        deposit_amount = 0,
        expected_return_days = 30,
        assigned_by,
        notes
      } = assignmentData;

      const query = `
        SELECT assign_loaner_asset(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) as assignment_id
      `;

      const result = await pool.query(query, [
        loaner_asset_id, consumable_item_id, center_id, department,
        assigned_to_person, assigned_to_user_id, consumable_quantity_given,
        consumable_unit_cost, deposit_amount, expected_return_days, assigned_by, notes
      ]);

      const assignmentId = result.rows[0].assignment_id;

      // Get the complete assignment details
      const assignmentQuery = `
        SELECT 
          laa.*,
          am.asset_code as loaner_asset_code,
          am.asset_name as loaner_asset_name,
          eim.item_code as consumable_code,
          eim.item_name as consumable_name,
          c.name as center_name,
          assigned_user.name as assigned_to_user_name,
          assigning_user.name as assigned_by_name
        FROM loaner_asset_assignments laa
        LEFT JOIN asset_master am ON laa.loaner_asset_id = am.id
        LEFT JOIN expense_items_master eim ON laa.consumable_item_id = eim.id
        LEFT JOIN centers c ON laa.center_id = c.id
        LEFT JOIN users assigned_user ON laa.assigned_to_user_id = assigned_user.id
        LEFT JOIN users assigning_user ON laa.assigned_by = assigning_user.id
        WHERE laa.id = $1
      `;

      const assignmentResult = await pool.query(assignmentQuery, [assignmentId]);

      logger.info(`Loaner asset assigned: ${assignmentResult.rows[0].loaner_asset_code} to ${assignmentResult.rows[0].assigned_to_person}`);
      return assignmentResult.rows[0];
    } catch (error) {
      logger.error('Error assigning loaner asset:', error);
      throw error;
    }
  }

  // Return loaner asset
  static async returnLoanerAsset(returnData) {
    try {
      const {
        assignment_id,
        returned_by,
        condition_at_return = 'GOOD',
        damage_description = null,
        deposit_refund_amount = null,
        notes = null
      } = returnData;

      const query = `
        SELECT return_loaner_asset($1, $2, $3, $4, $5, $6)
      `;

      await pool.query(query, [
        assignment_id, returned_by, condition_at_return, damage_description, deposit_refund_amount, notes
      ]);

      // Get the updated assignment details
      const assignmentQuery = `
        SELECT 
          laa.*,
          am.asset_code as loaner_asset_code,
          am.asset_name as loaner_asset_name,
          eim.item_code as consumable_code,
          eim.item_name as consumable_name,
          c.name as center_name,
          assigned_user.name as assigned_to_user_name,
          returning_user.name as returned_by_name
        FROM loaner_asset_assignments laa
        LEFT JOIN asset_master am ON laa.loaner_asset_id = am.id
        LEFT JOIN expense_items_master eim ON laa.consumable_item_id = eim.id
        LEFT JOIN centers c ON laa.center_id = c.id
        LEFT JOIN users assigned_user ON laa.assigned_to_user_id = assigned_user.id
        LEFT JOIN users returning_user ON laa.returned_by = returning_user.id
        WHERE laa.id = $1
      `;

      const assignmentResult = await pool.query(assignmentQuery, [assignment_id]);

      logger.info(`Loaner asset returned: ${assignmentResult.rows[0].loaner_asset_code} from ${assignmentResult.rows[0].assigned_to_person}`);
      return assignmentResult.rows[0];
    } catch (error) {
      logger.error('Error returning loaner asset:', error);
      throw error;
    }
  }

  // Get active assignments
  static async getActiveAssignments(filters = {}) {
    try {
      const { center_id, department, asset_id, days_overdue, page = 1, limit = 50 } = filters;

      let whereClause = 'laa.assignment_status = \'ACTIVE\' AND laa.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (center_id) {
        whereClause += ` AND laa.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (department) {
        whereClause += ` AND laa.department ILIKE $${paramIndex++}`;
        queryParams.push(`%${department}%`);
      }

      if (asset_id) {
        whereClause += ` AND laa.loaner_asset_id = $${paramIndex++}`;
        queryParams.push(asset_id);
      }

      if (days_overdue) {
        whereClause += ` AND (CURRENT_DATE - laa.expected_return_date) >= $${paramIndex++}`;
        queryParams.push(days_overdue);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          laa.*,
          am.asset_code as loaner_asset_code,
          am.asset_name as loaner_asset_name,
          am.asset_type,
          eim.item_code as consumable_code,
          eim.item_name as consumable_name,
          c.name as center_name,
          assigned_user.name as assigned_to_user_name,
          assigned_user.email as assigned_to_email,
          assigned_user.phone as assigned_to_phone,
          assigning_user.name as assigned_by_name,
          (CURRENT_DATE - laa.expected_return_date) as days_overdue,
          CASE 
            WHEN (CURRENT_DATE - laa.expected_return_date) > 0 THEN 'OVERDUE'
            WHEN (CURRENT_DATE - laa.expected_return_date) >= -3 THEN 'DUE_SOON'
            ELSE 'NORMAL'
          END as urgency_status,
          CASE 
            WHEN (CURRENT_DATE - laa.expected_return_date) > 0 THEN 'danger'
            WHEN (CURRENT_DATE - laa.expected_return_date) >= -3 THEN 'warning'
            ELSE 'success'
          END as urgency_class
        FROM loaner_asset_assignments laa
        LEFT JOIN asset_master am ON laa.loaner_asset_id = am.id
        LEFT JOIN expense_items_master eim ON laa.consumable_item_id = eim.id
        LEFT JOIN centers c ON laa.center_id = c.id
        LEFT JOIN users assigned_user ON laa.assigned_to_user_id = assigned_user.id
        LEFT JOIN users assigning_user ON laa.assigned_by = assigning_user.id
        WHERE ${whereClause}
        ORDER BY laa.expected_return_date ASC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting active assignments:', error);
      throw error;
    }
  }

  // Get overdue assignments
  static async getOverdueAssignments() {
    try {
      const query = `
        SELECT 
          laa.id,
          laa.loaner_asset_id,
          am.asset_name,
          laa.assigned_to_person,
          laa.expected_return_date,
          (CURRENT_DATE - laa.expected_return_date) as days_overdue,
          laa.deposit_amount,
          u.email,
          u.phone,
          c.name as center_name,
          laa.department
        FROM loaner_asset_assignments laa
        LEFT JOIN asset_master am ON laa.loaner_asset_id = am.id
        LEFT JOIN users u ON laa.assigned_to_user_id = u.id
        LEFT JOIN centers c ON laa.center_id = c.id
        WHERE laa.assignment_status = 'ACTIVE'
        AND laa.expected_return_date < CURRENT_DATE
        AND laa.active = true
        ORDER BY days_overdue DESC
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting overdue assignments:', error);
      throw error;
    }
  }

  // Get loaner asset utilization
  static async getLoanerAssetUtilization(filters = {}) {
    try {
      const { asset_id, utilization_period = 30, page = 1, limit = 50 } = filters;

      let whereClause = 'am.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (asset_id) {
        whereClause += ` AND am.id = $${paramIndex++}`;
        queryParams.push(asset_id);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          am.id as asset_id,
          am.asset_code,
          am.asset_name,
          am.asset_type,
          am.status as asset_status,
          COUNT(DISTINCT laa.id) as total_assignments,
          COUNT(DISTINCT CASE WHEN laa.assignment_date >= CURRENT_DATE - INTERVAL '${utilization_period} days' THEN laa.id END) as assignments_last_period,
          COALESCE(SUM(laa.consumable_quantity_given), 0) as total_consumables_given,
          COALESCE(SUM(CASE WHEN laa.assignment_date >= CURRENT_DATE - INTERVAL '${utilization_period} days' THEN laa.consumable_quantity_given ELSE 0 END), 0) as consumables_last_period,
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
          END as utilization_level,
          CASE 
            WHEN COUNT(DISTINCT laa.id) > 10 THEN 'success'
            WHEN COUNT(DISTINCT laa.id) > 5 THEN 'info'
            WHEN COUNT(DISTINCT laa.id) > 0 THEN 'warning'
            ELSE 'danger'
          END as utilization_class
        FROM asset_master am
        LEFT JOIN loaner_asset_assignments laa ON am.id = laa.loaner_asset_id AND laa.active = true
        LEFT JOIN loaner_asset_performance lap ON am.id = lap.loaner_asset_id AND lap.active = true
        LEFT JOIN loaner_asset_maintenance lam ON am.id = lam.loaner_asset_id AND lam.active = true
        WHERE ${whereClause}
        GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type, am.status
        ORDER BY total_assignments DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting loaner asset utilization:', error);
      throw error;
    }
  }

  // Create loaner asset agreement
  static async createAgreement(agreementData) {
    try {
      const {
        loaner_asset_id,
        consumable_item_id,
        center_id,
        assigned_to_person,
        assigned_to_user_id,
        agreement_type = 'STANDARD',
        agreement_start_date,
        agreement_end_date,
        auto_renewal = false,
        terms_and_conditions,
        responsibilities,
        liability_clause,
        insurance_required = false,
        insurance_policy_number,
        deposit_amount = 0,
        usage_restrictions,
        maintenance_responsibility = 'USER',
        replacement_terms,
        termination_conditions,
        signed_by,
        witness_name,
        witness_contact
      } = agreementData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Generate agreement number
        const agreementNumber = 'LA-AGREEMENT-' + new Date().toLocaleDateString('en-CA').replace(/-/g, '') + '-' +
                              Math.floor(Math.random() * 1000).toString().padStart(3, '0');

        // Insert agreement
        const agreementQuery = `
          INSERT INTO loaner_asset_agreements (
            agreement_number, loaner_asset_id, consumable_item_id, center_id,
            assigned_to_person, assigned_to_user_id, agreement_type,
            agreement_start_date, agreement_end_date, auto_renewal,
            terms_and_conditions, responsibilities, liability_clause,
            insurance_required, insurance_policy_number, deposit_amount,
            usage_restrictions, maintenance_responsibility, replacement_terms,
            termination_conditions, signed_date, signed_by, witness_name,
            witness_contact, agreement_status, created_at, updated_at, active
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18, $19,
            $20, CURRENT_DATE, $21, $22,
            $23, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
          ) RETURNING *
        `;

        const result = await client.query(agreementQuery, [
          agreementNumber, loaner_asset_id, consumable_item_id, center_id,
          assigned_to_person, assigned_to_user_id, agreement_type,
          agreement_start_date, agreement_end_date, auto_renewal,
          terms_and_conditions, responsibilities, liability_clause,
          insurance_required, insurance_policy_number, deposit_amount,
          usage_restrictions, maintenance_responsibility, replacement_terms,
          termination_conditions, signed_by, witness_name, witness_contact
        ]);

        await client.query('COMMIT');
        
        logger.info(`Loaner asset agreement created: ${agreementNumber}`);
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating loaner asset agreement:', error);
      throw error;
    }
  }

  // Record maintenance
  static async recordMaintenance(maintenanceData) {
    try {
      const {
        loaner_asset_id,
        maintenance_type,
        maintenance_date,
        performed_by,
        vendor_id,
        cost = 0,
        downtime_hours = 0,
        maintenance_description,
        parts_replaced,
        next_maintenance_date,
        performance_before_maintenance,
        performance_after_maintenance,
        maintenance_rating,
        performed_by_user_id
      } = maintenanceData;

      const query = `
        INSERT INTO loaner_asset_maintenance (
          loaner_asset_id, maintenance_type, maintenance_date, performed_by,
          vendor_id, cost, downtime_hours, maintenance_description,
          parts_replaced, next_maintenance_date, performance_before_maintenance,
          performance_after_maintenance, maintenance_rating, performed_by_user_id,
          created_at, updated_at, active
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        loaner_asset_id, maintenance_type, maintenance_date, performed_by,
        vendor_id, cost, downtime_hours, maintenance_description,
        parts_replaced, next_maintenance_date, performance_before_maintenance,
        performance_after_maintenance, maintenance_rating, performed_by_user_id
      ]);

      // Update asset status if under maintenance
      if (maintenance_type !== 'ROUTINE') {
        await pool.query(
          'UPDATE asset_master SET status = \'UNDER_MAINTENANCE\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [loaner_asset_id]
        );
      }

      logger.info(`Maintenance recorded for loaner asset: ${loaner_asset_id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error recording maintenance:', error);
      throw error;
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(centerId = null) {
    try {
      let centerFilter = centerId ? `WHERE laa.center_id = ${centerId}` : '';

      const queries = {
        total_loaner_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.active = true AND EXISTS (SELECT 1 FROM loaner_asset_assignments laa WHERE laa.loaner_asset_id = am.id) ${centerFilter ? `AND ${centerFilter.replace('WHERE laa', 'WHERE laa')}` : ''}`,
        active_assignments: `SELECT COUNT(*) as count FROM loaner_asset_assignments laa WHERE laa.assignment_status = 'ACTIVE' AND laa.active = true ${centerFilter}`,
        overdue_assignments: `SELECT COUNT(*) as count FROM loaner_asset_assignments laa WHERE laa.assignment_status = 'ACTIVE' AND laa.expected_return_date < CURRENT_DATE AND laa.active = true ${centerFilter}`,
        damaged_assets: `SELECT COUNT(*) as count FROM loaner_asset_assignments laa WHERE laa.assignment_status = 'DAMAGED' AND laa.active = true ${centerFilter}`,
        lost_assets: `SELECT COUNT(*) as count FROM loaner_asset_assignments laa WHERE laa.assignment_status = 'LOST' AND laa.active = true ${centerFilter}`,
        total_deposits_held: `SELECT COALESCE(SUM(deposit_amount), 0) as count FROM loaner_asset_assignments laa WHERE laa.assignment_status = 'ACTIVE' AND laa.active = true ${centerFilter}`,
        consumables_given: `SELECT COALESCE(SUM(consumable_quantity_given), 0) as count FROM loaner_asset_assignments laa WHERE laa.active = true ${centerFilter}`,
        total_maintenance_cost: `SELECT COALESCE(SUM(cost), 0) as count FROM loaner_asset_maintenance lam WHERE lam.active = true ${centerFilter ? `AND EXISTS (SELECT 1 FROM loaner_asset_assignments laa WHERE laa.loaner_asset_id = lam.loaner_asset_id AND ${centerFilter.replace('WHERE laa', 'WHERE laa')})` : ''}`
      };

      const results = await Promise.all(
        Object.entries(queries).map(([key, query]) => pool.query(query))
      );

      const stats = {};
      Object.keys(queries).forEach((key, index) => {
        stats[key] = parseInt(results[index].rows[0].count) || 0;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      throw error;
    }
  }
}

// API Routes

// Get loaner asset summary
router.get('/summary', async (req, res) => {
  try {
    const filters = {
      asset_type: req.query.asset_type,
      asset_status: req.query.asset_status,
      center_id: req.query.center_id,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await LoanerAssetTracking.getLoanerAssetSummary(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting loaner asset summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get consumable-loaner asset mapping
router.get('/mapping', async (req, res) => {
  try {
    const filters = {
      category_id: req.query.category_id,
      has_loaner_asset: req.query.has_loaner_asset,
      page: req.query.page,
      limit: req.query.limit
    };

    const mapping = await LoanerAssetTracking.getConsumableLoanerMapping(filters);
    
    res.json({
      success: true,
      data: mapping
    });
  } catch (error) {
    logger.error('Error getting consumable loaner mapping:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Assign loaner asset
router.post('/assign', [
  body('loaner_asset_id').isInt(),
  body('consumable_item_id').isInt(),
  body('center_id').isInt(),
  body('assigned_to_person').trim().isLength({ min: 2, max: 100 }),
  body('consumable_quantity_given').isFloat({ min: 0.01 }),
  body('consumable_unit_cost').isFloat({ min: 0 }),
  body('assigned_by').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const assignment = await LoanerAssetTracking.assignLoanerAsset(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Loaner asset assigned successfully',
      data: assignment
    });
  } catch (error) {
    logger.error('Error assigning loaner asset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Return loaner asset
router.post('/return', [
  body('assignment_id').isInt(),
  body('returned_by').isInt(),
  body('condition_at_return').isIn(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'LOST'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const returnData = await LoanerAssetTracking.returnLoanerAsset(req.body);
    
    res.json({
      success: true,
      message: 'Loaner asset returned successfully',
      data: returnData
    });
  } catch (error) {
    logger.error('Error returning loaner asset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get active assignments
router.get('/assignments', async (req, res) => {
  try {
    const filters = {
      center_id: req.query.center_id,
      department: req.query.department,
      asset_id: req.query.asset_id,
      days_overdue: req.query.days_overdue,
      page: req.query.page,
      limit: req.query.limit
    };

    const assignments = await LoanerAssetTracking.getActiveAssignments(filters);
    
    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    logger.error('Error getting active assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get overdue assignments
router.get('/overdue', async (req, res) => {
  try {
    const overdue = await LoanerAssetTracking.getOverdueAssignments();
    
    res.json({
      success: true,
      data: overdue
    });
  } catch (error) {
    logger.error('Error getting overdue assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get loaner asset utilization
router.get('/utilization', async (req, res) => {
  try {
    const filters = {
      asset_id: req.query.asset_id,
      utilization_period: req.query.utilization_period,
      page: req.query.page,
      limit: req.query.limit
    };

    const utilization = await LoanerAssetTracking.getLoanerAssetUtilization(filters);
    
    res.json({
      success: true,
      data: utilization
    });
  } catch (error) {
    logger.error('Error getting loaner asset utilization:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create agreement
router.post('/agreements', [
  body('loaner_asset_id').isInt(),
  body('consumable_item_id').isInt(),
  body('center_id').isInt(),
  body('assigned_to_person').trim().isLength({ min: 2, max: 100 }),
  body('agreement_start_date').isISO8601().toDate(),
  body('signed_by').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const agreement = await LoanerAssetTracking.createAgreement(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Loaner asset agreement created successfully',
      data: agreement
    });
  } catch (error) {
    logger.error('Error creating loaner asset agreement:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Record maintenance
router.post('/maintenance', [
  body('loaner_asset_id').isInt(),
  body('maintenance_type').isIn(['ROUTINE', 'REPAIR', 'CALIBRATION', 'CLEANING', 'UPGRADE']),
  body('maintenance_date').isISO8601().toDate(),
  body('maintenance_rating').isInt({ min: 1, max: 5 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const maintenance = await LoanerAssetTracking.recordMaintenance(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Maintenance recorded successfully',
      data: maintenance
    });
  } catch (error) {
    logger.error('Error recording maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const { center_id } = req.query;
    const stats = await LoanerAssetTracking.getDashboardStats(center_id);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in loaner asset tracking:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

module.exports = router;
