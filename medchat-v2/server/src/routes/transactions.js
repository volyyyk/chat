/**
 * Transaction Routes
 *
 * Specific paths (/balance, /payouts, /statistics, /doctor/:id, /clinic/:id)
 * are registered BEFORE /:id to avoid being captured by the id parameter.
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
  depositSchema,
  withdrawSchema,
  payoutSchema,
} = require('../validators/transaction');

// All routes require authentication
router.use(authenticate());

// Specific paths first
router.post('/refund', validate(refundTransactionSchema), TransactionController.refund);
router.get('/balance', TransactionController.getBalance);
router.post('/balance/deposit', validate(depositSchema), TransactionController.deposit);
router.post('/balance/withdraw', validate(withdrawSchema), TransactionController.withdraw);
router.post('/payouts', validate(payoutSchema), isDoctor(), TransactionController.createPayout);
router.get('/payouts', isDoctor(), TransactionController.listPayouts);
router.get('/statistics', TransactionController.getStatistics);
router.get('/doctor/:doctorId', isDoctor(), TransactionController.listByDoctor);
router.get('/clinic/:clinicId', authorize(['system_admin', 'clinic_admin']), TransactionController.listByClinic);

// CRUD
router.post('/', validate(createTransactionSchema), TransactionController.create);
router.get('/', validate(listTransactionSchema, 'query'), TransactionController.list);
router.get('/:id', TransactionController.getById);
router.post('/:id/cancel', TransactionController.cancel);

module.exports = router;
