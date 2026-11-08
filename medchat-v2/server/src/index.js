/**
 * MedChat Server v2.0
 * Main entry point
 */

require('dotenv').config();
require('./config/database'); // Initialize database connection
require('./config/redis'); // Initialize Redis connection

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Logger (also sets global.logger)
const logger = require('./utils/logger');

// SECURITY: fail fast when the JWT secret is missing or trivially short.
// Booting without it used to produce cryptic "invalid signature" 401s on the
// first request; now the operator gets an actionable message at startup.
// (.env.example ships a placeholder; CI and the launcher always set a secret.)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 8) {
  logger.error(
    'FATAL: JWT_SECRET is missing or shorter than 8 characters. ' +
    'Set a strong secret in server/.env (see .env.example) and restart.'
  );
  process.exit(1);
}

// Ensure log directory exists before any file transports are added
if (process.env.LOG_TO_FILE === 'true') {
  fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
}

// Initialize models
const models = require('./models');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clinicRoutes = require('./routes/clinics');
const doctorRoutes = require('./routes/doctors');
const patientRoutes = require('./routes/patients');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');
const paymentRoutes = require('./routes/payments');
const transactionRoutes = require('./routes/transactions');
const backupRoutes = require('./routes/backups');
const specialtyRoutes = require('./routes/specialties');
const reviewRoutes = require('./routes/reviews');
const appointmentRoutes = require('./routes/appointments');
const eprescriptionRoutes = require('./routes/eprescriptions');
const reminderRoutes = require('./routes/reminders');
const webhookRoutes = require('./routes/webhooks');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { rateLimiter, authRateLimiter } = require('./middleware/rateLimiter');
const authMiddleware = require('./middleware/auth');
const requestLogger = require('./middleware/requestLogger');

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// SECURITY: behave correctly behind a reverse proxy (nginx, Traefik, cloud LB).
// Without this, req.ip resolves to the proxy address, so per-IP rate limits
// lump every client into one bucket (one abuser blocks the whole user base,
// and the limiter stops protecting anything). In production set
// TRUST_PROXY=1 (or a proxy count / subnet list) together with your proxy.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
}

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket.IO middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
  if (token) {
    // Verify JWT token
    const authService = require('./services/authService');
    try {
      const decoded = authService.verifyToken(token);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  } else {
    // Allow connection without token for public rooms
    next();
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  logger.info('User connected: ' + socket.id);

  // Join user's personal room
  if (socket.user) {
    socket.join('user:' + socket.user.id);
    socket.join('role:' + socket.user.role);

    if (socket.user.clinicId) {
      socket.join('clinic:' + socket.user.clinicId);
    }

    if (socket.user.doctorId) {
      socket.join('doctor:' + socket.user.doctorId);
    }

    if (socket.user.patientId) {
      socket.join('patient:' + socket.user.patientId);
    }
  }

  // Membership check helper: can this user access this chat?
  // Resolves chat by UUID (id) or by human-readable chatId string.
  const { canAccessChat } = require('./utils/chatAccess');
  const { Op } = require('sequelize');
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resolveChatAccess = async (user, chatRef) => {
    if (!user || !chatRef) return null;
    // Avoid querying a UUID column with a non-UUID string (Postgres would throw)
    const where = UUID_RE.test(chatRef)
      ? { [Op.or]: [{ id: chatRef }, { chatId: chatRef }] }
      : { chatId: chatRef };
    const chat = await models.Chat.findOne({ where });
    if (!chat) return null;
    const allowed = await canAccessChat(user, chat);
    return allowed ? chat : null;
  };

  // Handle chat joining (membership is verified against the database)
  socket.on('joinChat', async (chatId, cb) => {
    if (!socket.user || !chatId) {
      if (typeof cb === 'function') cb({ error: 'unauthorized' });
      return;
    }
    try {
      const chat = await resolveChatAccess(socket.user, chatId);
      if (!chat) {
        logger.warn('joinChat denied: user ' + socket.user.id + ' chat ' + chatId);
        if (typeof cb === 'function') cb({ error: 'forbidden' });
        return;
      }
      // Join every room key the chat may be addressed by, so clients
      // receive events regardless of whether they use UUID or chatId string.
      socket.join('chat:' + chat.chatId);
      socket.join('chat:' + chat.id);
      socket.join('chat:uuid:' + chat.id);
      if (typeof cb === 'function') cb({ ok: true });
      logger.debug('User ' + socket.user.id + ' joined chat ' + chat.chatId);
    } catch (err) {
      if (typeof cb === 'function') cb({ error: 'server_error' });
    }
  });

  // Handle chat leaving
  socket.on('leaveChat', (chatId) => {
    socket.leave('chat:' + chatId);
    socket.leave('chat:uuid:' + chatId);
  });

  // Handle typing indicator (only relay if the socket actually joined the room)
  socket.on('typing', (data) => {
    const { chatId, isTyping } = data || {};
    if (socket.user && chatId && (socket.rooms.has('chat:' + chatId) || socket.rooms.has('chat:uuid:' + chatId))) {
      socket.to('chat:' + chatId).emit('userTyping', {
        userId: socket.user.id,
        isTyping,
        chatId,
      });
    }
  });

  // Handle message read (only relay if the socket actually joined the room)
  socket.on('messageRead', (data) => {
    const { chatId, messageId } = data || {};
    if (socket.user && chatId && (socket.rooms.has('chat:' + chatId) || socket.rooms.has('chat:uuid:' + chatId))) {
      socket.to('chat:' + chatId).emit('messageRead', {
        userId: socket.user.id,
        messageId,
        chatId,
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.debug('User disconnected: ' + socket.id);
  });
});

// Make io accessible to routes and services
app.set('io', io);

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// SECURITY: in production an unrestricted CORS policy is an open door for
// credential abuse from arbitrary origins. Do not block startup (operators
// may have a valid reason), but make the misconfiguration loud.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  logger.warn(
    'CORS_ORIGIN is not set and NODE_ENV=production: ALL origins are allowed. ' +
    'Set CORS_ORIGIN=https://app.example.com,https://admin.example.com to restrict access.'
  );
}

// Rate limiting (global + stricter limiter for auth endpoints)
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Morgan logging (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));

