/**
 * Backup Controller
 * Handles cloud backup creation, restoration, and management.
 *
 * Fixes vs previous version:
 * - BackupService writes files to the local `backups/` directory (not MinIO),
 *   so download/delete/cleanup now use the filesystem.
 * - User has no `username` column; includes select real columns.
 * - `req.user.roles` never existed; access control uses req.user.role.
 * - Backup model has no `deleted`/`type` columns; soft delete uses status.
 * - verifyBackupPassword returns { valid } object.
 * - export/import reworked to the actual BackupService API (no multipart
 *   upload middleware is configured in the app).
 */

const models = require('../models');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { AppError } = require('../middleware/errorHandler');
const BackupService = require('../services/backupService');

const BACKUP_DIR = path.join(__dirname, '../../backups');

const isSystemAdmin = (req) => req.user.role === 'system_admin';

const backupFilePath = (backup) => path.join(BACKUP_DIR, backup.filename);

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
        downloadUrl: '/api/backups/' + result.backup.id + '/download',
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
      const { status, page = 1, limit = 20 } = req.query;

      const where = isSystemAdmin(req) ? {} : { userId: req.user.id };
      if (status) where.status = status;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Backup.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName'] },
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
          { model: models.User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName'] },
        ],
      });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      if (backup.userId !== req.user.id && !isSystemAdmin(req)) {
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
   * Download backup file (BackupService stores files locally)
   */
  static async download(req, res, next) {
    try {
      const { id } = req.params;

      const backup = await models.Backup.findOne({ where: { id } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      if (backup.userId !== req.user.id && !isSystemAdmin(req)) {
        throw new AppError('Cannot access other user backup', 403, 'FORBIDDEN');
      }

      const filePath = backupFilePath(backup);
      if (!fs.existsSync(filePath)) {
        throw new AppError('Backup file not found on disk', 404, 'NOT_FOUND');
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + backup.filename + '"');
      res.setHeader('Content-Length', backup.size);

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        const logger = require('../utils/logger');
        logger.error('Error streaming backup file: ' + err.message);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error downloading backup' });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
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

      if (backup.userId !== req.user.id && !isSystemAdmin(req)) {
        throw new AppError('Cannot restore other user backup', 403, 'FORBIDDEN');
      }

      if (!password) {
        throw new AppError('Password is required for backup decryption', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.restoreBackup(backup.id, password);

      res.json({
        success: true,
        data: result,
        message: 'Backup restored successfully.',
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
      const { password, permanent = false } = req.body;

      const backup = await models.Backup.findOne({ where: { id } });

      if (!backup) {
        throw new AppError('Backup not found', 404, 'NOT_FOUND');
      }

      if (backup.userId !== req.user.id && !isSystemAdmin(req)) {
        throw new AppError('Cannot delete other user backup', 403, 'FORBIDDEN');
      }

      if (!permanent) {
        // Soft delete by default
        await backup.update({ status: 'deleted' });
        return res.json({
          success: true,
          message: 'Backup deleted',
        });
      }

      // Permanent delete: file + record (requires the user's login password)
      if (!password) {
        throw new AppError('Password is required for permanent deletion', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.deleteBackup(backup.id, password);
      res.json({
        success: true,
        message: result.message || 'Backup permanently deleted',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export data (encrypted backup file)
   */
  static async export(req, res, next) {
    try {
      const {
        name,
        dataTypes = ['chats', 'files', 'contacts', 'settings'],
        format = 'json',
        password,
      } = req.body;

      const userId = req.user.id;

      if (format === 'zip') {
        const zip = await BackupService.createZipBackup(userId, dataTypes);
        const backup = await models.Backup.create({
          userId,
          name: name || 'Экспорт (ZIP)',
          description: 'Экспорт данных',
          filename: zip.filename,
          size: zip.size,
          dataTypes,
          format: 'zip',
          encrypted: false,
          status: 'completed',
        });

        return res.status(201).json({
          success: true,
          data: backup,
          downloadUrl: '/api/backups/' + backup.id + '/download',
          message: 'Data exported successfully',
        });
      }

      if (!password) {
        throw new AppError('Password is required for encrypted export', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.createBackup(
        userId,
        name || 'Экспорт данных',
        'Экспорт данных',
        password,
        dataTypes,
        'json'
      );

      res.status(201).json({
        success: true,
        data: result.backup,
        downloadUrl: '/api/backups/' + result.backup.id + '/download',
        message: 'Data exported successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import data from a JSON payload (multipart upload is not configured)
   */
  static async import(req, res, next) {
    try {
      const { dataType, data } = req.body;

      const userId = req.user.id;

      if (!dataType || data === undefined) {
        throw new AppError('dataType and data are required', 400, 'VALIDATION_ERROR');
      }

      if (dataType === 'settings') {
        const user = await models.User.findByPk(userId);
        if (!user) {
          throw new AppError('User not found', 404, 'NOT_FOUND');
        }
        await user.update({ backupSettings: data });
        return res.status(201).json({
          success: true,
          data: { updated: 1 },
          message: 'Settings imported successfully',
        });
      }

      const result = await BackupService.importData(dataType, data, userId);

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

      const settings = user && user.backupSettings ? user.backupSettings : {};

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

      if (autoBackup !== undefined && typeof autoBackup !== 'boolean') {
        throw new AppError('autoBackup must be a boolean', 400, 'VALIDATION_ERROR');
      }

      if (backupInterval && !['daily', 'weekly', 'monthly'].includes(backupInterval)) {
        throw new AppError('Invalid backup interval', 400, 'VALIDATION_ERROR');
      }

      if (dataTypes) {
        const validDataTypes = ['chats', 'files', 'contacts', 'settings', 'all'];
        const invalidTypes = dataTypes.filter((type) => !validDataTypes.includes(type));
        if (invalidTypes.length > 0) {
          throw new AppError(
            'Invalid data types: ' + invalidTypes.join(', '),
            400,
            'VALIDATION_ERROR'
          );
        }
      }

      if (maxBackups && (maxBackups < 1 || maxBackups > 50)) {
        throw new AppError('maxBackups must be between 1 and 50', 400, 'VALIDATION_ERROR');
      }

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      const merged = {
        autoBackup:
          autoBackup !== undefined
            ? autoBackup
            : (user.backupSettings && user.backupSettings.autoBackup) || false,
        backupInterval:
          backupInterval ||
          (user.backupSettings && user.backupSettings.backupInterval) ||
          'weekly',
        dataTypes:
          dataTypes ||
          (user.backupSettings && user.backupSettings.dataTypes) ||
          ['chats', 'files', 'contacts', 'settings'],
        maxBackups:
          maxBackups ||
          (user.backupSettings && user.backupSettings.maxBackups) ||
          10,
      };

      await user.update({ backupSettings: merged });

      res.json({
        success: true,
        data: merged,
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

      const user = await models.User.findOne({ where: { id: userId } });

      if (!user || !user.backupSettings || !user.backupSettings.autoBackup) {
        throw new AppError('Auto backup is not enabled for this user', 400, 'VALIDATION_ERROR');
      }

      const result = await BackupService.createBackup(
        userId,
        'Auto Backup - ' + new Date().toISOString().split('T')[0],
        'Automatic backup',
        user.email, // deterministic password for auto backups (test mode)
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

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

      const backups = await models.Backup.findAll({
        where: {
          userId,
          createdAt: { [Op.lt]: cutoffDate },
        },
      });

      let deletedCount = 0;
      const errors = [];

      for (const backup of backups) {
        try {
          const filePath = backupFilePath(backup);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          await backup.destroy();
          deletedCount++;
        } catch (err) {
          errors.push(backup.id);
          const logger = require('../utils/logger');
          logger.error('Error deleting backup ' + backup.id + ': ' + err.message);
        }
      }

      res.json({
        success: true,
        data: {
          deletedCount,
          errors,
        },
        message: 'Cleaned up ' + deletedCount + ' old backups',
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

      if (backup.userId !== req.user.id && !isSystemAdmin(req)) {
        throw new AppError('Cannot access other user backup', 403, 'FORBIDDEN');
      }

      const result = await BackupService.verifyBackupPassword(backup, password);

      res.json({
        success: true,
        data: {
          valid: result && typeof result === 'object' ? Boolean(result.valid) : Boolean(result),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BackupController;
