/**
 * Request Logger Middleware
 * Logs incoming requests for debugging and monitoring
 */

const { v4: uuidv4 } = require('uuid');

function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || uuidv4();

  // Set request ID
  req.requestId = requestId;
  res.set('X-Request-ID', requestId);

  // Log request
  const logData = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    role: req.user?.role,
    clinicId: req.user?.clinicId,
  };

  logger.info('Incoming Request', logData);

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const responseLog = {
      requestId,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };

    if (res.statusCode >= 400) {
      logger.warn('Request Completed with Error', { ...logData, ...responseLog });
    } else {
      logger.info('Request Completed', { ...logData, ...responseLog });
    }
  });

  res.on('close', () => {
    const duration = Date.now() - start;
    logger.warn('Request Closed', {
      requestId,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  });

  next();
}

module.exports = requestLogger;
