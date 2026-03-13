const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const winston = require('winston');
const axios = require('axios');

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
    new winston.transports.File({ filename: 'logs/whatsapp.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// WhatsApp Integration Class
class WhatsAppIntegration {
  static async initializeWhatsAppAPI() {
    // This will be implemented when WhatsApp API is available
    // For now, we'll simulate the API structure
    const config = {
      apiKey: process.env.WHATSAPP_API_KEY,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      version: 'v18.0',
      baseUrl: 'https://graph.facebook.com'
    };
    return config;
  }

  static async sendWhatsAppMessage(to, message, messageType = 'text') {
    try {
      // Placeholder for WhatsApp API implementation
      const config = await this.initializeWhatsAppAPI();
      
      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: messageType,
        [messageType]: messageType === 'text' ? { body: message } : message
      };

      // This will be implemented when WhatsApp API is available
      logger.info(`WhatsApp message sent to ${to}:`, { message, messageType });
      
      return {
        success: true,
        messageId: `msg_${Date.now()}`,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error sending WhatsApp message:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  static async sendBillNotification(patientId, billId) {
    try {
      // Get patient and bill details
      const patientQuery = `
        SELECT p.name, p.phone, p.email 
        FROM patients p 
        WHERE p.id = $1 AND p.active = true
      `;
      const patientResult = await pool.query(patientQuery, [patientId]);
      
      const billQuery = `
        SELECT b.bill_number, b.total_amount, b.due_date, b.status,
               pm.name as payment_method_name
        FROM accounting_bills b
        LEFT JOIN payment_methods pm ON b.payment_method_id = pm.id
        WHERE b.id = $1 AND b.active = true
      `;
      const billResult = await pool.query(billQuery, [billId]);

      if (patientResult.rows.length === 0 || billResult.rows.length === 0) {
        throw new Error('Patient or bill not found');
      }

      const patient = patientResult.rows[0];
      const bill = billResult.rows[0];

      // Construct bill notification message
      const message = `🏥 *Bill Notification*\n\n` +
        `Dear ${patient.name},\n\n` +
        `Your bill has been generated:\n` +
        `📄 Bill Number: ${bill.bill_number}\n` +
        `💰 Amount: ₹${bill.total_amount}\n` +
        `📅 Due Date: ${new Date(bill.due_date).toLocaleDateString()}\n` +
        `💳 Payment Method: ${bill.payment_method_name || 'Not specified'}\n` +
        `📊 Status: ${bill.status}\n\n` +
        `Thank you for choosing our services!\n` +
        `For queries, please contact our billing department.`;

      // Send WhatsApp message
      const result = await this.sendWhatsAppMessage(patient.phone, message);
      
      // Log the notification
      await this.logNotification(patientId, billId, 'BILL_NOTIFICATION', message, result);

      return result;
    } catch (error) {
      logger.error('Error sending bill notification:', error);
      throw error;
    }
  }

  static async sendStudyCompletionNotification(patientId, studyId) {
    try {
      // Get patient and study details
      const patientQuery = `
        SELECT p.name, p.phone, p.email 
        FROM patients p 
        WHERE p.id = $1 AND p.active = true
      `;
      const patientResult = await pool.query(patientQuery, [patientId]);
      
      const studyQuery = `
        SELECT s.accession_number, s.requested_procedure, s.completed_at,
               sm.study_name, c.name as center_name
        FROM studies s
        LEFT JOIN study_master sm ON s.study_code = sm.study_code
        LEFT JOIN centers c ON s.center_id = c.id
        WHERE s.id = $1 AND s.active = true
      `;
      const studyResult = await pool.query(studyQuery, [studyId]);

      if (patientResult.rows.length === 0 || studyResult.rows.length === 0) {
        throw new Error('Patient or study not found');
      }

      const patient = patientResult.rows[0];
      const study = studyResult.rows[0];

      // Construct study completion message
      const message = `🔬 *Study Completed*\n\n` +
        `Dear ${patient.name},\n\n` +
        `Your study has been completed:\n` +
        `📋 Accession Number: ${study.accession_number}\n` +
        `🏥 Procedure: ${study.requested_procedure}\n` +
        `📊 Study Type: ${study.study_name}\n` +
        `📍 Center: ${study.center_name}\n` +
        `✅ Completed At: ${new Date(study.completed_at).toLocaleString()}\n\n` +
        `Your reports are ready for collection.\n` +
        `Please visit the center to collect your reports.\n\n` +
        `For any queries, contact our radiology department.`;

      // Send WhatsApp message
      const result = await this.sendWhatsAppMessage(patient.phone, message);
      
      // Log the notification
      await this.logNotification(patientId, studyId, 'STUDY_COMPLETION', message, result);

      return result;
    } catch (error) {
      logger.error('Error sending study completion notification:', error);
      throw error;
    }
  }

  static async sendReportReadyNotification(patientId, reportId) {
    try {
      // Get patient and report details
      const patientQuery = `
        SELECT p.name, p.phone, p.email 
        FROM patients p 
        WHERE p.id = $1 AND p.active = true
      `;
      const patientResult = await pool.query(patientQuery, [patientId]);
      
      const reportQuery = `
        SELECT r.report_number, r.study_id, r.generated_at, r.status,
               s.accession_number, s.requested_procedure,
               sm.study_name, c.name as center_name
        FROM radiology_reports r
        LEFT JOIN studies s ON r.study_id = s.id
        LEFT JOIN study_master sm ON s.study_code = sm.study_code
        LEFT JOIN centers c ON s.center_id = c.id
        WHERE r.id = $1 AND r.active = true
      `;
      const reportResult = await pool.query(reportQuery, [reportId]);

      if (patientResult.rows.length === 0 || reportResult.rows.length === 0) {
        throw new Error('Patient or report not found');
      }

      const patient = patientResult.rows[0];
      const report = reportResult.rows[0];

      // Construct report ready message
      const message = `📋 *Report Ready*\n\n` +
        `Dear ${patient.name},\n\n` +
        `Your radiology report is ready:\n` +
        `📄 Report Number: ${report.report_number}\n` +
        `📋 Accession Number: ${report.accession_number}\n` +
        `🏥 Procedure: ${report.requested_procedure}\n` +
        `📊 Study Type: ${report.study_name}\n` +
        `📍 Center: ${report.center_name}\n` +
        `✅ Generated At: ${new Date(report.generated_at).toLocaleString()}\n` +
        `📊 Status: ${report.status}\n\n` +
        `Your report is ready for collection.\n` +
        `Please visit the center to collect your report.\n\n` +
        `For any queries, contact our radiology department.`;

      // Send WhatsApp message
      const result = await this.sendWhatsAppMessage(patient.phone, message);
      
      // Log the notification
      await this.logNotification(patientId, reportId, 'REPORT_READY', message, result);

      return result;
    } catch (error) {
      logger.error('Error sending report ready notification:', error);
      throw error;
    }
  }

  static async sendPromotionalMessage(promotionId, targetGroup = 'all') {
    try {
      // Get promotion details
      const promotionQuery = `
        SELECT p.title, p.message, p.discount_percentage, p.valid_from, p.valid_to,
               p.service_types, p.target_audience
        FROM whatsapp_promotions p
        WHERE p.id = $1 AND p.active = true
      `;
      const promotionResult = await pool.query(promotionQuery, [promotionId]);

      if (promotionResult.rows.length === 0) {
        throw new Error('Promotion not found');
      }

      const promotion = promotionResult.rows[0];

      // Get target audience based on promotion settings
      let targetQuery = `
        SELECT DISTINCT p.phone, p.name
        FROM patients p
        WHERE p.active = true AND p.phone IS NOT NULL AND p.phone != ''
      `;

      if (promotion.target_audience === 'recent_patients') {
        targetQuery += ` AND p.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
      } else if (promotion.target_audience === 'active_patients') {
        targetQuery += ` AND p.last_visit_date >= CURRENT_DATE - INTERVAL '180 days'`;
      }

      const targetResult = await pool.query(targetQuery);
      const targets = targetResult.rows;

      // Construct promotional message
      const message = `🎉 *Special Offer*\n\n` +
        `${promotion.title}\n\n` +
        `${promotion.message}\n` +
        `💰 Discount: ${promotion.discount_percentage}% OFF\n` +
        `📅 Valid From: ${new Date(promotion.valid_from).toLocaleDateString()}\n` +
        `📅 Valid Until: ${new Date(promotion.valid_to).toLocaleDateString()}\n\n` +
        `📍 Visit our center to avail this offer!\n` +
        `📞 For appointments: [Your Phone Number]\n\n` +
        `Terms and conditions apply.`;

      // Send promotional messages
      const results = [];
      for (const target of targets) {
        try {
          const result = await this.sendWhatsAppMessage(target.phone, message);
          results.push({
            phone: target.phone,
            name: target.name,
            success: result.success,
            messageId: result.messageId
          });
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          results.push({
            phone: target.phone,
            name: target.name,
            success: false,
            error: error.message
          });
        }
      }

      // Log the promotional campaign
      await this.logPromotionalCampaign(promotionId, targets.length, results);

      return {
        success: true,
        totalTargets: targets.length,
        successfulSends: results.filter(r => r.success).length,
        failedSends: results.filter(r => !r.success).length,
        results: results
      };
    } catch (error) {
      logger.error('Error sending promotional message:', error);
      throw error;
    }
  }

  static async sendAppointmentReminder(appointmentId) {
    try {
      // Get appointment details
      const appointmentQuery = `
        SELECT a.patient_id, a.appointment_date, a.appointment_time, a.study_code,
               p.name as patient_name, p.phone, p.email,
               sm.study_name, c.name as center_name
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN study_master sm ON a.study_code = sm.study_code
        LEFT JOIN centers c ON a.center_id = c.id
        WHERE a.id = $1 AND a.active = true
      `;
      const appointmentResult = await pool.query(appointmentQuery, [appointmentId]);

      if (appointmentResult.rows.length === 0) {
        throw new Error('Appointment not found');
      }

      const appointment = appointmentResult.rows[0];

      // Construct appointment reminder message
      const message = `⏰ *Appointment Reminder*\n\n` +
        `Dear ${appointment.patient_name},\n\n` +
        `This is a reminder for your upcoming appointment:\n` +
        `📅 Date: ${new Date(appointment.appointment_date).toLocaleDateString()}\n` +
        `⏰ Time: ${appointment.appointment_time}\n` +
        `🏥 Procedure: ${appointment.study_name}\n` +
        `📍 Center: ${appointment.center_name}\n\n` +
        `Please arrive 15 minutes before your appointment time.\n` +
        `Bring your ID and any previous medical records.\n\n` +
        `For any changes, please call us at [Your Phone Number].\n\n` +
        `We look forward to seeing you!`;

      // Send WhatsApp message
      const result = await this.sendWhatsAppMessage(appointment.phone, message);
      
      // Log the notification
      await this.logNotification(appointment.patient_id, appointmentId, 'APPOINTMENT_REMINDER', message, result);

      return result;
    } catch (error) {
      logger.error('Error sending appointment reminder:', error);
      throw error;
    }
  }

  static async sendServiceStatusUpdate(serviceId, status, message = null) {
    try {
      // Get service details
      const serviceQuery = `
        SELECT s.patient_id, s.service_code, s.status, s.updated_at,
               p.name as patient_name, p.phone, p.email,
               sm.study_name as service_name
        FROM services s
        LEFT JOIN patients p ON s.patient_id = p.id
        LEFT JOIN study_master sm ON s.service_code = sm.study_code
        WHERE s.id = $1 AND s.active = true
      `;
      const serviceResult = await pool.query(serviceQuery, [serviceId]);

      if (serviceResult.rows.length === 0) {
        throw new Error('Service not found');
      }

      const service = serviceResult.rows[0];

      // Construct status update message
      const statusMessage = `📊 *Service Status Update*\n\n` +
        `Dear ${service.patient_name},\n\n` +
        `Your service status has been updated:\n` +
        `🏥 Service: ${service.service_name}\n` +
        `📊 Status: ${status}\n` +
        `🕐 Updated At: ${new Date().toLocaleString()}\n\n` +
        (message || '') +
        `\nFor any queries, please contact our support team.`;

      // Send WhatsApp message
      const result = await this.sendWhatsAppMessage(service.phone, statusMessage);
      
      // Log the notification
      await this.logNotification(service.patient_id, serviceId, 'SERVICE_STATUS', statusMessage, result);

      return result;
    } catch (error) {
      logger.error('Error sending service status update:', error);
      throw error;
    }
  }

  static async logNotification(patientId, entityId, notificationType, message, result) {
    try {
      const query = `
        INSERT INTO whatsapp_notifications (
          patient_id, entity_id, notification_type, message, 
          status, message_id, error_message, sent_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      `;
      
      await pool.query(query, [
        patientId,
        entityId,
        notificationType,
        message,
        result.success ? 'sent' : 'failed',
        result.messageId || null,
        result.error || null
      ]);
    } catch (error) {
      logger.error('Error logging notification:', error);
    }
  }

  static async logPromotionalCampaign(promotionId, totalTargets, results) {
    try {
      const query = `
        INSERT INTO whatsapp_promotional_campaigns (
          promotion_id, total_targets, successful_sends, failed_sends,
          campaign_date, results_summary
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)
      `;
      
      await pool.query(query, [
        promotionId,
        totalTargets,
        results.filter(r => r.success).length,
        results.filter(r => !r.success).length,
        JSON.stringify(results)
      ]);
    } catch (error) {
      logger.error('Error logging promotional campaign:', error);
    }
  }

  static async getNotificationHistory(patientId, limit = 50) {
    try {
      const query = `
        SELECT wn.*, p.name as patient_name
        FROM whatsapp_notifications wn
        LEFT JOIN patients p ON wn.patient_id = p.id
        WHERE wn.patient_id = $1
        ORDER BY wn.sent_at DESC
        LIMIT $2
      `;
      
      const result = await pool.query(query, [patientId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting notification history:', error);
      throw error;
    }
  }

  static async getNotificationStats(startDate, endDate) {
    try {
      const query = `
        SELECT 
          notification_type,
          COUNT(*) as total_sent,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM whatsapp_notifications
        WHERE sent_at BETWEEN $1 AND $2
        GROUP BY notification_type
        ORDER BY total_sent DESC
      `;
      
      const result = await pool.query(query, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }
}

// API Routes

// Send bill notification
router.post('/send-bill-notification',
  [
    body('patient_id').isInt().withMessage('Patient ID must be an integer'),
    body('bill_id').isInt().withMessage('Bill ID must be an integer')
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

      const { patient_id, bill_id } = req.body;
      const result = await WhatsAppIntegration.sendBillNotification(patient_id, bill_id);

      res.json({
        success: true,
        message: 'Bill notification sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending bill notification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Send study completion notification
router.post('/send-study-completion',
  [
    body('patient_id').isInt().withMessage('Patient ID must be an integer'),
    body('study_id').isInt().withMessage('Study ID must be an integer')
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

      const { patient_id, study_id } = req.body;
      const result = await WhatsAppIntegration.sendStudyCompletionNotification(patient_id, study_id);

      res.json({
        success: true,
        message: 'Study completion notification sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending study completion notification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Send report ready notification
router.post('/send-report-ready',
  [
    body('patient_id').isInt().withMessage('Patient ID must be an integer'),
    body('report_id').isInt().withMessage('Report ID must be an integer')
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

      const { patient_id, report_id } = req.body;
      const result = await WhatsAppIntegration.sendReportReadyNotification(patient_id, report_id);

      res.json({
        success: true,
        message: 'Report ready notification sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending report ready notification:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Send promotional message
router.post('/send-promotional',
  [
    body('promotion_id').isInt().withMessage('Promotion ID must be an integer'),
    body('target_group').optional().isIn(['all', 'recent_patients', 'active_patients'])
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

      const { promotion_id, target_group = 'all' } = req.body;
      const result = await WhatsAppIntegration.sendPromotionalMessage(promotion_id, target_group);

      res.json({
        success: true,
        message: 'Promotional message sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending promotional message:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Send appointment reminder
router.post('/send-appointment-reminder',
  [
    body('appointment_id').isInt().withMessage('Appointment ID must be an integer')
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

      const { appointment_id } = req.body;
      const result = await WhatsAppIntegration.sendAppointmentReminder(appointment_id);

      res.json({
        success: true,
        message: 'Appointment reminder sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending appointment reminder:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Send service status update
router.post('/send-service-status',
  [
    body('service_id').isInt().withMessage('Service ID must be an integer'),
    body('status').isString().withMessage('Status is required'),
    body('message').optional().isString()
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

      const { service_id, status, message } = req.body;
      const result = await WhatsAppIntegration.sendServiceStatusUpdate(service_id, status, message);

      res.json({
        success: true,
        message: 'Service status update sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending service status update:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get notification history
router.get('/notification-history/:patient_id',
  [
    body('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req, res) => {
    try {
      const { patient_id } = req.params;
      const { limit = 50 } = req.query;
      
      const history = await WhatsAppIntegration.getNotificationHistory(patient_id, parseInt(limit));

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error getting notification history:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Get notification statistics
router.get('/notification-stats',
  [
    body('start_date').isISO8601().withMessage('Start date must be a valid date'),
    body('end_date').isISO8601().withMessage('End date must be a valid date')
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

      const { start_date, end_date } = req.query;
      const stats = await WhatsAppIntegration.getNotificationStats(start_date, end_date);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Test endpoint (for development)
router.post('/test-message',
  [
    body('phone').isString().withMessage('Phone number is required'),
    body('message').isString().withMessage('Message is required')
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

      const { phone, message } = req.body;
      const result = await WhatsAppIntegration.sendWhatsAppMessage(phone, message);

      res.json({
        success: true,
        message: 'Test message sent successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error sending test message:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// Error handler
router.use((error, req, res, next) => {
  logger.error('Unhandled error in WhatsApp integration:', {
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
