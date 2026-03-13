const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/asset-management.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/asset-documents';
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
  }
});

// Enhanced Asset Management Class
class AssetManagement {
  // Get comprehensive asset list with all related information
  static async getAssets(filters = {}) {
    try {
      const {
        center_id,
        asset_category,
        asset_type,
        asset_ownership,
        lifecycle_status,
        vendor_id,
        corporate_pool_id,
        include_shared = false,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'am.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (center_id) {
        if (include_shared) {
          // Include both center-owned and shared corporate assets
          whereClause += ` AND (am.center_id = $${paramIndex++} OR (am.asset_ownership = 'CORPORATE' AND $${paramIndex} = ANY(am.shared_centers)))`;
          queryParams.push(center_id, center_id);
        } else {
          // Only center-owned assets
          whereClause += ` AND am.center_id = $${paramIndex++}`;
          queryParams.push(center_id);
        }
      }

      if (asset_category) {
        whereClause += ` AND am.asset_category = $${paramIndex++}`;
        queryParams.push(asset_category);
      }

      if (asset_type) {
        whereClause += ` AND am.asset_type = $${paramIndex++}`;
        queryParams.push(asset_type);
      }

      if (asset_ownership) {
        whereClause += ` AND am.asset_ownership = $${paramIndex++}`;
        queryParams.push(asset_ownership);
      }

      if (lifecycle_status) {
        whereClause += ` AND am.lifecycle_status = $${paramIndex++}`;
        queryParams.push(lifecycle_status);
      }

      if (vendor_id) {
        whereClause += ` AND am.vendor_id = $${paramIndex++}`;
        queryParams.push(vendor_id);
      }

      if (corporate_pool_id) {
        whereClause += ` AND am.corporate_pool_id = $${paramIndex++}`;
        queryParams.push(corporate_pool_id);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          am.*,
          c.name as center_name,
          at.name as asset_type_name,
          av.vendor_name,
          cap.pool_name,
          COUNT(DISTINCT ac.id) as active_contracts,
          COUNT(DISTINCT ae.id) as expense_count,
          COALESCE(SUM(ae.amount), 0) as total_expenses,
          COUNT(DISTINCT ale.id) as lifecycle_events,
          COUNT(DISTINCT apm.id) as performance_records,
          COUNT(DISTINCT ab.id) as total_bookings,
          COUNT(DISTINCT CASE WHEN ab.booking_status = 'COMPLETED' THEN ab.id END) as completed_bookings,
          CASE 
            WHEN am.license_expiry AND am.license_expiry <= CURRENT_DATE + INTERVAL '${contract_expiry_days || 30} days' THEN 'EXPIRING_SOON'
            WHEN am.contract_end_date AND am.contract_end_date <= CURRENT_DATE + INTERVAL '${contract_expiry_days || 30} days' THEN 'CONTRACT_EXPIRING'
            ELSE 'NORMAL'
          END as alert_status,
          CASE 
            WHEN am.asset_ownership = 'CENTER' THEN 'Center Owned'
            WHEN am.asset_ownership = 'CORPORATE' THEN 'Corporate Pool'
            ELSE 'Unknown'
          END as ownership_description,
          CASE 
            WHEN am.asset_ownership = 'CORPORATE' THEN array_length(am.shared_centers, 1)
            ELSE 0
          END as shared_centers_count
        FROM asset_master am
        LEFT JOIN centers c ON am.center_id = c.id
        LEFT JOIN asset_types at ON am.asset_type = at.type_code
        LEFT JOIN asset_vendors av ON am.vendor_id = av.id
        LEFT JOIN asset_contracts ac ON am.id = ac.asset_id AND ac.active = true AND ac.status = 'ACTIVE'
        LEFT JOIN asset_expenses ae ON am.id = ae.asset_id AND ae.active = true
        LEFT JOIN asset_lifecycle_events ale ON am.id = ale.asset_id AND ale.active = true
        LEFT JOIN asset_performance_metrics apm ON am.id = apm.asset_id AND apm.active = true
        LEFT JOIN asset_bookings ab ON am.id = ab.asset_id AND ab.active = true
        LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
        WHERE ${whereClause}
        GROUP BY am.id, c.name, at.name, av.vendor_name, cap.pool_name
        ORDER BY am.asset_code
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const countQuery = `
        SELECT COUNT(DISTINCT am.id) as total
        FROM asset_master am
        LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
        WHERE ${whereClause}
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
      logger.error('Error getting assets:', error);
      throw error;
    }
  }

  // Create new asset (tangible or intangible)
  static async createAsset(assetData) {
    try {
      const {
        asset_code,
        asset_name,
        asset_category = 'TANGIBLE',
        asset_type,
        asset_subtype,
        description,
        center_id,
        manufacturer,
        model,
        serial_number,
        purchase_date,
        purchase_cost,
        depreciation_rate = 0,
        warranty_expiry,
        location,
        assigned_to,
        status = 'ACTIVE',
        license_key,
        license_expiry,
        vendor_id,
        contract_start_date,
        contract_end_date,
        renewal_reminder_days = 30,
        asset_ownership = 'CENTER',
        corporate_pool_id,
        shared_centers = [],
        allocation_type = 'DEDICATED',
        booking_required = false
      } = assetData;

      // Validate asset ownership configuration
      if (asset_ownership === 'CORPORATE' && !corporate_pool_id) {
        throw new Error('Corporate assets must be assigned to a corporate pool');
      }

      if (asset_ownership === 'CENTER' && !center_id) {
        throw new Error('Center-owned assets must be assigned to a center');
      }

      const query = `
        INSERT INTO asset_master (
          asset_code, asset_name, asset_category, asset_type, asset_subtype, description, center_id,
          manufacturer, model, serial_number, purchase_date, purchase_cost,
          current_value, depreciation_rate, warranty_expiry, location,
          assigned_to, status, license_key, license_expiry, vendor_id,
          contract_start_date, contract_end_date, renewal_reminder_days,
          asset_ownership, corporate_pool_id, shared_centers, allocation_type,
          booking_required, created_at, updated_at, active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23,
          $24, $25, $26, $27,
          $28, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        asset_code, asset_name, asset_category, asset_type, asset_subtype, description, 
        asset_ownership === 'CENTER' ? center_id : null,
        manufacturer, model, serial_number, purchase_date, purchase_cost,
        purchase_cost, depreciation_rate, warranty_expiry, location,
        assigned_to, status, license_key, license_expiry, vendor_id,
        contract_start_date, contract_end_date, renewal_reminder_days,
        asset_ownership, corporate_pool_id, shared_centers, allocation_type,
        booking_required
      ]);

      // Log lifecycle event
      await this.logLifecycleEvent(result.rows[0].id, 'PURCHASED', purchase_date, 
        `${asset_ownership} asset purchased for ₹${purchase_cost}`, null, purchase_cost, vendor_id);

      logger.info(`Asset created: ${asset_code} - ${asset_name} (${asset_ownership})`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating asset:', error);
      throw error;
    }
  }

  // Update asset information
  static async updateAsset(assetId, updateData) {
    try {
      const allowedFields = [
        'asset_name', 'asset_category', 'asset_type', 'asset_subtype', 'description',
        'manufacturer', 'model', 'serial_number', 'location', 'assigned_to', 'status',
        'license_key', 'license_expiry', 'vendor_id', 'contract_start_date', 
        'contract_end_date', 'renewal_reminder_days', 'performance_rating', 'utilization_rate',
        'lifecycle_status', 'current_value', 'depreciation_rate'
      ];

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramIndex++}`);
          updateValues.push(value);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(assetId);

      const query = `
        UPDATE asset_master 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND active = true
        RETURNING *
      `;

      const result = await pool.query(query, updateValues);
      
      if (result.rows.length === 0) {
        throw new Error('Asset not found');
      }

      // Log lifecycle event if status changed
      if (updateData.status && updateData.status !== result.rows[0].status) {
        await this.logLifecycleEvent(assetId, 'STATUS_CHANGED', new Date(), 
          `Status changed to ${updateData.status}`, null, null, null);
      }

      logger.info(`Asset updated: ${result.rows[0].asset_code}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating asset:', error);
      throw error;
    }
  }

