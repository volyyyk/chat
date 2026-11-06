/**
 * Transaction Validators
 */

const Joi = require('joi');

// Create transaction schema (for system use)
const createTransactionSchema = Joi.object({
  userId: Joi.string().uuid().optional().allow(null),
  doctorId: Joi.string().uuid().optional().allow(null),
  patientId: Joi.string().uuid().optional().allow(null),
  clinicId: Joi.string().uuid().optional().allow(null),
  type: Joi.string().valid(
    'message_payment', 'consultation_payment', 'subscription_payment',
    'refund', 'withdrawal', 'deposit', 'payout', 'other'
  ).required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('RUB'),
  paymentMethod: Joi.string().valid(
    'yoo_money', 'tinkoff', 'stripe', 'bank_card', 'bank_transfer',
    'mobile_balance', 'cryptocurrency', 'test_balance', 'other'
  ).default('test_balance'),
  messageId: Joi.string().uuid().optional().allow(null),
  chatId: Joi.string().uuid().optional().allow(null),
  appointmentId: Joi.string().uuid().optional().allow(null),
  description: Joi.string().max(500).optional().allow(null, ''),
  metadata: Joi.object().optional().default({}),
});

// List transactions schema
const listTransactionSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  userId: Joi.string().uuid().optional(),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  type: Joi.string().valid(
    'message_payment', 'consultation_payment', 'subscription_payment',
    'refund', 'withdrawal', 'deposit', 'payout', 'other'
  ).optional(),
  status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled', 'refunded', 'disputed').optional(),
  paymentMethod: Joi.string().valid(
    'yoo_money', 'tinkoff', 'stripe', 'bank_card', 'bank_transfer',
    'mobile_balance', 'cryptocurrency', 'test_balance', 'other'
  ).optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
});

// Deposit to balance schema (test balance)
const depositSchema = Joi.object({
  amount: Joi.number().min(1).max(10000).required(),
  currency: Joi.string().length(3).default('RUB'),
  paymentMethod: Joi.string().valid('test_balance').default('test_balance'),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Withdraw from balance schema
const withdrawSchema = Joi.object({
  amount: Joi.number().min(1).max(10000).required(),
  currency: Joi.string().length(3).default('RUB'),
  paymentMethod: Joi.string().valid('yoo_money', 'tinkoff', 'stripe', 'bank_card', 'bank_transfer').optional(),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Transfer balance schema (between user accounts)
const transferSchema = Joi.object({
  recipientId: Joi.string().uuid().required(),
  amount: Joi.number().min(1).max(10000).required(),
  currency: Joi.string().length(3).default('RUB'),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Get balance schema
const balanceSchema = Joi.object({
  currency: Joi.string().length(3).default('RUB'),
});

module.exports = {
  createTransactionSchema,
  listTransactionSchema,
  depositSchema,
  withdrawSchema,
  transferSchema,
  balanceSchema,
};
