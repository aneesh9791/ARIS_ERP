// Circuit Breaker Pattern Implementation
// Prevents cascading failures and provides resilience

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5; // Number of failures before opening
    this.timeout = options.timeout || 60000; // Time to wait before trying again
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.monitoring = options.monitoring || false;
    this.name = options.name || 'CircuitBreaker';
    this.logger = options.logger || console;
  }

  async execute(operation) {
    // Log state transition
    if (this.monitoring) {
      this.logger.info(`CircuitBreaker[${this.name}] State: ${this.state}, Failures: ${this.failureCount}`);
    }

    // Check if circuit is OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        if (this.monitoring) {
          this.logger.info(`CircuitBreaker[${this.name}] Transitioning to HALF_OPEN`);
        }
      } else {
        const error = new Error(`CircuitBreaker[${this.name}] is OPEN`);
        error.code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    if (this.monitoring) {
      this.logger.info(`CircuitBreaker[${this.name}] Operation successful, circuit CLOSED`);
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      if (this.monitoring) {
        this.logger.warn(`CircuitBreaker[${this.name}] Threshold reached, circuit OPEN`);
      }
    } else if (this.monitoring) {
      this.logger.warn(`CircuitBreaker[${this.name}] Operation failed, failures: ${this.failureCount}/${this.threshold}`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      threshold: this.threshold,
      timeout: this.timeout
    };
  }

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
    if (this.monitoring) {
      this.logger.info(`CircuitBreaker[${this.name}] Reset to CLOSED state`);
    }
  }

  forceOpen() {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    if (this.monitoring) {
      this.logger.warn(`CircuitBreaker[${this.name}] Forced to OPEN state`);
    }
  }

  forceClose() {
    this.reset();
  }
}

// Database Circuit Breaker
const databaseCircuitBreaker = new CircuitBreaker({
  name: 'Database',
  threshold: 5,
  timeout: 60000,
  monitoring: true
});

// Redis Circuit Breaker
const redisCircuitBreaker = new CircuitBreaker({
  name: 'Redis',
  threshold: 3,
  timeout: 30000,
  monitoring: true
});

// External API Circuit Breaker
const apiCircuitBreaker = new CircuitBreaker({
  name: 'ExternalAPI',
  threshold: 10,
  timeout: 120000,
  monitoring: true
});

// Circuit Breaker Middleware Factory
const createCircuitBreakerMiddleware = (circuitBreaker) => {
  return (req, res, next) => {
    circuitBreaker.execute(async () => {
      return new Promise((resolve, reject) => {
        const originalNext = next;
        next = (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        originalNext();
      });
    }).then(() => {
      // Circuit breaker execution succeeded, continue with request
      next();
    }).catch((error) => {
      if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE'
        });
      } else {
        // Pass through other errors
        next(error);
      }
    });
  };
};

// Retry with Exponential Backoff
const retryWithBackoff = async (operation, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// Health Check with Circuit Breaker
const healthCheckWithCircuitBreaker = async (circuitBreaker, healthCheckFunction) => {
  try {
    const result = await circuitBreaker.execute(healthCheckFunction);
    return {
      status: 'healthy',
      circuitBreaker: circuitBreaker.getState(),
      ...result
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      circuitBreaker: circuitBreaker.getState()
    };
  }
};

// Database Operations with Circuit Breaker
const executeWithDatabaseCircuitBreaker = async (query, params = []) => {
  return databaseCircuitBreaker.execute(async () => {
    const pool = require('../app').pool;
    return await pool.query(query, params);
  });
};

// Redis Operations with Circuit Breaker
const executeWithRedisCircuitBreaker = async (operation) => {
  return redisCircuitBreaker.execute(async () => {
    const redisClient = require('../app').redisClient;
    return await operation(redisClient);
  });
};

// External API Calls with Circuit Breaker
const executeWithApiCircuitBreaker = async (url, options = {}) => {
  return apiCircuitBreaker.execute(async () => {
    const axios = require('axios');
    return await axios.get(url, options);
  });
};

// Circuit Breaker Status Monitor
const getCircuitBreakerStatus = () => {
  return {
    database: databaseCircuitBreaker.getState(),
    redis: redisCircuitBreaker.getState(),
    externalAPI: apiCircuitBreaker.getState()
  };
};

// Reset All Circuit Breakers (for testing/recovery)
const resetAllCircuitBreakers = () => {
  databaseCircuitBreaker.reset();
  redisCircuitBreaker.reset();
  apiCircuitBreaker.reset();
};

// Force Open All Circuit Breakers (for testing)
const forceOpenAllCircuitBreakers = () => {
  databaseCircuitBreaker.forceOpen();
  redisCircuitBreaker.forceOpen();
  apiCircuitBreaker.forceOpen();
};

module.exports = {
  CircuitBreaker,
  databaseCircuitBreaker,
  redisCircuitBreaker,
  apiCircuitBreaker,
  createCircuitBreakerMiddleware,
  retryWithBackoff,
  healthCheckWithCircuitBreaker,
  executeWithDatabaseCircuitBreaker,
  executeWithRedisCircuitBreaker,
  executeWithApiCircuitBreaker,
  getCircuitBreakerStatus,
  resetAllCircuitBreakers,
  forceOpenAllCircuitBreakers
};