  // Add asset expense
  static async addAssetExpense(expenseData) {
    try {
      const {
        asset_id,
        expense_type,
        expense_category,
        amount,
        expense_date,
        description,
        vendor_id,
        invoice_number,
        invoice_date,
        created_by
      } = expenseData;

      const query = `
        INSERT INTO asset_expenses (
          asset_id, expense_type, expense_category, amount, currency, expense_date,
          description, vendor_id, invoice_number, invoice_date, payment_status,
          created_by, created_at, active
        ) VALUES (
          $1, $2, $3, $4, 'INR', $5,
          $6, $7, $8, $9, 'PENDING',
          $10, CURRENT_TIMESTAMP, true
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        asset_id, expense_type, expense_category, amount, expense_date,
        description, vendor_id, invoice_number, invoice_date, created_by
      ]);

      // Log lifecycle event
      await this.logLifecycleEvent(asset_id, expense_type, expense_date, 
        description, null, amount, vendor_id);

      logger.info(`Asset expense added: ${expense_type} - ₹${amount} for asset ${asset_id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error adding asset expense:', error);
      throw error;
    }
  }

  // Create asset contract (SLA, AMC, CMS, etc.)
  static async createAssetContract(contractData) {
    try {
      const {
        asset_id,
        contract_type,
        contract_number,
        vendor_id,
        contract_start_date,
        contract_end_date,
        billing_cycle,
        contract_value,
        service_level,
        response_time,
        resolution_time,
        availability_guarantee,
        coverage_details,
        exclusions
      } = contractData;

      const query = `
        INSERT INTO asset_contracts (
          asset_id, contract_type, contract_number, vendor_id, contract_start_date,
          contract_end_date, billing_cycle, contract_value, currency, service_level,
          response_time, resolution_time, availability_guarantee, coverage_details,
          exclusions, status, created_at, active
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, 'INR', $9,
          $10, $11, $12, $13,
          $14, 'ACTIVE', CURRENT_TIMESTAMP, true
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        asset_id, contract_type, contract_number, vendor_id, contract_start_date,
        contract_end_date, billing_cycle, contract_value, service_level,
        response_time, resolution_time, availability_guarantee, coverage_details,
        exclusions
      ]);

      // Update asset contract dates if needed
      if (contract_type === 'LICENSE' && contract_end_date) {
        await pool.query(
          'UPDATE asset_master SET license_expiry = $1 WHERE id = $2',
          [contract_end_date, asset_id]
        );
      }

      logger.info(`Asset contract created: ${contract_type} - ${contract_number}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating asset contract:', error);
      throw error;
    }
  }

  // Log asset lifecycle events
  static async logLifecycleEvent(assetId, eventType, eventDate, description, performedBy, cost, vendorId) {
    try {
      const query = `
        INSERT INTO asset_lifecycle_events (
          asset_id, event_type, event_date, description, performed_by, cost,
          vendor_id, created_at, active
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, CURRENT_TIMESTAMP, true
        )
      `;

      await pool.query(query, [assetId, eventType, eventDate, description, performedBy, cost, vendorId]);
    } catch (error) {
      logger.error('Error logging lifecycle event:', error);
    }
  }

  // Get asset financial summary
  static async getAssetFinancialSummary(assetId) {
    try {
      const query = `
        SELECT 
          am.*,
          COALESCE(SUM(ae.amount), 0) as total_expenses,
          (am.purchase_cost + COALESCE(SUM(ae.amount), 0)) as total_cost_of_ownership,
          (am.purchase_cost - am.current_value) as accumulated_depreciation,
          COALESCE(SUM(CASE WHEN ae.expense_category = 'CAPEX' THEN ae.amount ELSE 0 END), 0) as capex_expenses,
          COALESCE(SUM(CASE WHEN ae.expense_category = 'OPEX' THEN ae.amount ELSE 0 END), 0) as opex_expenses,
          COALESCE(SUM(CASE WHEN ae.expense_type = 'MAINTENANCE' THEN ae.amount ELSE 0 END), 0) as maintenance_expenses,
          COALESCE(SUM(CASE WHEN ae.expense_type = 'LICENSE' THEN ae.amount ELSE 0 END), 0) as license_expenses,
          COALESCE(SUM(CASE WHEN ae.expense_type = 'UPGRADE' THEN ae.amount ELSE 0 END), 0) as upgrade_expenses
        FROM asset_master am
        LEFT JOIN asset_expenses ae ON am.id = ae.asset_id AND ae.active = true
        WHERE am.id = $1 AND am.active = true
        GROUP BY am.id
      `;

      const result = await pool.query(query, [assetId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting asset financial summary:', error);
      throw error;
    }
  }

  // Get asset contracts and SLA information
  static async getAssetContracts(assetId) {
    try {
      const query = `
        SELECT 
          ac.*,
          av.vendor_name,
          av.contact_person,
          av.email,
          av.phone,
          CASE 
            WHEN ac.contract_end_date < CURRENT_DATE THEN 'EXPIRED'
            WHEN ac.contract_end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
            ELSE 'ACTIVE'
          END as contract_status,
          DATEDIFF(ac.contract_end_date, CURRENT_DATE) as days_to_expiry
        FROM asset_contracts ac
        LEFT JOIN asset_vendors av ON ac.vendor_id = av.id
        WHERE ac.asset_id = $1 AND ac.active = true
        ORDER BY ac.contract_end_date DESC
      `;

      const result = await pool.query(query, [assetId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset contracts:', error);
      throw error;
    }
  }

  // Get asset performance metrics
  static async getAssetPerformance(assetId, startDate, endDate) {
    try {
      const query = `
        SELECT 
          apm.*,
          CASE 
            WHEN apm.uptime_percentage >= 99.9 THEN 'EXCELLENT'
            WHEN apm.uptime_percentage >= 99.0 THEN 'GOOD'
            WHEN apm.uptime_percentage >= 95.0 THEN 'ACCEPTABLE'
            ELSE 'POOR'
          END as performance_rating
        FROM asset_performance_metrics apm
        WHERE apm.asset_id = $1 AND apm.active = true
        AND apm.metric_date BETWEEN $2 AND $3
        ORDER BY apm.metric_date DESC
      `;

      const result = await pool.query(query, [assetId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset performance:', error);
      throw error;
    }
  }

  // Get contracts expiring soon
  static async getExpiringContracts(days = 30) {
    try {
      const query = `
        SELECT 
          am.asset_code,
          am.asset_name,
          am.asset_type,
          ac.contract_type,
          ac.contract_number,
          ac.contract_end_date,
          av.vendor_name,
          av.email,
          DATEDIFF(ac.contract_end_date, CURRENT_DATE) as days_to_expiry,
          ac.contract_value,
          ac.billing_cycle
        FROM asset_master am
        JOIN asset_contracts ac ON am.id = ac.asset_id
        LEFT JOIN asset_vendors av ON ac.vendor_id = av.id
        WHERE am.active = true 
        AND ac.active = true 
        AND ac.status = 'ACTIVE'
        AND ac.contract_end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '${days} days')
        ORDER BY ac.contract_end_date ASC
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting expiring contracts:', error);
      throw error;
    }
  }

  // Get asset lifecycle history
  static async getAssetLifecycle(assetId) {
    try {
      const query = `
        SELECT 
          ale.*,
          av.vendor_name
        FROM asset_lifecycle_events ale
        LEFT JOIN asset_vendors av ON ale.vendor_id = av.id
        WHERE ale.asset_id = $1 AND ale.active = true
        ORDER BY ale.event_date DESC
      `;

      const result = await pool.query(query, [assetId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset lifecycle:', error);
      throw error;
    }
  }

  // Upload asset document
  static async uploadAssetDocument(assetId, documentData, file) {
    try {
      const { document_type, description, uploaded_by } = documentData;

      const query = `
        INSERT INTO asset_documents (
          asset_id, document_type, document_name, file_path, file_size,
          file_type, upload_date, description, uploaded_by, created_at, active
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, CURRENT_DATE, $7, $8, CURRENT_TIMESTAMP, true
        ) RETURNING *
      `;

      const result = await pool.query(query, [
        assetId, document_type, file.originalname, file.path, file.size,
        file.mimetype, description, uploaded_by
      ]);

      logger.info(`Asset document uploaded: ${document_type} for asset ${assetId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error uploading asset document:', error);
      throw error;
    }
  }

  // Get asset documents
  static async getAssetDocuments(assetId) {
    try {
      const query = `
        SELECT 
          ad.*,
          CASE 
            WHEN ad.expiry_date AND ad.expiry_date <= CURRENT_DATE THEN 'EXPIRED'
            WHEN ad.expiry_date AND ad.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
            ELSE 'VALID'
          END as document_status
        FROM asset_documents ad
        WHERE ad.asset_id = $1 AND ad.active = true
        ORDER BY ad.upload_date DESC
      `;

      const result = await pool.query(query, [assetId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset documents:', error);
      throw error;
    }
  }

  // Calculate asset ROI
  static async calculateAssetROI(assetId) {
    try {
      const query = `
        SELECT 
          am.purchase_cost,
          am.current_value,
          COALESCE(SUM(ae.amount), 0) as total_expenses,
          am.utilization_rate,
          am.performance_rating
        FROM asset_master am
        LEFT JOIN asset_expenses ae ON am.id = ae.asset_id AND ae.active = true
        WHERE am.id = $1 AND am.active = true
        GROUP BY am.id
      `;

      const result = await pool.query(query, [assetId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const asset = result.rows[0];
      const totalCost = parseFloat(asset.purchase_cost) + parseFloat(asset.total_expenses);
      const currentValue = parseFloat(asset.current_value) || 0;
      
      // Calculate benefit based on asset type and utilization
      let benefitValue = currentValue;
      
      if (asset.asset_category === 'INTANGIBLE') {
        // For intangible assets, benefit is based on performance and utilization
        benefitValue = currentValue * (asset.utilization_rate / 100) * (asset.performance_rating / 5);
      } else {
        // For tangible assets, include current value + utilization benefit
        benefitValue = currentValue + (currentValue * 0.1 * (asset.utilization_rate / 100));
      }

      const roi = totalCost > 0 ? ((benefitValue - totalCost) / totalCost) * 100 : 0;

      return {
        total_cost_of_ownership: totalCost,
        current_value: currentValue,
        benefit_value: benefitValue,
        roi_percentage: roi,
        utilization_rate: asset.utilization_rate,
        performance_rating: asset.performance_rating
      };
    } catch (error) {
      logger.error('Error calculating asset ROI:', error);
      throw error;
    }
  }

  // Get vendors
  static async getVendors(filters = {}) {
    try {
      const { vendor_type, active_only = true } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (vendor_type) {
        whereClause += ` AND vendor_type = $${paramIndex++}`;
        queryParams.push(vendor_type);
      }

      if (active_only) {
        whereClause += ` AND active = true`;
      }

      const query = `
        SELECT 
          av.*,
          COUNT(DISTINCT am.id) as assets_count,
          COUNT(DISTINCT ac.id) as contracts_count,
          COALESCE(SUM(ac.contract_value), 0) as total_contract_value
        FROM asset_vendors av
        LEFT JOIN asset_master am ON av.id = am.vendor_id AND am.active = true
        LEFT JOIN asset_contracts ac ON av.id = ac.vendor_id AND ac.active = true AND ac.status = 'ACTIVE'
        WHERE ${whereClause}
        GROUP BY av.id
        ORDER BY av.vendor_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting vendors:', error);
      throw error;
    }
  }

  // Get asset types
  static async getAssetTypes() {
    try {
      const query = `
        SELECT 
          at.*,
          COUNT(DISTINCT am.id) as assets_count
        FROM asset_types at
        LEFT JOIN asset_master am ON at.type_code = am.asset_type AND am.active = true
        WHERE at.active = true
        GROUP BY at.id
        ORDER BY at.name
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset types:', error);
      throw error;
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(centerId = null) {
    try {
      let centerFilter = centerId ? `AND am.center_id = ${centerId}` : '';
      let sharedFilter = centerId ? `OR (am.asset_ownership = 'CORPORATE' AND ${centerId} = ANY(am.shared_centers))` : '';

      const queries = {
        total_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        center_owned_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.asset_ownership = 'CENTER' AND am.active = true ${centerFilter}`,
        corporate_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.asset_ownership = 'CORPORATE' AND am.active = true ${centerId ? `AND ${centerId} = ANY(am.shared_centers)` : ''}`,
        tangible_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.asset_category = 'TANGIBLE' AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        intangible_assets: `SELECT COUNT(*) as count FROM asset_master am WHERE am.asset_category = 'INTANGIBLE' AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        active_contracts: `SELECT COUNT(*) as count FROM asset_contracts ac JOIN asset_master am ON ac.asset_id = am.id WHERE ac.active = true AND ac.status = 'ACTIVE' AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        expiring_contracts: `SELECT COUNT(*) as count FROM asset_contracts ac JOIN asset_master am ON ac.asset_id = am.id WHERE ac.active = true AND ac.status = 'ACTIVE' AND ac.contract_end_date <= CURRENT_DATE + INTERVAL '30 days' AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        total_value: `SELECT COALESCE(SUM(am.purchase_cost), 0) as count FROM asset_master am WHERE am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        total_expenses: `SELECT COALESCE(SUM(ae.amount), 0) as count FROM asset_expenses ae JOIN asset_master am ON ae.asset_id = am.id WHERE ae.active = true AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        maintenance_alerts: `SELECT COUNT(*) as count FROM asset_master am WHERE am.next_maintenance_date <= CURRENT_DATE + INTERVAL '7 days' AND am.active = true ${centerFilter ? `AND (am.center_id = ${centerId} ${sharedFilter})` : ''}`,
        pending_bookings: `SELECT COUNT(*) as count FROM asset_bookings ab JOIN asset_master am ON ab.asset_id = am.id WHERE ab.booking_status = 'PENDING' AND ab.active = true AND am.active = true ${centerId ? `AND ab.requesting_center_id = ${centerId}` : ''}`,
        active_bookings: `SELECT COUNT(*) as count FROM asset_bookings ab JOIN asset_master am ON ab.asset_id = am.id WHERE ab.booking_status = 'APPROVED' AND ab.active = true AND am.active = true ${centerId ? `AND ab.requesting_center_id = ${centerId}` : ''}`
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

  // Get corporate asset pools
  static async getCorporatePools(filters = {}) {
    try {
      const { management_center_id, pool_type, active_only = true } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (management_center_id) {
        whereClause += ` AND cap.management_center_id = $${paramIndex++}`;
        queryParams.push(management_center_id);
      }

      if (pool_type) {
        whereClause += ` AND cap.pool_type = $${paramIndex++}`;
        queryParams.push(pool_type);
      }

      if (active_only) {
        whereClause += ` AND cap.active = true`;
      }

      const query = `
        SELECT 
          cap.*,
          c.name as management_center_name,
          COUNT(DISTINCT am.id) as asset_count,
          COUNT(DISTINCT CASE WHEN am.status = 'ACTIVE' THEN am.id END) as active_assets,
          COUNT(DISTINCT ab.id) as total_bookings,
          COUNT(DISTINCT CASE WHEN ab.booking_status = 'COMPLETED' THEN ab.id END) as completed_bookings,
          COALESCE(SUM(am.purchase_cost), 0) as total_asset_value,
          COALESCE(SUM(ab.utilization_hours), 0) as total_utilization_hours
        FROM corporate_asset_pools cap
        LEFT JOIN centers c ON cap.management_center_id = c.id
        LEFT JOIN asset_master am ON cap.id = am.corporate_pool_id AND am.active = true
        LEFT JOIN asset_bookings ab ON am.id = ab.asset_id AND ab.active = true
        WHERE ${whereClause}
        GROUP BY cap.id, c.name
        ORDER BY cap.pool_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting corporate pools:', error);
      throw error;
    }
  }

  // Get asset bookings
  static async getAssetBookings(filters = {}) {
    try {
      const {
        asset_id,
        requesting_center_id,
        booking_status,
        booking_type,
        start_date,
        end_date,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'ab.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (asset_id) {
        whereClause += ` AND ab.asset_id = $${paramIndex++}`;
        queryParams.push(asset_id);
      }

      if (requesting_center_id) {
        whereClause += ` AND ab.requesting_center_id = $${paramIndex++}`;
        queryParams.push(requesting_center_id);
      }

      if (booking_status) {
        whereClause += ` AND ab.booking_status = $${paramIndex++}`;
        queryParams.push(booking_status);
      }

      if (booking_type) {
        whereClause += ` AND ab.booking_type = $${paramIndex++}`;
        queryParams.push(booking_type);
      }

      if (start_date && end_date) {
        whereClause += ` AND ab.booking_start_date >= $${paramIndex++} AND ab.booking_end_date <= $${paramIndex++}`;
        queryParams.push(start_date, end_date);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          ab.*,
          am.asset_code,
          am.asset_name,
          am.asset_type,
          rc.name as requesting_center_name,
          req_user.name as requested_by_name,
          app_user.name as approved_by_name,
          cap.pool_name
        FROM asset_bookings ab
        LEFT JOIN asset_master am ON ab.asset_id = am.id
        LEFT JOIN centers rc ON ab.requesting_center_id = rc.id
        LEFT JOIN users req_user ON ab.requested_by = req_user.id
        LEFT JOIN users app_user ON ab.approved_by = app_user.id
        LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
        WHERE ${whereClause}
        ORDER BY ab.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset bookings:', error);
      throw error;
    }
  }

  // Create asset booking
  static async createAssetBooking(bookingData) {
    try {
      const {
        asset_id,
        requested_by,
        requesting_center_id,
        requesting_department,
        booking_type,
        booking_start_date,
        booking_end_date,
        booking_start_time,
        booking_end_time,
        purpose,
        priority = 'NORMAL'
      } = bookingData;

      const query = `
        SELECT create_asset_booking(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) as booking_id
      `;

      const result = await pool.query(query, [
        asset_id, requested_by, requesting_center_id, requesting_department,
        booking_type, booking_start_date, booking_end_date, booking_start_time,
        booking_end_time, purpose, priority
      ]);

      const bookingId = result.rows[0].booking_id;
      
      // Get the created booking details
      const bookingQuery = `
        SELECT 
          ab.*,
          am.asset_code,
          am.asset_name,
          rc.name as requesting_center_name,
          req_user.name as requested_by_name
        FROM asset_bookings ab
        LEFT JOIN asset_master am ON ab.asset_id = am.id
        LEFT JOIN centers rc ON ab.requesting_center_id = rc.id
        LEFT JOIN users req_user ON ab.requested_by = req_user.id
        WHERE ab.id = $1
      `;

      const bookingResult = await pool.query(bookingQuery, [bookingId]);
      
      logger.info(`Asset booking created: ${bookingResult.rows[0].booking_reference}`);
      return bookingResult.rows[0];
    } catch (error) {
      logger.error('Error creating asset booking:', error);
      throw error;
    }
  }

  // Get asset transfers
  static async getAssetTransfers(filters = {}) {
    try {
      const {
        asset_id,
        from_center_id,
        to_center_id,
        transfer_status,
        transfer_type,
        start_date,
        end_date,
        page = 1,
        limit = 50
      } = filters;

      let whereClause = 'atrans.active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (asset_id) {
        whereClause += ` AND atrans.asset_id = $${paramIndex++}`;
        queryParams.push(asset_id);
      }

      if (from_center_id) {
        whereClause += ` AND atrans.from_center_id = $${paramIndex++}`;
        queryParams.push(from_center_id);
      }

      if (to_center_id) {
        whereClause += ` AND atrans.to_center_id = $${paramIndex++}`;
        queryParams.push(to_center_id);
      }

      if (transfer_status) {
        whereClause += ` AND atrans.transfer_status = $${paramIndex++}`;
        queryParams.push(transfer_status);
      }

      if (transfer_type) {
        whereClause += ` AND atrans.transfer_type = $${paramIndex++}`;
        queryParams.push(transfer_type);
      }

      if (start_date && end_date) {
        whereClause += ` AND atrans.transfer_date >= $${paramIndex++} AND atrans.transfer_date <= $${paramIndex++}`;
        queryParams.push(start_date, end_date);
      }

      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          atrans.*,
          am.asset_code,
          am.asset_name,
          am.asset_type,
          fc.name as from_center_name,
          tc.name as to_center_name,
          creator.name as created_by_name,
          approver.name as approved_by_name
        FROM asset_transfers atrans
        LEFT JOIN asset_master am ON atrans.asset_id = am.id
        LEFT JOIN centers fc ON atrans.from_center_id = fc.id
        LEFT JOIN centers tc ON atrans.to_center_id = tc.id
        LEFT JOIN users creator ON atrans.created_by = creator.id
        LEFT JOIN users approver ON atrans.approved_by = approver.id
        WHERE ${whereClause}
        ORDER BY atrans.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(limit, offset);

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting asset transfers:', error);
      throw error;
    }
  }

  // Create asset transfer
  static async createAssetTransfer(transferData) {
    try {
      const {
        asset_id,
        from_center_id,
        to_center_id,
        transfer_type,
        transfer_reason,
        transfer_date,
        expected_return_date,
        created_by
      } = transferData;

      const query = `
        SELECT transfer_asset(
          $1, $2, $3, $4, $5, $6, $7, $8
        ) as transfer_id
      `;

      const result = await pool.query(query, [
        asset_id, from_center_id, to_center_id, transfer_type,
        transfer_reason, transfer_date, expected_return_date, created_by
      ]);

      const transferId = result.rows[0].transfer_id;
      
      // Get the created transfer details
      const transferQuery = `
        SELECT 
          atrans.*,
          am.asset_code,
          am.asset_name,
          fc.name as from_center_name,
          tc.name as to_center_name,
          creator.name as created_by_name
        FROM asset_transfers atrans
        LEFT JOIN asset_master am ON atrans.asset_id = am.id
        LEFT JOIN centers fc ON atrans.from_center_id = fc.id
        LEFT JOIN centers tc ON atrans.to_center_id = tc.id
        LEFT JOIN users creator ON atrans.created_by = creator.id
        WHERE atrans.id = $1
      `;

      const transferResult = await pool.query(transferQuery, [transferId]);
      
      logger.info(`Asset transfer created: ${transferResult.rows[0].transfer_reference}`);
      return transferResult.rows[0];
    } catch (error) {
      logger.error('Error creating asset transfer:', error);
      throw error;
    }
  }

  // Get center asset inventory
  static async getCenterAssetInventory(centerId = null) {
    try {
      let whereClause = '1=1';
      if (centerId) {
        whereClause = `c.id = ${centerId}`;
      }

      const query = `
        SELECT * FROM center_asset_inventory
        WHERE ${whereClause}
        ORDER BY center_name
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting center asset inventory:', error);
      throw error;
    }
  }

  // Get corporate asset utilization
  static async getCorporateAssetUtilization(filters = {}) {
    try {
      const { corporate_pool_id, asset_type, utilization_period = 30 } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (corporate_pool_id) {
        whereClause += ` AND am.corporate_pool_id = $${paramIndex++}`;
        queryParams.push(corporate_pool_id);
      }

      if (asset_type) {
        whereClause += ` AND am.asset_type = $${paramIndex++}`;
        queryParams.push(asset_type);
      }

      const query = `
        SELECT 
          am.id as asset_id,
          am.asset_code,
          am.asset_name,
          am.asset_type,
          cap.pool_name,
          COUNT(ab.id) as total_bookings,
          COUNT(CASE WHEN ab.booking_status = 'COMPLETED' THEN ab.id END) as completed_bookings,
          COUNT(CASE WHEN ab.booking_start_date >= CURRENT_DATE - INTERVAL '${utilization_period} days' AND ab.booking_status = 'COMPLETED' THEN ab.id END) as bookings_last_period,
          COALESCE(SUM(ab.utilization_hours), 0) as total_utilization_hours,
          COALESCE(AVG(ab.feedback_rating), 0) as average_feedback,
          COUNT(DISTINCT ab.requesting_center_id) as centers_served,
          MAX(ab.booking_end_date) as last_booking_date,
          CASE 
            WHEN COUNT(ab.id) > 0 THEN 'HIGH_UTILIZATION'
            WHEN COUNT(ab.id) > 5 THEN 'MEDIUM_UTILIZATION'
            ELSE 'LOW_UTILIZATION'
          END as utilization_level
        FROM asset_master am
        LEFT JOIN corporate_asset_pools cap ON am.corporate_pool_id = cap.id
        LEFT JOIN asset_bookings ab ON am.id = ab.asset_id AND ab.active = true
        WHERE am.asset_ownership = 'CORPORATE' AND am.active = true AND ${whereClause}
        GROUP BY am.id, am.asset_code, am.asset_name, am.asset_type, cap.pool_name
        ORDER BY total_utilization_hours DESC
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting corporate asset utilization:', error);
      throw error;
    }
  }
}

// API Routes

// Get assets with filtering and pagination
router.get('/assets', async (req, res) => {
  try {
    const filters = {
      center_id: req.query.center_id,
      asset_category: req.query.asset_category,
      asset_type: req.query.asset_type,
      lifecycle_status: req.query.lifecycle_status,
      vendor_id: req.query.vendor_id,
      contract_expiry_days: req.query.contract_expiry_days,
      page: req.query.page,
      limit: req.query.limit
    };

    const result = await AssetManagement.getAssets(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error getting assets:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create new asset
router.post('/assets', [
  body('asset_code').trim().isLength({ min: 2, max: 20 }),
  body('asset_name').trim().isLength({ min: 5, max: 100 }),
  body('asset_category').isIn(['TANGIBLE', 'INTANGIBLE']),
  body('asset_type').notEmpty(),
  body('description').trim().isLength({ min: 10, max: 500 }),
  body('center_id').isInt(),
  body('purchase_date').isISO8601().toDate(),
  body('purchase_cost').isFloat({ min: 0 })
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

    const asset = await AssetManagement.createAsset(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      data: asset
    });
  } catch (error) {
    logger.error('Error creating asset:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update asset
router.put('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await AssetManagement.updateAsset(parseInt(id), req.body);
    
    res.json({
      success: true,
      message: 'Asset updated successfully',
      data: asset
    });
  } catch (error) {
    logger.error('Error updating asset:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset financial summary
router.get('/assets/:id/financial', async (req, res) => {
  try {
    const { id } = req.params;
    const summary = await AssetManagement.getAssetFinancialSummary(parseInt(id));
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error getting asset financial summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset contracts
router.get('/assets/:id/contracts', async (req, res) => {
  try {
    const { id } = req.params;
    const contracts = await AssetManagement.getAssetContracts(parseInt(id));
    
    res.json({
      success: true,
      data: contracts
    });
  } catch (error) {
    logger.error('Error getting asset contracts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Add asset expense
router.post('/assets/:id/expenses', [
  body('expense_type').isIn(['PURCHASE', 'MAINTENANCE', 'UPGRADE', 'LICENSE', 'REPAIR', 'DISPOSAL']),
  body('expense_category').isIn(['CAPEX', 'OPEX']),
  body('amount').isFloat({ min: 0 }),
  body('expense_date').isISO8601().toDate(),
  body('description').trim().isLength({ min: 10, max: 500 })
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

    const { id } = req.params;
    const expenseData = { ...req.body, asset_id: parseInt(id) };
    const expense = await AssetManagement.addAssetExpense(expenseData);
    
    res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      data: expense
    });
  } catch (error) {
    logger.error('Error adding asset expense:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create asset contract
router.post('/assets/:id/contracts', [
  body('contract_type').isIn(['SLA', 'AMC', 'CMS', 'WARRANTY', 'LICENSE']),
  body('contract_number').trim().isLength({ min: 2, max: 50 }),
  body('contract_start_date').isISO8601().toDate(),
  body('contract_end_date').isISO8601().toDate(),
  body('billing_cycle').isIn(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  body('contract_value').isFloat({ min: 0 })
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

    const { id } = req.params;
    const contractData = { ...req.body, asset_id: parseInt(id) };
    const contract = await AssetManagement.createAssetContract(contractData);
    
    res.status(201).json({
      success: true,
      message: 'Contract created successfully',
      data: contract
    });
  } catch (error) {
    logger.error('Error creating asset contract:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset performance metrics
router.get('/assets/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    
    const performance = await AssetManagement.getAssetPerformance(
      parseInt(id), 
      start_date, 
      end_date
    );
    
    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    logger.error('Error getting asset performance:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset lifecycle history
router.get('/assets/:id/lifecycle', async (req, res) => {
  try {
    const { id } = req.params;
    const lifecycle = await AssetManagement.getAssetLifecycle(parseInt(id));
    
    res.json({
      success: true,
      data: lifecycle
    });
  } catch (error) {
    logger.error('Error getting asset lifecycle:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Upload asset document
router.post('/assets/:id/documents', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { id } = req.params;
    const documentData = {
      document_type: req.body.document_type,
      description: req.body.description,
      uploaded_by: req.body.uploaded_by
    };

    const document = await AssetManagement.uploadAssetDocument(
      parseInt(id), 
      documentData, 
      req.file
    );
    
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    logger.error('Error uploading asset document:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset documents
router.get('/assets/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const documents = await AssetManagement.getAssetDocuments(parseInt(id));
    
    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    logger.error('Error getting asset documents:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Calculate asset ROI
router.get('/assets/:id/roi', async (req, res) => {
  try {
    const { id } = req.params;
    const roi = await AssetManagement.calculateAssetROI(parseInt(id));
    
    if (!roi) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }

    res.json({
      success: true,
      data: roi
    });
  } catch (error) {
    logger.error('Error calculating asset ROI:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get expiring contracts
router.get('/contracts/expiring', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const contracts = await AssetManagement.getExpiringContracts(parseInt(days));
    
    res.json({
      success: true,
      data: contracts
    });
  } catch (error) {
    logger.error('Error getting expiring contracts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get vendors
router.get('/vendors', async (req, res) => {
  try {
    const filters = {
      vendor_type: req.query.vendor_type,
      active_only: req.query.active_only
    };

    const vendors = await AssetManagement.getVendors(filters);
    
    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    logger.error('Error getting vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset types
router.get('/asset-types', async (req, res) => {
  try {
    const assetTypes = await AssetManagement.getAssetTypes();
    
    res.json({
      success: true,
      data: assetTypes
    });
  } catch (error) {
    logger.error('Error getting asset types:', error);
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
    const stats = await AssetManagement.getDashboardStats(center_id);
    
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

// Get corporate asset pools
router.get('/corporate-pools', async (req, res) => {
  try {
    const filters = {
      management_center_id: req.query.management_center_id,
      pool_type: req.query.pool_type,
      active_only: req.query.active_only
    };

    const pools = await AssetManagement.getCorporatePools(filters);
    
    res.json({
      success: true,
      data: pools
    });
  } catch (error) {
    logger.error('Error getting corporate pools:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset bookings
router.get('/bookings', async (req, res) => {
  try {
    const filters = {
      asset_id: req.query.asset_id,
      requesting_center_id: req.query.requesting_center_id,
      booking_status: req.query.booking_status,
      booking_type: req.query.booking_type,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      page: req.query.page,
      limit: req.query.limit
    };

    const bookings = await AssetManagement.getAssetBookings(filters);
    
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    logger.error('Error getting asset bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create asset booking
router.post('/bookings', [
  body('asset_id').isInt(),
  body('requested_by').isInt(),
  body('requesting_center_id').isInt(),
  body('booking_type').isIn(['TEMPORARY', 'PROJECT_BASED', 'MAINTENANCE', 'TRAINING']),
  body('booking_start_date').isISO8601().toDate(),
  body('booking_end_date').isISO8601().toDate(),
  body('purpose').trim().isLength({ min: 10, max: 500 }),
  body('priority').isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
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

    const booking = await AssetManagement.createAssetBooking(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });
  } catch (error) {
    logger.error('Error creating asset booking:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get asset transfers
router.get('/transfers', async (req, res) => {
  try {
    const filters = {
      asset_id: req.query.asset_id,
      from_center_id: req.query.from_center_id,
      to_center_id: req.query.to_center_id,
      transfer_status: req.query.transfer_status,
      transfer_type: req.query.transfer_type,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      page: req.query.page,
      limit: req.query.limit
    };

    const transfers = await AssetManagement.getAssetTransfers(filters);
    
    res.json({
      success: true,
      data: transfers
    });
  } catch (error) {
    logger.error('Error getting asset transfers:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create asset transfer
router.post('/transfers', [
  body('asset_id').isInt(),
  body('from_center_id').isInt(),
  body('to_center_id').isInt(),
  body('transfer_type').isIn(['PERMANENT', 'TEMPORARY', 'ROTATION']),
  body('transfer_reason').trim().isLength({ min: 10, max: 500 }),
  body('transfer_date').isISO8601().toDate(),
  body('created_by').isInt()
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

    const transfer = await AssetManagement.createAssetTransfer(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Transfer created successfully',
      data: transfer
    });
  } catch (error) {
    logger.error('Error creating asset transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get center asset inventory
router.get('/center-inventory', async (req, res) => {
  try {
    const { center_id } = req.query;
    const inventory = await AssetManagement.getCenterAssetInventory(center_id);
    
    res.json({
      success: true,
      data: inventory
    });
  } catch (error) {
    logger.error('Error getting center asset inventory:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get corporate asset utilization
router.get('/corporate-utilization', async (req, res) => {
  try {
    const filters = {
      corporate_pool_id: req.query.corporate_pool_id,
      asset_type: req.query.asset_type,
      utilization_period: req.query.utilization_period
    };

    const utilization = await AssetManagement.getCorporateAssetUtilization(filters);
    
    res.json({
      success: true,
      data: utilization
    });
  } catch (error) {
    logger.error('Error getting corporate asset utilization:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in asset management:', {
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
