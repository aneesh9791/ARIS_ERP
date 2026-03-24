const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const { authorizePermission } = require('../middleware/auth');

const router = express.Router();
router.use(authorizePermission('MASTER_DATA_VIEW'));

// Settings Management Class
class SettingsManager {
  // Get system settings
  static async getSystemSettings(filters = {}) {
    try {
      const { category, is_active } = filters;

      let whereClause = '1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (category) {
        whereClause += ` AND ss.setting_category = $${paramIndex++}`;
        queryParams.push(category);
      }

      if (is_active !== undefined) {
        whereClause += ` AND ss.is_active = $${paramIndex++}`;
        queryParams.push(is_active);
      }

      const query = `
        SELECT 
          ss.*,
          CASE 
            WHEN ss.setting_type = 'SELECT' THEN (
              SELECT json_agg(
                json_build_object(
                  'value', opt.option_value,
                  'label', opt.option_label,
                  'description', opt.option_description,
                  'is_default', opt.is_default
                ) ORDER BY opt.sort_order
              )::TEXT
              FROM dropdown_options opt 
              WHERE opt.option_group = ss.setting_key AND opt.is_active = true
            )
            WHEN ss.setting_type = 'BOOLEAN' THEN 
              CASE WHEN ss.setting_value = 'true' THEN 'true' ELSE 'false' END
            WHEN ss.setting_type = 'NUMBER' THEN 
              CASE WHEN ss.setting_value ~ '^[0-9]+(\.[0-9]+)?$' THEN ss.setting_value ELSE '0' END
            ELSE ss.setting_value
          END as processed_value,
          CASE 
            WHEN ss.setting_type = 'SELECT' THEN (
              SELECT opt.option_label 
              FROM dropdown_options opt 
              WHERE opt.option_group = ss.setting_key AND opt.option_value = ss.setting_value AND opt.is_active = true
            )
            WHEN ss.setting_type = 'BOOLEAN' THEN CASE WHEN ss.setting_value = 'true' THEN 'Yes' ELSE 'No' END
            ELSE ss.setting_value
          END as display_value
        FROM system_settings ss
        WHERE ${whereClause}
        ORDER BY ss.setting_category, ss.sort_order
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting system settings:', error);
      throw error;
    }
  }

  // Update system setting
  static async updateSystemSetting(settingKey, settingValue, updatedBy) {
    try {
      // Get setting details for validation
      const settingResult = await pool.query(
        'SELECT * FROM system_settings WHERE setting_key = $1 AND is_active = true',
        [settingKey]
      );

      if (settingResult.rows.length === 0) {
        throw new Error('Setting not found');
      }

      const setting = settingResult.rows[0];

      // Validate setting value based on type
      let validatedValue = settingValue;
      if (setting.validation_rules) {
        const rules = setting.validation_rules;
        
        if (setting.setting_type === 'NUMBER') {
          const numValue = parseFloat(settingValue);
          if (isNaN(numValue)) {
            throw new Error('Invalid number format');
          }
          
          if (rules.min && numValue < parseFloat(rules.min)) {
            throw new Error(`Value must be at least ${rules.min}`);
          }
          
          if (rules.max && numValue > parseFloat(rules.max)) {
            throw new Error(`Value must be at most ${rules.max}`);
          }
          
          validatedValue = numValue.toString();
        } else if (setting.setting_type === 'BOOLEAN') {
          validatedValue = settingValue === 'true' || settingValue === true ? 'true' : 'false';
        } else if (setting.setting_type === 'SELECT') {
          // Validate that the option exists
          const optionResult = await pool.query(
            'SELECT option_value FROM dropdown_options WHERE option_group = $1 AND option_value = $2 AND is_active = true',
            [settingKey, settingValue]
          );
          
          if (optionResult.rows.length === 0) {
            throw new Error('Invalid option selected');
          }
        }
      }

      // Update setting
      const query = `
        UPDATE system_settings 
        SET setting_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE setting_key = $3
        RETURNING *
      `;

      const result = await pool.query(query, [validatedValue, updatedBy, settingKey]);
      
      logger.info(`System setting updated: ${settingKey} = ${validatedValue} by user ${updatedBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating system setting:', error);
      throw error;
    }
  }

