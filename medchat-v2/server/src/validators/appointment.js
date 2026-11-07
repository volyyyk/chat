/**
 * Appointment Validators
 * Aligned with the Appointment model:
 * type: in_person | online | home_visit | consultation
 * status: pending | confirmed | completed | cancelled | rescheduled | no_show | deleted
 */

const Joi = require('joi');

// Create appointment schema
const createAppointmentSchema = Joi.object({
  doctorId: Joi.string().uuid().required(),
  patientId: Joi.string().uuid().optional().allow(null),
  clinicId: Joi.string().uuid().optional().allow(null),
  startTime: Joi.date().required(),
  endTime: Joi.date().optional(),
  // Used when endTime is not provided (minutes)
  duration: Joi.number().integer().min(5).max(480).optional(),
  type: Joi.string().valid('in_person', 'online', 'home_visit', 'consultation').default('consultation'),
  status: Joi.string().valid('pending', 'confirmed').default('pending'),
  reason: Joi.string().max(2000).optional().allow(null, ''),
  symptoms: Joi.string().max(5000).optional().allow(null, ''),
  notes: Joi.string().max(5000).optional().allow(null, ''),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  // 0 disables the reminder entirely
  reminderMinutes: Joi.number().integer().min(0).max(1440).optional(),
  // Legacy alias used by some clients
  reminderBefore: Joi.number().integer().min(0).max(1440).optional(),
});

// Update appointment schema
const updateAppointmentSchema = Joi.object({
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  duration: Joi.number().integer().min(5).max(480).optional(),
  type: Joi.string().valid('in_person', 'online', 'home_visit', 'consultation').optional(),
  status: Joi.string().valid(
    'pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'
  ).optional(),
  reason: Joi.string().max(2000).optional().allow(null, ''),
  symptoms: Joi.string().max(5000).optional().allow(null, ''),
  notes: Joi.string().max(5000).optional().allow(null, ''),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  reminderMinutes: Joi.number().integer().min(0).max(1440).optional(),
  reminderBefore: Joi.number().integer().min(0).max(1440).optional(),
});

// Reschedule appointment schema
const rescheduleAppointmentSchema = Joi.object({
  startTime: Joi.date().required(),
  endTime: Joi.date().optional(),
  duration: Joi.number().integer().min(5).max(480).optional(),
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// List appointments schema
const listAppointmentSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  status: Joi.string().valid(
    'pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'
  ).optional(),
  type: Joi.string().valid('in_person', 'online', 'home_visit', 'consultation').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
});

// Cancel appointment schema
const cancelAppointmentSchema = Joi.object({
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// Confirm appointment schema
const confirmAppointmentSchema = Joi.object({
  notes: Joi.string().max(2000).optional().allow(null, ''),
  preparationInstructions: Joi.string().max(5000).optional().allow(null, ''),
});

module.exports = {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  listAppointmentSchema,
  cancelAppointmentSchema,
  confirmAppointmentSchema,
};
