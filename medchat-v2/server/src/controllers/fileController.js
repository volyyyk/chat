/**
 * File Controller
 * Handles file upload, download, and management
 */

const models = require('../models');
const { minioClient, bucketName, FILE_TYPES, getFileUrl } = require('../config/minio');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');
const fs = require('fs');
const path = require('path');

class FileController {
  /**
   * Upload file
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async upload(req, res, next) {
    try {
      const { chatId, messageId, type, category, description, tags, visibility, autoDelete, deleteAfterDays } = req.body;
      const userId = req.user.id;

      // multer's upload.single('file') sets req.file; upload.array sets req.files.
      // Accept both shapes so the route configuration cannot silently break uploads.
      const file = req.file || (req.files && req.files[0]);

      // Check if file is provided
      if (!file) {
        throw new AppError('No file provided', 400, 'VALIDATION_ERROR');
      }

      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new AppError('File size exceeds maximum limit of 50MB', 400, 'VALIDATION_ERROR');
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'application/json', 'application/xml',
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip'];

      if (!allowedTypes.includes(file.mimetype)) {
        throw new AppError('File type not allowed', 400, 'VALIDATION_ERROR');
      }

      // Determine file type
      let fileType;
      if (file.mimetype.startsWith('image/')) fileType = 'image';
      else if (file.mimetype.startsWith('video/')) fileType = 'video';
      else if (file.mimetype.startsWith('audio/')) fileType = 'audio';
      else if (file.mimetype.startsWith('application/pdf')) fileType = 'document';
      else if (file.mimetype.startsWith('application/zip') || file.mimetype.startsWith('application/x-rar')) fileType = 'archive';
      else fileType = 'document';

      // Generate unique filename
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${userId}${ext}`;
      const storagePath = `${userId}/${filename}`;

      // Upload to MinIO
      const uploadParams = {
        Bucket: bucketName,
        Key: storagePath,
        Body: fs.createReadStream(file.path),
        ContentType: file.mimetype,
        ContentLength: file.size,
      };

      const minioResponse = await new Promise((resolve, reject) => {
        minioClient.putObject(uploadParams, (err, etag) => {
          if (err) reject(err);
          else resolve({ etag, key: storagePath });
        });
      });

      // Get file dimensions for images/videos
      let width, height, duration;
      if (fileType === 'image') {
        width = null;
        height = null;
      } else if (fileType === 'video' || fileType === 'audio') {
        duration = null;
      }

      // Determine owner
      const ownerType = req.user.role === 'doctor' ? 'doctor' : 'patient';
      const ownerId = req.user.doctorId || req.user.patientId || req.user.id;

      // Checksum: with diskStorage there is no file.buffer, read from the temp file
      let checksum = null;
      try {
        checksum = CryptoService.hashSHA256(fs.readFileSync(file.path));
      } catch (e) {
        checksum = null;
      }

      // Create file record
      const fileRecord = await models.File.create({
        filename,
        originalFilename: file.originalname,
        storagePath,
        storageBucket: bucketName,
        fileType,
        mimeType: file.mimetype,
        extension: ext.replace('.', ''),
        size: file.size,
        width,
        height,
        duration,
        ownerType,
        ownerId,
        uploaderId: userId,
        chatId: chatId || null,
        messageId: messageId || null,
        visibility: visibility || 'shared',
        category: category || 'document',
        isEncrypted: true,
        autoDelete: autoDelete || false,
        deleteAfterDays: deleteAfterDays || 3,
        deleteAt: autoDelete ? new Date(Date.now() + deleteAfterDays * 24 * 60 * 60 * 1000) : null,
        description: description || null,
        tags: tags || [],
        checksum,
        virusScanStatus: 'pending',
      });

      // Set deleteAt if autoDelete is true
      if (autoDelete) {
        await fileRecord.update({
          deleteAt: new Date(Date.now() + deleteAfterDays * 24 * 60 * 60 * 1000),
        });
      }

      // Clean up temporary file
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // non-fatal
      }

      res.status(201).json(fileRecord);
    } catch (error) {
      // Clean up temporary file on error
      const tmp = req.file || (req.files && req.files[0]);
      if (tmp && tmp.path) {
        try {
          fs.unlinkSync(tmp.path);
        } catch (e) {
          // non-fatal
        }
      }
      next(error);
    }
  }

  /**
   * Get file by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id, {
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.Message, as: 'message' },
          { model: models.User, as: 'uploader' },
        ],
      });

      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access based on visibility
      if (file.visibility === 'private') {
        if (req.user.role !== 'system_admin' && req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      } else if (file.visibility === 'doctor_only') {
        if (req.user.role !== 'system_admin' && req.user.role !== 'doctor' && req.user.id !== file.ownerId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      } else if (file.visibility === 'patient_only') {
        if (req.user.role !== 'system_admin' && req.user.role !== 'patient' && req.user.id !== file.ownerId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      // Increment download count
      await file.update({
        downloadCount: file.downloadCount + 1,
        lastDownloadedAt: new Date(),
      });

      res.json(file);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download file
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async download(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access based on visibility
      if (file.visibility === 'private') {
        if (req.user.role !== 'system_admin' && req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      } else if (file.visibility === 'doctor_only') {
        if (req.user.role !== 'system_admin' && req.user.role !== 'doctor' && req.user.id !== file.ownerId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      } else if (file.visibility === 'patient_only') {
        if (req.user.role !== 'system_admin' && req.user.role !== 'patient' && req.user.id !== file.ownerId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      // Check if file is expired
      if (file.deleteAt && new Date() > new Date(file.deleteAt)) {
        throw new AppError('File has been deleted', 410, 'GONE');
      }

      // Get file from MinIO
      const downloadParams = {
        Bucket: bucketName,
        Key: file.storagePath,
      };

      const fileStream = await new Promise((resolve, reject) => {
        minioClient.getObject(downloadParams, (err, dataStream) => {
          if (err) reject(err);
          else resolve(dataStream);
        });
      });

      // Set headers
      res.set({
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalFilename)}"`,
        'Content-Length': file.size,
      });

      // Stream file to response
      fileStream.pipe(res);

      // Increment download count
      await file.update({
        downloadCount: file.downloadCount + 1,
        lastDownloadedAt: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List files
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { chatId, messageId, uploaderId, ownerType, ownerId, category, visibility, page = 1, limit = 20, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (chatId) where.chatId = chatId;
      if (messageId) where.messageId = messageId;
      if (uploaderId) where.uploaderId = uploaderId;
      if (ownerType) where.ownerType = ownerType;
      if (ownerId) where.ownerId = ownerId;
      if (category) where.category = category;
      if (visibility) where.visibility = visibility;
      if (search) {
        where.originalFilename = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      // For non-admin users, only show their files or files they have access to
      if (req.user.role !== 'system_admin') {
        where[models.Sequelize.Op.or] = [
          { ownerId: req.user.id },
          { uploaderId: req.user.id },
          { visibility: 'shared' },
          { visibility: 'public' },
        ];
      }

      const files = await models.File.findAndCountAll({
        where,
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.Message, as: 'message' },
          { model: models.User, as: 'uploader' },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: files.rows,
        pagination: {
          page,
          limit,
          total: files.count,
          totalPages: Math.ceil(files.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update file
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const { description, tags, category, visibility, autoDelete, deleteAfterDays } = req.body;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access (owner or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      await file.update({
        description,
        tags,
        category,
        visibility,
        autoDelete,
        deleteAfterDays,
        deleteAt: autoDelete ? new Date(Date.now() + deleteAfterDays * 24 * 60 * 60 * 1000) : null,
      });

      res.json(file);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete file
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access (owner or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Delete from MinIO
      const deleteParams = {
        Bucket: bucketName,
        Key: file.storagePath,
      };

      await new Promise((resolve, reject) => {
        minioClient.removeObject(deleteParams, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete from database
      await file.destroy();

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get file URL
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getUrl(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access based on visibility
      if (file.visibility === 'private') {
        if (req.user.role !== 'system_admin' && req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      // Generate presigned URL
      const url = getFileUrl(file.storagePath);

      res.json({ url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get file metadata
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getMetadata(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== file.ownerId && req.user.id !== file.uploaderId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      res.json({
        id: file.id,
        filename: file.filename,
        originalFilename: file.originalFilename,
        size: file.size,
        mimeType: file.mimeType,
        fileType: file.fileType,
        width: file.width,
        height: file.height,
        duration: file.duration,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get files by chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getByChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const { page = 1, limit = 20, category, visibility } = req.query;
      const offset = (page - 1) * limit;

      const chat = await models.Chat.findByPk(chatId);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== chat.doctorId && req.user.id !== chat.patientId) {
          const participant = await models.ChatParticipant.findOne({
            where: { chatId, userId: req.user.id },
          });
          if (!participant) {
            throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
          }
        }
      }

      const where = { chatId };
      if (category) where.category = category;
      if (visibility) where.visibility = visibility;

      const files = await models.File.findAndCountAll({
        where,
        include: [{ model: models.User, as: 'uploader' }],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: files.rows,
        pagination: {
          page,
          limit,
          total: files.count,
          totalPages: Math.ceil(files.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get files by user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getByUser(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, category, visibility } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: userId };
      if (category) where.category = category;
      if (visibility) where.visibility = visibility;

      // Check access
      if (req.user.role !== 'system_admin' && req.user.id !== userId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const files = await models.File.findAndCountAll({
        where,
        include: [{ model: models.User, as: 'uploader' }],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: files.rows,
        pagination: {
          page,
          limit,
          total: files.count,
          totalPages: Math.ceil(files.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clean up expired files
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async cleanupExpired(req, res, next) {
    try {
      // Only system admin can run cleanup
      if (req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Find expired files
      const now = new Date();
      const expiredFiles = await models.File.findAll({
        where: {
          deleteAt: { [models.Sequelize.Op.lte]: now },
          status: 'active',
        },
      });

      let deletedCount = 0;

      for (const file of expiredFiles) {
        try {
          // Delete from MinIO
          const deleteParams = {
            Bucket: bucketName,
            Key: file.storagePath,
          };

          await new Promise((resolve, reject) => {
            minioClient.removeObject(deleteParams, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Delete from database
          await file.destroy();
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting file ${file.id}:`, error.message);
        }
      }

      res.json({
        message: `Cleanup completed. Deleted ${deletedCount} expired files.`,
        deletedCount,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = FileController;