  // Get dropdown options
  static async getDropdownOptions(group, parentValue = null) {
    try {
      let whereClause = 'do.is_active = true AND do.option_group = $1';
      let queryParams = [group];
      let paramIndex = 2;

      if (parentValue !== null) {
        whereClause += ` AND do.parent_option_value = $${paramIndex++}`;
        queryParams.push(parentValue);
      }

      const query = `
        SELECT 
          do.*,
          CASE 
            WHEN do.parent_option_value IS NOT NULL THEN 
              (SELECT option_label FROM dropdown_options WHERE option_group = do.option_group AND option_value = do.parent_option_value AND is_active = true)
            ELSE NULL
          END as parent_label
        FROM dropdown_options do
        WHERE ${whereClause}
        ORDER BY do.parent_option_value NULLS FIRST, do.sort_order
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting dropdown options:', error);
      throw error;
    }
  }

  // Get form configurations
  static async getFormConfigurations(formName, userRole = null) {
    try {
      let whereClause = 'fc.is_active = true AND fc.form_name = $1';
      let queryParams = [formName];
      let paramIndex = 2;

      // Add role-based filtering if needed
      if (userRole) {
        // This could be extended to filter fields based on user role
        // whereClause += ` AND (fc.required_roles IS NULL OR $${paramIndex} = ANY(fc.required_roles))`;
        // queryParams.push(userRole);
        // paramIndex++;
      }

      const query = `
        SELECT 
          fc.*,
          CASE 
            WHEN fc.field_type = 'SELECT' THEN (
              SELECT json_agg(
                json_build_object(
                  'value', opt.option_value,
                  'label', opt.option_label,
                  'description', opt.option_description,
                  'is_default', opt.is_default
                ) ORDER BY opt.sort_order
              )
              FROM dropdown_options opt 
              WHERE opt.option_group = fc.field_name AND opt.is_active = true
            )
            ELSE NULL
          END as field_options
        FROM form_configurations fc
        WHERE ${whereClause}
        ORDER BY fc.display_order
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting form configurations:', error);
      throw error;
    }
  }

