const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');

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
    new winston.transports.File({ filename: 'logs/service-management.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Service Management Class
class ServiceManager {
  static async getAllServices() {
    const query = `
      SELECT 
        sm.*,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.active = true
      ORDER BY sm.study_name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getServiceByCode(serviceCode) {
    const query = `
      SELECT 
        sm.*,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.study_code = $1 AND sm.active = true
    `;
    
    const result = await pool.query(query, [serviceCode]);
    return result.rows[0] || null;
  }

  static async createService(serviceData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert service into study_master
      const insertServiceQuery = `
        INSERT INTO study_master (
          study_code, study_name, study_type, base_rate, gst_rate, 
          is_taxable, cess_rate, hsn_code, sac_code, category, 
          gst_applicable, tax_category, department, description,
          active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const serviceValues = [
        serviceData.study_code,
        serviceData.study_name,
        serviceData.study_type || 'SERVICE',
        serviceData.base_rate || 0,
        serviceData.gst_rate || 0.18,
        serviceData.is_taxable !== false,
        serviceData.cess_rate || 0,
        serviceData.hsn_code || null,
        serviceData.sac_code || null,
        serviceData.category || 'GENERAL',
        serviceData.gst_applicable !== false,
        serviceData.tax_category || 'STANDARD',
        serviceData.department || 'GENERAL',
        serviceData.description || null
      ];
      
      const serviceResult = await client.query(insertServiceQuery, serviceValues);
      
      // Create or update tax configuration if HSN/SAC codes are provided
      if (serviceData.hsn_code || serviceData.sac_code) {
        const upsertTaxQuery = `
          INSERT INTO tax_configuration (
            hsn_code, sac_code, gst_percentage, cess_percentage,
            is_reverse_charge_applicable, gst_type, description,
            effective_from, active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (hsn_code, sac_code, effective_from) 
          DO UPDATE SET 
            gst_percentage = EXCLUDED.gst_percentage,
            cess_percentage = EXCLUDED.cess_percentage,
            is_reverse_charge_applicable = EXCLUDED.is_reverse_charge_applicable,
            gst_type = EXCLUDED.gst_type,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `;
        
        const taxValues = [
          serviceData.hsn_code,
          serviceData.sac_code,
          serviceData.gst_rate || 0.18,
          serviceData.cess_rate || 0,
          serviceData.is_reverse_charge_applicable || false,
          serviceData.gst_type || 'SERVICES',
          serviceData.description || ''
        ];
        
        await client.query(upsertTaxQuery, taxValues);
      }
      
      await client.query('COMMIT');
      
      return serviceResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateService(serviceCode, serviceData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update service in study_master
      const updateServiceQuery = `
        UPDATE study_master 
        SET 
          study_name = $1,
          study_type = $2,
          base_rate = $3,
          gst_rate = $4,
          is_taxable = $5,
          cess_rate = $6,
          hsn_code = $7,
          sac_code = $8,
          category = $9,
          gst_applicable = $10,
          tax_category = $11,
          department = $12,
          description = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE study_code = $14
        RETURNING *
      `;
      
      const serviceValues = [
        serviceData.study_name,
        serviceData.study_type || 'SERVICE',
        serviceData.base_rate || 0,
        serviceData.gst_rate || 0.18,
        serviceData.is_taxable !== false,
        serviceData.cess_rate || 0,
        serviceData.hsn_code || null,
        serviceData.sac_code || null,
        serviceData.category || 'GENERAL',
        serviceData.gst_applicable !== false,
        serviceData.tax_category || 'STANDARD',
        serviceData.department || 'GENERAL',
        serviceData.description || null,
        serviceCode
      ];
      
      const serviceResult = await client.query(updateServiceQuery, serviceValues);
      
      // Update tax configuration if HSN/SAC codes are provided
      if (serviceData.hsn_code || serviceData.sac_code) {
        const upsertTaxQuery = `
          INSERT INTO tax_configuration (
            hsn_code, sac_code, gst_percentage, cess_percentage,
            is_reverse_charge_applicable, gst_type, description,
            effective_from, active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (hsn_code, sac_code, effective_from) 
          DO UPDATE SET 
            gst_percentage = EXCLUDED.gst_percentage,
            cess_percentage = EXCLUDED.cess_percentage,
            is_reverse_charge_applicable = EXCLUDED.is_reverse_charge_applicable,
            gst_type = EXCLUDED.gst_type,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `;
        
        const taxValues = [
          serviceData.hsn_code,
          serviceData.sac_code,
          serviceData.gst_rate || 0.18,
          serviceData.cess_rate || 0,
          serviceData.is_reverse_charge_applicable || false,
          serviceData.gst_type || 'SERVICES',
          serviceData.description || ''
        ];
        
        await client.query(upsertTaxQuery, taxValues);
      }
      
      await client.query('COMMIT');
      
      return serviceResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteService(serviceCode) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Soft delete service
      const updateServiceQuery = `
        UPDATE study_master 
        SET active = false, deleted_at = CURRENT_TIMESTAMP
        WHERE study_code = $1
        RETURNING *
      `;
      
      const serviceResult = await client.query(updateServiceQuery, [serviceCode]);
      
      if (serviceResult.rows.length === 0) {
        throw new Error('Service not found');
      }
      
      await client.query('COMMIT');
      
      return serviceResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getServicesByCategory() {
    const query = `
      SELECT 
        category,
        COUNT(*) as service_count,
        SUM(CASE WHEN is_taxable = true THEN 1 ELSE 0 END) as taxable_count,
        SUM(CASE WHEN is_taxable = false THEN 1 ELSE 0 END) as exempt_count,
        AVG(gst_rate) as avg_gst_rate,
        MAX(gst_rate) as max_gst_rate,
        MIN(gst_rate) as min_gst_rate,
        SUM(base_rate) as total_base_rate
      FROM study_master
      WHERE active = true
      GROUP BY category
      ORDER BY category
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getServicesByDepartment() {
    const query = `
      SELECT 
        department,
        COUNT(*) as service_count,
        SUM(CASE WHEN is_taxable = true THEN 1 ELSE 0 END) as taxable_count,
        SUM(CASE WHEN is_taxable = false THEN 1 ELSE 0 END) as exempt_count,
        AVG(gst_rate) as avg_gst_rate,
        SUM(base_rate) as total_base_rate
      FROM study_master
      WHERE active = true
      GROUP BY department
      ORDER BY department
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async searchServices(searchTerm) {
    const query = `
      SELECT 
        sm.*,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.active = true 
      AND (
        sm.study_code ILIKE $1 OR 
        sm.study_name ILIKE $1 OR 
        sm.category ILIKE $1 OR 
        sm.department ILIKE $1 OR
        sm.description ILIKE $1
      )
      ORDER BY sm.study_name
    `;
    
    const result = await pool.query(query, [`%${searchTerm}%`]);
    return result.rows;
  }

  static async getServiceStatistics() {
    const query = `
      SELECT 
        COUNT(*) as total_services,
        SUM(CASE WHEN is_taxable = true THEN 1 ELSE 0 END) as taxable_services,
        SUM(CASE WHEN is_taxable = false THEN 1 ELSE 0 END) as exempt_services,
        SUM(CASE WHEN gst_rate = 0 THEN 1 ELSE 0 END) as zero_gst_services,
        SUM(CASE WHEN gst_rate = 0.05 THEN 1 ELSE 0 END) as gst_5_percent_services,
        SUM(CASE WHEN gst_rate = 0.12 THEN 1 ELSE 0 END) as gst_12_percent_services,
        SUM(CASE WHEN gst_rate = 0.18 THEN 1 ELSE 0 END) as gst_18_percent_services,
        SUM(CASE WHEN gst_rate = 0.28 THEN 1 ELSE 0 END) as gst_28_percent_services,
        AVG(base_rate) as avg_base_rate,
        MAX(base_rate) as max_base_rate,
        MIN(base_rate) as min_base_rate
      FROM study_master
      WHERE active = true
    `;
    
    const result = await pool.query(query);
    return result.rows[0];
  }

  static async duplicateService(originalServiceCode, newServiceData) {
    const originalService = await this.getServiceByCode(originalServiceCode);
    
    if (!originalService) {
      throw new Error('Original service not found');
    }

    const duplicatedService = {
      ...originalService,
      study_code: newServiceData.study_code,
      study_name: newServiceData.study_name || `${originalService.study_name} (Copy)`,
      description: newServiceData.description || originalService.description
    };

    // Remove fields that shouldn't be duplicated
    delete duplicatedService.id;
    delete duplicatedService.created_at;
    delete duplicatedService.updated_at;
    delete duplicatedService.deleted_at;

    return await this.createService(duplicatedService);
  }

  static async bulkUpdateServices(updates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const results = [];
      
      for (const update of updates) {
        const { serviceCode, ...serviceData } = update;
        
        const updateServiceQuery = `
          UPDATE study_master 
          SET 
            study_name = COALESCE($1, study_name),
            study_type = COALESCE($2, study_type),
            base_rate = COALESCE($3, base_rate),
            gst_rate = COALESCE($4, gst_rate),
            is_taxable = COALESCE($5, is_taxable),
            cess_rate = COALESCE($6, cess_rate),
            hsn_code = COALESCE($7, hsn_code),
            sac_code = COALESCE($8, sac_code),
            category = COALESCE($9, category),
            gst_applicable = COALESCE($10, gst_applicable),
            tax_category = COALESCE($11, tax_category),
            department = COALESCE($12, department),
            description = COALESCE($13, description),
            updated_at = CURRENT_TIMESTAMP
          WHERE study_code = $14
          RETURNING *
        `;
        
        const serviceValues = [
          serviceData.study_name,
          serviceData.study_type,
          serviceData.base_rate,
          serviceData.gst_rate,
          serviceData.is_taxable,
          serviceData.cess_rate,
          serviceData.hsn_code,
          serviceData.sac_code,
          serviceData.category,
          serviceData.gst_applicable,
          serviceData.tax_category,
          serviceData.department,
          serviceData.description,
          serviceCode
        ];
        
        const result = await client.query(updateServiceQuery, serviceValues);
        results.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// API Routes

// Get all services
router.get('/services', async (req, res) => {
  try {
    const services = await ServiceManager.getAllServices();
    
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    logger.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get service by code
router.get('/services/:serviceCode', async (req, res) => {
  try {
    const { serviceCode } = req.params;
    const service = await ServiceManager.getServiceByCode(serviceCode);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    logger.error('Error fetching service:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Create new service
router.post('/services',
  [
    body('study_code').trim().isLength({ min: 2, max: 20 }).withMessage('Service code must be 2-20 characters'),
    body('study_name').trim().isLength({ min: 2, max: 100 }).withMessage('Service name must be 2-100 characters'),
    body('study_type').optional().isIn(['SERVICE', 'GOODS', 'CONSULTATION', 'PROCEDURE']).withMessage('Invalid service type'),
    body('base_rate').isDecimal({ min: 0 }).withMessage('Base rate must be non-negative'),
    body('gst_rate').optional().isDecimal({ min: 0, max: 0.28 }).withMessage('GST rate must be between 0 and 28%'),
    body('is_taxable').optional().isBoolean().withMessage('Taxable status must be boolean'),
    body('cess_rate').optional().isDecimal({ min: 0 }).withMessage('CESS rate must be non-negative'),
    body('hsn_code').optional().trim().isLength({ min: 4, max: 8 }).withMessage('HSN code must be 4-8 characters'),
    body('sac_code').optional().trim().isLength({ min: 4, max: 8 }).withMessage('SAC code must be 4-8 characters'),
    body('category').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Category must be 2-50 characters'),
    body('department').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Department must be 2-50 characters'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
    body('gst_applicable').optional().isBoolean().withMessage('GST applicable must be boolean'),
    body('tax_category').optional().isIn(['STANDARD', 'EXEMPT', 'ZERO_RATED']).withMessage('Invalid tax category'),
    body('is_reverse_charge_applicable').optional().isBoolean().withMessage('Reverse charge must be boolean'),
    body('gst_type').optional().isIn(['GOODS', 'SERVICES']).withMessage('GST type must be GOODS or SERVICES')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const serviceData = req.body;
      const service = await ServiceManager.createService(serviceData);

      logger.info(`Service created: ${service.study_code}`, {
        service_code: service.study_code,
        service_name: service.study_name,
        gst_rate: service.gst_rate,
        is_taxable: service.is_taxable
      });

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: service
      });
    } catch (error) {
      logger.error('Error creating service:', error);
      
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Service code already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Update service
router.put('/services/:serviceCode',
  [
    body('study_name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Service name must be 2-100 characters'),
    body('study_type').optional().isIn(['SERVICE', 'GOODS', 'CONSULTATION', 'PROCEDURE']).withMessage('Invalid service type'),
    body('base_rate').optional().isDecimal({ min: 0 }).withMessage('Base rate must be non-negative'),
    body('gst_rate').optional().isDecimal({ min: 0, max: 0.28 }).withMessage('GST rate must be between 0 and 28%'),
    body('is_taxable').optional().isBoolean().withMessage('Taxable status must be boolean'),
    body('cess_rate').optional().isDecimal({ min: 0 }).withMessage('CESS rate must be non-negative'),
    body('hsn_code').optional().trim().isLength({ min: 4, max: 8 }).withMessage('HSN code must be 4-8 characters'),
    body('sac_code').optional().trim().isLength({ min: 4, max: 8 }).withMessage('SAC code must be 4-8 characters'),
    body('category').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Category must be 2-50 characters'),
    body('department').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Department must be 2-50 characters'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
    body('gst_applicable').optional().isBoolean().withMessage('GST applicable must be boolean'),
    body('tax_category').optional().isIn(['STANDARD', 'EXEMPT', 'ZERO_RATED']).withMessage('Invalid tax category'),
    body('is_reverse_charge_applicable').optional().isBoolean().withMessage('Reverse charge must be boolean'),
    body('gst_type').optional().isIn(['GOODS', 'SERVICES']).withMessage('GST type must be GOODS or SERVICES')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { serviceCode } = req.params;
      const serviceData = req.body;
      
      const service = await ServiceManager.updateService(serviceCode, serviceData);

      logger.info(`Service updated: ${serviceCode}`, {
        service_code: serviceCode,
        updated_fields: Object.keys(serviceData)
      });

      res.json({
        success: true,
        message: 'Service updated successfully',
        data: service
      });
    } catch (error) {
      logger.error('Error updating service:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Delete service (soft delete)
router.delete('/services/:serviceCode', async (req, res) => {
  try {
    const { serviceCode } = req.params;
    
    const service = await ServiceManager.deleteService(serviceCode);

    logger.info(`Service deleted: ${serviceCode}`, {
      service_code: serviceCode,
      service_name: service.study_name
    });

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    
    if (error.message === 'Service not found') {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get services by category
router.get('/services/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    const query = `
      SELECT 
        sm.*,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.active = true AND sm.category = $1
      ORDER BY sm.study_name
    `;
    
    const result = await pool.query(query, [category]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching services by category:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get services by department
router.get('/services/department/:department', async (req, res) => {
  try {
    const { department } = req.params;
    
    const query = `
      SELECT 
        sm.*,
        tc.gst_percentage as tax_gst_rate,
        tc.cess_percentage,
        tc.is_reverse_charge_applicable,
        tc.gst_type,
        tc.description as tax_description
      FROM study_master sm
      LEFT JOIN tax_configuration tc ON sm.hsn_code = tc.hsn_code OR sm.sac_code = tc.sac_code
      WHERE sm.active = true AND sm.department = $1
      ORDER BY sm.study_name
    `;
    
    const result = await pool.query(query, [department]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Error fetching services by department:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Search services
router.get('/services/search/:searchTerm', async (req, res) => {
  try {
    const { searchTerm } = req.params;
    const services = await ServiceManager.searchServices(searchTerm);
    
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    logger.error('Error searching services:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get service statistics
router.get('/services/statistics', async (req, res) => {
  try {
    const statistics = await ServiceManager.getServiceStatistics();
    const categoryStats = await ServiceManager.getServicesByCategory();
    const departmentStats = await ServiceManager.getServicesByDepartment();
    
    res.json({
      success: true,
      data: {
        overview: statistics,
        by_category: categoryStats,
        by_department: departmentStats
      }
    });
  } catch (error) {
    logger.error('Error fetching service statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Duplicate service
router.post('/services/:serviceCode/duplicate',
  [
    body('study_code').trim().isLength({ min: 2, max: 20 }).withMessage('Service code must be 2-20 characters'),
    body('study_name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Service name must be 2-100 characters'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { serviceCode } = req.params;
      const newServiceData = req.body;
      
      const duplicatedService = await ServiceManager.duplicateService(serviceCode, newServiceData);

      logger.info(`Service duplicated: ${serviceCode} -> ${duplicatedService.study_code}`, {
        original_service: serviceCode,
        new_service: duplicatedService.study_code
      });

      res.status(201).json({
        success: true,
        message: 'Service duplicated successfully',
        data: duplicatedService
      });
    } catch (error) {
      logger.error('Error duplicating service:', error);
      
      if (error.message === 'Original service not found') {
        return res.status(404).json({
          success: false,
          message: 'Original service not found'
        });
      }
      
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'Service code already exists'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Bulk update services
router.put('/services/bulk',
  [
    body('services').isArray().withMessage('Services must be an array'),
    body('services.*.serviceCode').notEmpty().withMessage('Service code is required'),
    body('services.*.study_name').optional().trim().isLength({ min: 2, max: 100 }),
    body('services.*.base_rate').optional().isDecimal({ min: 0 }),
    body('services.*.gst_rate').optional().isDecimal({ min: 0, max: 0.28 }),
    body('services.*.is_taxable').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { services } = req.body;
      const updatedServices = await ServiceManager.bulkUpdateServices(services);

      logger.info(`Bulk updated ${updatedServices.length} services`, {
        updated_count: updatedServices.length
      });

      res.json({
        success: true,
        message: 'Services updated successfully',
        data: updatedServices
      });
    } catch (error) {
      logger.error('Error bulk updating services:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get service categories
router.get('/categories', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT category
      FROM study_master
      WHERE active = true
      ORDER BY category
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows.map(row => row.category)
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get departments
router.get('/departments', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT department
      FROM study_master
      WHERE active = true
      ORDER BY department
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows.map(row => row.department)
    });
  } catch (error) {
    logger.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get service types
router.get('/service-types', async (req, res) => {
  try {
    const serviceTypes = ['SERVICE', 'GOODS', 'CONSULTATION', 'PROCEDURE'];
    
    res.json({
      success: true,
      data: serviceTypes
    });
  } catch (error) {
    logger.error('Error fetching service types:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get GST rates
router.get('/gst-rates', async (req, res) => {
  try {
    const gstRates = [
      { rate: 0, label: 'GST Exempt', description: 'No GST applicable' },
      { rate: 0.05, label: '5% GST', description: 'Lower GST rate' },
      { rate: 0.12, label: '12% GST', description: 'Standard GST rate' },
      { rate: 0.18, label: '18% GST', description: 'Standard GST rate for services' },
      { rate: 0.28, label: '28% GST', description: 'Higher GST rate' }
    ];
    
    res.json({
      success: true,
      data: gstRates
    });
  } catch (error) {
    logger.error('Error fetching GST rates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in service management:', {
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
