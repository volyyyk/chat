/**
 * Payment Validators
 */

const Joi = require('joi');

// Create payment schema
const createPaymentSchema = Joi.object({
  type: Joi.string().valid('message', 'file', 'package', 'deposit', 'subscription_payment').required(),
  amount: Joi.number().min(1).required(),
  currency: Joi.string().default('RUB'),
  description: Joi.string().max(500).optional(),
  referenceId: Joi.string().optional(),
  chatId: Joi.string().uuid().optional(),
  messageId: Joi.string().uuid().optional(),
  fileId: Joi.string().uuid().optional(),
});

// Process payment schema
const processPaymentSchema = Joi.object({
  type: Joi.string().valid('message', 'file', 'package', 'deposit').required(),
  amount: Joi.number().min(1).optional(),
  currency: Joi.string().default('RUB'),
  chatId: Joi.string().uuid().optional(),
  messageId: Joi.string().uuid().optional(),
  fileId: Joi.string().uuid().optional(),
  description: Joi.string().max(500).optional(),
});

// Check-free schema
const checkFreeSchema = Joi.object({
  chatId: Joi.string().required(),
});

// Payout schema
const payoutSchema = Joi.object({
  amount: Joi.number().min(1).required(),
  currency: Joi.string().default('RUB'),
  payoutMethod: Joi.string().valid('test_balance', 'yoomoney', 'tinkoff', 'card').default('test_balance'),
  payoutDetails: Joi.object().optional(),
  description: Joi.string().max(500).optional(),
});

module.exports = {
  createPaymentSchema,
  processPaymentSchema,
  checkFreeSchema,
  payoutSchema,
};
