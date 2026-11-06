/**
 * Reminder Validators
 */

const Joi = require('joi');

// Create reminder schema
const createReminderSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().optional().allow(null),
  patientId: Joi.string().uuid().optional().allow(null),
  type: Joi.string().valid('appointment', 'medication', 'consultation', 'followup', 'custom', 'other').required(),
  title: Joi.string().min(2).max(255).required(),
  message: Joi.string().max(1000).required(),
  scheduledAt: Joi.date().required(),
  triggerAt: Joi.date().required(),
  relatedId: Joi.string().uuid().optional().allow(null),
  relatedType: Joi.string().valid(
    'appointment', 'message', 'chat', 'eprescription', 'patient', 'doctor', 'custom'
  ).optional(),
  repeat: Joi.boolean().default(false),
  repeatInterval: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').optional(),
  repeatCount: Joi.number().min(1).max(365).optional(),
  isActive: Joi.boolean().default(true),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
});

// Update reminder schema
const updateReminderSchema = Joi.object({
  title: Joi.string().min(2).max(255).optional(),
  message: Joi.string().max(1000).optional(),
  scheduledAt: Joi.date().optional(),
  triggerAt: Joi.date().optional(),
  relatedId: Joi.string().uuid().optional().allow(null),
  relatedType: Joi.string().valid(
    'appointment', 'message', 'chat', 'eprescription', 'patient', 'doctor', 'custom'
  ).optional(),
  repeat: Joi.boolean().optional(),
  repeatInterval: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').optional(),
  repeatCount: Joi.number().min(1).max(365).optional(),
  isActive: Joi.boolean().optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
});

// List reminders schema
const listReminderSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  userId: Joi.string().uuid().optional(),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  type: Joi.string().valid('appointment', 'medication', 'consultation', 'followup', 'custom', 'other').optional(),
  isActive: Joi.boolean().optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
});

// Mark reminder as completed schema
const completeReminderSchema = Joi.object({
  completedAt: Joi.date().optional(),
  notes: Joi.string().max(500).optional().allow(null, ''),
});

// Snooze reminder schema
const snoozeReminderSchema = Joi.object({
  minutes: Joi.number().min(5).max(1440).required(),
});

module.exports = {
  createReminderSchema,
  updateReminderSchema,
  listReminderSchema,
  completeReminderSchema,
  snoozeReminderSchema,
};
