/**
 * Rate Limiter Middleware
 * Limits the number of requests per IP address
 */

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../config/redis');

// Rate limiting configuration
const rateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable legacy headers
  keyGenerator: (req) => {
    // Use IP address as key
    return req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for certain paths
    const skipPaths = [
      '/health',
      '/api-docs',
      '/static',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
    ];
    return skipPaths.some((path) => req.path.startsWith(path));
  },
  handler: (req, res) => {
    const retryAfter = req.rateLimit.resetTime;
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(retryAfter / 1000), // Seconds until reset
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        reset: new Date(req.rateLimit.resetTime).toISOString(),
      },
    });
  },
  requestWasSuccessful: (req, res) => {
    // Only count successful requests (status < 400)
    return res.statusCode < 400;
  },
});

// Auth-specific rate limiter (more restrictive)
const authRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per window
  keyGenerator: (req) => {
    return req.ip;
  },
  skip: (req) => {
    return !req.path.startsWith('/api/auth');
  },
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
      },
    });
  },
});

// WebSocket rate limiter
const wsRateLimiter = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 messages per window
  track: async (socket) => {
    const key = `ws:${socket.id}`;
    const now = Date.now();
    
    try {
      const count = await redis.get(key);
      const parsedCount = count ? JSON.parse(count) : { count: 0, start: now };
      
      if (now - parsedCount.start > wsRateLimiter.windowMs) {
        // Reset window
        parsedCount.count = 1;
        parsedCount.start = now;
      } else {
        parsedCount.count++;
      }
      
      if (parsedCount.count > wsRateLimiter.max) {
        return false; // Rate limited
      }
      
      await redis.set(key, JSON.stringify(parsedCount), 'PX', wsRateLimiter.windowMs);
      return true; // Allowed
    } catch (err) {
      logger.error('WebSocket rate limiter error:', err);
      return true; // Allow on error
    }
  },
};

module.exports = {
  rateLimiter,
  authRateLimiter,
  wsRateLimiter,
};
