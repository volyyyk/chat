/**
 * Backup Service
 * Handles cloud backup and restore with password protection
 * Complies with Russian Federation Law No. 152-FZ
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const archiver = require('archiver');
const extract = require('extract-zip');
const models = require('../models');
const { AppError } = require('../middleware/errorHandler');

// Safe logger: never crash this service if winston is not loadable
let logger;
try {
  logger = require('../utils/logger');
} catch (e) {
  logger = global.logger || {
    error: (...args) => console.error('[error]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    info: (...args) => console.info('[info]', ...args),
  };
}

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Encryption settings
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

class BackupService {
  /**
   * Generate encryption key from password
   * @param {string} password - Password
   * @param {Buffer} salt - Salt
   * @returns {Promise<{key: Buffer, iv: Buffer}>} Encryption key and IV
   */
  static async generateKey(password, salt) {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        ITERATIONS,
        KEY_LENGTH,
        'sha256',
        (err, key) => {
          if (err) reject(err);
          else resolve({ key, iv: crypto.randomBytes(IV_LENGTH) });
        }
      );
    });
  }

  /**
   * Encrypt data
   * @param {Buffer} data - Data to encrypt
   * @param {Buffer} key - Encryption key
   * @param {Buffer} iv - Initialization vector
   * @returns {Buffer} Encrypted data
   */
  static encrypt(data, key, iv) {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
    return encrypted;
  }

  /**
   * Decrypt data
   * @param {Buffer} encryptedData - Encrypted data
   * @param {Buffer} key - Encryption key
   * @returns {Buffer} Decrypted data
   */
  static decrypt(encryptedData, key) {
    const iv = encryptedData.slice(0, IV_LENGTH);
    const data = encryptedData.slice(IV_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Verify backup password without restoring
   * @param {Object} backup - Backup DB record
   * @param {string} password - Password to verify
   * @returns {Promise<{valid: boolean}>}
   */
  static async verifyBackupPassword(backup, password) {
    if (!backup || !password) {
      return { valid: false };
    }

    // Read backup file
    const backupPath = path.join(__dirname, '../../backups', backup.filename);
    let encryptedData;
    try {
      encryptedData = await readFile(backupPath);
    } catch (error) {
      logger.warn(`Backup file not found for verification: ${backup.filename}`);
      return { valid: false };
    }

    // Get salt from metadata
    if (!backup.metadata || !backup.metadata.salt) {
      return { valid: false };
    }

    const salt = Buffer.from(backup.metadata.salt, 'hex');

    let key;
    try {
      const generated = await this.generateKey(password, salt);
      key = generated.key;
    } catch (error) {
      return { valid: false };
    }

    try {
      this.decrypt(encryptedData, key);
      return { valid: true };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Create backup
   * @param {string} userId - User ID
   * @param {string} name - Backup name
   * @param {string} description - Backup description
   * @param {string} password - Backup password
   * @param {Array} dataTypes - Data types to backup
   * @param {string} format - Backup format (json or zip)
   * @returns {Promise<Object>} Backup result
   */
  static async createBackup(userId, name, description, password, dataTypes, format = 'json') {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    // Normalize data types (fall back to 'all' when not provided)
    const types = Array.isArray(dataTypes) && dataTypes.length > 0
      ? dataTypes
      : ['all'];

    // Generate salt and key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const { key, iv } = await this.generateKey(password, salt);

    // Collect data based on dataTypes
    const backupData = {};

    // Always include user info
    backupData.user = this.sanitizeUser(user);

    // Include selected data types
    for (const dataType of types) {
      try {
        backupData[dataType] = await this.exportData(dataType, userId);
      } catch (error) {
        logger.error(`Error exporting ${dataType}:`, error);
        // Continue with other data types
      }
    }

    // Add metadata
    backupData.metadata = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      userId,
      name,
      description,
      dataTypes: types,
      format,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
    };

    // Serialize data
    const jsonData = JSON.stringify(backupData, null, 2);
    const dataBuffer = Buffer.from(jsonData, 'utf8');

    // Encrypt data
    const encryptedData = this.encrypt(dataBuffer, key, iv);

    // Create backup record
    const backup = await models.Backup.create({
      userId,
      name,
      description,
      filename: `${userId}_${Date.now()}.${format === 'zip' ? 'zip' : 'enc'}`,
      size: encryptedData.length,
      dataTypes: types,
      format,
      encrypted: true,
      status: 'completed',
      metadata: {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
      },
    });

    // Save encrypted data
    const backupDir = path.join(__dirname, '../../backups');
    await mkdir(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, backup.filename);
    await writeFile(backupPath, encryptedData);

    return {
      success: true,
      backup,
      path: backupPath,
    };
  }

  /**
   * Restore backup
   * @param {string} backupId - Backup ID
   * @param {string} password - Backup password
   * @returns {Promise<Object>} Restore result
   */
  static async restoreBackup(backupId, password) {
    const backup = await models.Backup.findByPk(backupId);
    if (!backup) {
      throw new AppError('Backup not found', 404, 'NOT_FOUND');
    }

    // Read backup file
    const backupPath = path.join(__dirname, '../../backups', backup.filename);
    let encryptedData;
    try {
      encryptedData = await readFile(backupPath);
    } catch (error) {
      throw new AppError('Backup file not found', 404, 'NOT_FOUND');
    }

    // Get salt and iv from metadata
    const salt = Buffer.from(backup.metadata.salt, 'hex');
    const iv = Buffer.from(backup.metadata.iv, 'hex');

    // Generate key
    const { key } = await this.generateKey(password, salt);

    // Decrypt data
    let decryptedData;
    try {
      decryptedData = this.decrypt(encryptedData, key);
    } catch (error) {
      throw new AppError('Invalid password', 401, 'AUTHENTICATION_ERROR');
    }

    // Parse data
    const backupData = JSON.parse(decryptedData.toString('utf8'));

    // Verify user
    const user = await models.User.findByPk(backup.user.id);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    // Restore data
    const restoreResults = {};
    const types = Array.isArray(backupData.dataTypes) ? backupData.dataTypes : [];
    for (const dataType of types) {
      if (backupData[dataType]) {
        try {
          restoreResults[dataType] = await this.importData(dataType, backupData[dataType], user.id);
        } catch (error) {
          logger.error(`Error importing ${dataType}:`, error);
          restoreResults[dataType] = { success: false, error: error.message };
        }
      }
    }

    // Update backup status
    await backup.update({
      restoredAt: new Date(),
      restoreCount: (backup.restoreCount || 0) + 1,
    });

    return {
      success: true,
      backup,
      restoreResults,
    };
  }

  /**
   * List backups
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} List of backups
   */
  static async listBackups(userId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const backups = await models.Backup.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit,
      limit,
    });

    const count = await models.Backup.count({ where: { userId } });

    return {
      data: backups,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Delete backup
   * @param {string} backupId - Backup ID
   * @param {string} password - User password for confirmation
   * @returns {Promise<Object>} Delete result
   */
  static async deleteBackup(backupId, password) {
    const backup = await models.Backup.findByPk(backupId);
    if (!backup) {
      throw new AppError('Backup not found', 404, 'NOT_FOUND');
    }

    // Verify user password
    const user = await models.User.findByPk(backup.userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    const AuthService = require('./authService');
    const isValidPassword = await AuthService.comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid password', 401, 'AUTHENTICATION_ERROR');
    }

    // Delete backup file
    const backupPath = path.join(__dirname, '../../backups', backup.filename);
    try {
      await unlink(backupPath);
    } catch (error) {
      logger.warn(`Error deleting backup file: ${error.message}`);
    }

    // Delete backup record
    await backup.destroy();

    return {
      success: true,
      message: 'Backup deleted successfully',
    };
  }

  /**
   * Export data for backup
   * @param {string} dataType - Data type to export
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Exported data
   */
  static async exportData(dataType, userId) {
    if (dataType === 'all') {
      const allTypes = ['users', 'chats', 'messages', 'files', 'transactions', 'appointments'];
      const result = {};
      for (const t of allTypes) {
        try {
          result[t] = await this.exportData(t, userId);
        } catch (error) {
          logger.warn(`Skipping export of ${t}: ${error.message}`);
        }
      }
      return result;
    }

    if (dataType === 'settings') {
      const user = await models.User.findByPk(userId);
      return user ? { notificationSettings: user.notificationSettings, backupSettings: user.backupSettings } : {};
    }

    if (dataType === 'contacts' || dataType === 'chats') {
      // Chats where the user participates (via ChatParticipant or as doctor/patient)
      // Schema is globally underscored: real columns are chat_id / user_id.
      // Alias "chatId" keeps the mapping below working.
      const { QueryTypes } = require('sequelize');
      const chatIds = await models.sequelize.query(
        'SELECT DISTINCT chat_id AS "chatId" FROM chat_participants WHERE user_id = $1',
        { bind: [userId], type: QueryTypes.SELECT }
      );
      const ids = chatIds.map((c) => c.chatId);
      if (ids.length === 0) return [];
      return models.Chat.findAll({ where: { id: ids } });
    }

    const model = models[dataType.charAt(0).toUpperCase() + dataType.slice(1)];
    if (!model) {
      throw new Error(`Model ${dataType} not found`);
    }

    const data = await model.findAll({
      where: { userId },
      include: this.getIncludeOptions(dataType),
    });

    return data.map((item) => this.sanitizeData(item, dataType));
  }

  /**
   * Import data from backup
   * @param {string} dataType - Data type to import
   * @param {Array} data - Data to import
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Import result
   */
  static async importData(dataType, data, userId) {
    if (dataType === 'all' && data && typeof data === 'object' && !Array.isArray(data)) {
      const results = {};
      for (const [t, d] of Object.entries(data)) {
        if (t === 'users') continue; // never re-import users blindly
        try {
          results[t] = await this.importData(t, d, userId);
        } catch (error) {
          results[t] = { success: false, error: error.message };
        }
      }
      return results;
    }

    const model = models[dataType.charAt(0).toUpperCase() + dataType.slice(1)];
    if (!model) {
      throw new Error(`Model ${dataType} not found`);
    }

    const results = {
      created: 0,
      updated: 0,
      errors: 0,
    };

    for (const item of data) {
      try {
        // Check if item exists
        const existing = await model.findByPk(item.id);
        if (existing) {
          await existing.update(item);
          results.updated++;
        } else {
          // Set userId for the item
          item.userId = userId;
          await model.create(item);
          results.created++;
        }
      } catch (error) {
        results.errors++;
        logger.error(`Error importing ${dataType} item ${item.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Get include options for model
   * @param {string} dataType - Data type
   * @returns {Array} Include options
   */
  static getIncludeOptions(dataType) {
    const includes = {
      users: [],
      clinics: [{ model: models.User, as: 'admin' }],
      doctors: [
        { model: models.User, as: 'user' },
        { model: models.Clinic, as: 'clinic' },
      ],
      patients: [
        { model: models.User, as: 'user' },
        { model: models.Doctor, as: 'doctor' },
        { model: models.Clinic, as: 'clinic' },
      ],
      chats: [
        { model: models.Doctor, as: 'doctor' },
        { model: models.Patient, as: 'patient' },
        { model: models.Clinic, as: 'clinic' },
      ],
      messages: [
        { model: models.Chat, as: 'chat' },
        { model: models.User, as: 'sender' },
        { model: models.User, as: 'receiver' },
      ],
      files: [
        { model: models.Chat, as: 'chat' },
        { model: models.Message, as: 'message' },
        { model: models.User, as: 'uploader' },
      ],
      transactions: [
        { model: models.User, as: 'user' },
        { model: models.Doctor, as: 'doctor' },
        { model: models.Patient, as: 'patient' },
        { model: models.Clinic, as: 'clinic' },
      ],
      specialties: [],
      appointments: [
        { model: models.Doctor, as: 'doctor' },
        { model: models.Patient, as: 'patient' },
        { model: models.Clinic, as: 'clinic' },
      ],
      eprescriptions: [
        { model: models.Doctor, as: 'doctor' },
        { model: models.Patient, as: 'patient' },
        { model: models.Chat, as: 'chat' },
      ],
      reminders: [
        { model: models.User, as: 'user' },
        { model: models.Doctor, as: 'doctor' },
        { model: models.Patient, as: 'patient' },
      ],
      reviews: [
        { model: models.User, as: 'author' },
        { model: models.Doctor, as: 'doctor' },
        { model: models.Clinic, as: 'clinic' },
      ],
    };

    return includes[dataType] || [];
  }

  /**
   * Sanitize user data (remove sensitive fields)
   * @param {Object} user - User object
   * @returns {Object} Sanitized user
   */
  static sanitizeUser(user) {
    if (!user) return null;

    const sanitized = { ...user.toJSON() };
    delete sanitized.passwordHash;
    delete sanitized.privateKey;
    delete sanitized.twoFactorSecret;
    delete sanitized.ipAddress;
    delete sanitized.userAgent;

    return sanitized;
  }

  /**
   * Sanitize data (remove sensitive fields)
   * @param {Object} data - Data object
   * @param {string} dataType - Data type
   * @returns {Object} Sanitized data
   */
  static sanitizeData(data, dataType) {
    if (!data) return null;

    const sanitized = { ...data.toJSON() };

    // Remove sensitive fields based on data type
    switch (dataType) {
      case 'users':
        delete sanitized.passwordHash;
        delete sanitized.privateKey;
        delete sanitized.twoFactorSecret;
        break;
      case 'messages':
        // Keep message content (it's already encrypted)
        break;
      case 'files':
        delete sanitized.encryptionKey;
        break;
      default:
        // Remove any sensitive fields
        break;
    }

    return sanitized;
  }

  /**
   * Create encrypted backup file
   * @param {string} userId - User ID
   * @param {string} password - Password
   * @param {Array} dataTypes - Data types
   * @returns {Promise<Object>} Backup file
   */
  static async createEncryptedBackupFile(userId, password, dataTypes) {
    // Collect data
    const backupData = {};
    for (const dataType of dataTypes) {
      backupData[dataType] = await this.exportData(dataType, userId);
    }

    // Generate salt and key
    const salt = crypto.randomBytes(SALT_LENGTH);
    const { key, iv } = await this.generateKey(password, salt);

    // Serialize and encrypt
    const jsonData = JSON.stringify(backupData, null, 2);
    const dataBuffer = Buffer.from(jsonData, 'utf8');
    const encryptedData = this.encrypt(dataBuffer, key, iv);

    // Create backup file
    const filename = `backup_${userId}_${Date.now()}.enc`;
    const backupDir = path.join(__dirname, '../../backups');
    await mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, filename);
    await writeFile(backupPath, encryptedData);

    return {
      filename,
      path: backupPath,
      size: encryptedData.length,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Create ZIP backup (unencrypted for testing)
   * @param {string} userId - User ID
   * @param {Array} dataTypes - Data types
   * @returns {Promise<Object>} ZIP file
   */
  static async createZipBackup(userId, dataTypes) {
    const backupDir = path.join(__dirname, '../../backups');
    await mkdir(backupDir, { recursive: true });

    const filename = `backup_${userId}_${Date.now()}.zip`;
    const backupPath = path.join(backupDir, filename);

    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip');

    output.on('close', () => {
      logger.info(`ZIP backup created: ${backupPath}`);
    });

    archive.on('error', (err) => {
      logger.error('ZIP backup error:', err);
    });

    archive.pipe(output);

    // Add each data type as a separate JSON file
    for (const dataType of dataTypes) {
      try {
        const data = await this.exportData(dataType, userId);
        archive.append(JSON.stringify(data, null, 2), { name: `${dataType}.json` });
      } catch (error) {
        logger.warn(`Skipping ${dataType} in ZIP backup: ${error.message}`);
      }
    }

    await archive.finalize();

    return {
      filename,
      path: backupPath,
      size: fs.statSync(backupPath).size,
    };
  }
}

module.exports = BackupService;
