/**
 * Backup Controller
 * Handles cloud backup creation, restoration, and management
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const BackupService = require('../services/backupService');
const CryptoService = require('../services/cryptoService');
const { minioClient, bucketName } = require('../config/minio');

class BackupController {
  /**
   * Create cloud backup
   */
  static async create(req, res, next) {
    try {
      const {
        name,
        description,
        password,
        dataTypes = ['chats', 'files', 'contacts', 'settings'],
        format = 'json',
      } = req.body;

      const userId = req.user.id;

      if (!password) {
        throw new AppError('Password is required for backup encryption', 400, 'VALIDATION_ERROR');
      }

      // Validate data types
      const validDataTypes = ['chats', 'files', 'contacts', 'settings', 'all'];
      const invalidTypes = dataTypes.filter(type => !validDataTypes.includes(type));
      if (invalidTypes.length > 0) {
        throw new AppError(`Invalid data types: ${invalidTypes.join(', ')}`, 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.createBackup(
        userId,
        name,
        description,
        password,
        dataTypes,
        format
      );

      res.status(201).json({
        success: true,
        data: result.backup,
        message: 'Backup created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List backups
   */
  static async list(req, res, next) {
    try {
      const {
        type,
        status,
        page = 1,
        limit = 20,
      } = req.query;

      const userId = req.user.id;

      // Admin can see all backups
      const where = req.user.roles?.includes('admin') ? {} : { userId };

      if (type) where.type = type;
      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Backup.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username', 'email'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get backup by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const backup = await models.Backup.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username', 'email'] },
        ],
      });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (backup.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other user backup', 403, 'FORBIDDEN');
      }

      res.json({
        success: true,
        data: backup,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download backup file
   */
  static async download(req, res, next) {
    try {
      const { id } = req.params;

      const backup = await models.Backup.findOne({ where: { id } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (backup.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other user backup', 403, 'FORBIDDEN');
      }

      // Get file from MinIO
      const fileStream = minioClient.getObject(bucketName, backup.storagePath);

      // Set headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      res.setHeader('Content-Length', backup.size);

      // Stream file to response
      fileStream.pipe(res);

      fileStream.on('error', (err) => {
        console.error('Error streaming backup file:', err);
        res.status(500).json({
          success: false,
          message: 'Error downloading backup',
        });
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Restore from backup
   */
  static async restore(req, res, next) {
    try {
      const { id } = req.params;
      const { password, restoreOptions = {} } = req.body;

      const backup = await models.Backup.findOne({ where: { id } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (backup.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot restore other user backup', 403, 'FORBIDDEN');
      }

      if (!password) {
        throw new AppError('Password is required for backup decryption', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.restoreBackup(
        backup.id,
        password,
        restoreOptions,
        req.user.id
      );

      res.json({
        success: true,
        data: result,
        message: 'Backup restoration initiated. This may take some time.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete backup
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.body;

      const backup = await models.Backup.findOne({ where: { id } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (backup.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot delete other user backup', 403, 'FORBIDDEN');
      }

      // Soft delete by default
      if (!permanent) {
        await backup.update({ deleted: true, deletedAt: new Date() });
      } else {
        // Permanent delete - also delete from MinIO
        await minioClient.removeObject(bucketName, backup.storagePath);
        await backup.destroy();
      }

      res.json({
        success: true,
        message: permanent ? 'Backup permanently deleted' : 'Backup deleted',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export data to local backup
   */
  static async export(req, res, next) {
    try {
      const {
        dataTypes = ['chats', 'files', 'contacts', 'settings'],
        format = 'json',
        password,
      } = req.body;

      const userId = req.user.id;

      // Validate data types
      const validDataTypes = ['chats', 'files', 'contacts', 'settings', 'all'];
      const invalidTypes = dataTypes.filter(type => !validDataTypes.includes(type));
      if (invalidTypes.length > 0) {
        throw new AppError(`Invalid data types: ${invalidTypes.join(', ')}`, 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.exportBackup(
        userId,
        dataTypes,
        format,
        password
      );

      res.status(201).json({
        success: true,
        data: result.backup,
        downloadUrl: result.downloadUrl,
        message: 'Data exported successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import data from backup
   */
  static async import(req, res, next) {
    try {
      const { password, importOptions = {} } = req.body;

      if (!req.files || req.files.length === 0) {
        throw new AppError('No backup file provided', 400, 'VALIDATION_ERROR');
      }

      const file = req.files[0];
      const userId = req.user.id;

      if (!password) {
        throw new AppError('Password is required for backup decryption', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.importBackup(
        userId,
        file,
        password,
        importOptions
      );

      res.status(201).json({
        success: true,
        data: result,
        message: 'Data imported successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get backup settings
   */
  static async getSettings(req, res, next) {
    try {
      const userId = req.user.id;

      const user = await models.User.findOne({
        where: { id: userId },
        attributes: ['id', 'backupSettings'],
      });

      const defaultSettings = {
        autoBackup: false,
        backupInterval: 'weekly',
        dataTypes: ['chats', 'files', 'contacts', 'settings'],
        maxBackups: 10,
      };

      const settings = user?.backupSettings || defaultSettings;

      res.json({
        success: true,
        data: {
          ...defaultSettings,
          ...settings,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update backup settings
   */
  static async updateSettings(req, res, next) {
    try {
      const {
        autoBackup,
        backupInterval,
        dataTypes,
        maxBackups,
      } = req.body;

      const userId = req.user.id;

      // Validate
      if (autoBackup !== undefined && typeof autoBackup !== 'boolean') {
        throw new AppError('autoBackup must be a boolean', 400, 'VALIDATION_ERROR');
      }

      if (backupInterval && !['daily', 'weekly', 'monthly'].includes(backupInterval)) {
        throw new AppError('Invalid backup interval', 400, 'VALIDATION_ERROR');
      }

      if (dataTypes) {
        const validDataTypes = ['chats', 'files', 'contacts', 'settings', 'all'];
        const invalidTypes = dataTypes.filter(type => !validDataTypes.includes(type));
        if (invalidTypes.length > 0) {
          throw new AppError(`Invalid data types: ${invalidTypes.join(', ')}`, 400, 'VALIDATION_ERROR');
        }
      }

      if (maxBackups && (maxBackups < 1 || maxBackups > 50)) {
        throw new AppError('maxBackups must be between 1 and 50', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      await user.update({
        backupSettings: {
          autoBackup: autoBackup !== undefined ? autoBackup : user.backupSettings?.autoBackup || false,
          backupInterval: backupInterval || user.backupSettings?.backupInterval || 'weekly',
          dataTypes: dataTypes || user.backupSettings?.dataTypes || ['chats', 'files', 'contacts', 'settings'],
          maxBackups: maxBackups || user.backupSettings?.maxBackups || 10,
        },
      });

      res.json({
        success: true,
        data: user.backupSettings,
        message: 'Backup settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create automatic backup
   */
  static async createAutoBackup(req, res, next) {
    try {
      const userId = req.user.id;

      // Check if auto backup is enabled
      const user = await models.User.findOne({ where: { id: userId } });

      if (!user?.backupSettings?.autoBackup) {
        throw new AppError('Auto backup is not enabled for this user', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.createBackup(
        userId,
        `Auto Backup - ${new Date().toISOString().split('T')[0]}`,
        'Automatic backup',
        null, // No password for auto backups (stored securely)
        user.backupSettings.dataTypes,
        'json'
      );

      res.status(201).json({
        success: true,
        data: result.backup,
        message: 'Auto backup created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cleanup old backups
   */
  static async cleanup(req, res, next) {
    try {
      const { olderThanDays = 30 } = req.body;

      const userId = req.user.id;

      // Find backups older than specified days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const where = {
        userId,
        createdAt: { $lt: cutoffDate },
        deleted: false,
      };

      const backups = await models.Backup.findAll({ where });

      let deletedCount = 0;
      const errors = [];

      for (const backup of backups) {
        try {
          // Delete from MinIO
          await minioClient.removeObject(bucketName, backup.storagePath);
          // Delete from database
          await backup.destroy();
          deletedCount++;
        } catch (err) {
          errors.push(backup.id);
          console.error(`Error deleting backup ${backup.id}:`, err);
        }
      }

      res.json({
        success: true,
        data: {
          deletedCount,
          errors,
        },
        message: `Cleaned up ${deletedCount} old backups`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify backup password
   */
  static async verifyPassword(req, res, next) {
    try {
      const { backupId, password } = req.body;

      const backup = await models.Backup.findOne({ where: { id: backupId } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (backup.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other user backup', 403, 'FORBIDDEN');
      }

      // Try to decrypt a small portion to verify password
      // This is a simplified check - in production, use proper password verification
      const isValid = await BackupService.verifyBackupPassword(backup, password);

      res.json({
        success: true,
        data: { valid: isValid },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BackupController;
