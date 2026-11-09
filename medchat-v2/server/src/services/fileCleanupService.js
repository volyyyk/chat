/**
 * File Cleanup Service
 * Handles automatic cleanup of expired files (3 days after upload)
 */

const models = require('../models');
const { minioClient, bucketName } = require('../config/minio');
const { Op } = require('sequelize');

class FileCleanupService {
  /**
   * Cleanup expired files (files older than 3 days with autoDelete enabled)
   * This is meant to be run as a cron job
   */
  static async cleanupExpiredFiles() {
    try {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // deleteAt is the canonical per-file expiry. Older records created before
      // deleteAt was populated get a conservative 3-day fallback only when
      // autoDelete is explicitly enabled. Never use deleteAfterDays <= 3:
      // that is a duration setting, not an expiry timestamp, and would match
      // every new record whose default TTL is three days.
      const filesToDelete = await models.File.findAll({
        where: {
          [Op.or]: [
            { deleteAt: { [Op.lte]: now } },
            {
              autoDelete: true,
              deleteAt: null,
              createdAt: { [Op.lte]: threeDaysAgo },
            },
          ],
          deleted: false,
        },
        include: [
          { model: models.Chat, attributes: ['id'] },
          { model: models.Doctor, attributes: ['id'] },
          { model: models.Patient, attributes: ['id'] },
        ],
      });

      let deletedCount = 0;
      let errors = [];

      for (const file of filesToDelete) {
        try {
          // Delete from MinIO
          await minioClient.removeObject(bucketName, file.storagePath);

          // Soft delete from database
          await file.update({
            deleted: true,
            deletedAt: new Date(),
            deletionReason: 'Auto-delete after 3 days',
          });

          // Log the deletion
          console.log(`Deleted file ${file.id} (${file.filename}) from MinIO and marked as deleted in DB`);

          deletedCount++;
        } catch (err) {
          console.error(`Error deleting file ${file.id}:`, err);
          errors.push({
            fileId: file.id,
            filename: file.filename,
            error: err.message,
          });
        }
      }

      return {
        success: true,
        deletedCount,
        errors,
        message: `Cleaned up ${deletedCount} expired files`,
      };
    } catch (error) {
      console.error('Error in file cleanup:', error);
      return {
        success: false,
        error: error.message,
        deletedCount: 0,
        errors: [],
      };
    }
  }

  /**
   * Cleanup files by doctor
   * @param {string} doctorId - Doctor ID
   * @param {number} olderThanDays - Delete files older than X days
   * @returns {Promise<Object>} - Cleanup result
   */
  static async cleanupDoctorFiles(doctorId, olderThanDays = 3) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Find files uploaded by this doctor
      const filesToDelete = await models.File.findAll({
        where: {
          ownerType: 'doctor',
          ownerId: doctorId,
          createdAt: { [Op.lte]: cutoffDate },
          deleted: false,
        },
      });

      let deletedCount = 0;
      let errors = [];

      for (const file of filesToDelete) {
        try {
          // Delete from MinIO
          await minioClient.removeObject(bucketName, file.storagePath);

          // Soft delete from database
          await file.update({
            deleted: true,
            deletedAt: new Date(),
            deletionReason: `Auto-delete by doctor after ${olderThanDays} days`,
          });

          deletedCount++;
        } catch (err) {
          console.error(`Error deleting doctor file ${file.id}:`, err);
          errors.push({
            fileId: file.id,
            filename: file.filename,
            error: err.message,
          });
        }
      }

