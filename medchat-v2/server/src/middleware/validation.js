/**
 * Validation Middleware
 * Validates request data using Joi schemas
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Validate request data against Joi schema
 * @param {Object} schema - Joi schema
 * @param {string} source - Data source ('body', 'query', 'params', 'headers')
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const requestId = req.headers['x-request-id'] || uuidv4();

    // Set request ID for logging
    req.requestId = requestId;

    // Validate data
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: false,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/[""]/g, ''),
        type: detail.type,
      }));

      logger.warn(`Validation failed for request ${requestId}: ${JSON.stringify(errors)}`);

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Request data validation failed',
        details: errors,
        requestId,
      });
    }

    // Attach validated data to request
    req.validatedData = value;
    next();
  };
}

/**
 * Validate multiple sources
 * @param {Object} schemas - Object with schemas for each source
 * @returns {Function} Express middleware
 */
function validateMultiple(schemas) {
  return (req, res, next) => {
    const errors = [];
    const validatedData = {};

    for (const [source, schema] of Object.entries(schemas)) {
      const data = req[source];
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        allowUnknown: false,
      });

      if (error) {
        errors.push(...error.details);
      } else {
        validatedData[source] = value;
      }
    }

    if (errors.length > 0) {
      const errorDetails = errors.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/[""]/g, ''),
        type: detail.type,
      }));

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Request data validation failed',
        details: errorDetails,
      });
    }

    req.validatedData = validatedData;
    next();
  };
}

/**
 * Create validation error response
 * @param {Array} errors - Joi validation errors
 * @returns {Object} Error response
 */
function createValidationError(errors) {
  return {
    error: 'Validation Error',
    message: 'Request data validation failed',
    details: errors.map((error) => ({
      field: error.path.join('.'),
      message: error.message.replace(/[""]/g, ''),
      type: error.type,
    })),
  };
}

module.exports = {
  validate,
  validateMultiple,
  createValidationError,
};
