// Health Monitoring System
// Comprehensive system health monitoring and alerting

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      checkInterval: options.checkInterval || 30000, // 30 seconds
      alertThreshold: options.alertThreshold || 0.8, // 80%
      logFile: options.logFile || 'logs/health.log',
      enableMetrics: options.enableMetrics !== false,
      enableAlerts: options.enableAlerts !== false,
      ...options
    };
    
    this.metrics = {
      system: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0
      },
      database: {
        connections: 0,
        queryTime: 0,
        errors: 0
      },
      redis: {
        connections: 0,
        memory: 0,
        operations: 0
      },
      application: {
        uptime: 0,
        requests: 0,
        errors: 0,
        responseTime: 0
      }
    };
    
    this.alerts = [];
    this.isRunning = false;
    this.checkTimer = null;
    this.startTime = Date.now();
    
    // Ensure log directory exists
    const logDir = path.dirname(this.options.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.startTime = Date.now();
    
    // Start periodic health checks
    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.checkInterval);
    
    // Perform initial health check
    this.performHealthCheck();
    
    this.log('Health monitoring started');
    this.emit('started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    this.log('Health monitoring stopped');
    this.emit('stopped');
  }

  async performHealthCheck() {
    try {
      const healthData = {
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        system: await this.checkSystemHealth(),
        database: await this.checkDatabaseHealth(),
        redis: await this.checkRedisHealth(),
        application: this.checkApplicationHealth()
      };

      // Update metrics
      this.updateMetrics(healthData);
      
      // Check for alerts
      if (this.options.enableAlerts) {
        this.checkAlerts(healthData);
      }
      
      // Log health data
      if (this.options.enableMetrics) {
        this.logHealthData(healthData);
      }
      
      // Emit health data
      this.emit('healthCheck', healthData);
      
      return healthData;
    } catch (error) {
      this.log(`Health check failed: ${error.message}`, 'error');
      this.emit('error', error);
    }
  }

  async checkSystemHealth() {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const loadAvg = os.loadavg();
    
    // CPU usage calculation
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / (os.cpus().length * 1000000) * 100;
    
    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = (usedMemory / totalMemory) * 100;
    
    // Disk usage (simplified - in production, use proper disk monitoring)
    const diskUsage = this.getDiskUsage();
    
    // Network stats (simplified)
    const networkStats = this.getNetworkStats();
    
    return {
      cpu: {
        usage: Math.min(cpuPercent, 100),
        loadAverage: loadAvg[0],
        cores: os.cpus().length
      },
      memory: {
        used: memoryUsage,
        total: totalMemory,
        usage: memoryPercent,
        free: freeMemory
      },
      disk: diskUsage,
      network: networkStats,
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime()
    };
  }

  async checkDatabaseHealth() {
    try {
      const pool = require('../app').pool;
      const start = Date.now();
      
      // Test database connection
      const result = await pool.query('SELECT 1 as test, NOW() as timestamp');
      const queryTime = Date.now() - start;
      
      // Get connection pool stats
      const totalCount = pool.totalCount;
      const idleCount = pool.idleCount;
      const waitingCount = pool.waitingCount;
      
      return {
        status: 'healthy',
        connections: {
          total: totalCount,
          active: totalCount - idleCount,
          idle: idleCount,
          waiting: waitingCount
        },
        queryTime,
        lastCheck: new Date().toISOString(),
        error: null
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connections: { total: 0, active: 0, idle: 0, waiting: 0 },
        queryTime: 0,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async checkRedisHealth() {
    try {
      const redisClient = require('../app').redisClient;
      const start = Date.now();
      
      // Test Redis connection
      const pong = await redisClient.ping();
      const responseTime = Date.now() - start;
      
      // Get Redis info
      const info = await redisClient.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      return {
        status: 'healthy',
        response: pong,
        responseTime,
        memory: {
          used: memoryInfo.used_memory,
          peak: memoryInfo.used_memory_peak,
          rss: memoryInfo.used_memory_rss
        },
        lastCheck: new Date().toISOString(),
        error: null
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        response: null,
        responseTime: 0,
        memory: { used: 0, peak: 0, rss: 0 },
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  checkApplicationHealth() {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    return {
      uptime,
      memory: memoryUsage,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      lastCheck: new Date().toISOString()
    };
  }

  getDiskUsage() {
    try {
      const stats = fs.statSync(process.cwd());
      return {
        available: 'N/A', // Would need proper disk monitoring library
        used: 'N/A',
        total: 'N/A',
        usage: 0
      };
    } catch (error) {
      return {
        available: 0,
        used: 0,
        total: 0,
        usage: 0,
        error: error.message
      };
    }
  }

  getNetworkStats() {
    try {
      const networkInterfaces = os.networkInterfaces();
      const stats = {};
      
      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        stats[name] = interfaces.map(iface => ({
          address: iface.address,
          netmask: iface.netmask,
          family: iface.family,
          mac: iface.mac,
          internal: iface.internal
        }));
      }
      
      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = isNaN(value) ? value : Number(value);
        }
      }
    }
    
    return result;
  }

  updateMetrics(healthData) {
    this.metrics.system = healthData.system;
    this.metrics.database = healthData.database;
    this.metrics.redis = healthData.redis;
    this.metrics.application = healthData.application;
  }

  checkAlerts(healthData) {
    const alerts = [];
    
    // CPU usage alert
    if (healthData.system.cpu.usage > this.options.alertThreshold * 100) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${healthData.system.cpu.usage.toFixed(2)}%`,
        value: healthData.system.cpu.usage,
        threshold: this.options.alertThreshold * 100
      });
    }
    
    // Memory usage alert
    if (healthData.system.memory.usage > this.options.alertThreshold * 100) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${healthData.system.memory.usage.toFixed(2)}%`,
        value: healthData.system.memory.usage,
        threshold: this.options.alertThreshold * 100
      });
    }
    
    // Database health alert
    if (healthData.database.status === 'unhealthy') {
      alerts.push({
        type: 'database',
        severity: 'critical',
        message: `Database connection failed: ${healthData.database.error}`,
        error: healthData.database.error
      });
    }
    
    // Redis health alert
    if (healthData.redis.status === 'unhealthy') {
      alerts.push({
        type: 'redis',
        severity: 'critical',
        message: `Redis connection failed: ${healthData.redis.error}`,
        error: healthData.redis.error
      });
    }
    
    // Database query time alert
    if (healthData.database.queryTime > 1000) {
      alerts.push({
        type: 'database_performance',
        severity: 'warning',
        message: `Slow database query: ${healthData.database.queryTime}ms`,
        value: healthData.database.queryTime,
        threshold: 1000
      });
    }
    
    // Update alerts
    this.alerts = alerts;
    
    // Emit alerts
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        this.emit('alert', alert);
        this.log(`ALERT: ${alert.message}`, alert.severity);
      });
    }
  }

  logHealthData(healthData) {
    const logEntry = {
      timestamp: healthData.timestamp,
      system: {
        cpu: healthData.system.cpu.usage,
        memory: healthData.system.memory.usage
      },
      database: {
        status: healthData.database.status,
        queryTime: healthData.database.queryTime
      },
      redis: {
        status: healthData.redis.status,
        responseTime: healthData.redis.responseTime
      }
    };
    
    this.log(JSON.stringify(logEntry), 'info');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Write to log file
    try {
      fs.appendFileSync(this.options.logFile, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(logMessage);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      alerts: this.alerts,
      uptime: Date.now() - this.startTime,
      isRunning: this.isRunning
    };
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    
    // Determine overall health status
    let status = 'healthy';
    if (metrics.alerts.some(alert => alert.severity === 'critical')) {
      status = 'critical';
    } else if (metrics.alerts.some(alert => alert.severity === 'warning')) {
      status = 'warning';
    }
    
    return {
      status,
      uptime: metrics.uptime,
      metrics,
      alerts: metrics.alerts,
      lastCheck: new Date().toISOString()
    };
  }
}

// Create global health monitor instance
const healthMonitor = new HealthMonitor({
  checkInterval: 30000, // 30 seconds
  alertThreshold: 0.8, // 80%
  enableMetrics: true,
  enableAlerts: true
});

// Health check endpoint middleware
const healthCheckMiddleware = async (req, res) => {
  try {
    const healthStatus = healthMonitor.getHealthStatus();
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                     healthStatus.status === 'warning' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Detailed health check endpoint
const detailedHealthCheckMiddleware = async (req, res) => {
  try {
    const healthData = await healthMonitor.performHealthCheck();
    res.json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Metrics endpoint
const metricsMiddleware = (req, res) => {
  try {
    const metrics = healthMonitor.getMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  HealthMonitor,
  healthMonitor,
  healthCheckMiddleware,
  detailedHealthCheckMiddleware,
  metricsMiddleware
};
