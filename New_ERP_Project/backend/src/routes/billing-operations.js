const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const crypto = require('crypto');

const router = express.Router();

// Role-based Access Control Configuration
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  BILLING_CLERK: 'BILLING_CLERK',
  RECEPTIONIST: 'RECEPTIONIST',
  VIEWER: 'VIEWER'
};

// Permission Matrix
const PERMISSIONS = {
  // Bill Operations
  EDIT_BILL: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.BILLING_CLERK],
  DELETE_BILL: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  CANCEL_BILL: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  
  // Discount Operations
  APPLY_DISCOUNT: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  APPROVE_DISCOUNT: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  
  // Refund Operations
  PROCESS_REFUND: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  APPROVE_REFUND: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  
  // Payment Operations
  EDIT_PAYMENT: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT],
  DELETE_PAYMENT: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
  
  // View Operations
  VIEW_BILL: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.BILLING_CLERK, ROLES.RECEPTIONIST, ROLES.VIEWER],
  VIEW_FINANCIALS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.ACCOUNTANT]
};

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
    new winston.transports.File({ filename: 'logs/billing-operations.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Utility Functions
class BillingOperationsUtils {
  static generateCreditNoteNumber(centerId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CRN-${centerId}-${year}${month}${day}-${random}`;
  }

  static generateRefundNumber(centerId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `REF-${centerId}-${year}${month}${day}-${random}`;
  }

  static checkPermission(userRole, permission) {
    return PERMISSIONS[permission]?.includes(userRole) || false;
  }

  static validateBillStatusForEdit(bill) {
    const editableStatuses = ['DRAFT', 'PENDING', 'POSTED'];
    return editableStatuses.includes(bill.billing_status);
  }

  static validateBillStatusForCancel(bill) {
    const cancellableStatuses = ['DRAFT', 'PENDING', 'POSTED', 'PARTIALLY_PAID'];
    return cancellableStatuses.includes(bill.billing_status);
  }

  static validateBillStatusForRefund(bill) {
    const refundableStatuses = ['FULLY_PAID', 'OVERPAID', 'PARTIALLY_PAID'];
    return refundableStatuses.includes(bill.billing_status) && parseFloat(bill.amount_paid) > 0;
  }

  static calculateRefundableAmount(bill, refundAmount) {
    const amountPaid = parseFloat(bill.amount_paid);
    const requestedRefund = parseFloat(refundAmount);
    return Math.min(requestedRefund, amountPaid);
  }

  static formatCurrency(amount) {
    return parseFloat(amount).toFixed(2);
  }

  static createAuditTrail(userId, action, entityType, entityId, oldValues, newValues, additionalDetails = {}) {
    return {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues || {},
      new_values: newValues || {},
      ip_address: additionalDetails.ipAddress,
      user_agent: additionalDetails.userAgent,
      session_id: additionalDetails.sessionId,
      additional_details: additionalDetails
    };
  }
}

// Middleware for Role-based Access Control
const checkPermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user?.role || 'VIEWER';
    
    if (!BillingOperationsUtils.checkPermission(userRole, permission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to perform this action',
        required_permission: permission,
        user_role: userRole
      });
    }
    
    next();
  };
};

// Middleware to get user from session/token
const authenticateUser = (req, res, next) => {
  // This should be implemented based on your authentication system
  // For now, we'll assume user is attached to req.user
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

// Edit Bill
router.put('/bills/:billId/edit',
  authenticateUser,
  checkPermission('EDIT_BILL'),
  [
    body('patient_id').optional().trim().isLength({ min: 1, max: 50 }),
    body('center_id').optional().isInt(),
    body('study_codes').optional().isArray(),
    body('payment_terms').optional().isIn(['IMMEDIATE', 'NET15', 'NET30', 'NET45', 'NET60']),
    body('notes').optional().trim().isLength({ max: 500 }),
    body('billing_address').optional(),
    body('shipping_address').optional()
  ],
  async (req, res) => {
    const { billId } = req.params;
    const userId = req.user.id;
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Get current bill
      const currentBillQuery = `
        SELECT * FROM accounting_bills 
        WHERE id = $1 AND active = true
      `;
      const currentBillResult = await pool.query(currentBillQuery, [billId]);
      
      if (currentBillResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      const currentBill = currentBillResult.rows[0];

      // Check if bill can be edited
      if (!BillingOperationsUtils.validateBillStatusForEdit(currentBill)) {
        return res.status(400).json({
          success: false,
          message: `Bill cannot be edited in status: ${currentBill.billing_status}`
        });
      }

      // Store old values for audit
      const oldValues = { ...currentBill };

      // Update bill with new values
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      const {
        patient_id,
        center_id,
        study_codes,
        payment_terms,
        notes,
        billing_address,
        shipping_address
      } = req.body;

      if (patient_id) {
        updateFields.push(`patient_id = $${paramIndex++}`);
        updateValues.push(patient_id);
      }

      if (center_id) {
        updateFields.push(`center_id = $${paramIndex++}`);
        updateValues.push(center_id);
      }

      if (payment_terms) {
        updateFields.push(`payment_terms = $${paramIndex++}`);
        updateValues.push(payment_terms);
        
        // Recalculate due date and due days
        const dueDays = payment_terms === 'IMMEDIATE' ? 0 : parseInt(payment_terms.replace('NET', ''));
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dueDays);
        
        updateFields.push(`due_date = $${paramIndex++}`);
        updateValues.push(dueDate);
        updateFields.push(`due_days = $${paramIndex++}`);
        updateValues.push(dueDays);
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        updateValues.push(notes);
      }

      if (billing_address) {
        updateFields.push(`billing_address = $${paramIndex++}`);
        updateValues.push(JSON.stringify(billing_address));
      }

      if (shipping_address) {
        updateFields.push(`shipping_address = $${paramIndex++}`);
        updateValues.push(JSON.stringify(shipping_address));
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(billId);

      if (updateFields.length > 1) { // More than just updated_at
        const updateQuery = `
          UPDATE accounting_bills 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;

        const updatedBillResult = await pool.query(updateQuery, updateValues);
        const updatedBill = updatedBillResult.rows[0];

        // If study codes changed, update bill items
        if (study_codes && Array.isArray(study_codes)) {
          // Get study details
          const studyDetailsQuery = `
            SELECT study_code, study_name, base_rate, hsn_code, sac_code, gst_rate,
                   is_taxable, cess_rate, category
            FROM study_master 
            WHERE study_code = ANY($1)
          `;
          const studyDetailsResult = await pool.query(studyDetailsQuery, [study_codes]);
          
          // Delete existing items
          await pool.query(
            'UPDATE accounting_bill_items SET active = false WHERE bill_id = $1',
            [billId]
          );

          // Create new items
          let subtotal = 0;
          let taxableAmount = 0;
          const newItems = [];

          for (const study of studyDetailsResult.rows) {
            const quantity = 1;
            const unitPrice = parseFloat(study.base_rate);
            const totalPrice = unitPrice * quantity;
            
            subtotal += totalPrice;
            
            if (study.is_taxable !== false) {
              taxableAmount += totalPrice;
            }

            const itemQuery = `
              INSERT INTO accounting_bill_items (
                bill_id, item_code, item_name, item_type, hsn_code, sac_code,
                quantity, unit_price, total_price, discount_percentage, discount_amount,
                taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
              ) RETURNING *
            `;

            const gstRate = study.gst_rate || 0.18;
            const cgstAmount = study.is_taxable !== false ? (totalPrice * (gstRate / 2)) : 0;
            const sgstAmount = study.is_taxable !== false ? (totalPrice * (gstRate / 2)) : 0;

            const itemValues = [
              billId, study.study_code, study.study_name, 'SERVICE',
              study.hsn_code, study.sac_code, quantity, unitPrice, totalPrice,
              0, 0, study.is_taxable !== false ? totalPrice : 0, gstRate,
              cgstAmount, sgstAmount, 0, study.cess_rate ? totalPrice * study.cess_rate : 0, totalPrice
            ];

            const itemResult = await pool.query(itemQuery, itemValues);
            newItems.push(itemResult.rows[0]);
          }

          // Recalculate totals
          const discountAmount = parseFloat(updatedBill.discount_amount) || 0;
          const discountedSubtotal = subtotal - discountAmount;
          const gstAmount = taxableAmount * 0.18;
          const totalAmount = discountedSubtotal + gstAmount;
          const balanceAmount = totalAmount - parseFloat(updatedBill.amount_paid);

          // Update bill totals
          await pool.query(`
            UPDATE accounting_bills 
            SET subtotal = $1, taxable_amount = $2, cgst_amount = $3, sgst_amount = $4,
                total_amount = $5, balance_amount = $6
            WHERE id = $7
          `, [subtotal, taxableAmount, gstAmount / 2, gstAmount / 2, totalAmount, balanceAmount, billId]);
        }

        // Create audit trail
        const auditData = BillingOperationsUtils.createAuditTrail(
          userId, 'UPDATE', 'ACCOUNTING_BILL', billId,
          oldValues, updatedBill, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID
          }
        );

        await pool.query(`
          INSERT INTO audit_trail (
            user_id, action, entity_type, entity_id, old_values, new_values,
            ip_address, user_agent, session_id, additional_details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        `, [
          auditData.user_id, auditData.action, auditData.entity_type, auditData.entity_id,
          JSON.stringify(auditData.old_values), JSON.stringify(auditData.new_values),
          auditData.ip_address, auditData.user_agent, auditData.session_id,
          JSON.stringify(auditData.additional_details)
        ]);

        logger.info(`Bill ${billId} updated by user ${userId}`, {
          bill_id: billId,
          user_id: userId,
          changes: Object.keys(req.body)
        });

        res.json({
          success: true,
          message: 'Bill updated successfully',
          data: updatedBill
        });
      } else {
        res.json({
          success: true,
          message: 'No changes to update',
          data: currentBill
        });
      }

    } catch (error) {
      logger.error('Error updating bill:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Apply Discount
router.post('/bills/:billId/discount',
  authenticateUser,
  checkPermission('APPLY_DISCOUNT'),
  [
    body('discount_percentage').isDecimal({ min: 0, max: 100 }).withMessage('Discount percentage must be between 0 and 100'),
    body('discount_amount').optional().isDecimal({ min: 0 }).withMessage('Discount amount must be non-negative'),
    body('discount_reason').trim().isLength({ min: 2, max: 200 }).withMessage('Discount reason is required'),
    body('requires_approval').optional().isBoolean()
  ],
  async (req, res) => {
    const { billId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        discount_percentage,
        discount_amount,
        discount_reason,
        requires_approval = false
      } = req.body;

      // Get current bill
      const currentBillQuery = `
        SELECT * FROM accounting_bills 
        WHERE id = $1 AND active = true
      `;
      const currentBillResult = await pool.query(currentBillQuery, [billId]);
      
      if (currentBillResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      const currentBill = currentBillResult.rows[0];

      // Check if bill can be discounted
      if (!BillingOperationsUtils.validateBillStatusForEdit(currentBill)) {
        return res.status(400).json({
          success: false,
          message: `Discount cannot be applied to bill in status: ${currentBill.billing_status}`
        });
      }

      // Check approval requirements
      const needsApproval = requires_approval || discount_percentage > 10 || parseFloat(discount_amount || 0) > 1000;
      
      if (needsApproval && !BillingOperationsUtils.checkPermission(userRole, 'APPROVE_DISCOUNT')) {
        return res.status(403).json({
          success: false,
          message: 'This discount requires managerial approval'
        });
      }

      const subtotal = parseFloat(currentBill.subtotal);
      let calculatedDiscountAmount = 0;

      if (discount_amount) {
        calculatedDiscountAmount = parseFloat(discount_amount);
      } else {
        calculatedDiscountAmount = subtotal * (parseFloat(discount_percentage) / 100);
      }

      if (calculatedDiscountAmount > subtotal) {
        return res.status(400).json({
          success: false,
          message: 'Discount amount cannot exceed subtotal'
        });
      }

      // Recalculate totals
      const discountedSubtotal = subtotal - calculatedDiscountAmount;
      const taxableAmount = parseFloat(currentBill.taxable_amount) - (calculatedDiscountAmount * (parseFloat(currentBill.taxable_amount) / subtotal));
      const gstAmount = taxableAmount * 0.18;
      const totalAmount = discountedSubtotal + gstAmount;
      const balanceAmount = totalAmount - parseFloat(currentBill.amount_paid);

      // Store old values for audit
      const oldValues = {
        discount_amount: currentBill.discount_amount,
        discount_percentage: currentBill.discount_percentage,
        total_amount: currentBill.total_amount,
        balance_amount: currentBill.balance_amount
      };

      // Update bill
      const updateQuery = `
        UPDATE accounting_bills 
        SET discount_amount = $1, discount_percentage = $2, discount_reason = $3,
            subtotal = $4, taxable_amount = $5, cgst_amount = $6, sgst_amount = $7,
            total_amount = $8, balance_amount = $9, updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING *
      `;

      const updateValues = [
        calculatedDiscountAmount,
        discount_percentage || 0,
        discount_reason,
        subtotal,
        taxableAmount,
        gstAmount / 2,
        gstAmount / 2,
        totalAmount,
        balanceAmount,
        billId
      ];

      const updatedBillResult = await pool.query(updateQuery, updateValues);
      const updatedBill = updatedBillResult.rows[0];

      // Create audit trail
      const auditData = BillingOperationsUtils.createAuditTrail(
        userId, 'APPLY_DISCOUNT', 'ACCOUNTING_BILL', billId,
        oldValues, {
          discount_amount: calculatedDiscountAmount,
          discount_percentage: discount_percentage || 0,
          discount_reason,
          requires_approval: needsApproval,
          total_amount: totalAmount,
          balance_amount: balanceAmount
        }, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        }
      );

      await pool.query(`
        INSERT INTO audit_trail (
          user_id, action, entity_type, entity_id, old_values, new_values,
          ip_address, user_agent, session_id, additional_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        auditData.user_id, auditData.action, auditData.entity_type, auditData.entity_id,
        JSON.stringify(auditData.old_values), JSON.stringify(auditData.new_values),
        auditData.ip_address, auditData.user_agent, auditData.session_id,
        JSON.stringify(auditData.additional_details)
      ]);

      logger.info(`Discount applied to bill ${billId} by user ${userId}`, {
        bill_id: billId,
        user_id: userId,
        discount_amount: calculatedDiscountAmount,
        discount_percentage: discount_percentage || 0,
        requires_approval: needsApproval
      });

      res.json({
        success: true,
        message: needsApproval ? 'Discount applied (requires approval)' : 'Discount applied successfully',
        data: updatedBill,
        requires_approval: needsApproval
      });

    } catch (error) {
      logger.error('Error applying discount:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Cancel Bill
router.post('/bills/:billId/cancel',
  authenticateUser,
  checkPermission('CANCEL_BILL'),
  [
    body('cancellation_reason').trim().isLength({ min: 5, max: 500 }).withMessage('Cancellation reason is required'),
    body('refund_amount').optional().isDecimal({ min: 0 }).withMessage('Refund amount must be non-negative'),
    body('refund_method').optional().isIn(['CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD']),
    body('refund_reference').optional().trim().isLength({ max: 100 })
  ],
  async (req, res) => {
    const { billId } = req.params;
    const userId = req.user.id;
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        cancellation_reason,
        refund_amount,
        refund_method,
        refund_reference
      } = req.body;

      // Get current bill
      const currentBillQuery = `
        SELECT * FROM accounting_bills 
        WHERE id = $1 AND active = true
      `;
      const currentBillResult = await pool.query(currentBillQuery, [billId]);
      
      if (currentBillResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      const currentBill = currentBillResult.rows[0];

      // Check if bill can be cancelled
      if (!BillingOperationsUtils.validateBillStatusForCancel(currentBill)) {
        return res.status(400).json({
          success: false,
          message: `Bill cannot be cancelled in status: ${currentBill.billing_status}`
        });
      }

      // Store old values for audit
      const oldValues = { ...currentBill };

      // Calculate refund amount if provided
      let finalRefundAmount = 0;
      if (refund_amount) {
        finalRefundAmount = BillingOperationsUtils.calculateRefundableAmount(currentBill, refund_amount);
      } else if (parseFloat(currentBill.amount_paid) > 0) {
        finalRefundAmount = parseFloat(currentBill.amount_paid);
      }

      // Update bill status
      const updateQuery = `
        UPDATE accounting_bills 
        SET billing_status = 'VOIDED', payment_status = 'CANCELLED',
            cancellation_reason = $1, cancellation_date = CURRENT_TIMESTAMP,
            cancelled_by = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const updateValues = [cancellation_reason, userId, billId];
      const updatedBillResult = await pool.query(updateQuery, updateValues);
      const updatedBill = updatedBillResult.rows[0];

      // Process refund if applicable
      let refundRecord = null;
      if (finalRefundAmount > 0) {
        const refundNumber = BillingOperationsUtils.generateRefundNumber(currentBill.center_id);
        
        const refundQuery = `
          INSERT INTO accounting_payments (
            receipt_number, bill_id, payment_date, payment_method, payment_type,
            amount, payment_status, reference_number, created_by, created_at, active
          ) VALUES ($1, $2, CURRENT_DATE, $3, 'REFUND', $4, 'COMPLETED', $5, $6, CURRENT_TIMESTAMP, true)
          RETURNING *
        `;

        const refundValues = [
          refundNumber,
          billId,
          refund_method || 'CASH',
          finalRefundAmount,
          refund_reference || `REFUND-${billId}`,
          userId
        ];

        const refundResult = await pool.query(refundQuery, refundValues);
        refundRecord = refundResult.rows[0];

        // Update bill amounts
        await pool.query(`
          UPDATE accounting_bills 
          SET amount_paid = amount_paid - $1, balance_amount = balance_amount + $1
          WHERE id = $2
        `, [finalRefundAmount, billId]);
      }

      // Create audit trail
      const auditData = BillingOperationsUtils.createAuditTrail(
        userId, 'CANCEL_BILL', 'ACCOUNTING_BILL', billId,
        oldValues, {
          billing_status: 'VOIDED',
          payment_status: 'CANCELLED',
          cancellation_reason,
          refund_amount: finalRefundAmount,
          refund_method,
          refund_reference
        }, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        }
      );

      await pool.query(`
        INSERT INTO audit_trail (
          user_id, action, entity_type, entity_id, old_values, new_values,
          ip_address, user_agent, session_id, additional_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        auditData.user_id, auditData.action, auditData.entity_type, auditData.entity_id,
        JSON.stringify(auditData.old_values), JSON.stringify(auditData.new_values),
        auditData.ip_address, auditData.user_agent, auditData.session_id,
        JSON.stringify(auditData.additional_details)
      ]);

      logger.info(`Bill ${billId} cancelled by user ${userId}`, {
        bill_id: billId,
        user_id: userId,
        cancellation_reason,
        refund_amount: finalRefundAmount
      });

      res.json({
        success: true,
        message: 'Bill cancelled successfully',
        data: {
          bill: updatedBill,
          refund: refundRecord
        }
      });

    } catch (error) {
      logger.error('Error cancelling bill:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Process Refund
router.post('/bills/:billId/refund',
  authenticateUser,
  checkPermission('PROCESS_REFUND'),
  [
    body('refund_amount').isDecimal({ min: 0.01 }).withMessage('Refund amount is required'),
    body('refund_reason').trim().isLength({ min: 5, max: 500 }).withMessage('Refund reason is required'),
    body('refund_method').isIn(['CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD']).withMessage('Valid refund method is required'),
    body('refund_reference').optional().trim().isLength({ max: 100 }),
    body('requires_approval').optional().isBoolean()
  ],
  async (req, res) => {
    const { billId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        refund_amount,
        refund_reason,
        refund_method,
        refund_reference,
        requires_approval = false
      } = req.body;

      // Get current bill
      const currentBillQuery = `
        SELECT * FROM accounting_bills 
        WHERE id = $1 AND active = true
      `;
      const currentBillResult = await pool.query(currentBillQuery, [billId]);
      
      if (currentBillResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      const currentBill = currentBillResult.rows[0];

      // Check if bill can be refunded
      if (!BillingOperationsUtils.validateBillStatusForRefund(currentBill)) {
        return res.status(400).json({
          success: false,
          message: `Bill cannot be refunded in status: ${currentBill.billing_status}`
        });
      }

      // Check approval requirements
      const needsApproval = requires_approval || parseFloat(refund_amount) > 5000;
      
      if (needsApproval && !BillingOperationsUtils.checkPermission(userRole, 'APPROVE_REFUND')) {
        return res.status(403).json({
          success: false,
          message: 'This refund requires managerial approval'
        });
      }

      // Calculate refundable amount
      const refundableAmount = BillingOperationsUtils.calculateRefundableAmount(currentBill, refund_amount);
      const requestedRefundAmount = parseFloat(refund_amount);

      if (requestedRefundAmount > refundableAmount) {
        return res.status(400).json({
          success: false,
          message: `Refund amount cannot exceed refundable amount: ${refundableAmount}`
        });
      }

      // Store old values for audit
      const oldValues = {
        amount_paid: currentBill.amount_paid,
        balance_amount: currentBill.balance_amount
      };

      // Generate refund number
      const refundNumber = BillingOperationsUtils.generateRefundNumber(currentBill.center_id);

      // Create refund record
      const refundQuery = `
        INSERT INTO accounting_payments (
          receipt_number, bill_id, payment_date, payment_method, payment_type,
          amount, payment_status, reference_number, created_by, created_at, active
        ) VALUES ($1, $2, CURRENT_DATE, $3, 'REFUND', $4, 'COMPLETED', $5, $6, CURRENT_TIMESTAMP, true)
        RETURNING *
      `;

      const refundValues = [
        refundNumber,
        billId,
        refund_method,
        requestedRefundAmount,
        refund_reference || `REFUND-${billId}`,
        userId
      ];

      const refundResult = await pool.query(refundQuery, refundValues);
      const refundRecord = refundResult.rows[0];

      // Update bill amounts
      const newAmountPaid = parseFloat(currentBill.amount_paid) - requestedRefundAmount;
      const newBalanceAmount = parseFloat(currentBill.total_amount) - newAmountPaid;
      
      // Update bill status based on new balance
      let newBillingStatus = currentBill.billing_status;
      if (newBalanceAmount <= 0) {
        newBillingStatus = 'FULLY_PAID';
      } else if (newBalanceAmount < parseFloat(currentBill.total_amount)) {
        newBillingStatus = 'PARTIALLY_PAID';
      }

      await pool.query(`
        UPDATE accounting_bills 
        SET amount_paid = $1, balance_amount = $2, billing_status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [newAmountPaid, newBalanceAmount, newBillingStatus, billId]);

      // Get updated bill
      const updatedBillResult = await pool.query(currentBillQuery, [billId]);
      const updatedBill = updatedBillResult.rows[0];

      // Create audit trail
      const auditData = BillingOperationsUtils.createAuditTrail(
        userId, 'PROCESS_REFUND', 'ACCOUNTING_BILL', billId,
        oldValues, {
          amount_paid: newAmountPaid,
          balance_amount: newBalanceAmount,
          billing_status: newBillingStatus,
          refund_amount: requestedRefundAmount,
          refund_reason,
          refund_method,
          refund_reference,
          requires_approval: needsApproval
        }, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        }
      );

      await pool.query(`
        INSERT INTO audit_trail (
          user_id, action, entity_type, entity_id, old_values, new_values,
          ip_address, user_agent, session_id, additional_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        auditData.user_id, auditData.action, auditData.entity_type, auditData.entity_id,
        JSON.stringify(auditData.old_values), JSON.stringify(auditData.new_values),
        auditData.ip_address, auditData.user_agent, auditData.sessionId,
        JSON.stringify(auditData.additional_details)
      ]);

      logger.info(`Refund processed for bill ${billId} by user ${userId}`, {
        bill_id: billId,
        user_id: userId,
        refund_amount: requestedRefundAmount,
        refund_method,
        requires_approval: needsApproval
      });

      res.json({
        success: true,
        message: needsApproval ? 'Refund processed (requires approval)' : 'Refund processed successfully',
        data: {
          bill: updatedBill,
          refund: refundRecord
        },
        requires_approval: needsApproval
      });

    } catch (error) {
      logger.error('Error processing refund:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get Bill Edit History
router.get('/bills/:billId/history',
  authenticateUser,
  checkPermission('VIEW_BILL'),
  async (req, res) => {
    const { billId } = req.params;
    
    try {
      // Get audit trail for this bill
      const auditQuery = `
        SELECT at.*, u.name as user_name, u.role as user_role
        FROM audit_trail at
        LEFT JOIN users u ON at.user_id = u.id
        WHERE at.entity_type = 'ACCOUNTING_BILL' AND at.entity_id = $1
        ORDER BY at.timestamp DESC
      `;
      
      const auditResult = await pool.query(auditQuery, [billId]);
      
      res.json({
        success: true,
        data: auditResult.rows
      });

    } catch (error) {
      logger.error('Error fetching bill history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get User Permissions
router.get('/user/permissions',
  authenticateUser,
  async (req, res) => {
    const userRole = req.user.role;
    
    try {
      const userPermissions = {};
      
      // Get all permissions for this role
      Object.keys(PERMISSIONS).forEach(permission => {
        userPermissions[permission] = PERMISSIONS[permission].includes(userRole);
      });

      res.json({
        success: true,
        data: {
          role: userRole,
          permissions: userPermissions
        }
      });

    } catch (error) {
      logger.error('Error fetching user permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Delete Bill (Soft Delete)
router.delete('/bills/:billId',
  authenticateUser,
  checkPermission('DELETE_BILL'),
  async (req, res) => {
    const { billId } = req.params;
    const userId = req.user.id;
    
    try {
      // Get current bill
      const currentBillQuery = `
        SELECT * FROM accounting_bills 
        WHERE id = $1 AND active = true
      `;
      const currentBillResult = await pool.query(currentBillQuery, [billId]);
      
      if (currentBillResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bill not found'
        });
      }

      const currentBill = currentBillResult.rows[0];

      // Check if bill can be deleted
      if (!BillingOperationsUtils.validateBillStatusForEdit(currentBill)) {
        return res.status(400).json({
          success: false,
          message: `Bill cannot be deleted in status: ${currentBill.billing_status}`
        });
      }

      // Soft delete bill
      await pool.query(`
        UPDATE accounting_bills 
        SET active = false, deleted_at = CURRENT_TIMESTAMP, deleted_by = $1
        WHERE id = $2
      `, [userId, billId]);

      // Soft delete related items
      await pool.query(`
        UPDATE accounting_bill_items 
        SET active = false 
        WHERE bill_id = $1
      `, [billId]);

      // Create audit trail
      const auditData = BillingOperationsUtils.createAuditTrail(
        userId, 'DELETE_BILL', 'ACCOUNTING_BILL', billId,
        currentBill, { active: false },
        {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        }
      );

      await pool.query(`
        INSERT INTO audit_trail (
          user_id, action, entity_type, entity_id, old_values, new_values,
          ip_address, user_agent, session_id, additional_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      `, [
        auditData.user_id, auditData.action, auditData.entity_type, auditData.entity_id,
        JSON.stringify(auditData.old_values), JSON.stringify(auditData.new_values),
        auditData.ip_address, auditData.user_agent, auditData.session_id,
        JSON.stringify(auditData.additional_details)
      ]);

      logger.info(`Bill ${billId} deleted by user ${userId}`, {
        bill_id: billId,
        user_id: userId
      });

      res.json({
        success: true,
        message: 'Bill deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting bill:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in billing operations:', {
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