  // Get user preferences
  static async getUserPreferences(userId) {
    try {
      const query = `
        SELECT 
          up.*,
          ss.setting_name,
          ss.setting_type,
          ss.display_options
        FROM user_preferences up
        LEFT JOIN system_settings ss ON up.preference_key = ss.setting_key
        WHERE up.user_id = $1
        ORDER BY up.preference_category
      `;

      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  // Update user preference
  static async updateUserPreference(userId, preferenceKey, preferenceValue) {
    try {
      const query = `
        INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, preference_key)
        DO UPDATE SET 
          preference_value = $3, 
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [userId, preferenceKey, preferenceValue]);
      
      logger.info(`User preference updated: user ${userId}, ${preferenceKey} = ${preferenceValue}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user preference:', error);
      throw error;
    }
  }

  // Get center settings
  static async getCenterSettings(centerId) {
    try {
      const query = `
        SELECT 
          cs.*,
          ss.setting_name,
          ss.setting_type,
          ss.display_options
        FROM center_settings cs
        LEFT JOIN system_settings ss ON cs.setting_key = ss.setting_key
        WHERE cs.center_id = $1
        ORDER BY cs.setting_category
      `;

      const result = await pool.query(query, [centerId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting center settings:', error);
      throw error;
    }
  }

  // Update center setting
  static async updateCenterSetting(centerId, settingKey, settingValue) {
    try {
      const query = `
        INSERT INTO center_settings (center_id, setting_key, setting_value, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (center_id, setting_key)
        DO UPDATE SET 
          setting_value = $3, 
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [centerId, settingKey, settingValue]);
      
      logger.info(`Center setting updated: center ${centerId}, ${settingKey} = ${settingValue}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating center setting:', error);
      throw error;
    }
  }

  // Get quick actions
  static async getQuickActions(userRole = null, favoritesOnly = false) {
    try {
      let whereClause = 'qa.is_active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (favoritesOnly) {
        whereClause += ` AND qa.is_favorite = true`;
      }

      // Add role-based filtering
      if (userRole) {
        whereClause += ` AND (qa.required_permissions IS NULL OR $${paramIndex} = ANY(qa.required_permissions))`;
        queryParams.push(userRole);
        paramIndex++;
      }

      const query = `
        SELECT 
          qa.*,
          CASE 
            WHEN qa.required_permissions IS NOT NULL THEN 
              (SELECT COUNT(*) FROM json_array_elements(qa.required_permissions) WHERE value = $${paramIndex})
            ELSE 0
          END as permission_count
        FROM quick_actions qa
        WHERE ${whereClause}
        ORDER BY qa.sort_order
      `;

      if (userRole) {
        queryParams.push(userRole);
      }

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting quick actions:', error);
      throw error;
    }
  }

  // Get dashboard widgets
  static async getDashboardWidgets(userRole = null, defaultOnly = false) {
    try {
      let whereClause = 'dw.is_active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (defaultOnly) {
        whereClause += ` AND dw.is_default = true`;
      }

      // Add role-based filtering if needed
      if (userRole) {
        // This could be extended to filter widgets based on user role
        // whereClause += ` AND (dw.required_roles IS NULL OR $${paramIndex} = ANY(dw.required_roles))`;
        // queryParams.push(userRole);
        // paramIndex++;
      }

      const query = `
        SELECT 
          dw.*,
          CASE 
            WHEN dw.widget_type = 'METRIC' THEN 
              json_build_object(
                'showTrend', true,
                'showIcon', true,
                'showColor', true
              )
            WHEN dw.widget_type = 'CHART' THEN 
              json_build_object(
                'responsive', true,
                'legend', true,
                'tooltip', true
              )
            WHEN dw.widget_type = 'TABLE' THEN 
              json_build_object(
                'sortable', true,
                'filterable', true,
                'paginated', true
              )
            ELSE NULL
          END as default_config
        FROM dashboard_widgets dw
        WHERE ${whereClause}
        ORDER BY dw.widget_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting dashboard widgets:', error);
      throw error;
    }
  }

  // Get notification templates
  static async getNotificationTemplates(filters = {}) {
    try {
      const { template_type, template_category } = filters;

      let whereClause = 'nt.is_active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (template_type) {
        whereClause += ` AND nt.template_type = $${paramIndex++}`;
        queryParams.push(template_type);
      }

      if (template_category) {
        whereClause += ` AND nt.template_category = $${paramIndex++}`;
        queryParams.push(template_category);
      }

      const query = `
        SELECT 
          nt.*,
          CASE 
            WHEN nt.template_variables IS NOT NULL THEN 
              json_array_length(nt.template_variables)
            ELSE 0
          END as variable_count
        FROM notification_templates nt
        WHERE ${whereClause}
        ORDER BY nt.template_name
      `;

      const result = await pool.query(query, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Error getting notification templates:', error);
      throw error;
    }
  }

  // Get all settings with categories for easy UI rendering
  static async getAllSettingsForUI() {
    try {
      const query = `
        WITH settings_with_options AS (
          SELECT 
            ss.*,
            CASE 
              WHEN ss.setting_type = 'SELECT' THEN (
                SELECT json_agg(
                  json_build_object(
                    'value', opt.option_value,
                    'label', opt.option_label,
                    'description', opt.option_description,
                    'is_default', opt.is_default
                  ) ORDER BY opt.sort_order
                )
                FROM dropdown_options opt 
                WHERE opt.option_group = ss.setting_key AND opt.is_active = true
              )
              ELSE NULL
            END as options,
            CASE 
              WHEN ss.setting_type = 'SELECT' THEN (
                SELECT opt.option_label 
                FROM dropdown_options opt 
                WHERE opt.option_group = ss.setting_key AND opt.option_value = ss.setting_value AND opt.is_active = true
              )
              WHEN ss.setting_type = 'BOOLEAN' THEN CASE WHEN ss.setting_value = 'true' THEN 'Yes' ELSE 'No' END
              ELSE ss.setting_value
            END as display_value
          FROM system_settings ss
          WHERE ss.is_active = true
        )
        SELECT 
          setting_category,
          json_agg(
            json_build_object(
              'key', setting_key,
              'name', setting_name,
              'type', setting_type,
              'value', setting_value,
              'defaultValue', default_value,
              'description', description,
              'options', options,
              'displayValue', display_value,
              'isRequired', is_required,
              'validationRules', validation_rules,
              'sortOrder', sort_order
            ) ORDER BY sort_order
          ) as settings
        FROM settings_with_options
        GROUP BY setting_category
        ORDER BY setting_category
      `;

      const result = await pool.query(query);
      
      // Convert to object format
      const settingsByCategory = {};
      result.rows.forEach(row => {
        settingsByCategory[row.setting_category] = row.settings;
      });

      return settingsByCategory;
    } catch (error) {
      logger.error('Error getting all settings for UI:', error);
      throw error;
    }
  }

  // Bulk update settings
  static async bulkUpdateSettings(settings, updatedBy) {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const results = [];
        for (const setting of settings) {
          const { key, value } = setting;
          
          // Validate and update each setting
          const result = await this.updateSystemSetting(key, value, updatedBy);
          results.push(result);
        }

        await client.query('COMMIT');
        
        logger.info(`Bulk update completed: ${settings.length} settings updated by user ${updatedBy}`);
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error in bulk update settings:', error);
      throw error;
    }
  }

  // Reset setting to default
  static async resetSettingToDefault(settingKey, updatedBy) {
    try {
      const query = `
        UPDATE system_settings 
        SET setting_value = default_value, updated_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE setting_key = $2
        RETURNING *
      `;

      const result = await pool.query(query, [updatedBy, settingKey]);
      
      if (result.rows.length === 0) {
        throw new Error('Setting not found');
      }

      logger.info(`Setting reset to default: ${settingKey} by user ${updatedBy}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error resetting setting to default:', error);
      throw error;
    }
  }

  // Export settings
  static async exportSettings(category = null) {
    try {
      let whereClause = 'ss.is_active = true';
      let queryParams = [];
      let paramIndex = 1;

      if (category) {
        whereClause += ` AND ss.setting_category = $${paramIndex++}`;
        queryParams.push(category);
      }

      const query = `
        SELECT 
          ss.setting_key,
          ss.setting_value,
          ss.setting_name,
          ss.setting_category,
          ss.description
        FROM system_settings ss
        WHERE ${whereClause}
        ORDER BY ss.setting_category, ss.setting_key
      `;

      const result = await pool.query(query, queryParams);
      
      // Format for export
      const exportData = {
        exported_at: new Date().toISOString(),
        settings: result.rows.reduce((acc, row) => {
          if (!acc[row.setting_category]) {
            acc[row.setting_category] = {};
          }
          acc[row.setting_category][row.setting_key] = {
            value: row.setting_value,
            name: row.setting_name,
            description: row.description
          };
          return acc;
        }, {})
      };

      return exportData;
    } catch (error) {
      logger.error('Error exporting settings:', error);
      throw error;
    }
  }

  // Import settings
  static async importSettings(settingsData, updatedBy) {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const results = [];
        for (const [category, settings] of Object.entries(settingsData.settings)) {
          for (const [key, setting] of Object.entries(settings)) {
            try {
              const result = await this.updateSystemSetting(key, setting.value, updatedBy);
              results.push({
                key,
                category,
                status: 'success',
                message: 'Updated successfully'
              });
            } catch (error) {
              results.push({
                key,
                category,
                status: 'error',
                message: error.message
              });
            }
          }
        }

        await client.query('COMMIT');
        
        logger.info(`Settings import completed: ${results.length} settings processed by user ${updatedBy}`);
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error importing settings:', error);
      throw error;
    }
  }
}

// API Routes

// Get all settings for UI
router.get('/ui', async (req, res) => {
  try {
    const settings = await SettingsManager.getAllSettingsForUI();
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error getting UI settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get system settings
router.get('/system', async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      is_active: req.query.is_active
    };

    const settings = await SettingsManager.getSystemSettings(filters);
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error getting system settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update system setting
router.put('/system/:key', [
  body('value').notEmpty()
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

    const { key } = req.params;
    const { value } = req.body;
    const updatedBy = req.user?.id || 1; // Get from authenticated user

    const setting = await SettingsManager.updateSystemSetting(key, value, updatedBy);
    
    res.json({
      success: true,
      message: 'Setting updated successfully',
      data: setting
    });
  } catch (error) {
    logger.error('Error updating system setting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Reset setting to default
router.post('/system/:key/reset', async (req, res) => {
  try {
    const { key } = req.params;
    const updatedBy = req.user?.id || 1;

    const setting = await SettingsManager.resetSettingToDefault(key, updatedBy);
    
    res.json({
      success: true,
      message: 'Setting reset to default successfully',
      data: setting
    });
  } catch (error) {
    logger.error('Error resetting setting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Bulk update settings
router.put('/system/bulk', [
  body('settings').isArray({ min: 1 }),
  body('settings.*.key').notEmpty(),
  body('settings.*.value').notEmpty()
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

    const { settings } = req.body;
    const updatedBy = req.user?.id || 1;

    const results = await SettingsManager.bulkUpdateSettings(settings, updatedBy);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: results
    });
  } catch (error) {
    logger.error('Error in bulk update settings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get dropdown options
router.get('/dropdown/:group', async (req, res) => {
  try {
    const { group } = req.params;
    const { parent_value } = req.query;

    const options = await SettingsManager.getDropdownOptions(group, parent_value);
    
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    logger.error('Error getting dropdown options:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get form configurations
router.get('/forms/:formName', async (req, res) => {
  try {
    const { formName } = req.params;
    const userRole = req.user?.role; // Get from authenticated user

    const configurations = await SettingsManager.getFormConfigurations(formName, userRole);
    
    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    logger.error('Error getting form configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user preferences
router.get('/user/preferences', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const preferences = await SettingsManager.getUserPreferences(userId);
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user preference
router.put('/user/preferences/:key', [
  body('value').notEmpty()
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

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { key } = req.params;
    const { value } = req.body;

    const preference = await SettingsManager.updateUserPreference(userId, key, value);
    
    res.json({
      success: true,
      message: 'Preference updated successfully',
      data: preference
    });
  } catch (error) {
    logger.error('Error updating user preference:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get center settings
router.get('/center/:centerId', async (req, res) => {
  try {
    const { centerId } = req.params;

    const settings = await SettingsManager.getCenterSettings(centerId);
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error getting center settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update center setting
router.put('/center/:centerId/:key', [
  body('value').notEmpty()
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

    const { centerId, key } = req.params;
    const { value } = req.body;

    const setting = await SettingsManager.updateCenterSetting(centerId, key, value);
    
    res.json({
      success: true,
      message: 'Center setting updated successfully',
      data: setting
    });
  } catch (error) {
    logger.error('Error updating center setting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Get quick actions
router.get('/quick-actions', async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { favorites_only } = req.query;

    const actions = await SettingsManager.getQuickActions(userRole, favorites_only);
    
    res.json({
      success: true,
      data: actions
    });
  } catch (error) {
    logger.error('Error getting quick actions:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get dashboard widgets
router.get('/dashboard/widgets', async (req, res) => {
  try {
    const userRole = req.user?.role;
    const { default_only } = req.query;

    const widgets = await SettingsManager.getDashboardWidgets(userRole, default_only);
    
    res.json({
      success: true,
      data: widgets
    });
  } catch (error) {
    logger.error('Error getting dashboard widgets:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get notification templates
router.get('/notification-templates', async (req, res) => {
  try {
    const filters = {
      template_type: req.query.template_type,
      template_category: req.query.template_category
    };

    const templates = await SettingsManager.getNotificationTemplates(filters);
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Error getting notification templates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Export settings
router.get('/export', async (req, res) => {
  try {
    const { category } = req.query;

    const exportData = await SettingsManager.exportSettings(category);
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    logger.error('Error exporting settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Import settings
router.post('/import', [
  body('settings').isObject()
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

    const { settings } = req.body;
    const updatedBy = req.user?.id || 1;

    const results = await SettingsManager.importSettings(settings, updatedBy);
    
    res.json({
      success: true,
      message: 'Settings import completed',
      data: results
    });
  } catch (error) {
    logger.error('Error importing settings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in settings:', {
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

// ── COMPANY INFO ────────────────────────────────────────────────────────────
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(png|jpeg|jpg|svg\+xml|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// GET company info + directors
router.get('/company', async (req, res) => {
  try {
    const ci = await pool.query('SELECT * FROM company_info ORDER BY id LIMIT 1');
    const company = ci.rows[0] || {};
    const dirs = await pool.query(
      'SELECT * FROM company_directors WHERE company_id=$1 AND active=true ORDER BY sort_order, id',
      [company.id]
    );
    res.json({ success: true, company, directors: dirs.rows });
  } catch (err) {
    logger.error('Get company info error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update company info
router.put('/company', async (req, res) => {
  try {
    const {
      company_name, tagline, address_line1, address_line2,
      city, state, pincode, country,
      phone, alternate_phone, email, website,
      pan_number, gstin, cin, tan, msme_number, incorporation_date,
      bill_header_text, bill_footer_text, terms_and_conditions,
      po_header_text, po_footer_text, po_terms_conditions,
    } = req.body;

    const existing = await pool.query('SELECT id FROM company_info ORDER BY id LIMIT 1');
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO company_info
          (company_name,tagline,address_line1,address_line2,city,state,pincode,country,
           phone,alternate_phone,email,website,pan_number,gstin,cin,tan,msme_number,
           incorporation_date,bill_header_text,bill_footer_text,terms_and_conditions,
           po_header_text,po_footer_text,po_terms_conditions,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
         RETURNING *`,
        [company_name,tagline,address_line1,address_line2,city,state,pincode,country,
         phone,alternate_phone,email,website,pan_number,gstin,cin,tan,msme_number,
         incorporation_date||null,bill_header_text,bill_footer_text,terms_and_conditions,
         po_header_text,po_footer_text,po_terms_conditions]
      );
    } else {
      result = await pool.query(
        `UPDATE company_info SET
          company_name=$1,tagline=$2,address_line1=$3,address_line2=$4,
          city=$5,state=$6,pincode=$7,country=$8,
          phone=$9,alternate_phone=$10,email=$11,website=$12,
          pan_number=$13,gstin=$14,cin=$15,tan=$16,msme_number=$17,
          incorporation_date=$18,bill_header_text=$19,bill_footer_text=$20,
          terms_and_conditions=$21,po_header_text=$22,po_footer_text=$23,
          po_terms_conditions=$24,updated_at=NOW()
         WHERE id=$25 RETURNING *`,
        [company_name,tagline,address_line1,address_line2,city,state,pincode,country,
         phone,alternate_phone,email,website,pan_number,gstin,cin,tan,msme_number,
         incorporation_date||null,bill_header_text,bill_footer_text,terms_and_conditions,
         po_header_text,po_footer_text,po_terms_conditions,
         existing.rows[0].id]
      );
    }
    // Upsert the Corporate / Head Office center to stay in sync with company info
    const corpName    = `${company_name} (Corporate)`;
    const corpAddress = [address_line1, address_line2].filter(Boolean).join(', ') || null;
    await pool.query(
      `INSERT INTO centers (code, name, address, city, state, postal_code, phone, email, gst_number, pan_number, active)
       VALUES ('CORP', $1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       ON CONFLICT (code) DO UPDATE SET
         name=$1, address=$2, city=$3, state=$4, postal_code=$5,
         phone=$6, email=$7, gst_number=$8, pan_number=$9, active=true, updated_at=NOW()`,
      [corpName, corpAddress, city||null, state||null, pincode||null, phone||null, email||null, gstin||null, pan_number||null]
    );

    res.json({ success: true, company: result.rows[0] });
  } catch (err) {
    logger.error('Update company info error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST upload logo
router.post('/company/logo', uploadLogo.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoPath = `/uploads/logos/${req.file.filename}`;
    const existing = await pool.query('SELECT id FROM company_info ORDER BY id LIMIT 1');
    if (existing.rows.length > 0) {
      await pool.query('UPDATE company_info SET logo_path=$1, updated_at=NOW() WHERE id=$2',
        [logoPath, existing.rows[0].id]);
    } else {
      // No company_info row yet — create one so the logo is persisted
      await pool.query('INSERT INTO company_info (logo_path, updated_at) VALUES ($1, NOW())', [logoPath]);
    }
    res.json({ success: true, logo_path: logoPath });
  } catch (err) {
    logger.error('Logo upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE logo
router.delete('/company/logo', async (req, res) => {
  try {
    const ci = await pool.query('SELECT logo_path FROM company_info ORDER BY id LIMIT 1');
    const p = ci.rows[0]?.logo_path;
    if (p) {
      const abs = path.join(__dirname, '../../', p);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      await pool.query("UPDATE company_info SET logo_path=NULL, updated_at=NOW() WHERE id=(SELECT id FROM company_info ORDER BY id LIMIT 1)");
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Logo delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST add director
router.post('/company/directors', [
  body('director_name').trim().notEmpty().withMessage('Director name is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const ci = await pool.query('SELECT id FROM company_info ORDER BY id LIMIT 1');
    if (!ci.rows.length) return res.status(404).json({ error: 'Company not found' });
    const { director_name, designation, din, email, phone } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) as mo FROM company_directors WHERE company_id=$1', [ci.rows[0].id]);
    const result = await pool.query(
      `INSERT INTO company_directors (company_id,director_name,designation,din,email,phone,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ci.rows[0].id, director_name, designation||null, din||null, email||null, phone||null, maxOrder.rows[0].mo + 1]
    );
    res.status(201).json({ success: true, director: result.rows[0] });
  } catch (err) {
    logger.error('Add director error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update director
router.put('/company/directors/:id', async (req, res) => {
  try {
    const { director_name, designation, din, email, phone } = req.body;
    const result = await pool.query(
      `UPDATE company_directors SET director_name=$1,designation=$2,din=$3,email=$4,phone=$5
       WHERE id=$6 AND active=true RETURNING *`,
      [director_name, designation||null, din||null, email||null, phone||null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Director not found' });
    res.json({ success: true, director: result.rows[0] });
  } catch (err) {
    logger.error('Update director error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE director
router.delete('/company/directors/:id', async (req, res) => {
  try {
    await pool.query('UPDATE company_directors SET active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete director error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
