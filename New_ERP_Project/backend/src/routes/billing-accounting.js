const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { logger } = require('../config/logger');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

// Accounting Standards Configuration
const ACCOUNTING_CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL,
  DEFAULT_GST_RATE: 0.18,
  API_TIMEOUT: 15000,
  MAX_RETRY_ATTEMPTS: 3,
  LOG_FILE: 'logs/billing.log',
  
  // Industry Standard Statuses
  BILLING_STATUSES: {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    POSTED: 'POSTED',
    PARTIALLY_PAID: 'PARTIALLY_PAID',
    FULLY_PAID: 'FULLY_PAID',
    OVERPAID: 'OVERPAID',
    VOIDED: 'VOIDED',
    WRITTEN_OFF: 'WRITTEN_OFF',
    DISPUTED: 'DISPUTED',
    SENT_TO_COLLECTION: 'SENT_TO_COLLECTION'
  },
  
  PAYMENT_STATUSES: {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
    PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
    CHARGEBACK: 'CHARGEBACK',
    REVERSED: 'REVERSED',
    HELD: 'HELD'
  },
  
  PAYMENT_METHODS: {
    CASH: 'CASH',
    CHECK: 'CHECK',
    WIRE_TRANSFER: 'WIRE_TRANSFER',
    ACH_TRANSFER: 'ACH_TRANSFER',
    CREDIT_CARD: 'CREDIT_CARD',
    DEBIT_CARD: 'DEBIT_CARD',
    BANK_TRANSFER: 'BANK_TRANSFER',
    UPI: 'UPI',
    NET_BANKING: 'NET_BANKING',
    MOBILE_WALLET: 'MOBILE_WALLET',
    CRYPTOCURRENCY: 'CRYPTOCURRENCY',
    INSURANCE: 'INSURANCE',
    CORPORATE: 'CORPORATE',
    GOVERNMENT: 'GOVERNMENT',
    COMBINED: 'COMBINED'
  },
  
  INVOICE_TYPES: {
    TAX_INVOICE: 'TAX_INVOICE',
    PROFORMA_INVOICE: 'PROFORMA_INVOICE',
    COMMERCIAL_INVOICE: 'COMMERCIAL_INVOICE',
    CREDIT_NOTE: 'CREDIT_NOTE',
    DEBIT_NOTE: 'DEBIT_NOTE',
    RECEIPT: 'RECEIPT',
    ESTIMATE: 'ESTIMATE',
    PURCHASE_ORDER: 'PURCHASE_ORDER',
    BILL_OF_SUPPLY: 'BILL_OF_SUPPLY',
    EXPORT_INVOICE: 'EXPORT_INVOICE'
  },
  
  TAX_CATEGORIES: {
    CGST: 'CGST',
    SGST: 'SGST',
    IGST: 'IGST',
    CESS: 'CESS',
    TDS: 'TDS'
  }
};

// Accounting Utility Functions
class AccountingUtils {
  static generateInvoiceNumber(centerId, type = 'INV') {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${type}-${centerId}-${year}${month}${day}-${random}`;
  }

  static generateReceiptNumber(centerId) {
    return this.generateInvoiceNumber(centerId, 'RCP');
  }

  static generateCreditNoteNumber(centerId) {
    return this.generateInvoiceNumber(centerId, 'CRN');
  }

  static generateDebitNoteNumber(centerId) {
    return this.generateInvoiceNumber(centerId, 'DRN');
  }

  static generateAccessionNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ACC-${year}${month}${day}-${random}`;
  }

  static generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createChecksum(data, timestamp) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data) + timestamp)
      .digest('hex');
  }

  static formatCurrency(amount) {
    return parseFloat(amount).toFixed(2);
  }

  static calculateTax(baseAmount, taxRate, taxCategory) {
    const taxAmount = baseAmount * taxRate;
    return {
      taxCategory,
      taxRate,
      taxAmount: this.formatCurrency(taxAmount),
      baseAmount: this.formatCurrency(baseAmount)
    };
  }

  static calculateGST(amount, isInterState = false) {
    const cgst = isInterState ? 0 : amount * (ACCOUNTING_CONFIG.DEFAULT_GST_RATE / 2);
    const sgst = isInterState ? 0 : amount * (ACCOUNTING_CONFIG.DEFAULT_GST_RATE / 2);
    const igst = isInterState ? amount * ACCOUNTING_CONFIG.DEFAULT_GST_RATE : 0;
    
    return {
      cgst: this.formatCurrency(cgst),
      sgst: this.formatCurrency(sgst),
      igst: this.formatCurrency(igst),
      totalGST: this.formatCurrency(cgst + sgst + igst),
      isInterState
    };
  }

  static validateBillingStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      [ACCOUNTING_CONFIG.BILLING_STATUSES.DRAFT]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.PENDING,
        ACCOUNTING_CONFIG.BILLING_STATUSES.VOIDED
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.PENDING]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.POSTED,
        ACCOUNTING_CONFIG.BILLING_STATUSES.VOIDED,
        ACCOUNTING_CONFIG.BILLING_STATUSES.DISPUTED
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.POSTED]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.PARTIALLY_PAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.OVERPAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.DISPUTED,
        ACCOUNTING_CONFIG.BILLING_STATUSES.SENT_TO_COLLECTION
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.PARTIALLY_PAID]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.OVERPAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.SENT_TO_COLLECTION,
        ACCOUNTING_CONFIG.BILLING_STATUSES.WRITTEN_OFF
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.OVERPAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.REFUNDED
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.OVERPAID]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.REFUNDED
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.DISPUTED]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.POSTED,
        ACCOUNTING_CONFIG.BILLING_STATUSES.VOIDED,
        ACCOUNTING_CONFIG.BILLING_STATUSES.SENT_TO_COLLECTION
      ],
      [ACCOUNTING_CONFIG.BILLING_STATUSES.SENT_TO_COLLECTION]: [
        ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID,
        ACCOUNTING_CONFIG.BILLING_STATUSES.WRITTEN_OFF
      ]
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  static calculateDaysSalesOutstanding(invoiceDate, paymentDate = null) {
    const start = new Date(invoiceDate);
    const end = paymentDate ? new Date(paymentDate) : new Date();
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }

  static generateAuditTrail(action, userId, details) {
    return {
      action,
      userId,
      timestamp: new Date().toISOString(),
      details,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
      sessionId: details.sessionId || null
    };
  }
}

