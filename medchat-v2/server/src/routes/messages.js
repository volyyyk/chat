/**
 * Message Routes
 *
 * IMPORTANT: specific single-segment paths (/unread-count, /search, /flagged)
 * must be registered BEFORE /:id, otherwise Express matches them as /:id.
 */

const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { validate } = require('../middleware/validation');
const { authenticate, isSystemAdmin } = require('../middleware/auth');
const {
  updateMessageSchema,
  listMessageSchema,
  markMessageAsReadSchema,
  deleteMessageSchema,
  flagMessageSchema,
} = require('../validators/message');

// All routes require authentication
router.use(authenticate());

// Specific paths first
router.get('/chats/:chatId/messages', validate(listMessageSchema, 'query'), MessageController.list);
router.post('/read', validate(markMessageAsReadSchema), MessageController.markMultipleAsRead);
router.get('/unread-count', MessageController.getUnreadCount);
router.get('/search', MessageController.search);
router.get('/flagged', isSystemAdmin(), MessageController.getFlagged);
router.post('/encrypt', MessageController.encryptMessage);
router.post('/decrypt', MessageController.decryptMessage);

// Parameterized paths
router.get('/:id', MessageController.getById);
router.put('/:id', validate(updateMessageSchema), MessageController.update);
router.delete('/:id', validate(deleteMessageSchema), MessageController.delete);
router.post('/:id/read', MessageController.markAsRead);
router.get('/:id/attachments', MessageController.getAttachments);
router.post('/:id/flag', validate(flagMessageSchema), MessageController.flag);

module.exports = router;
