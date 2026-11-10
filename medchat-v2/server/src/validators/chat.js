/**
 * Chat Validators
 */

const Joi = require('joi');

// Create chat schema
const createChatSchema = Joi.object({
  doctorId: Joi.string().uuid().required(),
  patientId: Joi.string().uuid().required(),
  clinicId: Joi.string().uuid().optional().allow(null),
  type: Joi.string().valid('individual', 'group', 'consultation', 'followup').default('individual'),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  title: Joi.string().max(255).optional().allow(null, ''),
  settings: Joi.object({
    notificationsEnabled: Joi.boolean().default(true),
    soundEnabled: Joi.boolean().default(true),
    autoArchive: Joi.boolean().default(false),
    archiveAfterDays: Joi.number().min(1).max(365).default(30),
    fileUploadEnabled: Joi.boolean().default(true),
    maxFileSize: Joi.number().min(1).max(100).default(50),
  }).default({}),
  fileRetentionDays: Joi.number().min(1).max(30).default(3),
  createdBy: Joi.string().valid('doctor', 'patient', 'clinic', 'system').default('patient'),
});

// Update chat schema
const updateChatSchema = Joi.object({
  title: Joi.string().max(255).optional().allow(null, ''),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  status: Joi.string().valid('active', 'archived', 'closed', 'blocked', 'deleted').optional(),
  settings: Joi.object({
    notificationsEnabled: Joi.boolean().optional(),
    soundEnabled: Joi.boolean().optional(),
    autoArchive: Joi.boolean().optional(),
    archiveAfterDays: Joi.number().min(1).max(365).optional(),
    fileUploadEnabled: Joi.boolean().optional(),
    maxFileSize: Joi.number().min(1).max(100).optional(),
  }).optional(),
  fileRetentionDays: Joi.number().min(1).max(30).optional(),
  metadata: Joi.object().optional(),
});

// List chats schema
const listChatSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  type: Joi.string().valid('individual', 'group', 'consultation', 'followup').optional(),
  status: Joi.string().valid('active', 'archived', 'closed', 'blocked', 'deleted').optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  search: Joi.string().optional(),
});

// Chat settings schema
const chatSettingsSchema = Joi.object({
  notificationsEnabled: Joi.boolean().optional(),
  soundEnabled: Joi.boolean().optional(),
  autoArchive: Joi.boolean().optional(),
  archiveAfterDays: Joi.number().min(1).max(365).optional(),
  fileUploadEnabled: Joi.boolean().optional(),
  maxFileSize: Joi.number().min(1).max(100).optional(),
});

// Mark chat as read schema
const markChatAsReadSchema = Joi.object({
  lastReadMessageId: Joi.string().uuid().optional(),
});

module.exports = {
  createChatSchema,
  updateChatSchema,
  listChatSchema,
  chatSettingsSchema,
  markChatAsReadSchema,
};
