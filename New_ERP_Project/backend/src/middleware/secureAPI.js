const crypto = require('crypto');
const axios = require('axios');

/**
 * Secure API Client for Local System Integration
 * Handles token-based authentication, request signing, and retry logic
 */
class SecureAPIClient {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 15000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enableSigning: config.enableSigning !== false,
      clientId: config.clientId || 'aris-erp'
    };
    
    this.authConfig = {
      token: config.token || null,
      apiKey: config.apiKey || null
    };
  }

  /**
   * Generate secure headers for API requests
   */
  generateHeaders(payload = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ARIS-ERP/1.0',
      'X-Client-ID': this.config.clientId,
      'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Add authentication
    if (this.authConfig.token) {
      headers['Authorization'] = `Bearer ${this.authConfig.token}`;
    } else if (this.authConfig.apiKey) {
      headers['X-API-Key'] = this.authConfig.apiKey;
    }

    // Add timestamp and signature if signing is enabled
    if (this.config.enableSigning) {
      const timestamp = new Date().toISOString();
      headers['X-Timestamp'] = timestamp;
      
      // Generate checksum for payload integrity
      const payloadString = JSON.stringify(payload);
      const checksum = crypto.createHash('sha256')
        .update(payloadString + timestamp + this.config.clientId)
        .digest('hex');
      headers['X-Checksum'] = checksum;
    }

    return headers;
  }

  /**
   * Create secure payload with metadata
   */
  createSecurePayload(data) {
    const timestamp = new Date().toISOString();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const securePayload = {
      ...data,
      security: {
        source: this.config.clientId,
        timestamp: timestamp,
        request_id: requestId
      }
    };

    // Add checksum if signing is enabled
    if (this.config.enableSigning) {
      const payloadString = JSON.stringify(data);
      securePayload.security.checksum = crypto.createHash('sha256')
        .update(payloadString + timestamp + this.config.clientId)
        .digest('hex');
    }

    return securePayload;
  }

  /**
   * Make secure API call with retry logic
   */
  async makeRequest(endpoint, payload, options = {}) {
    const securePayload = this.createSecurePayload(payload);
    const headers = this.generateHeaders(payload);

    const config = {
      method: 'POST',
      url: endpoint,
      headers: headers,
      data: securePayload,
      timeout: this.config.timeout,
      validateStatus: (status) => status < 500, // Don't throw for 4xx errors
      ...options
    };

    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await axios(config);
        
        // Validate response
        const validationResult = this.validateResponse(response);
        
        return {
          success: validationResult.success,
          data: response.data,
          status: response.status,
          message: validationResult.message,
          attempt: attempt
        };
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          return {
            success: false,
            status: error.response?.status || 500,
            message: this.getErrorMessage(error),
            error: error.message,
            attempt: attempt
          };
        }
        
        // Retry on network errors or server errors
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    return {
      success: false,
      status: lastError.response?.status || 500,
      message: this.getErrorMessage(lastError),
      error: lastError.message,
      attempts: this.config.retryAttempts
    };
  }

  /**
   * Validate API response
   */
  validateResponse(response) {
    if (response.status === 200) {
      if (response.data) {
        // Check for success indicators in response
        if (response.data.success === true || response.data.status === 'success') {
          return { success: true, message: 'Request successful' };
        } else {
          return { 
            success: false, 
            message: response.data.message || 'Request rejected by server' 
          };
        }
      }
      return { success: true, message: 'Request successful' };
    }
    
    // Handle specific error codes
    switch (response.status) {
      case 401:
        return { success: false, message: 'Authentication failed - Invalid token or API key' };
      case 403:
        return { success: false, message: 'Access forbidden - Insufficient permissions' };
      case 429:
        return { success: false, message: 'Rate limit exceeded' };
      default:
        return { 
          success: false, 
          message: `HTTP ${response.status}: ${response.data?.message || 'Unknown error'}` 
        };
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    if (error.response) {
      // Server responded with error status
      return this.validateResponse(error.response).message;
    } else if (error.request) {
      // Network error
      return 'Network error - Unable to reach local system';
    } else {
      // Other error
      return error.message || 'Unknown error occurred';
    }
  }

  /**
   * Delay utility for retry logic
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update authentication configuration
   */
  updateAuth(token = null, apiKey = null) {
    this.authConfig.token = token;
    this.authConfig.apiKey = apiKey;
  }

  /**
   * Test connection to local system
   */
  async testConnection(endpoint) {
    const testPayload = {
      test: true,
      timestamp: new Date().toISOString(),
      client: this.config.clientId
    };

    return this.makeRequest(endpoint, testPayload);
  }
}

/**
 * Create and configure secure API client from database config
 */
async function createSecureClient(pool) {
  try {
    // Get configuration from database
    const configQuery = `
      SELECT key, value FROM system_config 
      WHERE key IN (
        'LOCAL_SYSTEM_API_ENDPOINT', 
        'LOCAL_SYSTEM_API_TOKEN', 
        'LOCAL_SYSTEM_API_KEY',
        'API_REQUEST_TIMEOUT',
        'API_RETRY_ATTEMPTS',
        'ENABLE_REQUEST_SIGNING',
        'LOCAL_SYSTEM_CLIENT_ID'
      )
    `;
    const configResult = await pool.query(configQuery);
    
    const config = {};
    configResult.rows.forEach(row => {
      switch (row.key) {
        case 'LOCAL_SYSTEM_API_TOKEN':
          config.token = row.value;
          break;
        case 'LOCAL_SYSTEM_API_KEY':
          config.apiKey = row.value;
          break;
        case 'API_REQUEST_TIMEOUT':
          config.timeout = parseInt(row.value) || 15000;
          break;
        case 'API_RETRY_ATTEMPTS':
          config.retryAttempts = parseInt(row.value) || 3;
          break;
        case 'ENABLE_REQUEST_SIGNING':
          config.enableSigning = row.value === 'true';
          break;
        case 'LOCAL_SYSTEM_CLIENT_ID':
          config.clientId = row.value || 'aris-erp';
          break;
      }
    });

    // Override with environment variables if available
    config.token = config.token || process.env.LOCAL_SYSTEM_API_TOKEN;
    config.apiKey = config.apiKey || process.env.LOCAL_SYSTEM_API_KEY;
    config.timeout = config.timeout || parseInt(process.env.API_REQUEST_TIMEOUT) || 15000;
    config.retryAttempts = config.retryAttempts || parseInt(process.env.API_RETRY_ATTEMPTS) || 3;
    config.enableSigning = config.enableSigning !== false && process.env.ENABLE_REQUEST_SIGNING !== 'false';
    config.clientId = config.clientId || process.env.LOCAL_SYSTEM_CLIENT_ID || 'aris-erp';

    return new SecureAPIClient(config);
    
  } catch (error) {
    console.error('Failed to create secure API client:', error);
    // Return default client with environment variables
    return new SecureAPIClient({
      token: process.env.LOCAL_SYSTEM_API_TOKEN,
      apiKey: process.env.LOCAL_SYSTEM_API_KEY,
      timeout: parseInt(process.env.API_REQUEST_TIMEOUT) || 15000,
      retryAttempts: parseInt(process.env.API_RETRY_ATTEMPTS) || 3,
      enableSigning: process.env.ENABLE_REQUEST_SIGNING !== 'false',
      clientId: process.env.LOCAL_SYSTEM_CLIENT_ID || 'aris-erp'
    });
  }
}

module.exports = {
  SecureAPIClient,
  createSecureClient
};
