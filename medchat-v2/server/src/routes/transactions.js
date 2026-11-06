/**
 * Transaction Routes
 */

const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, isDoctor } = require('../middleware/auth');
const {
  createTransactionSchema,
  listTransactionSchema,
  refundTransactionSchema,
  payoutSchema,
} = require('../validators/transaction');

// All routes require authentication
router.use(authenticate());

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create transaction (test balance or real payment)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTransactionRequest'
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/', validate(createTransactionSchema), TransactionController.create);

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: List transactions
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: chatId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, message_payment, file_payment, subscription, payout, refund]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled, refunded]
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *           enum: [test_balance, yoomoney, tinkoff, card, mobile]
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           default: RUB
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
 *         description: List of transactions
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
router.get('/', validate(listTransactionSchema, 'query'), TransactionController.list);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     tags: [Transactions]
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
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.get('/:id', TransactionController.getById);

/**
 * @swagger
 * /api/transactions/{id}/cancel:
 *   post:
 *     summary: Cancel transaction
 *     tags: [Transactions]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/:id/cancel', TransactionController.cancel);

/**
 * @swagger
 * /api/transactions/refund:
 *   post:
 *     summary: Refund transaction
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefundTransactionRequest'
 *     responses:
 *       200:
 *         description: Transaction refunded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/refund', validate(refundTransactionSchema), TransactionController.refund);

/**
 * @swagger
 * /api/transactions/balance:
 *   get:
 *     summary: Get user balance
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           default: RUB
 *     responses:
 *       200:
 *         description: User balance
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
router.get('/balance', TransactionController.getBalance);

/**
 * @swagger
 * /api/transactions/balance/deposit:
 *   post:
 *     summary: Deposit to balance (test balance)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               currency:
 *                 type: string
 *                 default: RUB
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Deposit successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/balance/deposit', TransactionController.deposit);

/**
 * @swagger
 * /api/transactions/balance/withdraw:
 *   post:
 *     summary: Withdraw from balance
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               currency:
 *                 type: string
 *                 default: RUB
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Withdrawal successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 */
router.post('/balance/withdraw', TransactionController.withdraw);

/**
 * @swagger
 * /api/transactions/payouts:
 *   post:
 *     summary: Create payout (doctor withdrawal)
 *     tags: [Transactions]
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
router.post('/payouts', validate(payoutSchema), isDoctor(), TransactionController.createPayout);

/**
 * @swagger
 * /api/transactions/payouts:
 *   get:
 *     summary: List payouts
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, cancelled]
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
 *         description: List of payouts
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
router.get('/payouts', isDoctor(), TransactionController.listPayouts);

/**
 * @swagger
 * /api/transactions/doctor/{doctorId}:
 *   get:
 *     summary: Get doctor transactions
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, message_payment, file_payment, subscription, payout, refund]
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
 *         description: List of transactions
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
router.get('/doctor/:doctorId', isDoctor(), TransactionController.listByDoctor);

/**
 * @swagger
 * /api/transactions/clinic/{clinicId}:
 *   get:
 *     summary: Get clinic transactions (admin only)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clinicId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deposit, withdrawal, message_payment, file_payment, subscription, payout, refund]
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
 *         description: List of transactions
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
router.get('/clinic/:clinicId', authorize(['admin', 'clinic_admin']), TransactionController.listByClinic);

/**
 * @swagger
 * /api/transactions/statistics:
 *   get:
 *     summary: Get transaction statistics
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: clinicId
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: Transaction statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTransactions:
 *                   type: number
 *                 totalAmount:
 *                   type: number
 *                 byType:
 *                   type: object
 *                 byDay:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/statistics', TransactionController.getStatistics);

module.exports = router;
