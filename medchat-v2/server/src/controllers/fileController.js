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
const { parseFileRetention } = require('../utils/fileRetention');
const { canAccessChat, getAccessibleChatIds } = require('../utils/chatAccess');

/**
 * Владелец файла: сравниваем и с userId, и с профилями doctor/patient
 * (ownerId для загрузок пациента/врача - это id профиля, не user.id).
 */
function isFileOwner(user, file) {
  if (!user || !file) return false;
  return !!(
    user.id === file.ownerId ||
    user.id === file.uploaderId ||
    (user.doctorId && String(user.doctorId) === String(file.ownerId)) ||
    (user.patientId && String(user.patientId) === String(file.ownerId))
  );
}

/**
 * Единые правила доступа к файлу (изоляция гостей и пользователей):
 *  - system_admin: всё;
 *  - владелец файла и тот, кто его загрузил: всё;
 *  - visibility 'public': любой авторизованный пользователь;
 *  - файл в чате (chatId): участники чата (canAccessChat). 'shared'
 *    означает «общий внутри чата», а НЕ «общий для всего сервера»;
 *  - 'shared'/'doctor_only'/'patient_only' без чата и без прав владельца:
 *    доступ запрещён.
 * Раньше 'shared'/'public' файлы мог скачать ЛЮБОЙ авторизованный
 * пользователь по id (и увидеть в списке) - утечка данных между гостями.
 */
async function canAccessFile(user, file) {
  if (!user || !file) return false;
  if (user.role === 'system_admin') return true;
  if (isFileOwner(user, file)) return true;
  if (file.visibility === 'public') return true;
  if (file.chatId) {
    const chat = await models.Chat.findByPk(file.chatId);
    return chat ? canAccessChat(user, chat) : false;
  }
  return false;
}

class FileController {
  /**
   * Upload file
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async upload(req, res, next) {
    try {
      const { chatId, messageId, type, category, description, tags, visibility, autoDelete, deleteAfterDays } = req.body;
      const retention = parseFileRetention(autoDelete, deleteAfterDays);
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
        autoDelete: retention.autoDelete,
        deleteAfterDays: retention.deleteAfterDays,
        deleteAt: retention.deleteAt,
        description: description || null,
        tags: tags || [],
        checksum,
        virusScanStatus: 'pending',
      });

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

      const allowed = await canAccessFile(req.user, file);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
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

      const allowed = await canAccessFile(req.user, file);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
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

      // Non-admins: свои файлы, файлы своих профилей, public и файлы
      // чатов, к которым есть доступ. Общий 'shared' без чата больше
      // НЕ делает файл видимым всему серверу (изоляция гостей).
      if (req.user.role !== 'system_admin') {
        const accessibleChatIds = await getAccessibleChatIds(req.user);
        const ownerIds = [req.user.id, req.user.doctorId, req.user.patientId].filter(Boolean);
        where[models.Sequelize.Op.or] = [
          { ownerId: ownerIds },
          { uploaderId: req.user.id },
          { visibility: 'public' },
          { chatId: { [models.Sequelize.Op.in]: accessibleChatIds } },
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
      if (req.user.role !== 'system_admin' && !isFileOwner(req.user, file)) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const retention = parseFileRetention(
        Object.prototype.hasOwnProperty.call(req.body, 'autoDelete') ? autoDelete : file.autoDelete,
        deleteAfterDays ?? file.deleteAfterDays
      );

      await file.update({
        description,
        tags,
        category,
        visibility,
        autoDelete: retention.autoDelete,
        deleteAfterDays: retention.deleteAfterDays,
        deleteAt: retention.deleteAt,
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
      if (req.user.role !== 'system_admin' && !isFileOwner(req.user, file)) {
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

      const allowed = await canAccessFile(req.user, file);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
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

      const allowed = await canAccessFile(req.user, file);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
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
   * Update medical file metadata (POST /:id/metadata).
   * fileMetadataSchema allows: patientId, appointmentId, diagnosis, notes.
   * appointmentId has no own column on files, so it is stored in the JSONB
   * metadata column together with diagnosis and notes.
   */
  static async updateMetadata(req, res, next) {
    try {
      const { id } = req.params;
      const { patientId, appointmentId, diagnosis, notes } = req.body;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      // Only the owner/uploader or a system admin may edit metadata
      if (req.user.role !== 'system_admin' && !isFileOwner(req.user, file)) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const metadata = Object.assign({}, file.metadata || {});
      if (appointmentId !== undefined) metadata.appointmentId = appointmentId;
      if (diagnosis !== undefined) metadata.diagnosis = diagnosis;
      if (notes !== undefined) metadata.notes = notes;

      const updateData = { metadata };
      if (patientId !== undefined) updateData.patientId = patientId;

      await file.update(updateData);

      res.json(file);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get file preview (GET /:id/preview).
   * Streams images and PDFs inline with the same access rules as download.
   */
  static async getPreview(req, res, next) {
    try {
      const { id } = req.params;

      const file = await models.File.findByPk(id);
      if (!file) {
        throw new AppError('File not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessFile(req.user, file);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      if (file.deleteAt && new Date() > new Date(file.deleteAt)) {
        throw new AppError('File has been deleted', 410, 'GONE');
      }

      // Only images and PDFs are previewable in this implementation
      if (file.fileType !== 'image' && file.mimeType !== 'application/pdf') {
        throw new AppError('Preview not available for this file type', 415, 'UNSUPPORTED_MEDIA_TYPE');
      }

      const fileStream = await new Promise((resolve, reject) => {
        minioClient.getObject({ Bucket: bucketName, Key: file.storagePath }, (err, dataStream) => {
          if (err) reject(err);
          else resolve(dataStream);
        });
      });

      res.set({
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalFilename)}"`,
        'Content-Length': file.size,
      });
      fileStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List files uploaded by a doctor (GET /doctor/:doctorId).
   * Access: the doctor themself, their clinic admin, or a system admin.
   */
  static async listByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const { chatId, patientId, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const doctor = await models.Doctor.findByPk(doctorId);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      if (req.user.role !== 'system_admin') {
        const isSelf = doctor.userId === req.user.id ||
          String(req.user.doctorId || '') === String(doctorId);
        const isClinicAdmin = req.user.role === 'clinic_admin' &&
          String(req.user.clinicId || '') === String(doctor.clinicId);
        if (!isSelf && !isClinicAdmin) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      const where = { ownerType: 'doctor', ownerId: doctorId };
      if (chatId) where.chatId = chatId;
      if (patientId) where.patientId = patientId;

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
          page: parseInt(page),
          limit: parseInt(limit),
          total: files.count,
          totalPages: Math.ceil(files.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List files of a patient (GET /patient/:patientId).
   * Access: the patient themself, doctors, clinic admins, or a system admin
   * (medical context: treating staff may access patient files).
   */
  static async listByPatient(req, res, next) {
    try {
      const { patientId } = req.params;
      const { chatId, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const patient = await models.Patient.findByPk(patientId);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      if (req.user.role === 'patient') {
        const isSelf = patient.userId === req.user.id ||
          String(req.user.patientId || '') === String(patientId);
        if (!isSelf) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      const where = { ownerType: 'patient', ownerId: patientId };
      if (chatId) where.chatId = chatId;

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
          page: parseInt(page),
          limit: parseInt(limit),
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
