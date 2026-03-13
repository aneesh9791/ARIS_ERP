const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const winston = require('winston');
const { Pool } = require('pg');
const redis = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Database connection event handlers
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Database connection error:', err);
});

// Redis connection for sessions
const redisClient = redis.createClient({
  url: process.env.REDIS_URL
});

// Redis connection event handlers
redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

// Connect to Redis
redisClient.connect().catch(err => {
  logger.error('Failed to connect to Redis:', err);
});

// Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/api/', limiter);

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
      logger.error('Redis health check failed:', err);
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
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', authenticateToken, require('./routes/users'));
app.use('/api/customers', authenticateToken, require('./routes/customers'));
app.use('/api/patients', authenticateToken, require('./routes/patients'));
app.use('/api/patient-physician', authenticateToken, require('./routes/patient-physician'));
app.use('/api/centers', authenticateToken, require('./routes/centers'));
app.use('/api/scanners', authenticateToken, require('./routes/scanners'));
app.use('/api/masters', authenticateToken, require('./routes/masters'));
app.use('/api/billing', authenticateToken, require('./routes/billing'));
app.use('/api/bill-printing', authenticateToken, require('./routes/bill-printing'));
app.use('/api/simple-insurance', authenticateToken, require('./routes/simple-insurance'));
app.use('/api/payroll', authenticateToken, require('./routes/payroll'));
app.use('/api/radiology-reporting', authenticateToken, require('./routes/radiology-reporting'));
app.use('/api/rbac', authenticateToken, require('./routes/rbac'));
app.use('/api/password-settings', authenticateToken, require('./routes/password-settings'));
app.use('/api/dashboard-reports', authenticateToken, require('./routes/dashboard-reports'));
app.use('/api/invoices', authenticateToken, require('./routes/invoices'));
app.use('/api/expenses', authenticateToken, require('./routes/expenses'));
app.use('/api/products', authenticateToken, require('./routes/products'));
app.use('/api/reports', authenticateToken, require('./routes/reports'));

// Local API for PACS/RIS integration (no auth required)
app.use('/local-api', require('./routes/local-api'));

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
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
