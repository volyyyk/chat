/**
 * Rate limiting middleware for Express
 * 
 * Implements token bucket algorithm for rate limiting
 */

const rateLimit = require('express-rate-limit');

/**
 * Creates rate limiter middleware
 * @param {Object} config - Configuration object
 * @param {number} config.maxMessagesPerMinute - Max messages per minute per IP
 * @param {number} config.maxConnections - Max connections per IP
 * @returns {Function} Express middleware
 */
function rateLimiter(config) {
  // Create in-memory store for rate limiting
  const store = new Map();
  
  // Token bucket implementation
  const tokenBucket = (ip) => {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxTokens = config.maxMessagesPerMinute || 100;
    
    let bucket = store.get(ip);
    
    if (!bucket) {
      bucket = {
        tokens: maxTokens,
        lastRefill: now
      };
      store.set(ip, bucket);
    }
    
    // Refill tokens
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timePassed / windowMs) * maxTokens);
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
    
    return bucket;
  };
  
  // Connection tracking
  const connectionTracker = new Map();
  
  // Middleware function
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // Connection limiting
    if (config.maxConnectionsPerIP) {
      const connections = connectionTracker.get(ip) || 0;
      
      if (connections >= config.maxConnectionsPerIP) {
        return res.status(429).json({
          error: 'Too many connections',
          code: 'RATE_LIMIT_CONNECTIONS',
          retryAfter: 60
        });
      }
      
      connectionTracker.set(ip, connections + 1);
      
      // Cleanup on response finish
      res.on('finish', () => {
        const current = connectionTracker.get(ip) || 0;
        connectionTracker.set(ip, Math.max(0, current - 1));
      });
    }
    
    // Message rate limiting (for WebSocket, this is handled separately)
    // For HTTP requests
    if (req.method !== 'GET' || req.path !== '/health') {
      const bucket = tokenBucket(ip);
      
      if (bucket.tokens < 1) {
        return res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_REQUESTS',
          retryAfter: 60
        });
      }
      
      bucket.tokens--;
    }
    
    next();
  };
}

/**
 * Creates WebSocket rate limiter
 * @param {Object} config - Configuration object
 * @returns {Object} Rate limiter for WebSocket
 */
function createWebSocketRateLimiter(config) {
  const store = new Map();
  const maxMessages = config.maxMessagesPerMinute || 100;
  const windowMs = 60 * 1000; // 1 minute
  
  return {
    check: (ip) => {
      const now = Date.now();
      let data = store.get(ip);
      
      if (!data) {
        data = { count: 0, lastReset: now };
        store.set(ip, data);
      }
      
      // Reset counter if window has passed
      if (now - data.lastReset > windowMs) {
        data.count = 0;
        data.lastReset = now;
      }
      
      // Check if limit exceeded
      if (data.count >= maxMessages) {
        return false; // Rate limited
      }
      
      data.count++;
      return true; // Allowed
    },
    
    reset: (ip) => {
      store.delete(ip);
    },
    
    cleanup: () => {
      const now = Date.now();
      for (const [ip, data] of store) {
        if (now - data.lastReset > windowMs) {
          store.delete(ip);
        }
      }
    }
  };
}

/**
 * Creates Express rate limiter using express-rate-limit
 * @param {Object} options - Options for express-rate-limit
 * @returns {Function} Express middleware
 */
function createExpressRateLimiter(options = {}) {
  const defaults = {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health', // Skip health check
    keyGenerator: (req) => {
      return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    }
  };
  
  return rateLimit({ ...defaults, ...options });
}

module.exports = {
  rateLimiter,
  createWebSocketRateLimiter,
  createExpressRateLimiter
};
