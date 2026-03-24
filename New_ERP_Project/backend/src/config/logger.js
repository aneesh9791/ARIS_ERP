const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const PII_KEYS = new Set([
  'email', 'phone', 'name', 'patient_name', 'address',
  'id_proof_number', 'pan_number', 'bank_account_number',
  'bank_account', 'password', 'password_hash', 'token',
  'session_token', 'authorization'
]);

function maskPiiInPlace(obj, depth = 0) {
  if (depth > 5 || obj === null || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      if (typeof obj[key] === 'string' && obj[key].length > 0) obj[key] = '***';
    } else if (obj[key] && typeof obj[key] === 'object') {
      maskPiiInPlace(obj[key], depth + 1);
    }
  }
}

// Main logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Mask PII in metadata
      maskPiiInPlace(meta);
      
      let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        log += ` ${JSON.stringify(meta)}`;
      }
      return log;
    })
  ),
  transports: [
    // Error log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Combined log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Access log for HTTP requests
    new winston.transports.File({ 
      filename: path.join(logsDir, 'access.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    }),
    
    // Console output for development
    new winston.transports.Console({ 
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'production'
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

// Create category-specific loggers
const createCategoryLogger = (category) => {
  return {
    info: (message, meta = {}) => logger.info(message, { category, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { category, ...meta }),
    error: (message, meta = {}) => logger.error(message, { category, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { category, ...meta }),
    http: (message, meta = {}) => logger.http(message, { category, ...meta })
  };
};

// Predefined category loggers
const loggers = {
  auth: createCategoryLogger('auth'),
  patients: createCategoryLogger('patients'),
  studies: createCategoryLogger('studies'),
  billing: createCategoryLogger('billing'),
  database: createCategoryLogger('database'),
  redis: createCategoryLogger('redis'),
  api: createCategoryLogger('api'),
  system: createCategoryLogger('system'),
  security: createCategoryLogger('security'),
  performance: createCategoryLogger('performance')
};

// Log rotation and cleanup function
const cleanupLogs = () => {
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = Date.now();
  
  try {
    const files = fs.readdirSync(logsDir);
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up old log file: ${file}`);
      }
    });
  } catch (error) {
    logger.error('Error during log cleanup:', error);
  }
};

// Run cleanup daily
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

// Add request logging helper
const logRequest = (req, res, responseTime) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id
  });
};

// Add error logging helper
const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

// Add performance logging helper
const logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

module.exports = {
  logger,
  ...loggers,
  logRequest,
  logError,
  logPerformance,
  cleanupLogs
};