// API Documentation (Swagger) - fail-safe if the spec file is missing
try {
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const swaggerPath = path.join(__dirname, '../docs/api.yaml');
  if (fs.existsSync(swaggerPath)) {
    const swaggerDocument = YAML.load(swaggerPath);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  } else {
    logger.warn('Swagger spec not found at ' + swaggerPath + ', /api-docs disabled');
  }
} catch (err) {
  logger.warn('Swagger UI disabled: ' + err.message);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
// NOTE: authMiddleware.authenticate is a FACTORY: it must be CALLed - otherwise
// Express mounts the factory itself as middleware. The factory returns the
// inner middleware but never calls next(), so every request would hang forever
// (this exact bug made the smoke test fail with "fetch failed" at GET /api/chats).
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', authMiddleware.authenticate(), userRoutes);
app.use('/api/clinics', authMiddleware.authenticate(), clinicRoutes);
app.use('/api/doctors', authMiddleware.authenticate(), doctorRoutes);
app.use('/api/patients', authMiddleware.authenticate(), patientRoutes);
app.use('/api/chats', authMiddleware.authenticate(), chatRoutes);
app.use('/api/messages', authMiddleware.authenticate(), messageRoutes);
app.use('/api/files', authMiddleware.authenticate(), fileRoutes);
app.use('/api/payments', authMiddleware.authenticate(), paymentRoutes);
app.use('/api/transactions', authMiddleware.authenticate(), transactionRoutes);
app.use('/api/backups', authMiddleware.authenticate(), backupRoutes);
app.use('/api/specialties', specialtyRoutes);
app.use('/api/reviews', authMiddleware.authenticate(), reviewRoutes);
app.use('/api/appointments', authMiddleware.authenticate(), appointmentRoutes);
app.use('/api/eprescriptions', authMiddleware.authenticate(), eprescriptionRoutes);
app.use('/api/reminders', authMiddleware.authenticate(), reminderRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use(errorHandler.notFound);

// Global error handler (logs every error, masks internals in production)
app.use(errorHandler.errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  logger.info('MedChat Server v2.0 running on port ' + PORT);
  logger.info('API Documentation: http://localhost:' + PORT + '/api-docs');
  logger.info('Environment: ' + (process.env.NODE_ENV || 'development'));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', { message: err && err.message, stack: err && err.stack });
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { message: err.message, stack: err.stack });
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

module.exports = { app, httpServer, io };
