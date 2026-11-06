/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Error classes for custom errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message, details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

class AuthorizationError extends AppError {
  constructor(message, details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class RateLimitError extends AppError {
  constructor(message, details = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

class DatabaseError extends AppError {
  constructor(message, details = null) {
    super(message, 503, 'DATABASE_ERROR', details);
  }
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || uuidv4();
  
  // Set default values
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal Server Error';
  let details = err.details;
  let stack = err.stack;

  // Log the error
  const errorData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    code,
    message,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  };

  // Log different levels based on status code
  if (statusCode >= 500) {
    logger.error('Server Error:', { ...errorData, stack });
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', errorData);
  } else {
    logger.info('Error:', errorData);
  }

  // Handle specific error types
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
  } else if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
      type: e.validatorKey,
    }));
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    code = 'DUPLICATE_ERROR';
    message = 'Resource already exists';
    details = err.errors.map((e) => ({
      field: e.path,
      message: `${e.path} already exists`,
    }));
  } else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 503;
    code = 'DATABASE_ERROR';
    message = 'Database error occurred';
  } else if (err.name === 'RateLimitError') {
    statusCode = 429;
    code = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests, please try again later';
  }

  // Prepare response
  const response = {
    error: {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  // Include details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.details = details;
    response.error.stack = process.env.NODE_ENV === 'development' ? stack : undefined;
  }

  // Send response
  res.status(statusCode).json(response);
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      requestId: req.requestId || uuidv4(),
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  DatabaseError,
};
