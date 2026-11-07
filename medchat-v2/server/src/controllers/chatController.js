/**
 * Chat Controller
 * Handles chat-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');
const PaymentService = require('../services/paymentService');
const { canAccessChat } = require('../utils/chatAccess');

const CHAT_INCLUDE = [
  { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
  { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
  { model: models.Clinic, as: 'clinic' },
];

class ChatController {
  /**
   * Create new chat
   */
  static async create(req, res, next) {
    try {
      const { doctorId, patientId, clinicId, type, priority, title, settings, fileRetentionDays, createdBy } = req.body;
      const userId = req.user.id;

      // Validate participants
      const doctor = await models.Doctor.findByPk(doctorId, {
        include: [{ model: models.User, as: 'user' }],
      });
      if (!doctor) {
        throw new AppError('Doctor not found', 404, 'NOT_FOUND');
      }

      const patient = await models.Patient.findByPk(patientId, {
        include: [{ model: models.User, as: 'user' }],
      });
      if (!patient) {
        throw new AppError('Patient not found', 404, 'NOT_FOUND');
      }

      // Check if chat already exists between this doctor and patient
      const existingChat = await models.Chat.findOne({
        where: { doctorId, patientId },
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
      const fullChat = await models.Chat.findByPk(chat.id, { include: CHAT_INCLUDE });

      res.status(201).json(fullChat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id, { include: CHAT_INCLUDE });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List chats
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
      // (prefer the clinic linked to the user account, fall back to adminId)
      if (req.user.role === 'clinic_admin') {
        let clinicId = req.user.clinicId;
        if (!clinicId) {
          const clinic = await models.Clinic.findOne({ where: { adminId: req.user.id } });
          clinicId = clinic ? clinic.id : null;
        }
        if (clinicId) where.clinicId = clinicId;
      }

      const chats = await models.Chat.findAndCountAll({
        where,
        include: CHAT_INCLUDE,
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
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Never allow participants to overwrite accounting fields directly
      delete data.totalMessages;
      delete data.totalPaidMessages;
      delete data.totalFreeMessages;

      await chat.update(data);

      const fullChat = await models.Chat.findByPk(chat.id, { include: CHAT_INCLUDE });
      res.json(fullChat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete chat
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
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

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
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

      // Mark messages as delivered for this user (best-effort)
      try {
        await models.Message.update(
          { deliveredTo: models.Sequelize.fn('array_append', models.Sequelize.col('deliveredTo'), req.user.id) },
          { where: { chatId: id, senderId: { [models.Sequelize.Op.ne]: req.user.id }, deliveredTo: { [models.Sequelize.Op.notContains]: [req.user.id] } } }
        );
      } catch (e) {
        // non-fatal
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
   * Send message to chat.
   * Payment flow:
   *  1) If body.paymentTransactionId is passed: it must be a completed message_payment
   *     transaction of this user that has not been used by any message yet.
   *     The message is marked paid without charging again (no double charge).
   *  2) Otherwise the free/paid status is resolved via PaymentService.
   *     Paid messages are charged atomically from the test balance; if the
   *     balance is insufficient, a 402 PAYMENT_REQUIRED error is returned.
   */
  static async sendMessage(req, res, next) {
    try {
      const { id } = req.params;
      const {
        content, type, priority, attachments, replyToId,
        clientType, clientVersion, paymentTransactionId,
      } = req.body;
      const userId = req.user.id;

      const chat = await models.Chat.findByPk(id, { include: CHAT_INCLUDE });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      // Check access
      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Determine receiver
      const doctorUserId = chat.doctor && chat.doctor.userId;
      const patientUserId = chat.patient && chat.patient.userId;
      const receiverId = userId === doctorUserId ? patientUserId : doctorUserId;

      let isPaid = false;
      let isFree = true;
      let freeMessageReason = null;
      let usedTransaction = null;

      if (paymentTransactionId) {
        // Pre-paid message (payment was already processed via /api/payments/process)
        const transaction = await models.Transaction.findOne({
          where: {
            id: paymentTransactionId,
            userId,
            status: 'completed',
            type: 'message_payment',
          },
        });

        if (!transaction) {
          throw new AppError('Payment transaction not found', 404, 'TRANSACTION_NOT_FOUND');
        }

        const alreadyUsed = await models.Message.count({
          where: { paymentTransactionId },
        });
        if (alreadyUsed > 0) {
          throw new AppError('Payment transaction has already been used', 409, 'TRANSACTION_ALREADY_USED');
        }

        usedTransaction = transaction;
        isPaid = true;
        isFree = false;
      } else {
        const resolution = await PaymentService.resolveMessageFree(userId, chat);
        isFree = resolution.isFree;
        freeMessageReason = resolution.reason;

        if (!isFree) {
          const charge = await PaymentService.chargeMessagePayment(userId, chat, {
            description: `Message payment in chat ${chat.chatId}`,
          });

          if (!charge.success) {
            throw new AppError(
              'Insufficient balance. Please deposit funds to send paid messages.',
              402,
              'PAYMENT_REQUIRED'
            );
          }

          usedTransaction = charge.transaction;
          isPaid = true;
        }
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
        isEncrypted: false,
        isPaid,
        isFree,
        freeMessageReason,
        paymentTransactionId: usedTransaction ? usedTransaction.id : null,
        paymentAmount: isPaid ? Number(usedTransaction ? usedTransaction.amount : 0) : 0,
        clientType,
        clientVersion,
      });

      // Link transaction to the message (for the charge path)
      if (usedTransaction && !usedTransaction.messageId) {
        await usedTransaction.update({ messageId: message.id }).catch(() => {});
      }

      // Link uploaded attachment files to the message (best-effort) so that
      // the "files" include on the reloaded message populates for both sides.
      if (Array.isArray(attachments) && attachments.length > 0) {
        await models.File.update(
          { messageId: message.id },
          { where: { id: { [models.Sequelize.Op.in]: attachments } } }
        ).catch(() => {});
      }

      // Update chat last message + unread counters in one atomic update
      const unreadUpdate = userId === doctorUserId
        ? { unreadCountPatient: models.Sequelize.literal('unreadCountPatient + 1') }
        : { unreadCountDoctor: models.Sequelize.literal('unreadCountDoctor + 1') };

      await chat.update({
        lastMessageId: message.id,
        lastMessageText: content || '',
        lastMessageSenderId: userId,
        lastMessageAt: new Date(),
        totalMessages: models.Sequelize.literal('totalMessages + 1'),
        firstMessageAt: chat.firstMessageAt || new Date(),
        ...(isPaid
          ? {
              totalPaidMessages: models.Sequelize.literal('totalPaidMessages + 1'),
              lastPaidMessageAt: new Date(),
            }
          : { totalFreeMessages: models.Sequelize.literal('totalFreeMessages + 1') }),
        ...unreadUpdate,
      });

      // Load full message
      const fullMessage = await models.Message.findByPk(message.id, {
        include: [
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.User, as: 'receiver', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.File, as: 'files' },
        ],
      });

      // Real-time delivery via Socket.IO (best-effort)
      try {
        const io = req.app.get('io');
        if (io) {
          const messageJson = fullMessage.toJSON();
          io.to('chat:' + id).emit('newMessage', messageJson);
          if (receiverId) {
            io.to('user:' + receiverId).emit('newMessage', messageJson);
          }
          io.to('chat:' + id).emit('chatUpdated', {
            chatId: id,
            lastMessageText: fullMessage.content,
            lastMessageAt: fullMessage.createdAt,
            senderId: userId,
          });
        }
      } catch (e) {
        // Socket.IO not configured - ignore
      }

      res.status(201).json(fullMessage);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark chat messages as read
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

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Mark other users' messages as read
      const where = { chatId: id, senderId: { [models.Sequelize.Op.ne]: userId } };
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

      // Update unread counter for the reading side
      if (req.user.doctorId && req.user.doctorId === chat.doctorId) {
        await chat.update({ unreadCountDoctor: 0 });
      } else if (req.user.patientId && req.user.patientId === chat.patientId) {
        await chat.update({ unreadCountPatient: 0 });
      }

      res.json({ message: 'Messages marked as read successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat participants
   */
  static async getParticipants(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const participants = await models.ChatParticipant.findAll({
        where: { chatId: id },
        include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'avatar', 'role'] }],
      });

      res.json(participants);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat by chatId (for QR code)
   */
  static async getByChatId(req, res, next) {
    try {
      const { chatId } = req.params;

      const chat = await models.Chat.findOne({
        where: { chatId },
        include: CHAT_INCLUDE,
      });

      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(chat);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate QR code data for chat
   */
  static async generateQRCode(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Generate QR code data
      const qrData = {
        type: 'chat',
        chatId: chat.chatId,
        doctorId: chat.doctorId,
        clinicId: chat.clinicId,
      };

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
   */
  static async getSettings(req, res, next) {
    try {
      const { id } = req.params;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      res.json(chat.settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update chat settings
   */
  static async updateSettings(req, res, next) {
    try {
      const { id } = req.params;
      const { settings } = req.body;

      const chat = await models.Chat.findByPk(id);
      if (!chat) {
        throw new AppError('Chat not found', 404, 'NOT_FOUND');
      }

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
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
