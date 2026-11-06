/**
 * Payment Routes
 * Handles payment-related operations (test balance only per user request)
 */

const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/paymentController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createPaymentSchema,
  processPaymentSchema,
  payoutSchema,
} = require('../validators/payment');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/payments/methods:
 *   get:
 *     summary: Get available payment methods
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payment methods
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PaymentMethod'
 */
router.get('/methods', PaymentController.getPaymentMethods);

/**
 * @swagger
 * /api/payments/pricing:
 *   get:
 *     summary: Get pricing information
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pricing information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PricingInfo'
 */
router.get('/pricing', PaymentController.getPricing);

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/', validate(createPaymentSchema), PaymentController.create);

/**
 * @swagger
 * /api/payments/process:
 *   post:
 *     summary: Process payment for message or file
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessPaymentRequest'
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transaction:
 *                   $ref: '#/components/schemas/Transaction'
 *                 revenueSplit:
 *                   type: object
 */
router.post('/process', validate(processPaymentSchema), PaymentController.process);

/**
 * @swagger
 * /api/payments/check-free:
 *   post:
 *     summary: Check if message is free
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chatId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Free check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isFree:
 *                   type: boolean
 *                 reason:
 *                   type: string
 */
router.post('/check-free', PaymentController.checkFree);

/**
 * @swagger
 * /api/payments/payouts:
 *   post:
 *     summary: Create payout (doctor withdrawal)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PayoutRequest'
 *     responses:
 *       201:
 *         description: Payout created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/payouts', validate(payoutSchema), isDoctor(), PaymentController.createPayout);

/**
 * @swagger
 * /api/payments/doctor/balance:
 *   get:
 *     summary: Get doctor balance
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: number
 *                 reserved:
 *                   type: number
 *                 total:
 *                   type: number
 *                 currency:
 *                   type: string
 */
router.get('/doctor/balance', isDoctor(), PaymentController.getDoctorBalance);

/**
 * @swagger
 * /api/payments/doctor/transactions:
 *   get:
 *     summary: Get doctor transactions
 *     tags: [Payments]
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
 *         description: List of doctor transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/doctor/transactions', isDoctor(), PaymentController.getDoctorTransactions);

/**
 * @swagger
 * /api/payments/clinic/balance:
 *   get:
 *     summary: Get clinic balance
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clinic balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: number
 *                 reserved:
 *                   type: number
 *                 total:
 *                   type: number
 *                 currency:
 *                   type: string
 */
router.get('/clinic/balance', authorize(['admin', 'clinic_admin']), PaymentController.getClinicBalance);

/**
 * @swagger
 * /api/payments/statistics:
 *   get:
 *     summary: Get payment statistics
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Payment statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/statistics', PaymentController.getStatistics);

module.exports = router;
