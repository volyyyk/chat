const path = require('path');

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  // WebSocket configuration
  ws: {
    path: '/ws',
    maxPayload: 1024 * 1024 * 10, // 10MB
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      }
    }
  },
  
  // TLS configuration
  tls: {
    enabled: process.env.NODE_ENV === 'production' && process.env.SSL_ENABLED === 'true',
    key: process.env.SSL_KEY || path.join(__dirname, 'certs', 'server.key'),
    cert: process.env.SSL_CERT || path.join(__dirname, 'certs', 'server.cert'),
    minVersion: 'TLSv1.2',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-ECDSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-GCM-SHA384'
    ].join(':')
  },
  
  // Rate limiting
  limits: {
    maxConnections: 10000,
    maxMessagesPerMinute: 100,
    maxConnectionsPerIP: 100,
    messageQueueSize: 1000
  },
  
  // Security settings
  security: {
    requireAuthentication: true,
    validateDoctorId: true,
    validatePatientId: true,
    rateLimiting: true
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: path.join(__dirname, 'logs', 'server.log'),
    console: true,
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024 // 10MB
  },
  
  // CORS configuration (for development API)
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  // Session configuration
  session: {
    timeout: 24 * 60 * 60 * 1000, // 24 hours
    cleanupInterval: 60 * 60 * 1000 // 1 hour
  },
  
  // QR code configuration
  qr: {
    size: 200,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  },
  
  // Encryption settings
  crypto: {
    keyExchange: 'X25519',
    encryption: 'XChaCha20-Poly1305',
    hash: 'SHA-256',
    keyLength: 32
  }
};
