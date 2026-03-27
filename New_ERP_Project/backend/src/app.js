require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const redis = require('redis');
const pool = require('./config/db');
const { logger, redis: redisLogger, system: systemLogger, logRequest } = require('./config/logger');

const app = express();
const PORT = process.env.PORT || 3003;

// Redis connection for sessions
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB) || 0
});

// Redis connection event handlers
redisClient.on('connect', () => {
  redisLogger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  redisLogger.error('Redis connection error:', err);
});

// Connect to Redis
redisClient.connect().catch(err => {
  redisLogger.error('Failed to connect to Redis:', err);
});

// Middleware
app.use(helmet());

// Trust proxy (for deployments behind Nginx/load balancer)
app.set('trust proxy', 1);

// Redirect HTTP → HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.protocol === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3004', 'http://localhost:3003', 'http://localhost:3000', 'https://erp.feenixtech.com'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Strip null bytes only — HTML encoding belongs at render time (React does this automatically)
const sanitizeStrings = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key].replace(/\0/g, '');
    } else if (typeof obj[key] === 'object') {
      sanitizeStrings(obj[key]);
    }
  }
};
app.use((req, res, next) => {
  sanitizeStrings(req.body);
  sanitizeStrings(req.query);
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 2000 : 10000,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    logRequest(req, res, responseTime);
  });
  
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW()');
    
    // Test Redis connection
    let redisStatus = 'connected';
    try {
      await redisClient.ping();
    } catch (err) {
      redisStatus = 'disconnected';
      redisLogger.error('Redis health check failed:', err);
    }
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbResult ? 'connected' : 'disconnected',
      redis: redisStatus,
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    systemLogger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Server time & timezone (used by frontend for date defaults)
app.get('/api/server-time', (_, res) => {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  res.json({
    timezone: tz,
    date: now.toLocaleDateString('en-CA', { timeZone: tz }), // YYYY-MM-DD
    datetime: now.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T'),
  });
});

// Authentication middleware (session-based)
const { authenticateToken } = require('./middleware/auth');

// Static uploads (logos, etc.)
app.use('/uploads', require('express').static(require('path').join(__dirname, '../uploads')));

