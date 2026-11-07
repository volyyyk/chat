/**
 * Global Error Handler Middleware
 * Catches all errors, logs them and returns a consistent JSON response.
 */

const path = require('path');

// Use the app logger if available, fall back to console so the handler
// itself can never crash (previously logger was used without import).
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = global.logger || {
    error: (...args) => console.error('[error]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    info: (...args) => console.info('[info]', ...args),
  };
}

const ErrorHandler = {
  notFound: (req, res, next) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint not found: ' + req.method + ' ' + req.originalUrl,
      code: 'NOT_FOUND',
    });
  },

  errorHandler: (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';

    // Structured error log with request context
    logger.error('[' + code + '] ' + (err.message || 'Unknown error'), {
      code,
      status,
      method: req.method,
      url: req.originalUrl,
      requestId: req.requestId || undefined,
      userId: req.user && req.user.id ? req.user.id : undefined,
      stack: status === 500 ? err.stack : undefined,
    });

    // Never leak stack traces to clients in production
    const response = {
      success: false,
      message:
        status >= 500 && process.env.NODE_ENV === 'production'
          ? 'Внутренняя ошибка сервера'
          : err.message || 'Внутренняя ошибка сервера',
      code,
    };

    res.status(status).json(response);
  },

  wrapAsync: (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  },

  apiLimiter: (req, res, next) => {
    // Placeholder to keep API contract stable
    next();
  },
};

module.exports = ErrorHandler;
