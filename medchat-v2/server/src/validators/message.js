/**
 * Message Validators
 */

const Joi = require('joi');

// Create message schema
const createMessageSchema = Joi.object({
  chatId: Joi.string().uuid().required(),
  content: Joi.string().max(10000).optional().allow(null, ''),
  type: Joi.string().valid('text', 'image', 'video', 'audio', 'file', 'system', 'payment', 'prescription', 'appointment', 'reminder').default('text'),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  attachments: Joi.array().items(Joi.string().uuid()).default([]),
  replyToId: Joi.string().uuid().optional().allow(null),
  metadata: Joi.object().optional().default({}),
  clientType: Joi.string().valid('mobile', 'web', 'desktop').optional(),
  clientVersion: Joi.string().max(50).optional().allow(null, ''),
  // Pre-paid message: transaction from /api/payments/process,
  // prevents double charging when sending
  paymentTransactionId: Joi.string().uuid().optional().allow(null),
});

// Update message schema
const updateMessageSchema = Joi.object({
  content: Joi.string().max(10000).optional().allow(null, ''),
  metadata: Joi.object().optional(),
});

// List messages schema
const listMessageSchema = Joi.object({
  chatId: Joi.string().uuid().required(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(50),
  before: Joi.string().uuid().optional(),
  after: Joi.string().uuid().optional(),
  type: Joi.string().valid('text', 'image', 'video', 'audio', 'file', 'system', 'payment', 'prescription', 'appointment', 'reminder').optional(),
});

// Mark message as read schema
const markMessageAsReadSchema = Joi.object({
  messageIds: Joi.array().items(Joi.string().uuid()).optional(),
});

// Delete message schema
const deleteMessageSchema = Joi.object({
  reason: Joi.string().max(255).optional().allow(null, ''),
});

// Flag message schema
const flagMessageSchema = Joi.object({
  reason: Joi.string().max(255).required(),
});

module.exports = {
  createMessageSchema,
  updateMessageSchema,
  listMessageSchema,
  markMessageAsReadSchema,
  deleteMessageSchema,
  flagMessageSchema,
};
