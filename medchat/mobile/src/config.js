/**
 * MedChat Mobile App Configuration
 */

// Server configuration
const SERVER_CONFIG = {
  // Production server
  production: {
    url: 'wss://medchat.app/ws',
    // url: 'wss://your-server.com/ws', // Change to your server URL
    timeout: 30000,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },
  
  // Development server
  development: {
    url: 'ws://localhost:3000/ws',
    timeout: 30000,
    reconnectInterval: 2000,
    maxReconnectAttempts: 5
  },
  
  // Test server
  test: {
    url: 'ws://localhost:3001/ws',
    timeout: 10000,
    reconnectInterval: 1000,
    maxReconnectAttempts: 3
  }
};

// Get server config based on environment
const getServerConfig = () => {
  const env = process.env.NODE_ENV || __DEV__ ? 'development' : 'production';
  return SERVER_CONFIG[env] || SERVER_CONFIG.production;
};

// App configuration
const APP_CONFIG = {
  name: 'MedChat',
  version: '1.0.0',
  description: 'Secure doctor-patient communication app',
  
  // App modes
  modes: {
    DOCTOR: 'doctor',
    PATIENT: 'patient'
  },
  
  // Colors
  colors: {
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#3b82f6',
    secondary: '#7c3aed',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    background: '#f9fafb',
    surface: '#ffffff',
    text: '#1f2937',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    doctor: '#2563eb',
    patient: '#10b981'
  },
  
  // Encryption settings
  crypto: {
    keyExchange: 'X25519',
    encryption: 'XChaCha20-Poly1305',
    hash: 'SHA-256',
    keyLength: 32,
    nonceLength: 24
  },
  
  // Storage settings
  storage: {
    database: 'medchat.db',
    encryptionKeyStorage: '@medchat_encryption_key',
    doctorProfile: '@medchat_doctor_profile',
    patientProfile: '@medchat_patient_profile',
    messagesPrefix: '@medchat_messages_',
    filesPrefix: '@medchat_files_'
  },
  
  // Message settings
  messages: {
    maxLength: 4096,
    maxAttachments: 5,
    maxAttachmentSize: 10 * 1024 * 1024, // 10MB
    batchSize: 50,
    loadMoreThreshold: 10
  },
  
  // Notification settings
  notifications: {
    enabled: true,
    sound: true,
    vibration: true,
    title: 'MedChat',
    newMessage: 'New message received',
    newPatient: 'New patient connected',
    connectionError: 'Connection error'
  },
  
  // QR code settings
  qr: {
    size: 200,
    margin: 20,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    backgroundColor: '#ffffff',
    logoSize: 40
  },
  
  // File settings
  files: {
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/json'
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    storageDirectory: 'MedChatFiles'
  },
  
  // Rate limiting
  rateLimiting: {
    maxMessagesPerMinute: 100,
    maxConnections: 10
  },
  
  // Logging
  logging: {
    enabled: __DEV__,
    level: 'debug'
  },
  
  // Legal
  legal: {
    privacyPolicyUrl: 'https://medchat.app/privacy',
    termsOfServiceUrl: 'https://medchat.app/terms',
    consentRequired: true,
    consentText: 'I agree to the processing of my personal data in accordance with the Privacy Policy'
  }
};

// Export configuration
module.exports = {
  ...APP_CONFIG,
  server: getServerConfig(),
  SERVER_CONFIG,
  getServerConfig
};