// Accounting Database Service
class AccountingService {
  static async createAccountingEntry(entryData) {
    const query = `
      INSERT INTO accounting_entries (
        entry_type, reference_id, reference_type, debit_account, credit_account,
        amount, description, fiscal_year, period, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) RETURNING *
    `;
    
    const values = [
      entryData.entryType,
      entryData.referenceId,
      entryData.referenceType,
      entryData.debitAccount,
      entryData.creditAccount,
      entryData.amount,
      entryData.description,
      entryData.fiscalYear,
      entryData.period,
      entryData.createdBy
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getPatient(patientId) {
    const query = `
      SELECT id, pid, name, phone, email, date_of_birth, gender, address,
             city, state, postal_code, id_proof_type, id_proof_number, id_proof_verified,
             blood_group, allergies, emergency_contact_name, emergency_contact_phone,
             customer_type, credit_limit, payment_terms
      FROM patients 
      WHERE id = $1 AND active = true
    `;
    const result = await pool.query(query, [patientId]);
    
    if (result.rows.length === 0) {
      throw new Error('Patient not found');
    }
    
    return result.rows[0];
  }

  static async getStudyDetails(studyCodes) {
    if (!Array.isArray(studyCodes) || studyCodes.length === 0) {
      return [];
    }

    const query = `
      SELECT study_code, study_name, base_rate, hsn_code, sac_code, gst_rate,
             is_taxable, cess_rate, category
      FROM study_master 
      WHERE study_code = ANY($1)
    `;
    const result = await pool.query(query, [studyCodes]);
    return result.rows;
  }

  static async createAccountingBill(billData) {
    const query = `
      INSERT INTO accounting_bills (
        invoice_number, invoice_type, bill_date, due_date, patient_id, customer_type,
        center_id, billing_address, shipping_address, reference_number,
        subtotal, discount_amount, discount_percentage, discount_reason,
        taxable_amount, exempt_amount, zero_rated_amount,
        cgst_amount, sgst_amount, igst_amount, cess_amount, tds_amount,
        total_amount, amount_paid, balance_amount, billing_status, payment_status,
        payment_terms, due_days, overdue_days, late_fee_amount,
        posted_date, posted_by, approved_date, approved_by,
        accession_number, accession_generated, accession_generated_at,
        api_sent, api_sent_at, api_response_code, api_success, api_error_message,
        api_retry_count, last_api_attempt, created_at, updated_at, created_by, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42,
        $43, $44, $45, $46, $47, $48, $49, $50, $51, true
      ) RETURNING *
    `;

    const values = [
      billData.invoiceNumber,
      billData.invoiceType,
      billData.billDate,
      billData.dueDate,
      billData.patientId,
      billData.customerType,
      billData.centerId,
      JSON.stringify(billData.billingAddress),
      JSON.stringify(billData.shippingAddress),
      billData.referenceNumber,
      billData.subtotal,
      billData.discountAmount,
      billData.discountPercentage,
      billData.discountReason,
      billData.taxableAmount,
      billData.exemptAmount,
      billData.zeroRatedAmount,
      billData.cgstAmount,
      billData.sgstAmount,
      billData.igstAmount,
      billData.cessAmount,
      billData.tdsAmount,
      billData.totalAmount,
      billData.amountPaid,
      billData.balanceAmount,
      billData.billingStatus,
      billData.paymentStatus,
      billData.paymentTerms,
      billData.dueDays,
      billData.overdueDays,
      billData.lateFeeAmount,
      billData.postedDate,
      billData.postedBy,
      billData.approvedDate,
      billData.approvedBy,
      billData.accessionNumber,
      billData.accessionGenerated,
      billData.accessionGeneratedAt,
      false, null, null, false, null, 0, null,
      new Date(), new Date(), billData.createdBy
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async createBillItem(itemData) {
    const query = `
      INSERT INTO accounting_bill_items (
        bill_id, item_code, item_name, item_type, hsn_code, sac_code,
        quantity, unit_price, total_price, discount_percentage, discount_amount,
        taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, cess_amount,
        total_amount, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
      ) RETURNING *
    `;

    const values = [
      itemData.billId,
      itemData.itemCode,
      itemData.itemName,
      itemData.itemType,
      itemData.hsnCode,
      itemData.sacCode,
      itemData.quantity,
      itemData.unitPrice,
      itemData.totalPrice,
      itemData.discountPercentage,
      itemData.discountAmount,
      itemData.taxableAmount,
      itemData.gstRate,
      itemData.cgstAmount,
      itemData.sgstAmount,
      itemData.igstAmount,
      itemData.cessAmount,
      itemData.totalAmount
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async createPayment(paymentData) {
    const query = `
      INSERT INTO accounting_payments (
        receipt_number, bill_id, payment_date, payment_method, payment_type,
        amount, bank_name, transaction_id, reference_number, check_number,
        card_last_four, authorization_code, payment_status, payment_gateway,
        processing_fee, settlement_amount, settlement_date, currency,
        exchange_rate, foreign_amount, created_by, created_at, updated_at, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, true
      ) RETURNING *
    `;

    const values = [
      paymentData.receiptNumber,
      paymentData.billId,
      paymentData.paymentDate,
      paymentData.paymentMethod,
      paymentData.paymentType,
      paymentData.amount,
      paymentData.bankName,
      paymentData.transactionId,
      paymentData.referenceNumber,
      paymentData.checkNumber,
      paymentData.cardLastFour,
      paymentData.authorizationCode,
      paymentData.paymentStatus,
      paymentData.paymentGateway,
      paymentData.processingFee,
      paymentData.settlementAmount,
      paymentData.settlementDate,
      paymentData.currency,
      paymentData.exchangeRate,
      paymentData.foreignAmount,
      paymentData.createdBy
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updateBillStatus(billId, statusData, userId) {
    const query = `
      UPDATE accounting_bills 
      SET billing_status = $1, payment_status = $2, amount_paid = $3, 
          balance_amount = $4, posted_date = $5, posted_by = $6,
          approved_date = $7, approved_by = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND active = true
      RETURNING *
    `;

    const values = [
      statusData.billingStatus,
      statusData.paymentStatus,
      statusData.amountPaid,
      statusData.balanceAmount,
      statusData.postedDate,
      statusData.postedBy,
      statusData.approvedDate,
      statusData.approvedBy,
      billId
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async createAuditTrail(auditData) {
    const query = `
      INSERT INTO audit_trail (
        entity_type, entity_id, action, user_id, timestamp,
        old_values, new_values, ip_address, user_agent, session_id,
        additional_details, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
      ) RETURNING *
    `;

    const values = [
      auditData.entityType,
      auditData.entityId,
      auditData.action,
      auditData.userId,
      auditData.timestamp,
      JSON.stringify(auditData.oldValues || {}),
      JSON.stringify(auditData.newValues || {}),
      auditData.ipAddress,
      auditData.userAgent,
      auditData.sessionId,
      JSON.stringify(auditData.additionalDetails || {})
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getBillById(billId) {
    const query = `
      SELECT ab.*, p.pid as patient_pid, p.name as patient_name, p.customer_type,
             c.name as center_name, u.name as created_by_name
      FROM accounting_bills ab
      LEFT JOIN patients p ON ab.patient_id = p.id
      LEFT JOIN centers c ON ab.center_id = c.id
      LEFT JOIN users u ON ab.created_by = u.id
      WHERE ab.id = $1 AND ab.active = true
    `;
    
    const result = await pool.query(query, [billId]);
    return result.rows[0] || null;
  }

  static async getBillItems(billId) {
    const query = `
      SELECT * FROM accounting_bill_items 
      WHERE bill_id = $1 AND active = true
      ORDER BY created_at
    `;
    
    const result = await pool.query(query, [billId]);
    return result.rows;
  }

  static async getBillPayments(billId) {
    const query = `
      SELECT * FROM accounting_payments 
      WHERE bill_id = $1 AND active = true
      ORDER BY payment_date
    `;
    
    const result = await pool.query(query, [billId]);
    return result.rows;
  }
}

// Accounting Business Logic
class AccountingBusinessLogic {
  static calculateBillTotals(studyDetails, discountAmount = 0, discountPercentage = 0) {
    let subtotal = 0;
    let taxableAmount = 0;
    let exemptAmount = 0;
    let zeroRatedAmount = 0;

    const items = studyDetails.map(study => {
      const quantity = study.quantity || 1;
      const unitPrice = parseFloat(study.base_rate);
      const totalPrice = unitPrice * quantity;
      
      subtotal += totalPrice;
      
      // Categorize for tax purposes
      if (study.is_taxable === false) {
        exemptAmount += totalPrice;
      } else if (study.gst_rate === 0) {
        zeroRatedAmount += totalPrice;
      } else {
        taxableAmount += totalPrice;
      }
      
      return {
        itemCode: study.study_code,
        itemName: study.study_name,
        itemType: 'SERVICE',
        hsnCode: study.hsn_code,
        sacCode: study.sac_code,
        quantity,
        unitPrice: AccountingUtils.formatCurrency(unitPrice),
        totalPrice: AccountingUtils.formatCurrency(totalPrice),
        discountPercentage: discountPercentage,
        discountAmount: AccountingUtils.formatCurrency(totalPrice * (discountPercentage / 100)),
        taxableAmount: AccountingUtils.formatCurrency(study.is_taxable !== false ? totalPrice : 0),
        gstRate: study.gst_rate || ACCOUNTING_CONFIG.DEFAULT_GST_RATE,
        cgstAmount: AccountingUtils.formatCurrency(study.is_taxable !== false ? (totalPrice * (study.gst_rate / 2)) : 0),
        sgstAmount: AccountingUtils.formatCurrency(study.is_taxable !== false ? (totalPrice * (study.gst_rate / 2)) : 0),
        igstAmount: '0.00',
        cessAmount: AccountingUtils.formatCurrency(study.cess_rate ? totalPrice * study.cess_rate : 0),
        totalAmount: AccountingUtils.formatCurrency(totalPrice)
      };
    });

    // Apply discount
    const discountAmountCalculated = discountAmount > 0 ? discountAmount : subtotal * (discountPercentage / 100);
    const discountedSubtotal = subtotal - discountAmountCalculated;

    // Calculate GST
    const gstCalculation = AccountingUtils.calculateGST(taxableAmount - (taxableAmount * (discountPercentage / 100)));

    const totalAmount = discountedSubtotal + parseFloat(gstCalculation.totalGST);

    return {
      items,
      subtotal: AccountingUtils.formatCurrency(subtotal),
      discountAmount: AccountingUtils.formatCurrency(discountAmountCalculated),
      discountPercentage,
      taxableAmount: AccountingUtils.formatCurrency(taxableAmount - (taxableAmount * (discountPercentage / 100))),
      exemptAmount: AccountingUtils.formatCurrency(exemptAmount),
      zeroRatedAmount: AccountingUtils.formatCurrency(zeroRatedAmount),
      cgstAmount: gstCalculation.cgst,
      sgstAmount: gstCalculation.sgst,
      igstAmount: gstCalculation.igst,
      cessAmount: '0.00',
      tdsAmount: '0.00',
      totalAmount: AccountingUtils.formatCurrency(totalAmount)
    };
  }

  static determineCustomerType(patient) {
    // Determine customer type based on patient data
    if (patient.customer_type) {
      return patient.customer_type;
    }
    
    // Default logic - can be enhanced
    if (patient.credit_limit > 0) {
      return 'CREDIT';
    }
    return 'CASH';
  }

  static calculateDueDate(billDate, paymentTerms) {
    const date = new Date(billDate);
    const dueDays = paymentTerms === 'IMMEDIATE' ? 0 : 
                   paymentTerms === 'NET15' ? 15 :
                   paymentTerms === 'NET30' ? 30 :
                   paymentTerms === 'NET45' ? 45 :
                   paymentTerms === 'NET60' ? 60 : 30;
    
    date.setDate(date.getDate() + dueDays);
    return date;
  }

  static calculateOverdueDays(dueDate, paymentDate = null) {
    const today = paymentDate ? new Date(paymentDate) : new Date();
    const due = new Date(dueDate);
    return Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));
  }

  static processPayment(bill, paymentData, userId) {
    const newAmountPaid = parseFloat(bill.amount_paid) + parseFloat(paymentData.amount);
    const newBalanceAmount = parseFloat(bill.total_amount) - newAmountPaid;
    
    let newBillingStatus = bill.billing_status;
    let newPaymentStatus = bill.payment_status;
    
    // Determine new statuses based on payment
    if (newBalanceAmount <= 0) {
      newBillingStatus = ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID;
      newPaymentStatus = ACCOUNTING_CONFIG.PAYMENT_STATUSES.COMPLETED;
    } else if (newBalanceAmount < parseFloat(bill.total_amount)) {
      newBillingStatus = ACCOUNTING_CONFIG.BILLING_STATUSES.PARTIALLY_PAID;
      newPaymentStatus = ACCOUNTING_CONFIG.PAYMENT_STATUSES.COMPLETED;
    }
    
    if (newBalanceAmount < 0) {
      newBillingStatus = ACCOUNTING_CONFIG.BILLING_STATUSES.OVERPAID;
    }
    
    return {
      billingStatus: newBillingStatus,
      paymentStatus: newPaymentStatus,
      amountPaid: AccountingUtils.formatCurrency(newAmountPaid),
      balanceAmount: AccountingUtils.formatCurrency(Math.abs(newBalanceAmount))
    };
  }

  static generateAccountingEntries(bill, items, userId) {
    const entries = [];
    const fiscalYear = new Date().getFullYear();
    const period = Math.ceil((new Date().getMonth() + 1) / 3); // Quarterly periods
    
    // Debit customer account (Accounts Receivable)
    entries.push({
      entryType: 'DEBIT',
      referenceId: bill.id,
      referenceType: 'BILL',
      debitAccount: 'ACCOUNTS_RECEIVABLE',
      creditAccount: 'REVENUE',
      amount: bill.total_amount,
      description: `Invoice ${bill.invoice_number} - Patient ${bill.patient_pid}`,
      fiscalYear,
      period,
      createdBy: userId
    });
    
    // Credit revenue accounts for each item
    items.forEach(item => {
      entries.push({
        entryType: 'CREDIT',
        referenceId: bill.id,
        referenceType: 'BILL_ITEM',
        debitAccount: 'ACCOUNTS_RECEIVABLE',
        creditAccount: 'SERVICE_REVENUE',
        amount: item.total_amount,
        description: `Service: ${item.item_name} - ${bill.invoice_number}`,
        fiscalYear,
        period,
        createdBy: userId
      });
    });
    
    // Tax entries
    if (parseFloat(bill.cgst_amount) > 0) {
      entries.push({
        entryType: 'CREDIT',
        referenceId: bill.id,
        referenceType: 'TAX',
        debitAccount: 'ACCOUNTS_RECEIVABLE',
        creditAccount: 'CGST_PAYABLE',
        amount: bill.cgst_amount,
        description: `CGST on Invoice ${bill.invoice_number}`,
        fiscalYear,
        period,
        createdBy: userId
      });
    }
    
    if (parseFloat(bill.sgst_amount) > 0) {
      entries.push({
        entryType: 'CREDIT',
        referenceId: bill.id,
        referenceType: 'TAX',
        debitAccount: 'ACCOUNTS_RECEIVABLE',
        creditAccount: 'SGST_PAYABLE',
        amount: bill.sgst_amount,
        description: `SGST on Invoice ${bill.invoice_number}`,
        fiscalYear,
        period,
        createdBy: userId
      });
    }
    
    return entries;
  }
}

// Input Validation Rules
const createAccountingBillValidation = [
  body('patient_id').trim().isLength({ min: 1, max: 50 }).withMessage('Patient ID is required'),
  body('center_id').isInt().withMessage('Center ID must be an integer'),
  body('study_codes').isArray().withMessage('Study codes must be an array'),
  body('payment_method').isIn(Object.values(ACCOUNTING_CONFIG.PAYMENT_METHODS)).withMessage('Invalid payment method'),
  body('invoice_type').optional().isIn(Object.values(ACCOUNTING_CONFIG.INVOICE_TYPES)).withMessage('Invalid invoice type'),
  body('payment_terms').optional().isIn(['IMMEDIATE', 'NET15', 'NET30', 'NET45', 'NET60']).withMessage('Invalid payment terms'),
  body('discount_percentage').optional().isDecimal({ min: 0, max: 100 }).withMessage('Discount percentage must be between 0 and 100'),
  body('discount_amount').optional().isDecimal({ min: 0 }).withMessage('Discount amount must be non-negative'),
  body('discount_reason').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Discount reason must be 2-100 characters'),
  body('notes').optional().trim().isLength({ min: 2, max: 500 }).withMessage('Notes must be 2-500 characters'),
  body('study_id').optional().isInt().withMessage('Study ID must be an integer'),
  body('customer_type').optional().isIn(['CASH', 'CREDIT', 'CORPORATE', 'INSURANCE', 'GOVERNMENT']).withMessage('Invalid customer type')
];

const updatePaymentValidation = [
  body('payment_status').isIn(Object.values(ACCOUNTING_CONFIG.PAYMENT_STATUSES)).withMessage('Invalid payment status'),
  body('billing_status').optional().isIn(Object.values(ACCOUNTING_CONFIG.BILLING_STATUSES)).withMessage('Invalid billing status'),
  body('payment_method').isIn(Object.values(ACCOUNTING_CONFIG.PAYMENT_METHODS)).withMessage('Invalid payment method'),
  body('payment_amount').isDecimal({ min: 0 }).withMessage('Payment amount must be non-negative'),
  body('payment_notes').optional().trim().isLength({ max: 500 }).withMessage('Payment notes must be max 500 characters'),
  body('bank_name').optional().trim().isLength({ max: 100 }).withMessage('Bank name must be max 100 characters'),
  body('transaction_id').optional().trim().isLength({ max: 100 }).withMessage('Transaction ID must be max 100 characters'),
  body('reference_number').optional().trim().isLength({ max: 50 }).withMessage('Reference number must be max 50 characters'),
  body('check_number').optional().trim().isLength({ max: 50 }).withMessage('Check number must be max 50 characters')
];

// Error Handling Middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

const handleAsyncErrors = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Response Helpers
const createSuccessResponse = (message, data = null, statusCode = 200) => ({
  success: true,
  message,
  data,
  timestamp: new Date().toISOString()
});

const createErrorResponse = (message, statusCode = 500) => ({
  success: false,
  message,
  timestamp: new Date().toISOString()
});

// Routes
router.post('/accounting-bill',
  createAccountingBillValidation,
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const {
      patient_id,
      center_id,
      study_codes,
      payment_method,
      invoice_type = ACCOUNTING_CONFIG.INVOICE_TYPES.TAX_INVOICE,
      payment_terms = 'NET30',
      discount_percentage = 0,
      discount_amount = 0,
      discount_reason,
      notes,
      study_id,
      customer_type,
      billing_address,
      shipping_address
    } = req.body;

    const userId = req.user?.id || 1; // Get from auth middleware

    // Get patient information
    const patient = await AccountingService.getPatient(patient_id);
    
    // Get study details
    const studyDetails = await AccountingService.getStudyDetails(study_codes);
    
    // Calculate bill totals
    const billTotals = AccountingBusinessLogic.calculateBillTotals(
      studyDetails,
      discount_amount,
      discount_percentage
    );

    // Determine customer type
    const finalCustomerType = customer_type || AccountingBusinessLogic.determineCustomerType(patient);

    // Generate invoice number
    const invoiceNumber = AccountingUtils.generateInvoiceNumber(center_id);

    // Calculate dates
    const billDate = new Date();
    const dueDate = AccountingBusinessLogic.calculateDueDate(billDate, payment_terms);

    // Handle accession number generation
    let accessionNumber = null;
    let accessionGenerated = false;

    if (payment_terms === 'IMMEDIATE') {
      accessionNumber = AccountingUtils.generateAccessionNumber();
      accessionGenerated = true;
      
      // Update study with accession number if study_id exists
      if (study_id) {
        await pool.query(
          'UPDATE studies SET accession_number = $1, accession_generated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [accessionNumber, study_id]
        );
      }
    }

    // Create accounting bill
    const billData = {
      invoiceNumber,
      invoiceType: invoice_type,
      billDate,
      dueDate,
      patientId: patient_id,
      customerType: finalCustomerType,
      centerId: center_id,
      billingAddress: billing_address || {
        street: patient.address,
        city: patient.city,
        state: patient.state,
        postal_code: patient.postal_code
      },
      shippingAddress: shipping_address || {
        street: patient.address,
        city: patient.city,
        state: patient.state,
        postal_code: patient.postal_code
      },
      referenceNumber: study_id ? `STUDY-${study_id}` : null,
      subtotal: billTotals.subtotal,
      discountAmount: billTotals.discountAmount,
      discountPercentage: billTotals.discountPercentage,
      discountReason: discount_reason,
      taxableAmount: billTotals.taxableAmount,
      exemptAmount: billTotals.exemptAmount,
      zeroRatedAmount: billTotals.zeroRatedAmount,
      cgstAmount: billTotals.cgstAmount,
      sgstAmount: billTotals.sgstAmount,
      igstAmount: billTotals.igstAmount,
      cessAmount: billTotals.cessAmount,
      tdsAmount: billTotals.tdsAmount,
      totalAmount: billTotals.totalAmount,
      amountPaid: '0.00',
      balanceAmount: billTotals.totalAmount,
      billingStatus: ACCOUNTING_CONFIG.BILLING_STATUSES.POSTED,
      paymentStatus: ACCOUNTING_CONFIG.PAYMENT_STATUSES.PENDING,
      paymentTerms,
      dueDays: payment_terms === 'IMMEDIATE' ? 0 : parseInt(payment_terms.replace('NET', '')),
      overdueDays: 0,
      lateFeeAmount: '0.00',
      postedDate: new Date(),
      postedBy: userId,
      approvedDate: new Date(),
      approvedBy: userId,
      accessionNumber,
      accessionGenerated,
      accessionGeneratedAt: accessionGenerated ? new Date() : null,
      createdBy: userId
    };

    const bill = await AccountingService.createAccountingBill(billData);

    // Create bill items
    const billItems = [];
    for (const item of billTotals.items) {
      const itemData = {
        ...item,
        billId: bill.id
      };
      const billItem = await AccountingService.createBillItem(itemData);
      billItems.push(billItem);
    }

    // Generate accounting entries
    const accountingEntries = AccountingBusinessLogic.generateAccountingEntries(bill, billItems, userId);
    
    // Create accounting entries
    for (const entry of accountingEntries) {
      await AccountingService.createAccountingEntry(entry);
    }

    // Create audit trail
    await AccountingService.createAuditTrail({
      entityType: 'ACCOUNTING_BILL',
      entityId: bill.id,
      action: 'CREATE',
      userId,
      timestamp: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID,
      additionalDetails: {
        invoiceNumber,
        totalAmount: bill.total_amount,
        paymentMethod: payment_method
      }
    });

    logger.info(`Accounting bill created: ${bill.id}`, {
      bill_id: bill.id,
      invoice_number: bill.invoice_number,
      patient_id,
      pid: patient.pid,
      accession_number: accessionNumber,
      total_amount: bill.total_amount,
      customer_type: finalCustomerType
    });

    const responseData = {
      bill: {
        id: bill.id,
        invoice_number: bill.invoice_number,
        invoice_type: bill.invoice_type,
        bill_date: bill.bill_date,
        due_date: bill.due_date,
        patient_id: bill.patient_id,
        patient_pid: patient.pid,
        patient_name: patient.name,
        customer_type: bill.customer_type,
        center_id: bill.center_id,
        subtotal: bill.subtotal,
        discount_amount: bill.discount_amount,
        discount_percentage: bill.discount_percentage,
        taxable_amount: bill.taxable_amount,
        cgst_amount: bill.cgst_amount,
        sgst_amount: bill.sgst_amount,
        igst_amount: bill.igst_amount,
        total_amount: bill.total_amount,
        amount_paid: bill.amount_paid,
        balance_amount: bill.balance_amount,
        billing_status: bill.billing_status,
        payment_status: bill.payment_status,
        payment_terms: bill.payment_terms,
        due_days: bill.due_days,
        accession_number: bill.accession_number,
        accession_generated: bill.accession_generated,
        created_at: bill.created_at,
        posted_by: bill.posted_by
      },
      items: billItems,
      payments: [],
      audit_trail: {
        created_by: userId,
        created_at: bill.created_at,
        posted_date: bill.posted_date
      }
    };

    res.status(201).json(
      createSuccessResponse('Accounting bill created successfully', responseData)
    );
  })
);

router.post('/:billId/payment',
  updatePaymentValidation,
  handleValidationErrors,
  handleAsyncErrors(async (req, res) => {
    const { billId } = req.params;
    const {
      payment_method,
      payment_amount,
      payment_notes,
      bank_name,
      transaction_id,
      reference_number,
      check_number,
      card_last_four,
      authorization_code,
      payment_gateway,
      processing_fee,
      currency = 'INR',
      exchange_rate = 1,
      foreign_amount
    } = req.body;

    const userId = req.user?.id || 1;

    // Get current bill
    const currentBill = await AccountingService.getBillById(billId);
    if (!currentBill) {
      return res.status(404).json(createErrorResponse('Bill not found'));
    }

    // Generate receipt number
    const receiptNumber = AccountingUtils.generateReceiptNumber(currentBill.center_id);

    // Create payment record
    const paymentData = {
      receiptNumber,
      billId,
      paymentDate: new Date(),
      paymentMethod: payment_method,
      paymentType: 'PAYMENT',
      amount: AccountingUtils.formatCurrency(payment_amount),
      bankName: bank_name,
      transactionId: transaction_id,
      referenceNumber: reference_number,
      checkNumber: check_number,
      cardLastFour: card_last_four,
      authorizationCode: authorization_code,
      paymentStatus: ACCOUNTING_CONFIG.PAYMENT_STATUSES.COMPLETED,
      paymentGateway: payment_gateway,
      processingFee: processing_fee ? AccountingUtils.formatCurrency(processing_fee) : '0.00',
      settlementAmount: AccountingUtils.formatCurrency(payment_amount - (processing_fee || 0)),
      settlementDate: new Date(),
      currency,
      exchangeRate,
      foreignAmount: foreign_amount ? AccountingUtils.formatCurrency(foreign_amount) : null,
      createdBy: userId
    };

    const payment = await AccountingService.createPayment(paymentData);

    // Process payment and update bill status
    const paymentResult = AccountingBusinessLogic.processPayment(currentBill, paymentData, userId);

    // Update bill
    const updatedBill = await AccountingService.updateBillStatus(billId, {
      ...paymentResult,
      postedDate: paymentResult.billingStatus === ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID ? new Date() : currentBill.posted_date,
      postedBy: paymentResult.billingStatus === ACCOUNTING_CONFIG.BILLING_STATUSES.FULLY_PAID ? userId : currentBill.posted_by
    }, userId);

    // Create accounting entries for payment
    const paymentEntry = {
      entryType: 'DEBIT',
      referenceId: payment.id,
      referenceType: 'PAYMENT',
      debitAccount: 'CASH_BANK',
      creditAccount: 'ACCOUNTS_RECEIVABLE',
      amount: payment_amount,
      description: `Payment receipt ${receiptNumber} against invoice ${currentBill.invoice_number}`,
      fiscalYear: new Date().getFullYear(),
      period: Math.ceil((new Date().getMonth() + 1) / 3),
      createdBy: userId
    };

    await AccountingService.createAccountingEntry(paymentEntry);

    // Create audit trail
    await AccountingService.createAuditTrail({
      entityType: 'PAYMENT',
      entityId: payment.id,
      action: 'CREATE',
      userId,
      timestamp: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID,
      additionalDetails: {
        receiptNumber,
        billId,
        paymentAmount: payment_amount,
        paymentMethod: payment_method,
        newBalanceAmount: paymentResult.balanceAmount
      }
    });

    logger.info(`Payment processed for bill: ${billId}`, {
      bill_id: billId,
      receipt_number: receiptNumber,
      payment_amount,
      payment_method,
      new_balance: paymentResult.balanceAmount,
      new_billing_status: paymentResult.billing_status
    });

    res.json(
      createSuccessResponse('Payment processed successfully', {
        payment: {
          id: payment.id,
          receipt_number: payment.receipt_number,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          amount: payment.amount,
          payment_status: payment.payment_status
        },
        bill_update: {
          billing_status: paymentResult.billingStatus,
          payment_status: paymentResult.paymentStatus,
          amount_paid: paymentResult.amountPaid,
          balance_amount: paymentResult.balanceAmount
        }
      })
    );
  })
);

// Get comprehensive bill details
router.get('/accounting-bill/:billId', handleAsyncErrors(async (req, res) => {
  const { billId } = req.params;
  
  // Get bill details
  const bill = await AccountingService.getBillById(billId);
  if (!bill) {
    return res.status(404).json(createErrorResponse('Bill not found'));
  }
  
  // Get bill items
  const items = await AccountingService.getBillItems(billId);
  
  // Get payments
  const payments = await AccountingService.getBillPayments(billId);
  
  // Calculate overdue days
  const overdueDays = AccountingBusinessLogic.calculateOverdueDays(bill.due_date);
  
  const responseData = {
    bill: {
      ...bill,
      overdue_days: overdueDays,
      dso: AccountingUtils.calculateDaysSalesOutstanding(bill.bill_date, bill.posted_date)
    },
    items,
    payments,
    summary: {
      total_items: items.length,
      total_payments: payments.length,
      total_paid: payments.reduce((sum, p) => sum + parseFloat(p.amount), 0),
      last_payment_date: payments.length > 0 ? payments[payments.length - 1].payment_date : null
    }
  };
  
  res.json(createSuccessResponse('Bill retrieved successfully', responseData));
}));

// Get bills by accession number
router.get('/accession/:accessionNumber', handleAsyncErrors(async (req, res) => {
  const { accessionNumber } = req.params;
  
  const query = `
    SELECT ab.*, p.pid as patient_pid, p.name as patient_name,
           c.name as center_name, u.name as created_by_name
    FROM accounting_bills ab
    LEFT JOIN patients p ON ab.patient_id = p.id
    LEFT JOIN centers c ON ab.center_id = c.id
    LEFT JOIN users u ON ab.created_by = u.id
    WHERE ab.accession_number = $1 AND ab.active = true
  `;
  
  const result = await pool.query(query, [accessionNumber]);
  
  if (result.rows.length === 0) {
    return res.status(404).json(createErrorResponse('Bill not found'));
  }
  
  const bill = result.rows[0];
  const items = await AccountingService.getBillItems(bill.id);
  const payments = await AccountingService.getBillPayments(bill.id);
  
  res.json(createSuccessResponse('Bill retrieved successfully', {
    bill,
    items,
    payments
  }));
}));

// Get accounting reports
router.get('/reports/aging', handleAsyncErrors(async (req, res) => {
  const { centerId, customerId, dateRange } = req.query;
  
  let query = `
    SELECT ab.*, p.pid as patient_pid, p.name as patient_name,
           c.name as center_name,
           CASE 
             WHEN ab.balance_amount > 0 AND CURRENT_DATE > ab.due_date THEN 
               (CURRENT_DATE - ab.due_date) 
             ELSE 0 
           END as days_overdue
    FROM accounting_bills ab
    LEFT JOIN patients p ON ab.patient_id = p.id
    LEFT JOIN centers c ON ab.center_id = c.id
    WHERE ab.active = true AND ab.balance_amount > 0
  `;
  
  const params = [];
  let paramIndex = 1;
  
  if (centerId) {
    query += ` AND ab.center_id = $${paramIndex++}`;
    params.push(centerId);
  }
  
  if (customerId) {
    query += ` AND ab.patient_id = $${paramIndex++}`;
    params.push(customerId);
  }
  
  if (dateRange) {
    const [startDate, endDate] = dateRange.split(',');
    query += ` AND ab.bill_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    params.push(startDate, endDate);
  }
  
  query += ' ORDER BY days_overdue DESC, ab.due_date ASC';
  
  const result = await pool.query(query, params);
  
  // Categorize by aging buckets
  const agingBuckets = {
    current: [],
    '0-30': [],
    '31-60': [],
    '61-90': [],
    '91-120': [],
    '120+': []
  };
  
  result.rows.forEach(bill => {
    const daysOverdue = parseInt(bill.days_overdue);
    
    if (daysOverdue <= 0) {
      agingBuckets.current.push(bill);
    } else if (daysOverdue <= 30) {
      agingBuckets['0-30'].push(bill);
    } else if (daysOverdue <= 60) {
      agingBuckets['31-60'].push(bill);
    } else if (daysOverdue <= 90) {
      agingBuckets['61-90'].push(bill);
    } else if (daysOverdue <= 120) {
      agingBuckets['91-120'].push(bill);
    } else {
      agingBuckets['120+'].push(bill);
    }
  });
  
  const summary = {
    total_outstanding: result.rows.reduce((sum, bill) => sum + parseFloat(bill.balance_amount), 0),
    total_bills: result.rows.length,
    average_days_overdue: result.rows.reduce((sum, bill) => sum + parseInt(bill.days_overdue), 0) / result.rows.length || 0,
    bucket_totals: Object.keys(agingBuckets).reduce((acc, bucket) => {
      acc[bucket] = {
        count: agingBuckets[bucket].length,
        amount: agingBuckets[bucket].reduce((sum, bill) => sum + parseFloat(bill.balance_amount), 0)
      };
      return acc;
    }, {})
  };
  
  res.json(createSuccessResponse('Aging report generated successfully', {
    summary,
    buckets: agingBuckets
  }));
}));

// Global error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json(createErrorResponse('Internal server error'));
});

module.exports = router;
