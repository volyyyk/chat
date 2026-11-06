const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const config = require('../config');
const MessageRouter = require('./messageRouter');
const { setupLogging } = require('./utils/logger');
const { rateLimiter } = require('./middleware/rateLimiter');

// Setup logging
const logger = setupLogging(config.logging);

// Create Express app for potential REST API
const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting middleware
app.use(rateLimiter(config.limits));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create HTTP/HTTPS server based on configuration
let server;

if (config.tls.enabled && fs.existsSync(config.tls.key) && fs.existsSync(config.tls.cert)) {
  logger.info(`Starting HTTPS server on port ${config.port}`);
  
  const tlsOptions = {
    key: fs.readFileSync(config.tls.key),
    cert: fs.readFileSync(config.tls.cert),
    minVersion: config.tls.minVersion,
    ciphers: config.tls.ciphers
  };
  
  server = https.createServer(tlsOptions, app);
} else {
  logger.info(`Starting HTTP server on port ${config.port}`);
  if (config.tls.enabled) {
    logger.warn('TLS is enabled but certificate files are missing. Falling back to HTTP.');
  }
  server = http.createServer(app);
}

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  path: config.ws.path,
  maxPayload: config.ws.maxPayload,
  clientTracking: config.ws.clientTracking,
  perMessageDeflate: config.ws.perMessageDeflate
});

// Initialize message router
const messageRouter = new MessageRouter(wss, config, logger);

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || req.socket.remoteAddr;
  const connectionId = uuidv4();
  
  logger.info(`New WebSocket connection from ${ip}`, { connectionId });
  
  // Track connection
  ws.connectionId = connectionId;
  ws.ip = ip;
  ws.authenticated = false;
  ws.doctorId = null;
  ws.patientId = null;
  ws.lastMessageTime = Date.now();
  
  // Message handler
  ws.on('message', (message) => {
    try {
      messageRouter.handleMessage(ws, message, req);
    } catch (error) {
      logger.error('Error handling message', { error: error.message, connectionId });
      ws.send(JSON.stringify({ type: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' }));
    }
  });
  
  // Close handler
  ws.on('close', (code, reason) => {
    logger.info(`Connection closed from ${ip}`, { connectionId, code, reason: reason.toString() });
    messageRouter.handleDisconnect(ws);
  });
  
  // Error handler
  ws.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message, connectionId, ip });
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    server: 'MedChat',
    version: '1.0.0',
    connectionId,
    timestamp: Date.now()
  }));
});

// Error handler for WebSocket server
wss.on('error', (error) => {
  logger.error('WebSocket server error', { error: error.message });
});

// Start server
server.listen(config.port, config.host, () => {
  const protocol = config.tls.enabled ? 'wss' : 'ws';
  const address = config.host === '0.0.0.0' ? 'localhost' : config.host;
  logger.info(`MedChat server started on ${protocol}://${address}:${config.port}${config.ws.path}`);
  logger.info(`Health check available at http${config.tls.enabled ? 's' : ''}://${address}:${config.port}/health`);
});

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  
  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  });
  
  // Close server
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.emit('SIGTERM');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: reason ? reason.message : 'Unknown', promise });
});

module.exports = { server, wss, app, messageRouter };
