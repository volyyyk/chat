/**
 * User Validators
 */

const Joi = require('joi');

// Update user profile schema
const updateUserProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  middleName: Joi.string().min(1).max(100).optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  avatar: Joi.string().uri().optional().allow(null, ''),
  language: Joi.string().length(2).default('ru'),
  timezone: Joi.string().max(50).default('Europe/Moscow'),
  notificationSettings: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
    messageNotifications: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentNotifications: Joi.boolean().optional(),
  }).optional(),
});

// Update user settings schema
const updateUserSettingsSchema = Joi.object({
  language: Joi.string().length(2).optional(),
  timezone: Joi.string().max(50).optional(),
  notificationSettings: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
    messageNotifications: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentNotifications: Joi.boolean().optional(),
  }).optional(),
});

// List users schema (admin only)
const listUserSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  role: Joi.string().valid('clinic_admin', 'doctor', 'patient', 'system_admin').optional(),
  status: Joi.string().valid('active', 'inactive', 'pending', 'banned', 'deleted').optional(),
  clinicId: Joi.string().uuid().optional(),
  search: Joi.string().optional(),
});

// Update user status schema (admin only)
const updateUserStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive', 'pending', 'banned', 'deleted').required(),
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// Consent schema
const consentSchema = Joi.object({
  consentGiven: Joi.boolean().required(),
  consentVersion: Joi.string().max(50).optional(),
});

module.exports = {
  updateUserProfileSchema,
  updateUserSettingsSchema,
  listUserSchema,
  updateUserStatusSchema,
  consentSchema,
};
