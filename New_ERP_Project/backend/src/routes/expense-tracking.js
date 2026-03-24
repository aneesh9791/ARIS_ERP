const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// File upload configuration for item images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/expense-items';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  }
});

// Expense Tracking Class
class ExpenseTracking {
  // Get expense categories
  static async getExpenseCategories(filters = {}) {
    try {
      const { category_type, parent_category_id, active_only = true } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (category_type) {
        whereClause += ` AND ec.category_type = $${paramIndex++}`;
        queryParams.push(category_type);
      }

      if (parent_category_id) {
        whereClause += ` AND ec.parent_category_id = $${paramIndex++}`;
        queryParams.push(parent_category_id);
      }

      if (active_only) {
        whereClause += ` AND ec.active = true`;
      }

      const query = `
        SELECT 
          ec.*,
          COUNT(DISTINCT eim.id) as items_count,
          COALESCE(SUM(eim.current_stock), 0) as total_stock_value,
          parent.category_name as parent_category_name
        FROM expense_categories ec
        LEFT JOIN expense_items_master eim ON ec.id = eim.category_id AND eim.active = true
        LEFT JOIN expense_categories parent ON ec.parent_category_id = parent.id
        WHERE ${whereClause}
        GROUP BY ec.id, parent.category_name
        ORDER BY ec.category_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting expense categories:', error);
      throw error;
    }
  }

  // Get expense items with stock information
  static async getExpenseItems(filters = {}) {
    try {
      const {
        category_id,
        center_id,
        stock_status,
        vendor_id,
        search_term,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'eim.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (category_id) {
        whereClause += ` AND eim.category_id = $${paramIndex++}`;
        queryParams.push(category_id);
      }

      if (stock_status) {
        if (stock_status === 'LOW_STOCK') {
          whereClause += ` AND eim.current_stock <= eim.minimum_stock_level`;
        } else if (stock_status === 'OUT_OF_STOCK') {
          whereClause += ` AND eim.current_stock <= 0`;
        } else if (stock_status === 'ADEQUATE') {
          whereClause += ` AND eim.current_stock > eim.minimum_stock_level`;
        }
      }

      if (vendor_id) {
        whereClause += ` AND eiv.vendor_id = $${paramIndex++}`;
        queryParams.push(vendor_id);
      }

      if (search_term) {
        whereClause += ` AND (eim.item_name ILIKE $${paramIndex++} OR eim.item_code ILIKE $${paramIndex++})`;
        queryParams.push(`%${search_term}%`, `%${search_term}%`);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          eim.*,
          ec.category_name,
          ec.category_type,
          av.vendor_name as preferred_vendor,
          eiv.unit_price as preferred_price,
          eiv.lead_time_days as preferred_lead_time,
          CASE 
            WHEN eim.current_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN eim.current_stock <= eim.minimum_stock_level THEN 'LOW_STOCK'
            WHEN eim.current_stock <= (eim.minimum_stock_level * 1.5) THEN 'REORDER_RECOMMENDED'
            ELSE 'ADEQUATE'
          END as stock_status,
          CASE 
            WHEN eim.current_stock > 0 AND eim.average_monthly_consumption > 0 
            THEN FLOOR(eim.current_stock / (eim.average_monthly_consumption / 30))
            ELSE 0
          END as days_of_supply_remaining,
          COUNT(DISTINCT eiv2.vendor_id) as vendor_count,
          COUNT(DISTINCT ec2.id) as total_consumptions
        FROM expense_items_master eim
        LEFT JOIN expense_categories ec ON eim.category_id = ec.id
        LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id AND eiv.preferred_vendor = true AND eiv.active = true
        LEFT JOIN asset_vendors av ON eiv.vendor_id = av.id
        LEFT JOIN expense_item_vendors eiv2 ON eim.id = eiv2.expense_item_id AND eiv2.active = true
        LEFT JOIN expense_consumption ec2 ON eim.id = ec2.expense_item_id AND ec2.active = true
        WHERE ${whereClause}
        GROUP BY eim.id, ec.category_name, ec.category_type, av.vendor_name, eiv.unit_price, eiv.lead_time_days
        ORDER BY eim.item_name
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT eim.id) as total
        FROM expense_items_master eim
        LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id AND eiv.active = true
        WHERE ${whereClause}
      `;

      const [result, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, queryParams.slice(0, -2))
      ]);

