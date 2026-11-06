/**
 * MedChat Mobile App - Helper Functions
 * Utility functions for various tasks
 */

import config from '../config/config';
import * as Crypto from 'expo-crypto';

/**
 * Generate unique ID
 * @returns {string} - Unique ID
 */
const generateUniqueId = () => {
  return Crypto.randomUUID();
};

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} - Random string
 */
const generateRandomString = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate QR code data for doctor
 * @param {Object} doctor - Doctor object
 * @param {Object} clinic - Clinic object
 * @returns {string} - QR code data (JSON string)
 */
const generateQRCodeData = (doctor, clinic) => {
  const data = {
    type: 'medchat_doctor',
    version: config.APP_VERSION,
    doctorId: doctor.id,
    clinicId: clinic.id,
    clinicName: clinic.name,
    specialtyName: doctor.specialty?.name || '',
    doctorName: `${doctor.lastName} ${doctor.firstName} ${doctor.middleName || ''}`.trim(),
    timestamp: new Date().toISOString(),
    signature: '', // Will be set after signing
  };
  
  // In production, sign the data with doctor's private key
  // For now, just return the JSON string
  return JSON.stringify(data);
};

/**
 * Parse QR code data
 * @param {string} qrData - QR code data
 * @returns {Object|null} - Parsed data or null
 */
const parseQRCodeData = (qrData) => {
  try {
    const data = JSON.parse(qrData);
    
    // Validate required fields
    if (!data.type || data.type !== 'medchat_doctor') return null;
    if (!data.doctorId || !data.clinicId) return null;
    
    return data;
  } catch (error) {
    return null;
  }
};

/**
 * Generate patient identifier for a doctor
 * @param {string} doctorId - Doctor ID
 * @param {string} patientLogin - Patient login
 * @returns {string} - Unique patient identifier
 */
const generatePatientIdentifier = (doctorId, patientLogin) => {
  return `${doctorId}_${patientLogin}`;
};

/**
 * Parse patient identifier
 * @param {string} identifier - Patient identifier
 * @returns {Object} - { doctorId, patientLogin }
 */
const parsePatientIdentifier = (identifier) => {
  const parts = identifier.split('_');
  if (parts.length !== 2) {
    return { doctorId: '', patientLogin: '' };
  }
  return { doctorId: parts[0], patientLogin: parts[1] };
};

/**
 * Generate chat ID
 * @param {string} doctorId - Doctor ID
 * @param {string} patientLogin - Patient login
 * @returns {string} - Chat ID
 */
const generateChatId = (doctorId, patientLogin) => {
  // Sort to ensure consistent chat ID regardless of order
  const sorted = [doctorId, patientLogin].sort();
  return `chat_${sorted.join('_')}`;
};

/**
 * Generate message ID
 * @returns {string} - Message ID
 */
const generateMessageId = () => {
  return `msg_${generateUniqueId()}`;
};

/**
 * Generate file ID
 * @returns {string} - File ID
 */
const generateFileId = () => {
  return `file_${generateUniqueId()}`;
};

/**
 * Generate session ID
 * @returns {string} - Session ID
 */
const generateSessionId = () => {
  return `session_${generateUniqueId()}`;
};

/**
 * Generate encryption key pair
 * @returns {Promise<Object>} - { publicKey, privateKey }
 */
const generateKeyPair = async () => {
  // This is a placeholder - actual implementation uses tweetnacl
  // For now, return mock keys
  return {
    publicKey: generateRandomString(64),
    privateKey: generateRandomString(64),
  };
};

/**
 * Hash password
 * @param {string} password - Password to hash
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async (password) => {
  // In production, use bcrypt or similar
  // For now, use SHA-256
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    password
  );
  return hash;
};

/**
 * Verify password
 * @param {string} password - Password to verify
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */
const verifyPassword = async (password, hash) => {
  const computedHash = await hashPassword(password);
  return computedHash === hash;
};

/**
 * Generate backup filename
 * @param {string} userId - User ID
 * @param {Date} date - Backup date
 * @returns {string} - Backup filename
 */
const generateBackupFilename = (userId, date = new Date()) => {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `medchat_backup_${userId}_${timestamp}.enc`;
};

/**
 * Parse backup filename
 * @param {string} filename - Backup filename
 * @returns {Object} - { userId, date }
 */
const parseBackupFilename = (filename) => {
  const match = filename.match(/medchat_backup_([^_]+)_([\dT-]+)/);
  if (!match) return { userId: '', date: null };
  
  return {
    userId: match[1],
    date: new Date(match[2].replace(/-/g, ':'));
  };
};

/**
 * Calculate days between dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} - Days between dates
 */
