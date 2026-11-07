/**
 * Global Error Handler Middleware
 * Catches all errors, logs them and returns a consistent JSON response.
 */

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

/**
 * Application error with HTTP status and machine-readable code.
 * Used across services/controllers for operational (4xx/5xx) errors.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} status - HTTP status code (default 500)
   * @param {string} code - Machine-readable error code (default INTERNAL_ERROR)
   * @param {*} details - Optional extra details (validation errors etc.)
   */
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.message = message;
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
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

    if (err.details && status < 500) {
      response.details = err.details;
    }

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

// AppError is available both as a property and via destructuring:
// const { AppError } = require('../middleware/errorHandler');
ErrorHandler.AppError = AppError;

module.exports = ErrorHandler;