      return {
        success: true,
        deletedCount,
        errors,
        message: `Cleaned up ${deletedCount} doctor files`,
      };
    } catch (error) {
      console.error('Error cleaning up doctor files:', error);
      return {
        success: false,
        error: error.message,
        deletedCount: 0,
        errors: [],
      };
    }
  }

  /**
   * Cleanup all temporary files
   * @returns {Promise<Object>} - Cleanup result
   */
  static async cleanupTempFiles() {
    try {
      // Find temporary files (files with 'temp' in the path or metadata)
      const tempFiles = await models.File.findAll({
        where: {
          [Op.or]: [
            { storagePath: { [Op.iLike]: '%temp%' } },
            { metadata: { [Op.iLike]: '%temp%' } },
          ],
          deleted: false,
        },
      });

      let deletedCount = 0;
      let errors = [];

      for (const file of tempFiles) {
        try {
          // Delete from MinIO
          await minioClient.removeObject(bucketName, file.storagePath);

          // Hard delete from database (temp files don't need to be preserved)
          await file.destroy();

          deletedCount++;
        } catch (err) {
          console.error(`Error deleting temp file ${file.id}:`, err);
          errors.push({
            fileId: file.id,
            filename: file.filename,
            error: err.message,
          });
        }
      }

      return {
        success: true,
        deletedCount,
        errors,
        message: `Cleaned up ${deletedCount} temporary files`,
      };
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
      return {
        success: false,
        error: error.message,
        deletedCount: 0,
        errors: [],
      };
    }
  }

  /**
   * Get file cleanup statistics
   * @returns {Promise<Object>} - Statistics
   */
  static async getCleanupStatistics() {
    try {
      const now = new Date();

      // Files that will expire in 1 day
      const expiringIn1Day = await models.File.count({
        where: {
          autoDelete: true,
          createdAt: {
            [Op.gte]: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
            [Op.lte]: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          },
          deleted: false,
        },
      });

      // Files that will expire in 2 days
      const expiringIn2Days = await models.File.count({
        where: {
          autoDelete: true,
          createdAt: {
            [Op.gte]: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
            [Op.lte]: now,
          },
          deleted: false,
        },
      });

      // Files that should be deleted now (older than 3 days)
      const shouldBeDeleted = await models.File.count({
        where: {
          autoDelete: true,
          createdAt: { [Op.lte]: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
          deleted: false,
        },
      });

      // Total files
      const totalFiles = await models.File.count({ where: { deleted: false } });

      // Total storage used (approximate)
      const files = await models.File.findAll({
        where: { deleted: false },
        attributes: ['size'],
      });
      const totalStorage = files.reduce((sum, file) => sum + (file.size || 0), 0);

      return {
        success: true,
        data: {
          totalFiles,
          totalStorage: this.formatBytes(totalStorage),
          expiringIn1Day,
          expiringIn2Days,
          shouldBeDeleted,
          cleanupRecommended: shouldBeDeleted > 0,
        },
      };
    } catch (error) {
      console.error('Error getting cleanup statistics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes
   * @returns {string} - Formatted string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Manually delete a specific file
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for access control)
   * @param {string} reason - Deletion reason
   * @returns {Promise<Object>} - Deletion result
   */
  static async manualDeleteFile(fileId, userId, reason) {
    try {
      const file = await models.File.findOne({ where: { id: fileId } });

      if (!file) {
        return {
          success: false,
          message: 'File not found',
        };
      }

      // Access control - only owner or admin can delete
      if (file.ownerId !== userId && !req.user?.roles?.includes('admin')) {
        return {
          success: false,
          message: 'Cannot delete this file',
        };
      }

      // Delete from MinIO
      await minioClient.removeObject(bucketName, file.storagePath);

      // Hard delete from database
      await file.destroy();

      return {
        success: true,
        message: 'File deleted permanently',
      };
    } catch (error) {
      console.error('Error manually deleting file:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Restore a soft-deleted file
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for access control)
   * @returns {Promise<Object>} - Restoration result
   */
  static async restoreFile(fileId, userId) {
    try {
      const file = await models.File.findOne({
        where: { id: fileId, deleted: true },
      });

      if (!file) {
        return {
          success: false,
          message: 'File not found or not deleted',
        };
      }

      // Access control - only owner or admin can restore
      if (file.ownerId !== userId && !req.user?.roles?.includes('admin')) {
        return {
          success: false,
          message: 'Cannot restore this file',
        };
      }

      // Restore the file
      await file.update({
        deleted: false,
        deletedAt: null,
        deletionReason: null,
      });

      return {
        success: true,
        data: file,
        message: 'File restored successfully',
      };
    } catch (error) {
      console.error('Error restoring file:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = FileCleanupService;
