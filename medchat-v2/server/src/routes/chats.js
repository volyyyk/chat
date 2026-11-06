/**
 * Chat Routes
 */

const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chatController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor, isPatient } = require('../middleware/auth');
const {
  createChatSchema,
  updateChatSchema,
  listChatSchema,
  chatSettingsSchema,
  markChatAsReadSchema,
} = require('../validators/chat');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/chats:
 *   post:
 *     summary: Create new chat
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateChatRequest'
 *     responses:
 *       201:
 *         description: Chat created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 */
router.post('/', validate(createChatSchema), ChatController.create);

/**
 * @swagger
 * /api/chats:
 *   get:
 *     summary: List chats
 *     tags: [Chats]
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
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [individual, group, consultation, followup]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, closed, blocked, deleted]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of chats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chat'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/', validate(listChatSchema, 'query'), ChatController.list);

/**
 * @swagger
 * /api/chats/{id}:
 *   get:
 *     summary: Get chat by ID
 *     tags: [Chats]
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
 *         description: Chat details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 */
router.get('/:id', ChatController.getById);

/**
 * @swagger
 * /api/chats/{id}:
 *   put:
 *     summary: Update chat
 *     tags: [Chats]
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
 *             $ref: '#/components/schemas/UpdateChatRequest'
 *     responses:
 *       200:
 *         description: Chat updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 */
router.put('/:id', validate(updateChatSchema), ChatController.update);

/**
 * @swagger
 * /api/chats/{id}:
 *   delete:
 *     summary: Delete chat
 *     tags: [Chats]
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
 *         description: Chat deleted successfully
 */
router.delete('/:id', ChatController.delete);

/**
 * @swagger
 * /api/chats/{id}/messages:
 *   get:
 *     summary: Get chat messages
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
router.get('/:id/messages', ChatController.getMessages);

/**
 * @swagger
 * /api/chats/{id}/messages:
 *   post:
 *     summary: Send message to chat
 *     tags: [Chats]
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
 *             $ref: '#/components/schemas/CreateMessageRequest'
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 */
router.post('/:id/messages', ChatController.sendMessage);

/**
 * @swagger
 * /api/chats/{id}/read:
 *   post:
 *     summary: Mark chat messages as read
 *     tags: [Chats]
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
 *             $ref: '#/components/schemas/MarkChatAsReadRequest'
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 */
router.post('/:id/read', validate(markChatAsReadSchema), ChatController.markAsRead);

/**
 * @swagger
 * /api/chats/{id}/participants:
 *   get:
 *     summary: Get chat participants
 *     tags: [Chats]
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
 *         description: List of participants
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatParticipant'
 */
router.get('/:id/participants', ChatController.getParticipants);

/**
 * @swagger
 * /api/chats/by-chatid/{chatId}:
 *   get:
 *     summary: Get chat by chatId (for QR code)
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 */
router.get('/by-chatid/:chatId', ChatController.getByChatId);

/**
 * @swagger
 * /api/chats/{id}/qrcode:
 *   get:
 *     summary: Generate QR code for chat
 *     tags: [Chats]
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
 *         description: QR code data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrData:
 *                   type: object
 *                 chatId:
 *                   type: string
 *                 deepLink:
 *                   type: string
 */
router.get('/:id/qrcode', isDoctor(), ChatController.generateQRCode);

/**
 * @swagger
 * /api/chats/{id}/settings:
 *   get:
 *     summary: Get chat settings
 *     tags: [Chats]
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
 *         description: Chat settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/:id/settings', ChatController.getSettings);

/**
 * @swagger
 * /api/chats/{id}/settings:
 *   put:
 *     summary: Update chat settings
 *     tags: [Chats]
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
 *             $ref: '#/components/schemas/ChatSettingsRequest'
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Chat'
 */
router.put('/:id/settings', validate(chatSettingsSchema), ChatController.updateSettings);

module.exports = router;