const calculateDaysBetween = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  
  const diff = Math.abs(d2 - d1);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

/**
 * Check if date is within free period
 * @param {Date|string} appointmentDate - Appointment date
 * @returns {boolean} - True if within free period
 */
const isWithinFreePeriod = (appointmentDate) => {
  const days = calculateDaysBetween(appointmentDate, new Date());
  return days <= config.FREE_MESSAGE_DAYS;
};

/**
 * Calculate message cost
 * @param {Date|string} appointmentDate - Appointment date
 * @returns {number} - Message cost in RUB
 */
const calculateMessageCost = (appointmentDate) => {
  return isWithinFreePeriod(appointmentDate) ? 0 : config.MESSAGE_COST_RUB;
};

/**
 * Calculate revenue split
 * @param {number} amount - Total amount
 * @returns {Object} - { doctorShare, clinicShare }
 */
const calculateRevenueSplit = (amount) => {
  const doctorShare = Math.round(amount * config.DOCTOR_SHARE_PERCENT / 100);
  const clinicShare = amount - doctorShare;
  return { doctorShare, clinicShare };
};

/**
 * Check if file is expired
 * @param {Date|string} uploadDate - File upload date
 * @returns {boolean} - True if file is expired
 */
const isFileExpired = (uploadDate) => {
  const days = calculateDaysBetween(uploadDate, new Date());
  return days > config.FILE_RETENTION_DAYS;
};

/**
 * Get file expiration date
 * @param {Date|string} uploadDate - File upload date
 * @returns {Date} - Expiration date
 */
const getFileExpirationDate = (uploadDate) => {
  const date = new Date(uploadDate);
  date.setDate(date.getDate() + config.FILE_RETENTION_DAYS);
  return date;
};

/**
 * Generate deep link URL
 * @param {string} type - Link type (e.g., 'chat', 'doctor', 'clinic')
 * @param {string} id - ID of the entity
 * @returns {string} - Deep link URL
 */
const generateDeepLink = (type, id) => {
  return `medchat://${type}/${id}`;
};

/**
 * Parse deep link URL
 * @param {string} url - Deep link URL
 * @returns {Object} - { type, id }
 */
const parseDeepLink = (url) => {
  const match = url.match(/medchat:\/\/([^\/]+)\/([^\/]+)/);
  if (!match) return { type: '', id: '' };
  return { type: match[1], id: match[2] };
};

/**
 * Check if running in development mode
 * @returns {boolean} - True if in development
 */
const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Check if running in production mode
 * @returns {boolean} - True if in production
 */
const isProduction = () => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit time in milliseconds
 * @returns {Function} - Throttled function
 */
const throttle = (func, limit) => {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after sleep
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 * @param {Function} func - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in milliseconds
 * @returns {Promise} - Promise that resolves when function succeeds or retries exhausted
 */
const retryWithBackoff = async (func, maxRetries = 3, initialDelay = 1000) => {
  let retries = 0;
  let delay = initialDelay;
  
  while (retries < maxRetries) {
    try {
      return await func();
    } catch (error) {
      retries++;
      if (retries >= maxRetries) throw error;
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
};

/**
 * Safe JSON parse
 * @param {string} json - JSON string
 * @returns {Object|null} - Parsed object or null
 */
const safeJsonParse = (json) => {
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
};

/**
 * Safe JSON stringify
 * @param {Object} obj - Object to stringify
 * @returns {string} - JSON string or empty string
 */
const safeJsonStringify = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return '';
  }
};

/**
 * Get current timestamp
 * @returns {string} - ISO timestamp
 */
const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Get start of day
 * @param {Date|string} date - Date
 * @returns {Date} - Start of day
 */
const getStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get end of day
 * @param {Date|string} date - Date
 * @returns {Date} - End of day
 */
const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} - File extension
 */
const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

// Export all helpers
module.exports = {
  generateUniqueId,
  generateRandomString,
  generateQRCodeData,
  parseQRCodeData,
  generatePatientIdentifier,
  parsePatientIdentifier,
  generateChatId,
  generateMessageId,
  generateFileId,
  generateSessionId,
  generateKeyPair,
  hashPassword,
  verifyPassword,
  generateBackupFilename,
  parseBackupFilename,
  calculateDaysBetween,
  isWithinFreePeriod,
  calculateMessageCost,
  calculateRevenueSplit,
  isFileExpired,
  getFileExpirationDate,
  generateDeepLink,
  parseDeepLink,
  isDevelopment,
  isProduction,
  debounce,
  throttle,
  sleep,
  retryWithBackoff,
  safeJsonParse,
  safeJsonStringify,
  getCurrentTimestamp,
  getStartOfDay,
  getEndOfDay,
  getFileExtension,
};
