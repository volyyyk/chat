/**
 * MedChat Mobile App Configuration
 * API endpoints, WebSocket URLs, and app settings
 */

// Development configuration (local server)
const DEV_CONFIG = {
  API_BASE_URL: 'http://localhost:3000/api/v1',
  WS_BASE_URL: 'ws://localhost:3000',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: false,
};

// Production configuration (replace with your production server)
const PROD_CONFIG = {
  API_BASE_URL: 'https://api.medchat.ru/api/v1',
  WS_BASE_URL: 'wss://api.medchat.ru',
  MINIO_ENDPOINT: 'storage.medchat.ru',
  MINIO_PORT: 443,
  MINIO_USE_SSL: true,
};

// Staging configuration
const STAGING_CONFIG = {
  API_BASE_URL: 'https://staging-api.medchat.ru/api/v1',
  WS_BASE_URL: 'wss://staging-api.medchat.ru',
  MINIO_ENDPOINT: 'staging-storage.medchat.ru',
  MINIO_PORT: 443,
  MINIO_USE_SSL: true,
};

// Get configuration based on environment
const getConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env.toLowerCase()) {
    case 'production':
      return PROD_CONFIG;
    case 'staging':
      return STAGING_CONFIG;
    default:
      return DEV_CONFIG;
  }
};

// App configuration
const config = {
  ...getConfig(),
  
  // App settings
  APP_NAME: 'MedChat',
  APP_VERSION: '2.0.0',
  
  // Encryption settings
  ENCRYPTION_ALGORITHM: 'XChaCha20-Poly1305',
  KEY_EXCHANGE: 'X25519',
  
  // Storage settings
  DATABASE_NAME: 'medchat.db',
  
  // File settings
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  FILE_RETENTION_DAYS: 3, // Files auto-deleted after 3 days
  
  // Message settings
  MAX_MESSAGE_LENGTH: 5000,
  MESSAGE_BATCH_SIZE: 50,
  
  // Session settings
  JWT_EXPIRY: '1h',
  REFRESH_TOKEN_EXPIRY: '7d',
  
  // Notification settings
  NOTIFICATION_TITLE: 'MedChat',
  
  // Payment settings (test mode)
  TEST_BALANCE_ENABLED: true,
  MESSAGE_COST_RUB: 50, // 50 RUB per message after free period
  FREE_MESSAGE_DAYS: 30, // Free messages for 30 days after appointment
  DOCTOR_SHARE_PERCENT: 70, // 70% to doctor
  CLINIC_SHARE_PERCENT: 30, // 30% to clinic
  
  // Backup settings
  BACKUP_ENCRYPTION: 'AES-256-CBC',
  BACKUP_PBKDF2_ITERATIONS: 100000,
  BACKUP_SALT_LENGTH: 16,
  BACKUP_IV_LENGTH: 16,
  
  // Legal compliance
  TERMS_VERSION: '1.0',
  PRIVACY_POLICY_VERSION: '1.0',
  OFFER_VERSION: '1.0',
  
  // Rate limiting
  API_RATE_LIMIT: 100, // requests per minute
  WS_RECONNECT_DELAY: 5000, // 5 seconds
  WS_RECONNECT_MAX_ATTEMPTS: 10,
  
  // Timeouts
  API_TIMEOUT: 30000, // 30 seconds
  WS_PING_TIMEOUT: 30000, // 30 seconds
  WS_PONG_TIMEOUT: 10000, // 10 seconds
  
  // Logging
  LOG_LEVEL: 'info', // 'error', 'warn', 'info', 'debug'
  
  // Features
  FEATURE_APPOINTMENTS: true,
  FEATURE_EPRESCRIPTIONS: true,
  FEATURE_REMINDERS: true,
  FEATURE_REVIEWS: true,
  FEATURE_FILE_UPLOAD: true,
  FEATURE_CLOUD_BACKUP: true,
  FEATURE_PUSH_NOTIFICATIONS: true,
  FEATURE_MICROPAYMENTS: true,
  
  // Doctor convenience settings
  DEFAULT_CONVENIENT_TIME: '09:00-18:00',
  
  // Patient settings
  PATIENT_IDENTIFICATION: 'unique_login_per_doctor',
  
  // Clinic settings
  CLINIC_CODE_LENGTH: 8,
  DOCTOR_CODE_LENGTH: 12,
  
  // QR code settings
  QR_CODE_SIZE: 256,
  QR_CODE_COLOR: '#000000',
  QR_CODE_BACKGROUND: '#ffffff',
  
  // Animation settings
  ANIMATION_DURATION: 300,
  
  // Pagination
  PAGINATION_LIMIT: 20,
  
  // Search
  SEARCH_DEBOUNCE_MS: 500,
};

// Export configuration
module.exports = config;
