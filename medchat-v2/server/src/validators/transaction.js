/**
 * Transaction Validators
 * Aligned with the Transaction model enums:
 * type: message_payment | file_payment | consultation_payment | subscription_payment |
 *       refund | withdrawal | deposit | payout | other
 * paymentMethod: test_balance | yoo_money | tinkoff | stripe | bank_card | bank_transfer |
 *                mobile_balance | cryptocurrency | other
 */

const Joi = require('joi');

// Create transaction schema (for system use)
const createTransactionSchema = Joi.object({
  userId: Joi.string().uuid().optional().allow(null),
  doctorId: Joi.string().uuid().optional().allow(null),
  patientId: Joi.string().uuid().optional().allow(null),
  clinicId: Joi.string().uuid().optional().allow(null),
  chatId: Joi.string().uuid().optional().allow(null),
  type: Joi.string().valid(
    'message_payment', 'file_payment', 'consultation_payment', 'subscription_payment',
    'refund', 'withdrawal', 'deposit', 'payout', 'other'
  ).required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().length(3).default('RUB'),
  paymentMethod: Joi.string().valid(
    'test_balance', 'yoo_money', 'tinkoff', 'stripe', 'bank_card', 'bank_transfer',
    'mobile_balance', 'cryptocurrency', 'other'
  ).default('test_balance'),
  description: Joi.string().max(500).optional().allow(null, ''),
  referenceId: Joi.string().max(255).optional().allow(null),
  metadata: Joi.object().optional(),
});

// List transactions schema
const listTransactionSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  userId: Joi.string().uuid().optional(),
  doctorId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  chatId: Joi.string().uuid().optional(),
  type: Joi.string().valid(
    'message_payment', 'file_payment', 'consultation_payment', 'subscription_payment',
    'refund', 'withdrawal', 'deposit', 'payout', 'other'
  ).optional(),
  status: Joi.string().valid(
    'pending', 'completed', 'failed', 'cancelled', 'refunded', 'disputed'
  ).optional(),
  paymentMethod: Joi.string().valid(
    'test_balance', 'yoo_money', 'tinkoff', 'stripe', 'bank_card', 'bank_transfer',
    'mobile_balance', 'cryptocurrency', 'other'
  ).optional(),
  currency: Joi.string().length(3).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
});

// Refund transaction schema
const refundTransactionSchema = Joi.object({
  transactionId: Joi.string().uuid().required(),
  amount: Joi.number().min(0.01).optional(),
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// Deposit schema (test balance)
const depositSchema = Joi.object({
  amount: Joi.number().min(1).max(100000).required(),
  currency: Joi.string().length(3).default('RUB'),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Withdraw schema
const withdrawSchema = Joi.object({
  amount: Joi.number().min(1).max(100000).required(),
  currency: Joi.string().length(3).default('RUB'),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Payout schema (doctor withdrawal)
const payoutSchema = Joi.object({
  amount: Joi.number().min(1).max(100000).required(),
  currency: Joi.string().length(3).default('RUB'),
  payoutMethod: Joi.string().valid(
    'test_balance', 'bank_card', 'bank_transfer', 'yoo_money'
  ).optional(),
  payoutDetails: Joi.object().optional(),
  description: Joi.string().max(200).optional().allow(null, ''),
});

// Transfer balance schema (between user accounts)
const transferSchema = Joi.object({
  recipientId: Joi.string().uuid().required(),
  amount: Joi.number().min(1).max(100000).required(),
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
  refundTransactionSchema,
  depositSchema,
  withdrawSchema,
  payoutSchema,
  transferSchema,
  balanceSchema,
};
