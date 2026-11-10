/**
 * Rate Limiter Middleware
 * Limits the number of requests per IP address.
 * Uses a Redis store when Redis and rate-limit-redis are available,
 * and transparently falls back to the in-memory store otherwise,
 * so the server can always start.
 */

const rateLimit = require('express-rate-limit');

// Prefer Redis-backed store, fall back to in-memory
function createRedisStore() {
  try {
    const RedisStore = require('rate-limit-redis');
    const redis = require('../config/redis');
    if (redis && typeof redis.sendCommand === 'function') {
      // sendCommand must receive the command parts as separate arguments
      return new RedisStore({ sendCommand: (...args) => redis.sendCommand(...args) });
    }
  } catch (err) {
    // rate-limit-redis or redis not available - use default MemoryStore
  }
  return undefined;
}

const baseOptions = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  // express-rate-limit v8: дефолтный keyGenerator это req.ip с корректной
  // обработкой IPv6 (ipKeyGenerator); кастомный (req) => req.ip больше не нужен
};

// Rate limiting configuration
const rateLimiter = rateLimit({
  ...baseOptions,
  // v8: опция называется limit (max - устаревший алиас v7)
  limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300, // 300 requests per window
  store: createRedisStore(),
  passOnStoreError: true, // serve requests even if Redis is temporarily down
  skip: (req) => {
    // Skip rate limiting for certain paths
    const skipPaths = [
      '/health',
      '/api-docs',
      '/static',
    ];
    return skipPaths.some((path) => req.path.startsWith(path));
  },
  handler: (req, res) => {
    const retryAfter = req.rateLimit.resetTime;
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(retryAfter / 1000),
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        reset: new Date(req.rateLimit.resetTime).toISOString(),
      },
    });
  },
});

// Auth-specific rate limiter (more restrictive: brute-force protection).
// Previously `skip` returned true for every non-auth path, which silently
// DISABLED brute-force protection for login too - now only /health is skipped.
const authRateLimiter = rateLimit({
  ...baseOptions,
  limit: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10, // 10 login attempts per window
  store: createRedisStore(),
  passOnStoreError: true,
  skip: (req) => {
    // Only limit auth endpoints themselves
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

// WebSocket rate limiter (best-effort, allows on error)
const wsRateLimiter = {
  windowMs: 15 * 60 * 1000,
  max: 1000, // 1000 messages per window
  track: async (socket) => {
    try {
      const redis = require('../config/redis');
      if (!redis || typeof redis.get !== 'function') return true;

      const key = 'ws:' + socket.id;
      const now = Date.now();

      const count = await redis.get(key);
      const parsedCount = count ? JSON.parse(count) : { count: 0, start: now };

      if (now - parsedCount.start > wsRateLimiter.windowMs) {
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
      global.logger
        ? global.logger.error('WebSocket rate limiter error: ' + err.message)
        : console.error('WebSocket rate limiter error:', err.message);
      return true; // Allow on error
    }
  },
};

module.exports = {
  rateLimiter,
  authRateLimiter,
  wsRateLimiter,
};
