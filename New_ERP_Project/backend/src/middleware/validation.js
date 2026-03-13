const { body, validationResult } = require('express-validator');
const winston = require('winston');

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/validation.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Common validation rules
const commonValidations = {
  // User validations
  createUser: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-50 characters, alphanumeric and underscore only'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
    body('first_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('First name must be 2-50 characters, letters only'),
    body('last_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Last name must be 2-50 characters, letters only'),
    body('role')
      .isIn(['ADMIN', 'MANAGER', 'USER', 'DOCTOR', 'NURSE', 'RECEPTIONIST'])
      .withMessage('Valid role required'),
    body('phone')
      .optional()
      .matches(/^[+]?[\d\s\-\(\)]+$/)
      .withMessage('Valid phone number required'),
    body('center_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid center ID required'),
    body('department_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid department ID required')
  ],

  // Asset validations
  createAsset: [
    body('asset_code')
      .trim()
      .isLength({ min: 2, max: 20 })
      .matches(/^[A-Z0-9\-]+$/)
      .withMessage('Asset code must be 2-20 characters, uppercase letters, numbers, and hyphens'),
    body('asset_name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Asset name must be 3-100 characters'),
    body('asset_type')
      .isIn(['SCANNER', 'COMPUTER', 'WORKSTATION', 'PRINTER', 'NETWORK', 'FURNITURE', 'VEHICLE', 'OTHER'])
      .withMessage('Valid asset type required'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be 10-500 characters'),
    body('center_id')
      .isInt({ min: 1 })
      .withMessage('Valid center ID required'),
    body('manufacturer')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Manufacturer must be 2-100 characters'),
    body('purchase_date')
      .isISO8601()
      .toDate()
      .withMessage('Valid purchase date required'),
    body('purchase_cost')
      .isFloat({ min: 0 })
      .withMessage('Purchase cost must be a positive number'),
    body('serial_number')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Serial number must be 2-50 characters'),
    body('warranty_expiry')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Valid warranty expiry date required'),
    body('status')
      .optional()
      .isIn(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED', 'DISPOSED'])
      .withMessage('Valid status required')
  ],

  // Expense item validations
  createExpenseItem: [
    body('item_code')
      .trim()
      .isLength({ min: 2, max: 20 })
      .matches(/^[A-Z0-9\-]+$/)
      .withMessage('Item code must be 2-20 characters, uppercase letters, numbers, and hyphens'),
    body('item_name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Item name must be 3-100 characters'),
    body('category_id')
      .isInt({ min: 1 })
      .withMessage('Valid category ID required'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be 10-500 characters'),
    body('unit_of_measure')
      .isIn(['PIECES', 'BOXES', 'BOTTLES', 'PACKETS', 'KGS', 'LITERS', 'SETS'])
      .withMessage('Valid unit of measure required'),
    body('current_stock')
      .isInt({ min: 0 })
      .withMessage('Current stock must be a non-negative integer'),
    body('minimum_stock_level')
      .isInt({ min: 0 })
      .withMessage('Minimum stock level must be a non-negative integer'),
    body('maximum_stock_level')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Maximum stock level must be a non-negative integer'),
    body('reorder_quantity')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Reorder quantity must be a non-negative integer'),
    body('unit_price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Unit price must be a positive number')
  ],

  // Patient validations
  createPatient: [
    body('first_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('First name must be 2-50 characters, letters only'),
    body('last_name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .matches(/^[a-zA-Z\s]+$/)
      .withMessage('Last name must be 2-50 characters, letters only'),
    body('gender')
      .isIn(['MALE', 'FEMALE', 'OTHER'])
      .withMessage('Valid gender required'),
    body('date_of_birth')
      .isISO8601()
      .toDate()
      .withMessage('Valid date of birth required'),
    body('blood_group')
      .optional()
      .isIn(['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'])
      .withMessage('Valid blood group required'),
    body('phone')
      .matches(/^[+]?[\d\s\-\(\)]+$/)
      .withMessage('Valid phone number required'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required'),
    body('address')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Address must be 10-500 characters'),
    body('patient_type')
      .optional()
      .isIn(['OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'REFERRED'])
      .withMessage('Valid patient type required')
  ],

  // Vendor validations
  createVendor: [
    body('vendor_name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Vendor name must be 3-100 characters'),
    body('vendor_type')
      .isIn(['MEDICAL', 'PHARMACEUTICAL', 'EQUIPMENT', 'SUPPLIES', 'SERVICE', 'OTHER'])
      .withMessage('Valid vendor type required'),
    body('contact_person')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Contact person must be 3-100 characters'),
    body('phone')
      .matches(/^[+]?[\d\s\-\(\)]+$/)
      .withMessage('Valid phone number required'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required'),
    body('address')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Address must be 10-500 characters'),
    body('gst_number')
      .optional()
      .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]$/)
      .withMessage('Valid GST number required'),
    body('payment_terms')
      .optional()
      .isIn(['NET15', 'NET30', 'NET45', 'NET60', 'COD'])
      .withMessage('Valid payment terms required')
  ],

  // Journal entry validations
  createJournalEntry: [
    body('entry_date')
      .isISO8601()
      .toDate()
      .withMessage('Valid entry date required'),
    body('transaction_type_id')
      .isInt({ min: 1 })
      .withMessage('Valid transaction type ID required'),
    body('description')
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Description must be 5-500 characters'),
    body('lines')
      .isArray({ min: 2 })
      .withMessage('At least 2 line items required'),
    body('lines.*.account_id')
      .isInt({ min: 1 })
      .withMessage('Valid account ID required for each line'),
    body('lines.*.debit_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Debit amount must be a positive number'),
    body('lines.*.credit_amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Credit amount must be a positive number'),
    body('center_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid center ID required'),
    body('department_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid department ID required')
  ],

  // Center validations
  createCenter: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Center name must be 3-100 characters'),
    body('code')
      .trim()
      .isLength({ min: 2, max: 20 })
      .matches(/^[A-Z0-9_]+$/)
      .withMessage('Center code must be 2-20 characters, uppercase letters, numbers, and underscore'),
    body('address')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Address must be 10-500 characters'),
    body('city')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('City must be 2-50 characters'),
    body('state')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('State must be 2-50 characters'),
    body('postal_code')
      .optional()
      .matches(/^[0-9]{6}$/)
      .withMessage('Valid postal code required'),
    body('phone')
      .matches(/^[+]?[\d\s\-\(\)]+$/)
      .withMessage('Valid phone number required'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required')
  ],

  // Department validations
  createDepartment: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Department name must be 3-100 characters'),
    body('code')
      .trim()
      .isLength({ min: 2, max: 20 })
      .matches(/^[A-Z0-9_]+$/)
      .withMessage('Department code must be 2-20 characters, uppercase letters, numbers, and underscore'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Description must be 10-500 characters'),
    body('center_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid center ID required'),
    body('manager_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Valid manager ID required')
  ]
};

// Validation middleware factory
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Validation failed:', {
        url: req.url,
        method: req.method,
        errors: errors.array(),
        body: req.body
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(error => ({
          field: error.path,
          message: error.msg,
          value: error.value
        }))
      });
    }

    next();
  };
};

// Custom validation functions
const customValidations = {
  // Validate that debits equal credits in journal entry
  validateJournalBalance: (req, res, next) => {
    const { lines } = req.body;
    
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of lines) {
      totalDebits += parseFloat(line.debit_amount) || 0;
      totalCredits += parseFloat(line.credit_amount) || 0;
    }

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Total debits must equal total credits',
        total_debits: totalDebits,
        total_credits: totalCredits,
        difference: Math.abs(totalDebits - totalCredits)
      });
    }

    next();
  },

  // Validate that each line has either debit or credit amount
  validateJournalLines: (req, res, next) => {
    const { lines } = req.body;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasDebit = line.debit_amount && parseFloat(line.debit_amount) > 0;
      const hasCredit = line.credit_amount && parseFloat(line.credit_amount) > 0;

      if (!hasDebit && !hasCredit) {
        return res.status(400).json({
          success: false,
          message: `Line ${i + 1} must have either debit or credit amount`
        });
      }

      if (hasDebit && hasCredit) {
        return res.status(400).json({
          success: false,
          message: `Line ${i + 1} cannot have both debit and credit amounts`
        });
      }
    }

    next();
  },

  // Validate date is not in future for birth dates
  validateBirthDate: (req, res, next) => {
    const { date_of_birth } = req.body;
    const birthDate = new Date(date_of_birth);
    const today = new Date();

    if (birthDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Date of birth cannot be in the future'
      });
    }

    // Check if person is not too old (e.g., 120 years)
    const maxAge = 120 * 365 * 24 * 60 * 60 * 1000; // 120 years in milliseconds
    if (today - birthDate > maxAge) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date of birth'
      });
    }

    next();
  },

  // Validate purchase date is not in future
  validatePurchaseDate: (req, res, next) => {
    const { purchase_date } = req.body;
    const purchaseDate = new Date(purchase_date);
    const today = new Date();

    if (purchaseDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Purchase date cannot be in the future'
      });
    }

    next();
  },

  // Validate stock levels
  validateStockLevels: (req, res, next) => {
    const { current_stock, minimum_stock_level, maximum_stock_level } = req.body;

    if (minimum_stock_level > maximum_stock_level) {
      return res.status(400).json({
        success: false,
        message: 'Minimum stock level cannot be greater than maximum stock level'
      });
    }

    if (current_stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Current stock cannot be negative'
      });
    }

    next();
  }
};

module.exports = {
  commonValidations,
  validate,
  customValidations
};
