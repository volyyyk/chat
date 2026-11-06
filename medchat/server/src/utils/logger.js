const winston = require('winston');
const path = require('path');
const fs = require('fs');

function setupLogging(config) {
  // Ensure logs directory exists
  const logDir = path.dirname(config.file);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Create transports
  const transports = [];
  
  // Console transport
  if (config.console) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 
              ? ` ${JSON.stringify(meta)}` 
              : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        )
      })
    );
  }
  
  // File transport
  transports.push(
    new winston.transports.File({
      filename: config.file,
      maxsize: config.maxSize,
      maxFiles: config.maxFiles,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      )
    })
  );
  
  // Create logger
  const logger = winston.createLogger({
    level: config.level,
    levels: winston.config.syslog.levels,
    transports,
    exitOnError: false
  });
  
  // Handle uncaught exceptions
  logger.exceptions.handle(transports);
  
  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
      promise: promise,
      reason: reason
    });
  });
  
  return logger;
}

// Custom logger for different contexts
function createContextLogger(logger, context) {
  return {
    info: (message, meta = {}) => logger.info(message, { context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { context, ...meta }),
    verbose: (message, meta = {}) => logger.verbose(message, { context, ...meta })
  };
}

module.exports = {
  setupLogging,
  createContextLogger
};
