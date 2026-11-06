/**
 * Message Controller
 * Handles message-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');

class MessageController {
  /**
   * Get message by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const message = await models.Message.findByPk(id, {
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.User, as: 'receiver', attributes: ['id', 'firstName', 'lastName', 'avatar'] },
          { model: models.File, as: 'files' },
          { model: models.Message, as: 'replyTo' },
        ],
      });

      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          // Check if user is in the chat
          const chat = await models.Chat.findByPk(message.chatId);
          if (!chat || (req.user.id !== chat.doctorId && req.user.id !== chat.patientId)) {
            throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
          }
        }
      }

      res.json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List messages in chat
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async list(req, res, next) {
    try {
      const { chatId } = req.params;
      const { page = 1, limit = 50, before, after, type } = req.query;
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
   * Update message
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async update(req, res, next) {
    try {
      const { id } = req.params;
      const { content, metadata } = req.body;

      const message = await models.Message.findByPk(id);
      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access (sender or system admin)
      if (req.user.role !== 'system_admin' && req.user.id !== message.senderId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Check if message can be edited (e.g., within 5 minutes)
      const now = new Date();
      const createdAt = new Date(message.createdAt);
      const diffMinutes = (now - createdAt) / (1000 * 60);
      
      if (diffMinutes > 5) {
        throw new AppError('Message cannot be edited after 5 minutes', 400, 'VALIDATION_ERROR');
      }

      await message.update({ content, metadata });

      res.json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete message
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async delete(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const message = await models.Message.findByPk(id);
      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access (sender, receiver, or system admin)
      if (req.user.role !== 'system_admin' && 
          req.user.id !== message.senderId && 
          req.user.id !== message.receiverId) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      // Soft delete
      await message.update({
        status: 'deleted',
        content: '[Message deleted]',
      });

      res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark message as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const message = await models.Message.findByPk(id);
      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      // Mark as read
      const readBy = message.readBy || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await message.update({ readBy, status: 'read' });
      }

      res.json({ message: 'Message marked as read successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark multiple messages as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async markMultipleAsRead(req, res, next) {
    try {
      const { messageIds } = req.body;
      const userId = req.user.id;

      if (!messageIds || messageIds.length === 0) {
        throw new AppError('Message IDs are required', 400, 'VALIDATION_ERROR');
      }

      // Mark messages as read
      await models.Message.update(
        {
          readBy: models.Sequelize.fn('array_append', models.Sequelize.col('readBy'), userId),
          status: 'read',
        },
        { where: { id: messageIds } }
      );

      res.json({ message: 'Messages marked as read successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get unread messages count
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;

      // Get chats where user is a participant
      const participantChats = await models.ChatParticipant.findAll({
        where: { userId },
        attributes: ['chatId'],
      });
      const chatIds = participantChats.map((p) => p.chatId);

      // Count unread messages
      const unreadCount = await models.Message.count({
        where: {
          chatId: chatIds,
          readBy: { [models.Sequelize.Op.notContains]: [userId] },
          senderId: { [models.Sequelize.Op.ne]: userId },
          status: { [models.Sequelize.Op.ne]: 'deleted' },
        },
      });

      res.json({ unreadCount });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search messages
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async search(req, res, next) {
    try {
      const { chatId, query, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      if (!query || query.length < 2) {
        throw new AppError('Search query must be at least 2 characters long', 400, 'VALIDATION_ERROR');
      }

      const where = {
        content: { [models.Sequelize.Op.iLike]: `%${query}%` },
        status: { [models.Sequelize.Op.ne]: 'deleted' },
      };

      if (chatId) {
        where.chatId = chatId;
        
        // Check access to chat
        const chat = await models.Chat.findByPk(chatId);
        if (!chat) {
          throw new AppError('Chat not found', 404, 'NOT_FOUND');
        }
        if (req.user.role !== 'system_admin') {
          if (req.user.id !== chat.doctorId && req.user.id !== chat.patientId) {
            throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
          }
        }
      } else {
        // Search in all user's chats
        const participantChats = await models.ChatParticipant.findAll({
          where: { userId: req.user.id },
          attributes: ['chatId'],
        });
        const chatIds = participantChats.map((p) => p.chatId);
        where.chatId = chatIds;
      }

      const messages = await models.Message.findAndCountAll({
        where,
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: messages.rows,
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
   * Get message attachments
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getAttachments(req, res, next) {
    try {
      const { id } = req.params;

      const message = await models.Message.findByPk(id, {
        include: [{ model: models.File, as: 'files' }],
      });

      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      res.json(message.files);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Encrypt message for sending
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async encryptMessage(req, res, next) {
    try {
      const { message, receiverPublicKey } = req.body;
      const senderPrivateKey = req.user.privateKey;

      if (!message || !receiverPublicKey || !senderPrivateKey) {
        throw new AppError('Message, receiver public key, and sender private key are required', 400, 'VALIDATION_ERROR');
      }

      const encrypted = CryptoService.createEncryptedMessagePackage(
        message,
        senderPrivateKey,
        receiverPublicKey
      );

      res.json(encrypted);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Decrypt message
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async decryptMessage(req, res, next) {
    try {
      const { encryptedMessage, senderPublicKey } = req.body;
      const receiverPrivateKey = req.user.privateKey;

      if (!encryptedMessage || !senderPublicKey || !receiverPrivateKey) {
        throw new AppError('Encrypted message, sender public key, and receiver private key are required', 400, 'VALIDATION_ERROR');
      }

      const decrypted = CryptoService.decryptMessagePackage(
        encryptedMessage,
        receiverPrivateKey,
        senderPublicKey
      );

      res.json({ message: decrypted });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Flag message
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async flag(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const message = await models.Message.findByPk(id);
      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      // Check access
      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      await message.update({
        isFlagged: true,
        flagReason: reason,
        flaggedBy: userId,
        flaggedAt: new Date(),
      });

      res.json({ message: 'Message flagged successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get flagged messages (admin only)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  static async getFlagged(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      if (req.user.role !== 'system_admin') {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
      }

      const messages = await models.Message.findAndCountAll({
        where: { isFlagged: true },
        include: [
          { model: models.Chat, as: 'chat' },
          { model: models.User, as: 'sender' },
          { model: models.User, as: 'flaggedByUser', foreignKey: 'flaggedBy' },
        ],
        order: [['flaggedAt', 'DESC']],
        offset,
        limit,
      });

      res.json({
        data: messages.rows,
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
}

module.exports = MessageController;