// Public branding endpoint (no auth — used by login page on any device)
app.get('/api/public/branding', async (req, res) => {
  try {
    const pool = require('./config/db');
    const { rows } = await pool.query(
      'SELECT company_name, logo_path FROM company_info ORDER BY id LIMIT 1'
    );
    const row = rows[0] || {};
    res.json({ company_name: row.company_name || 'ARIS', logo_path: row.logo_path || null });
  } catch {
    res.json({ company_name: 'ARIS', logo_path: null });
  }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/masters', authenticateToken, require('./routes/masters'));
app.use('/api/users', authenticateToken, require('./routes/users'));
app.use('/api/customers', authenticateToken, require('./routes/customers'));
app.use('/api/patients', authenticateToken, require('./routes/patients'));
app.use('/api/patient-physician', authenticateToken, require('./routes/patient-physician'));
app.use('/api/referring-physicians', authenticateToken, require('./routes/referring-physicians'));
app.use('/api/rad-reporting', authenticateToken, require('./routes/rad-reporting'));
app.use('/api/centers', authenticateToken, require('./routes/centers'));
app.use('/api/center-master', authenticateToken, require('./routes/center_master'));
app.use('/api/center-master-public', require('./routes/center_master'));
app.use('/api/scanners', authenticateToken, require('./routes/scanners'));
app.use('/api/billing',            authenticateToken, require('./routes/billing'));
app.use('/api/billing-operations', authenticateToken, require('./routes/billing-operations'));
app.use('/api/bill-printing',      authenticateToken, require('./routes/bill-printing'));
app.use('/api/study-consumables', authenticateToken, require('./routes/study-consumables'));
app.use('/api/bill-consumables',  authenticateToken, require('./routes/bill-consumables'));
app.use('/api/simple-insurance', authenticateToken, require('./routes/simple-insurance'));
app.use('/api/payroll', authenticateToken, require('./routes/payroll'));
app.use('/api/radiology-reporting', authenticateToken, require('./routes/radiology-reporting'));
app.use('/api/rbac', authenticateToken, require('./routes/rbac'));
app.use('/api/password-settings', authenticateToken, require('./routes/password-settings'));
app.use('/api/dashboard-reports', authenticateToken, require('./routes/dashboard-reports'));
app.use('/api/dashboard',         authenticateToken, require('./routes/dashboard-reports'));
app.use('/api/invoices', authenticateToken, require('./routes/invoices'));
// Petty cash vouchers (replaces old expenses workflow)
app.use('/api/petty-cash', authenticateToken, require('./routes/petty-cash'));
app.use('/api/expenses',   authenticateToken, require('./routes/expenses'));
app.use('/api/vendors',   authenticateToken, require('./routes/vendors'));
app.use('/api/payments', authenticateToken, require('./routes/payments'));
app.use('/api/products', authenticateToken, require('./routes/products'));
app.use('/api/reports', authenticateToken, require('./routes/reports'));

// Studies / Radiology workflow
app.use('/api/studies', authenticateToken, require('./routes/studies'));

// Financial & accounting
app.use('/api/finance',                authenticateToken, require('./routes/finance'));
app.use('/api/chart-of-accounts',      authenticateToken, require('./routes/chart-of-accounts'));
// app.use('/api/expense-tracking', ...) — retired, replaced by /api/petty-cash
app.use('/api/gst',                    authenticateToken, require('./routes/gst-management'));
app.use('/api/corporate-entities',     authenticateToken, require('./routes/corporate-entities'));
app.use('/api/center-contract-rules',  authenticateToken, require('./routes/center-contract-rules'));
app.use('/api/parties',                authenticateToken, require('./routes/parties'));

// Insurance
app.use('/api/insurance', authenticateToken, require('./routes/insurance'));

// Asset management
app.use('/api/asset-management', authenticateToken, require('./routes/asset-management'));
app.use('/api/loaner-assets',    authenticateToken, require('./routes/loaner-asset-tracking'));

// Item categories (database-driven category + COA mapping)
const itemCategoriesRouter = require('./routes/item-categories');
app.use('/api/item-categories', authenticateToken, itemCategoriesRouter);

// Item master (stock + non-stock items)
app.use('/api/item-master',        authenticateToken, require('./routes/item-master'));

// Asset maintenance lifecycle
app.use('/api/asset-maintenance',  authenticateToken, require('./routes/asset-maintenance'));

// Procurement + Goods Receipt Notes
app.use('/api/procurement', authenticateToken, require('./routes/procurement'));
app.use('/api/grn',         authenticateToken, require('./routes/grn'));

// Equity / capital management
app.use('/api/equity', authenticateToken, require('./routes/equity'));

// DICOM MWL Gateway  — dual auth: Bearer token (worklist) + JWT (admin endpoints)
// NOTE: intentionally no global authenticateToken wrapper — route handles auth internally
app.use('/api/mwl', require('./routes/mwl'));

// Settings & configuration
app.use('/api/settings', authenticateToken, require('./routes/settings'));
app.use('/api/service-management', authenticateToken, require('./routes/service-management'));

// WhatsApp integration
app.use('/api/whatsapp', authenticateToken, require('./routes/whatsapp-integration'));

// Local API: only accessible from localhost and private networks
const localApiGuard = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || '';
  const normalized = ip.replace(/^::ffff:/, '');
  const allowed = ['127.0.0.1', '::1', 'localhost'];
  const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(normalized);
  if (allowed.includes(normalized) || isPrivate) return next();
  logger.warn(`Local API access denied from IP: ${ip}`);
  return res.status(403).json({ success: false, error: 'Access denied' });
};
app.use('/local-api', localApiGuard, require('./routes/local-api'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Don't send error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// ── Crash protection — prevent silent process death ──────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — keeping server alive', { error: err.message, stack: err.stack });
  // Do NOT exit — log and continue
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection — keeping server alive', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Do NOT exit — log and continue
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    // Close database connections
    await pool.end();
    logger.info('Database connections closed');
    
    // Close Redis connection
    await redisClient.quit();
    logger.info('Redis connection closed');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await pool.end();
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
app.listen(PORT, () => {
  systemLogger.info(`ARIS ERP Backend Server Started`, {
    port: PORT,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    pid: process.pid,
    timestamp: new Date().toISOString()
  });
});

// Periodic cleanup of expired sessions (runs every hour)
const sessionCleanupInterval = parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS) || 3600000;
setInterval(async () => {
  try {
    const result = await pool.query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    if (result.rowCount > 0) {
      systemLogger.info(`Session cleanup: removed ${result.rowCount} expired sessions`);
    }
  } catch (err) {
    systemLogger.error('Session cleanup error:', err);
  }
}, sessionCleanupInterval);

module.exports = app;
