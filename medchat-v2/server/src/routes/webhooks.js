/**
 * Webhook Routes
 * Handles incoming webhooks from external services
 */

const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhookController');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * /api/webhooks/payment:
 *   post:
 *     summary: Payment webhook (YooMoney, Tinkoff, etc.)
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/payment', WebhookController.handlePaymentWebhook);

/**
 * @swagger
 * /api/webhooks/sms:
 *   post:
 *     summary: SMS delivery webhook
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/sms', WebhookController.handleSMSWebhook);

/**
 * @swagger
 * /api/webhooks/email:
 *   post:
 *     summary: Email delivery webhook
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/email', WebhookController.handleEmailWebhook);

/**
 * @swagger
 * /api/webhooks/backup:
 *   post:
 *     summary: Backup service webhook
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/backup', authenticate(), WebhookController.handleBackupWebhook);

/**
 * @swagger
 * /api/webhooks/test:
 *   post:
 *     summary: Test webhook endpoint
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Test successful
 */
router.post('/test', WebhookController.handleTestWebhook);

module.exports = router;
