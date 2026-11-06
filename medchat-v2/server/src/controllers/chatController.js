/**
 * Chat Controller
 * Handles chat-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');
const BalanceService = require('../services/balanceService');

class ChatController {
  /**
   * Create new chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async create(req, res, next) {
    try {
      const { doctorId, patientId, clinicId, type, priority, title, settings, fileRetentionDays, createdBy } = req.body;
      const userId = req.user.id;

      // Validate participants
      const doctor = await models.Doctor.findByPk(doctorId);
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      const patient = await models.Patient.findByPk(patientId);
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check if chat already exists between this doctor and patient
      const existingChat = await models.Chat.findOne({
        where: { doctorId, patientId, clinicId },
      });
      if (existingChat) {
        throw new AppError('Chat already exists between this doctor and patient', 409, 'DUPLICATE_ERROR');
      }

      // Generate unique chat ID
      const chatId = `CHAT_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Generate encryption key for this chat
      const keyPair = CryptoService.generateX25519KeyPair();

      // Create chat
      const chat = await models.Chat.create({
        chatId,
        doctorId,
        patientId,
        clinicId: clinicId || doctor.clinicId,
        type: type || 'individual',
        priority: priority || 'normal',
        title: title || `${doctor.user?.fullName || 'Doctor'} - ${patient.user?.fullName || 'Patient'}`,
        settings: settings || {},
        fileRetentionDays: fileRetentionDays || 3,
        createdBy: createdBy || (req.user.role === 'doctor' ? 'doctor' : 'patient'),
        encryptionKey: keyPair.publicKey, // Store public key for reference
        isEncrypted: true,
      });

      // Create chat participants
      await models.ChatParticipant.bulkCreate([
        { chatId: chat.id, userId: doctor.userId, role: 'doctor' },
        { chatId: chat.id, userId: patient.userId, role: 'patient' },
      ]);

      // Update patient's chatCreatedAt
      await patient.update({ chatCreatedAt: new Date() });

      // Load full chat data
      const fullChat = await models.Chat.findByPk(chat.id, {
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      res.status(201).json(fullChat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id, {
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
          { model: models.Message, as: 'messages', limit: 1, order: [['createdAt', 'DESC']] },
        ],
      });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access (participant, doctor, clinic admin, or system admin)
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        if (req.user.role === 'doctor' && req.user.doctorId !== chat.doctorId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        if (req.user.role === 'clinic_admin' && req.user.clinicId !== chat.clinicId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List chats
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { page = 1, limit = 20, doctorId, patientId, clinicId, type, status, priority, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      
      if (doctorId) where.doctorId = doctorId;
      if (patientId) where.patientId = patientId;
      if (clinicId) where.clinicId = clinicId;
      if (type) where.type = type;
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (search) {
        where.title = { [models.Sequelize.Op.iLike]: `%${search}%` };
      }

      // For non-admin users, only show their chats
      if (req.user.role !== 'system_admin' && req.user.role !== 'clinic_admin') {
        if (req.user.doctorId) {
          where.doctorId = req.user.doctorId;
        } else if (req.user.patientId) {
          where.patientId = req.user.patientId;
        } else {
          // Get chats where user is a participant
          const participantChats = await models.ChatParticipant.findAll({
            where: { userId: req.user.id },
            attributes: ['chatId'],
          });
          const chatIds = participantChats.map((p) => p.chatId);
          where.id = chatIds;
        }
      }

      // For clinic admins, only show chats from their clinic
      if (req.user.role === 'clinic_admin') {
        const clinic = await models.Clinic.findOne({ where: { adminId: req.user.id } });
        if (clinic) where.clinicId = clinic.id;
      }

      const chats = await models.Chat.findAndCountAll({
        where,
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
        order: [['lastMessageAt', 'DESC NULLS LAST'], ['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: chats.rows,
        pagination: {
          page,
          limit,
          total: chats.count,
          totalPages: Math.ceil(chats.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access (participant, doctor, clinic admin, or system admin)
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        if (req.user.role === 'doctor' && req.user.doctorId !== chat.doctorId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        if (req.user.role === 'clinic_admin' && req.user.clinicId !== chat.clinicId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      await chat.update(data);

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access (doctor, clinic admin, or system admin)
      if (req.user.role !== 'system_admin') {
        if (req.user.role === 'doctor' && req.user.doctorId !== chat.doctorId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        if (req.user.role === 'clinic_admin' && req.user.clinicId !== chat.clinicId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Soft delete
      await chat.update({ status: 'deleted' });

      res.json({ message: 'Chat deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat messages
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getMessages(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50, before, after, type } = req.query;
      const offset = (page - 1) * limit;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        if (req.user.role === 'doctor' && req.user.doctorId !== chat.doctorId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        if (req.user.role === 'clinic_admin' && req.user.clinicId !== chat.clinicId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const where = { chatId: id };
      if (type) where.type = type;
      if (before) where.id = { [models.Sequelize.Op.lt]: before };
      if (after) where.id = { [models.Sequelize.Op.gt]: after };

      const messages = await models.Message.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.User, as: 'receiver', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.File, as: 'files' },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      // Mark messages as delivered for this user
      if (req.user.id !== chat.doctorId && req.user.id !== chat.patientId) {
        const participant = await models.ChatParticipant.findOne({
          where: { chatId: id, userId: req.user.id },
        });
        if (participant) {
          await models.Message.update(
            { deliveredTo: models.Sequelize.fn('array_append', models.Sequelize.col('deliveredTo'), req.user.id) },
            { where: { chatId: id, deliveredTo: { [models.Sequelize.Op.notContains]: [req.user.id] } } }
          );
        }
      }

      res.json({
        data: messages.rows.reverse(), // Return in chronological order
        pagination: {
          page,
          limit,
          total: messages.count,
          totalPages: Math.ceil(messages.count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send message to chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async sendMessage(req, res, next) {
    try {
      const { id } = req.params;
      const { content, type, priority, attachments, replyToId, clientType, clientVersion } = req.body;
      const userId = req.user.id;

      const chat = await models.Chat.findByPk(id, {
        include: [
          { model: models.Doctor, as: 'doctor' },
          { model: models.Patient, as: 'patient' },
        ],
      });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        if (req.user.role === 'doctor' && req.user.doctorId !== chat.doctorId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        if (req.user.role === 'clinic_admin' && req.user.clinicId !== chat.clinicId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Determine receiver
      const receiverId = userId === chat.doctor.userId ? chat.patient.userId : chat.doctor.userId;

      // Check if message is paid or free
      let isPaid = false;
      let isFree = true;
      let freeMessageReason = null;

      // Check if within 30 days of last appointment
      const lastAppointment = await models.Appointment.findOne({
        where: {
          [models.Sequelize.Op.or]: [
            { doctorId: chat.doctorId, patientId: chat.patientId },
            { doctorId: chat.doctorId, patientId: chat.patientId },
          ],
        },
        order: [['startTime', 'DESC']],
      });

      if (lastAppointment) {
        const daysSinceAppointment = Math.ceil(
          (new Date() - new Date(lastAppointment.startTime)) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceAppointment <= 30) {
          isFree = true;
          freeMessageReason = 'within_30_days';
        }
      }

      // If not free, check if it's the first message
      if (!isFree) {
        const messageCount = await models.Message.count({ where: { chatId: id } });
        if (messageCount === 0) {
          isFree = true;
          freeMessageReason = 'first_message';
        }
      }

      // If not free, check if doctor initiated
      if (!isFree && userId === chat.doctor.userId) {
        isFree = true;
        freeMessageReason = 'doctor_initiated';
      }

      // If not free, check balance and charge
      if (!isFree) {
        const hasBalance = await BalanceService.hasSufficientBalance(
          userId,
          process.env.MESSAGE_PRICE_RUB || 50,
          'RUB'
        );

        if (!hasBalance) {
          throw new AppError(
            'Insufficient balance. Please deposit funds to send paid messages.',
            402,
            'PAYMENT_REQUIRED'
          );
        }

        // Reserve balance
        const reserve = await BalanceService.reserve(
          userId,
          process.env.MESSAGE_PRICE_RUB || 50,
          'RUB',
          `message_${Date.now()}`
        );

        isPaid = true;
        isFree = false;
      }

      // Create message
      const message = await models.Message.create({
        chatId: id,
        senderId: userId,
        receiverId,
        content: content || '',
        type: type || 'text',
        priority: priority || 'normal',
        attachments: attachments || [],
        replyToId,
        status: 'sent',
        isEncrypted: true,
        isPaid,
        isFree,
        freeMessageReason,
        clientType,
        clientVersion,
      });

      // Update chat last message
      await chat.update({
        lastMessageId: message.id,
        lastMessageText: content,
        lastMessageSenderId: userId,
        lastMessageAt: new Date(),
        totalMessages: models.Sequelize.literal('totalMessages + 1'),
        firstMessageAt: chat.firstMessageAt || new Date(),
      });

      // Update unread count
      if (userId === chat.doctor.userId) {
        await chat.update({
          unreadCountPatient: models.Sequelize.literal('unreadCountPatient + 1'),
        });
      } else {
        await chat.update({
          unreadCountDoctor: models.Sequelize.literal('unreadCountDoctor + 1'),
        });
      }

      // If paid, commit the balance
      if (isPaid) {
        await BalanceService.commit(`message_${Date.now()}`);
        
        // Create transaction
        await models.Transaction.create({
          userId,
          type: 'message_payment',
          amount: process.env.MESSAGE_PRICE_RUB || 50,
          currency: 'RUB',
          paymentMethod: 'test_balance',
          status: 'completed',
          messageId: message.id,
          chatId: id,
          doctorId: chat.doctorId,
          patientId: chat.patientId,
          clinicId: chat.clinicId,
          doctorShare: (process.env.MESSAGE_PRICE_RUB || 50) * 0.8,
          clinicShare: (process.env.MESSAGE_PRICE_RUB || 50) * 0.2,
          description: `Message payment in chat ${chat.chatId}`,
        });
      }

      // Load full message
      const fullMessage = await models.Message.findByPk(message.id, {
        include: [
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.User, as: 'receiver', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.File, as: 'files' },
        ],
      });

      res.status(201).json(fullMessage);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark chat messages as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const { lastReadMessageId } = req.body;
      const userId = req.user.id;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Mark messages as read
      let where = { chatId: id };
      if (lastReadMessageId) {
        where.id = { [models.Sequelize.Op.lte]: lastReadMessageId };
      }

      await models.Message.update(
        {
          readBy: models.Sequelize.fn('array_append', models.Sequelize.col('readBy'), userId),
          status: 'read',
        },
        { where }
      );

      // Update unread count
      if (userId === chat.doctor.userId) {
        await chat.update({ unreadCountDoctor: 0 });
      } else {
        await chat.update({ unreadCountPatient: 0 });
      }

      res.json({ message: 'Messages marked as read successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat participants
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getParticipants(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const participants = await models.ChatParticipant.findAll({
        where: { chatId: id },
        include: [{ model: models.User, as: 'user' }],
      });

      res.json(participants);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat by chatId (for QR code)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getByChatId(req, res, next) {
    try {
      const { chatId } = req.params;

      const chat = await models.Chat.findOne({
        where: { chatId },
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate QR code for chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async generateQRCode(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin' && req.user.doctorId !== chat.doctorId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Generate QR code data
      const qrData = {
        type: 'chat',
        chatId: chat.chatId,
        doctorId: chat.doctorId,
        clinicId: chat.clinicId,
      };

      // In production, generate actual QR code image
      // For now, return the data
      res.json({
        qrData,
        chatId: chat.chatId,
        deepLink: `${process.env.FRONTEND_URL || 'https://medchat.ru'}/connect?chatId=${chat.chatId}`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat settings
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getSettings(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(chat.settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update chat settings
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async updateSettings(req, res, next) {
    try {
      const { id } = req.params;
      const { settings } = req.body;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const isParticipant = await models.ChatParticipant.findOne({
        where: { chatId: id, userId: req.user.id },
      });

      if (!isParticipant && req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      await chat.update({ settings });

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ChatController;
