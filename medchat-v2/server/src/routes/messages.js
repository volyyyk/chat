/**
 * Message Routes
 */

const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isSystemAdmin } = require('../middleware/auth');
const {
  createMessageSchema,
  updateMessageSchema,
  listMessageSchema,
  markMessageAsReadSchema,
  deleteMessageSchema,
  flagMessageSchema,
} = require('../validators/message');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/messages/{id}:
 *   get:
 *     summary: Get message by ID
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */
router.get('/:id', MessageController.getById);

/**
 * @swagger
 * /api/chats/{chatId}/messages:
 *   get:
 *     summary: List messages in chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [text, image, video, audio, file, system, payment, prescription, appointment, reminder]
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/chats/:chatId/messages', validate(listMessageSchema, 'query'), MessageController.list);

/**
 * @swagger
 * /api/messages/{id}:
 *   put:
 *     summary: Update message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMessageRequest'
 *     responses:
 *       200:
 *         description: Message updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */
router.put('/:id', validate(updateMessageSchema), MessageController.update);

/**
 * @swagger
 * /api/messages/{id}:
 *   delete:
 *     summary: Delete message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeleteMessageRequest'
 *     responses:
 *       200:
 *         description: Message deleted successfully
 */
router.delete('/:id', validate(deleteMessageSchema), MessageController.delete);

/**
 * @swagger
 * /api/messages/{id}/read:
 *   post:
 *     summary: Mark message as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message marked as read successfully
 */
router.post('/:id/read', MessageController.markAsRead);

/**
 * @swagger
 * /api/messages/read:
 *   post:
 *     summary: Mark multiple messages as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageIds
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 */
router.post('/read', validate(markMessageAsReadSchema), MessageController.markMultipleAsRead);

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: Get unread messages count
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread messages count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount:
 *                   type: integer
 */
router.get('/unread-count', MessageController.getUnreadCount);

/**
 * @swagger
 * /api/messages/search:
 *   get:
 *     summary: Search messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: chatId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/search', MessageController.search);

/**
 * @swagger
 * /api/messages/{id}/attachments:
 *   get:
 *     summary: Get message attachments
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of attachments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/File'
 */
router.get('/:id/attachments', MessageController.getAttachments);

/**
 * @swagger
 * /api/messages/encrypt:
 *   post:
 *     summary: Encrypt message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - receiverPublicKey
 *             properties:
 *               message:
 *                 type: string
 *               receiverPublicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Encrypted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/encrypt', MessageController.encryptMessage);

/**
 * @swagger
 * /api/messages/decrypt:
 *   post:
 *     summary: Decrypt message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - encryptedMessage
 *               - senderPublicKey
 *             properties:
 *               encryptedMessage:
 *                 type: object
 *               senderPublicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Decrypted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post('/decrypt', MessageController.decryptMessage);

/**
 * @swagger
 * /api/messages/{id}/flag:
 *   post:
 *     summary: Flag message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FlagMessageRequest'
 *     responses:
 *       200:
 *         description: Message flagged successfully
 */
router.post('/:id/flag', validate(flagMessageSchema), MessageController.flag);

/**
 * @swagger
 * /api/messages/flagged:
 *   get:
 *     summary: Get flagged messages (admin only)
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of flagged messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/flagged', isSystemAdmin(), MessageController.getFlagged);

module.exports = router;
