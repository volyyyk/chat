/**
 * Message Controller
 * Handles message-related operations
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const CryptoService = require('../services/cryptoService');
const { canAccessChat, getAccessibleChatIds } = require('../utils/chatAccess');

class MessageController {
  /**
   * Get message by ID
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

      // Check access to the chat the message belongs to
      if (req.user.role !== 'system_admin') {
        const allowed = await canAccessChat(req.user, message.chat);
        if (!allowed && req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      }

      res.json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List messages in chat
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

      const allowed = await canAccessChat(req.user, chat);
      if (!allowed) {
        throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
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

      // Check if message can be edited (within 5 minutes)
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
   */
  static async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const message = await models.Message.findByPk(id);
      if (!message) {
        throw new AppError('Message not found', 404, 'NOT_FOUND');
      }

      if (req.user.role !== 'system_admin') {
        const chat = await models.Chat.findByPk(message.chatId);
        const allowed = await canAccessChat(req.user, chat);
        if (!allowed) {
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
   */
  static async markMultipleAsRead(req, res, next) {
    try {
      const { messageIds } = req.body;
      const userId = req.user.id;

      if (!messageIds || messageIds.length === 0) {
        throw new AppError('Message IDs are required', 400, 'VALIDATION_ERROR');
      }

      // Security: only messages addressed to this user can be marked read
      await models.Message.update(
        {
          readBy: models.Sequelize.fn('array_append', models.Sequelize.col('read_by'), userId),
          status: 'read',
        },
        { where: { id: messageIds, receiverId: userId } }
      );

      res.json({ message: 'Messages marked as read successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get unread messages count
   */
  static async getUnreadCount(req, res, next) {
    try {
      const userId = req.user.id;

      // Chats the user can access (participants + own doctor/patient chats)
      const chatIds = await getAccessibleChatIds(req.user);

      if (!chatIds.length) {
        return res.json({ unreadCount: 0 });
      }

      const unreadCount = await models.Message.count({
        where: {
          chatId: chatIds,
          senderId: { [models.Sequelize.Op.ne]: userId },
          status: { [models.Sequelize.Op.ne]: 'deleted' },
          // NOT (read_by @> [userId]). Op.notContains emits "read_by NOT @>"
          // which is invalid PostgreSQL syntax (500 on every call).
          [models.Sequelize.Op.not]: [
            { readBy: { [models.Sequelize.Op.contains]: [userId] } },
          ],
        },
      });

      res.json({ unreadCount });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search messages: Op.iLike '%query%' по content. Ускоряется GIN-индексом
   * pg_trgm (messages_content_trgm_idx, gin_trgm_ops; создаётся seed-скриптом,
   * см. src/seeds/testData.js). Честно: E2E-сообщения (content='') не ищутся -
   * plaintext у сервера отсутствует.
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
        const allowed = await canAccessChat(req.user, chat);
        if (!allowed) {
          throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
        }
      } else {
        // Search in all chats the user can access
        const chatIds = await getAccessibleChatIds(req.user);
        if (!chatIds.length) {
          return res.json({
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          });
        }
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

      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          const chat = await models.Chat.findByPk(message.chatId);
          const allowed = await canAccessChat(req.user, chat);
          if (!allowed) {
            throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
          }
        }
      }

      res.json(message.files);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Encrypt message for sending
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

      if (req.user.role !== 'system_admin') {
        if (req.user.id !== message.senderId && req.user.id !== message.receiverId) {
          const chat = await models.Chat.findByPk(message.chatId);
          const allowed = await canAccessChat(req.user, chat);
          if (!allowed) {
            throw new AppError('Access denied', 403, 'AUTHORIZATION_ERROR');
          }
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
          { model: models.User, as: 'sender', attributes: ['id', 'firstName', 'lastName'] },
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
