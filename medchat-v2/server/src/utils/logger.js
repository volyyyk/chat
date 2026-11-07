/**
 * Logger utility (Winston)
 * Single logging entry point for the whole server.
 * Also exposes itself as global.logger for legacy code that
 * references the bare "logger" identifier.
 */

const winston = require('winston');

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const ctx = info.stack
        ? ' ' + info.stack
        : Object.keys(info)
            .filter((k) => !['timestamp', 'level', 'message'].includes(k))
            .map((k) => k + '=' + JSON.stringify(info[k]))
            .join(' ');
      return info.timestamp + ' [' + info.level + '] ' + info.message + (ctx ? ' ' + ctx : '');
    })
  ),
  transports: [new winston.transports.Console()],
});

// File transport only when explicitly enabled (keeps CI/docker clean)
if (process.env.LOG_TO_FILE === 'true') {
  logger.add(
    new winston.transports.File({ filename: process.env.LOG_FILE || 'logs/error.log', level: 'error' })
  );
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

// Make bare "logger" references work everywhere (see errorHandler/authService)
global.logger = logger;

module.exports = logger;