      return {
        items: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting expense items:', error);
      throw error;
    }
  }

  // Create new expense item
  static async createExpenseItem(itemData) {
    try {
      const {
        item_code,
        item_name,
        category_id,
        description,
        unit_of_measure,
        standard_package_size = 1,
        current_stock = 0,
        minimum_stock_level = 0,
        maximum_stock_level = 0,
        reorder_quantity = 0,
        storage_location,
        storage_requirements,
        expiry_tracking = false,
        shelf_life_months,
        hazardous_material = false,
        safety_instructions,
        barcode,
        qr_code,
        vendor_id,
        vendor_sku,
        unit_price,
        lead_time_days = 7
      } = itemData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert expense item
        const itemQuery = `
          INSERT INTO expense_items_master (
            item_code, item_name, category_id, description, unit_of_measure,
            standard_package_size, current_stock, minimum_stock_level, maximum_stock_level,
            reorder_quantity, storage_location, storage_requirements, expiry_tracking,
            shelf_life_months, hazardous_material, safety_instructions, barcode, qr_code,
            created_at, updated_at, active
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17, $18,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
          ) RETURNING *
        `;

        const itemResult = await client.query(itemQuery, [
          item_code, item_name, category_id, description, unit_of_measure,
          standard_package_size, current_stock, minimum_stock_level, maximum_stock_level,
          reorder_quantity, storage_location, storage_requirements, expiry_tracking,
          shelf_life_months, hazardous_material, safety_instructions, barcode, qr_code
        ]);

        const newItem = itemResult.rows[0];

        // Link to vendor if provided
        if (vendor_id && unit_price) {
          const vendorQuery = `
            INSERT INTO expense_item_vendors (
              expense_item_id, vendor_id, vendor_sku, unit_price, lead_time_days,
              preferred_vendor, created_at, updated_at, active
            ) VALUES (
              $1, $2, $3, $4, $5,
              true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
            )
          `;

          await client.query(vendorQuery, [
            newItem.id, vendor_id, vendor_sku || item_code, unit_price, lead_time_days
          ]);
        }

        // Record initial stock movement if stock > 0
        if (current_stock > 0) {
          await client.query(
            'SELECT update_stock_movement($1, $2, $3, $4, $5, NULL, NULL, $6)',
            [newItem.id, 1, 'ADJUSTMENT', current_stock, 'INITIAL_STOCK', 'Initial stock entry']
          );
        }

        await client.query('COMMIT');
        
        logger.info(`Expense item created: ${item_code} - ${item_name}`);
        return newItem;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating expense item:', error);
      throw error;
    }
  }

  // Record expense consumption
  static async recordConsumption(consumptionData) {
    try {
      const {
        expense_item_id,
        center_id,
        department,
        consumption_date,
        consumption_type,
        quantity_consumed,
        batch_number,
        expiry_date,
        consumed_by,
        purpose_of_use,
        reference_document,
        notes
      } = consumptionData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check available stock
        const stockResult = await client.query(
          'SELECT current_stock, unit_of_measure, average_monthly_consumption FROM expense_items_master WHERE id = $1 AND active = true',
          [expense_item_id]
        );

        if (stockResult.rows.length === 0) {
          throw new Error('Expense item not found');
        }

        const item = stockResult.rows[0];
        
        if (item.current_stock < quantity_consumed) {
          throw new Error(`Insufficient stock. Available: ${item.current_stock} ${item.unit_of_measure}, Requested: ${quantity_consumed} ${item.unit_of_measure}`);
        }

        // Get cost per unit
        const costResult = await client.query(
          'SELECT unit_price FROM expense_item_vendors WHERE expense_item_id = $1 AND preferred_vendor = true AND active = true',
          [expense_item_id]
        );

        const unitCost = costResult.rows.length > 0 ? costResult.rows[0].unit_price : 0;
        const totalCost = unitCost * quantity_consumed;

        // Insert consumption record
        const consumptionQuery = `
          INSERT INTO expense_consumption (
            expense_item_id, center_id, department, consumption_date, consumption_type,
            quantity_consumed, unit_of_measure, batch_number, expiry_date,
            consumed_by, purpose_of_use, cost_per_unit, total_cost,
            reference_document, notes, created_at, updated_at, active
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
          ) RETURNING *
        `;

        const consumptionResult = await client.query(consumptionQuery, [
          expense_item_id, center_id, department, consumption_date, consumption_type,
          quantity_consumed, item.unit_of_measure, batch_number, expiry_date,
          consumed_by, purpose_of_use, unitCost, totalCost,
          reference_document, notes
        ]);

        // Update stock movement (trigger will handle this automatically)
        await client.query(
          'SELECT update_stock_movement($1, $2, $3, $4, $5, $6, $7, $8)',
          [expense_item_id, center_id, 'CONSUMPTION', -quantity_consumed, 'CONSUMPTION', consumptionResult.rows[0].id, consumed_by, 'Daily consumption: ' + (purpose_of_use || 'N/A')]
        );

        await client.query('COMMIT');
        
        logger.info(`Consumption recorded: ${quantity_consumed} ${item.unit_of_measure} of item ${expense_item_id}`);
        return consumptionResult.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error recording consumption:', error);
      throw error;
    }
  }

  // Get consumption analysis
  static async getConsumptionAnalysis(filters = {}) {
    try {
      const {
        expense_item_id,
        center_id,
        department,
        start_date,
        end_date,
        consumption_type,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'ec.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (expense_item_id) {
        whereClause += ` AND ec.expense_item_id = $${paramIndex++}`;
        queryParams.push(expense_item_id);
      }

      if (center_id) {
        whereClause += ` AND ec.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (department) {
        whereClause += ` AND ec.department ILIKE $${paramIndex++}`;
        queryParams.push(`%${department}%`);
      }

      if (start_date && end_date) {
        whereClause += ` AND ec.consumption_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(start_date, end_date);
      }

      if (consumption_type) {
        whereClause += ` AND ec.consumption_type = $${paramIndex++}`;
        queryParams.push(consumption_type);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          ec.*,
          eim.item_code,
          eim.item_name,
          eim.unit_of_measure,
          c.name as center_name,
          u.name as consumed_by_name,
          eim.average_monthly_consumption,
          CASE 
            WHEN ec.quantity_consumed > (eim.average_monthly_consumption / 30) * 2 THEN 'HIGH_USAGE'
            WHEN ec.quantity_consumed > (eim.average_monthly_consumption / 30) THEN 'NORMAL_USAGE'
            ELSE 'LOW_USAGE'
          END as usage_level,
          CASE 
            WHEN ec.consumption_type = 'WASTAGE' THEN 'warning'
            WHEN ec.consumption_type = 'DAMAGE' THEN 'danger'
            WHEN ec.consumption_type = 'THEFT' THEN 'danger'
            WHEN ec.consumption_type = 'EXPIRY' THEN 'warning'
            ELSE 'success'
          END as consumption_type_class
        FROM expense_consumption ec
        LEFT JOIN expense_items_master eim ON ec.expense_item_id = eim.id
        LEFT JOIN centers c ON ec.center_id = c.id
        LEFT JOIN users u ON ec.consumed_by = u.id
        WHERE ${whereClause}
        ORDER BY ec.consumption_date DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting consumption analysis:', error);
      throw error;
    }
  }

  // Get vendor performance for expense items
  static async getVendorPerformance(filters = {}) {
    try {
      const { vendor_id, item_category, min_orders = 0 } = filters;

      let whereClause = 'av.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (vendor_id) {
        whereClause += ` AND av.id = $${paramIndex++}`;
        queryParams.push(vendor_id);
      }

      if (item_category) {
        whereClause += ` AND ec.category_type = $${paramIndex++}`;
        queryParams.push(item_category);
      }

      const query = `
        SELECT 
          av.id as vendor_id,
          av.vendor_name,
          av.contact_person,
          av.email,
          av.phone,
          COUNT(DISTINCT eiv.expense_item_id) as items_supplied,
          COUNT(DISTINCT epo.id) as total_orders,
          COALESCE(SUM(epo.net_amount), 0) as total_business,
          COALESCE(AVG(eiv.quality_rating), 0) as avg_quality_rating,
          COALESCE(AVG(eiv.delivery_rating), 0) as avg_delivery_rating,
          COALESCE(AVG(eiv.service_rating), 0) as avg_service_rating,
          COALESCE(AVG(eiv.lead_time_days), 0) as avg_lead_time,
          COUNT(DISTINCT CASE WHEN eiv.preferred_vendor = true THEN eiv.expense_item_id END) as preferred_items,
          COUNT(DISTINCT CASE WHEN epo.order_status = 'DELIVERED' THEN epo.id END) as delivered_orders,
          COUNT(DISTINCT CASE WHEN epo.order_status = 'DELAYED' THEN epo.id END) as delayed_orders,
          COUNT(DISTINCT ec.id) as categories_served
        FROM asset_vendors av
        LEFT JOIN expense_item_vendors eiv ON av.id = eiv.vendor_id AND eiv.active = true
        LEFT JOIN expense_purchase_orders epo ON av.id = epo.vendor_id AND epo.active = true
        LEFT JOIN expense_items_master eim ON eiv.expense_item_id = eim.id
        LEFT JOIN expense_categories ec ON eim.category_id = ec.id
        WHERE ${whereClause}
        GROUP BY av.id, av.vendor_name, av.contact_person, av.email, av.phone
        HAVING COUNT(DISTINCT epo.id) >= $${paramIndex++}
        ORDER BY total_business DESC
      `;

      queryParams.push(min_orders);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting vendor performance:', error);
      throw error;
    }
  }

  // Get stock alerts
  static async getStockAlerts(filters = {}) {
    try {
      const {
        center_id,
        alert_type,
        alert_level,
        acknowledged_only = false,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'esa.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (center_id) {
        whereClause += ` AND esa.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (alert_type) {
        whereClause += ` AND esa.alert_type = $${paramIndex++}`;
        queryParams.push(alert_type);
      }

      if (alert_level) {
        whereClause += ` AND esa.alert_level = $${paramIndex++}`;
        queryParams.push(alert_level);
      }

      if (acknowledged_only) {
        whereClause += ` AND esa.acknowledged = true`;
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          esa.*,
          eim.item_code,
          eim.item_name,
          eim.unit_of_measure,
          eim.minimum_stock_level,
          eim.reorder_quantity,
          av.vendor_name as preferred_vendor
        FROM expense_stock_alerts esa
        LEFT JOIN expense_items_master eim ON esa.expense_item_id = eim.id
        LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id AND eiv.preferred_vendor = true
        LEFT JOIN asset_vendors av ON eiv.vendor_id = av.id
        WHERE ${whereClause}
        ORDER BY esa.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting stock alerts:', error);
      throw error;
    }
  }

  // Generate reorder recommendations
  static async getReorderRecommendations(filters = {}) {
    try {
      const { center_id, urgency_level } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (center_id) {
        whereClause += ` AND eim.center_id = $${paramIndex++}`;
        queryParams.push(center_id);
      }

      if (urgency_level) {
        if (urgency_level === 'EMERGENCY') {
          whereClause += ` AND eim.current_stock <= 0`;
        } else if (urgency_level === 'URGENT') {
          whereClause += ` AND eim.current_stock <= eim.minimum_stock_level`;
        } else if (urgency_level === 'HIGH') {
          whereClause += ` AND eim.current_stock <= (eim.minimum_stock_level * 1.5)`;
        }
      }

      const query = `
        SELECT 
          eim.id,
          eim.item_code,
          eim.item_name,
          eim.current_stock,
          eim.minimum_stock_level,
          eim.reorder_quantity,
          eim.unit_of_measure,
          eim.days_of_supply,
          eiv.unit_price,
          eim.reorder_quantity * eiv.unit_price as estimated_cost,
          av.vendor_name,
          av.contact_person,
          av.email,
          av.phone,
          eiv.lead_time_days,
          CASE 
            WHEN eim.current_stock <= 0 THEN 'EMERGENCY'
            WHEN eim.current_stock <= eim.minimum_stock_level THEN 'URGENT'
            WHEN eim.current_stock <= (eim.minimum_stock_level * 1.5) THEN 'HIGH'
            ELSE 'NORMAL'
          END as urgency_level,
          CASE 
            WHEN eim.current_stock <= 0 THEN 'danger'
            WHEN eim.current_stock <= eim.minimum_stock_level THEN 'warning'
            ELSE 'info'
          END as urgency_class
        FROM expense_items_master eim
        LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id AND eiv.preferred_vendor = true AND eiv.active = true
        LEFT JOIN asset_vendors av ON eiv.vendor_id = av.id
        WHERE eim.active = true
        AND eim.reorder_quantity > 0
        AND eim.current_stock <= (eim.minimum_stock_level * 1.5)
        AND ${whereClause}
        ORDER BY 
          CASE 
            WHEN eim.current_stock <= 0 THEN 1
            WHEN eim.current_stock <= eim.minimum_stock_level THEN 2
            ELSE 3
          END,
          eim.item_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting reorder recommendations:', error);
      throw error;
    }
  }

  // Create purchase order
  static async createPurchaseOrder(orderData) {
    try {
      const {
        vendor_id,
        center_id,
        expected_delivery_date,
        priority = 'NORMAL',
        payment_terms,
        delivery_terms,
        notes,
        items,
        ordered_by
      } = orderData;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Generate order number
        const orderNumber = 'PO-' + new Date().toLocaleDateString('en-CA').replace(/-/g, '') + '-' +
                          Math.floor(Math.random() * 1000).toString().padStart(3, '0');

        // Calculate totals
        let totalAmount = 0;
        let taxAmount = 0;
        let discountAmount = 0;

        items.forEach(item => {
          const itemTotal = item.quantity_ordered * item.unit_price;
          const itemDiscount = itemTotal * (item.discount_percentage || 0) / 100;
          const itemTax = (itemTotal - itemDiscount) * (item.tax_percentage || 0) / 100;
          
          totalAmount += itemTotal;
          discountAmount += itemDiscount;
          taxAmount += itemTax;
        });

        const netAmount = totalAmount - discountAmount + taxAmount;

        // Insert purchase order
        const orderQuery = `
          INSERT INTO expense_purchase_orders (
            order_number, vendor_id, center_id, order_date, expected_delivery_date,
            priority, payment_terms, delivery_terms, total_amount, tax_amount,
            discount_amount, net_amount, ordered_by, notes, created_at, updated_at, active
          ) VALUES (
            $1, $2, $3, CURRENT_DATE, $4,
            $5, $6, $7, $8, $9,
            $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
          ) RETURNING *
        `;

        const orderResult = await client.query(orderQuery, [
          orderNumber, vendor_id, center_id, expected_delivery_date,
          priority, payment_terms, delivery_terms, totalAmount, taxAmount,
          discountAmount, netAmount, ordered_by, notes
        ]);

        const newOrder = orderResult.rows[0];

        // Insert purchase order items
        for (const item of items) {
          const itemTotal = item.quantity_ordered * item.unit_price;
          const itemDiscount = itemTotal * (item.discount_percentage || 0) / 100;
          const itemTax = (itemTotal - itemDiscount) * (item.tax_percentage || 0) / 100;
          const itemNetAmount = itemTotal - itemDiscount + itemTax;

          await client.query(`
            INSERT INTO expense_purchase_order_items (
              purchase_order_id, expense_item_id, vendor_sku, quantity_ordered,
              unit_price, discount_percentage, tax_percentage, total_amount,
              batch_number, expiry_date, created_at, updated_at, active
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8,
              $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
            )
          `, [
            newOrder.id, item.expense_item_id, item.vendor_sku, item.quantity_ordered,
            item.unit_price, item.discount_percentage, item.tax_percentage, itemNetAmount,
            item.batch_number, item.expiry_date
          ]);
        }

        await client.query('COMMIT');
        
        logger.info(`Purchase order created: ${orderNumber}`);
        return newOrder;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating purchase order:', error);
      throw error;
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(centerId = null) {
    try {
      const cid = centerId ? parseInt(centerId, 10) : null;
      if (centerId && !cid) throw new Error('Invalid centerId');

      // All queries use parameterized $1 when center filter is needed
      const param = cid ? [cid] : [];
      const cf = cid ? ' AND center_id = $1' : '';          // for tables with plain center_id
      const ecf = cid ? ' AND eim.center_id = $1' : '';     // for aliased expense_items_master

      const queryDefs = {
        total_items:       `SELECT COUNT(*) as count FROM expense_items_master WHERE active = true${cf}`,
        low_stock_items:   `SELECT COUNT(*) as count FROM expense_items_master WHERE active = true AND current_stock <= minimum_stock_level${cf}`,
        out_of_stock_items:`SELECT COUNT(*) as count FROM expense_items_master WHERE active = true AND current_stock <= 0${cf}`,
        total_stock_value: `SELECT COALESCE(SUM(eim.current_stock * COALESCE(eiv.unit_price, 0)), 0) as count FROM expense_items_master eim LEFT JOIN expense_item_vendors eiv ON eim.id = eiv.expense_item_id AND eiv.preferred_vendor = true WHERE eim.active = true${ecf}`,
        active_alerts:     `SELECT COUNT(*) as count FROM expense_stock_alerts WHERE active = true AND acknowledged = false${cf}`,
        pending_orders:    `SELECT COUNT(*) as count FROM expense_purchase_orders WHERE active = true AND order_status IN ('PENDING', 'APPROVED', 'ORDERED')${cf}`,
        today_consumption: `SELECT COUNT(*) as count FROM expense_consumption WHERE active = true AND consumption_date = CURRENT_DATE${cf}`,
        total_vendors:     `SELECT COUNT(DISTINCT vendor_id) as count FROM expense_item_vendors WHERE active = true`
      };

      const results = await Promise.all(
        Object.entries(queryDefs).map(([key, query]) =>
          // total_vendors has no center filter param
          key === 'total_vendors' ? pool.query(query) : pool.query(query, param)
        )
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

// Get expense categories
router.get('/categories', async (req, res) => {
  try {
    const filters = {
      category_type: req.query.category_type,
      parent_category_id: req.query.parent_category_id,
      active_only: req.query.active_only
    };

    const categories = await ExpenseTracking.getExpenseCategories(filters);
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error getting expense categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get expense items
router.get('/items', async (req, res) => {
  try {
    const filters = {
      category_id: req.query.category_id,
      center_id: req.query.center_id,
      stock_status: req.query.stock_status,
      vendor_id: req.query.vendor_id,
      search_term: req.query.search_term,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await ExpenseTracking.getExpenseItems(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting expense items:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create expense item
router.post('/items', [
  body('item_code').trim().isLength({ min: 2, max: 20 }),
  body('item_name').trim().isLength({ min: 3, max: 100 }),
  body('category_id').isInt(),
  body('unit_of_measure').isIn(['PIECES', 'BOXES', 'BOTTLES', 'PACKETS', 'KGS', 'LITERS', 'SETS']),
  body('minimum_stock_level').isFloat({ min: 0 }),
  body('reorder_quantity').isFloat({ min: 0 })
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

    const item = await ExpenseTracking.createExpenseItem(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Expense item created successfully',
      data: item
    });
  } catch (error) {
    logger.error('Error creating expense item:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Record consumption
router.post('/consumption', [
  body('expense_item_id').isInt(),
  body('center_id').isInt(),
  body('consumption_date').isISO8601().toDate(),
  body('consumption_type').isIn(['USAGE', 'WASTAGE', 'DAMAGE', 'THEFT', 'EXPIRY']),
  body('quantity_consumed').isFloat({ min: 0.01 })
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

    const consumption = await ExpenseTracking.recordConsumption(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Consumption recorded successfully',
      data: consumption
    });
  } catch (error) {
    logger.error('Error recording consumption:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get consumption analysis
router.get('/consumption-analysis', async (req, res) => {
  try {
    const filters = {
      expense_item_id: req.query.expense_item_id,
      center_id: req.query.center_id,
      department: req.query.department,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      consumption_type: req.query.consumption_type,
      page: req.query.page,
      limit: req.query.limit
    };

    const analysis = await ExpenseTracking.getConsumptionAnalysis(filters);
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    logger.error('Error getting consumption analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get vendor performance
router.get('/vendor-performance', async (req, res) => {
  try {
    const filters = {
      vendor_id: req.query.vendor_id,
      item_category: req.query.item_category,
      min_orders: req.query.min_orders
    };

    const performance = await ExpenseTracking.getVendorPerformance(filters);
    
    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    logger.error('Error getting vendor performance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get stock alerts
router.get('/stock-alerts', async (req, res) => {
  try {
    const filters = {
      center_id: req.query.center_id,
      alert_type: req.query.alert_type,
      alert_level: req.query.alert_level,
      acknowledged_only: req.query.acknowledged_only,
      page: req.query.page,
      limit: req.query.limit
    };

    const alerts = await ExpenseTracking.getStockAlerts(filters);
    
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    logger.error('Error getting stock alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get reorder recommendations
router.get('/reorder-recommendations', async (req, res) => {
  try {
    const filters = {
      center_id: req.query.center_id,
      urgency_level: req.query.urgency_level
    };

    const recommendations = await ExpenseTracking.getReorderRecommendations(filters);
    
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Error getting reorder recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create purchase order
router.post('/purchase-orders', [
  body('vendor_id').isInt(),
  body('center_id').isInt(),
  body('expected_delivery_date').isISO8601().toDate(),
  body('priority').isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  body('items').isArray({ min: 1 }),
  body('ordered_by').isInt()
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

    // Validate items array
    for (const item of req.body.items) {
      if (!item.expense_item_id || !item.quantity_ordered || !item.unit_price) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have expense_item_id, quantity_ordered, and unit_price'
        });
      }
    }

    const order = await ExpenseTracking.createPurchaseOrder(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: order
    });
  } catch (error) {
    logger.error('Error creating purchase order:', error);
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
    const stats = await ExpenseTracking.getDashboardStats(center_id);
    
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

// Upload item image
router.post('/items/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const itemId = req.params.id;
    const imagePath = req.file.path;

    // Update item with image path
    const result = await pool.query(
      'UPDATE expense_items_master SET item_image = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [imagePath, itemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error uploading item image:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in expense tracking:', {
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
