/**
 * Appointment Validators
 */

const Joi = require('joi');

// Create appointment schema
const createAppointmentSchema = Joi.object({
  doctorId: Joi.string().uuid().required(),
  patientId: Joi.string().uuid().required(),
  clinicId: Joi.string().uuid().optional().allow(null),
  title: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(5000).optional().allow(null, ''),
  startTime: Joi.date().required(),
  duration: Joi.number().min(5).max(240).default(30),
  price: Joi.number().min(0).default(0),
  currency: Joi.string().length(3).default('RUB'),
  status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show').default('pending'),
  type: Joi.string().valid('consultation', 'examination', 'followup', 'procedure', 'other').default('consultation'),
  location: Joi.string().max(500).optional().allow(null, ''),
  notes: Joi.string().max(2000).optional().allow(null, ''),
  reminderBefore: Joi.number().min(0).max(1440).default(60), // minutes
});

// Update appointment schema
const updateAppointmentSchema = Joi.object({
  title: Joi.string().min(2).max(255).optional(),
  description: Joi.string().max(5000).optional().allow(null, ''),
  startTime: Joi.date().optional(),
  duration: Joi.number().min(5).max(240).optional(),
  price: Joi.number().min(0).optional(),
  currency: Joi.string().length(3).optional(),
  status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show').optional(),
  type: Joi.string().valid('consultation', 'examination', 'followup', 'procedure', 'other').optional(),
  location: Joi.string().max(500).optional().allow(null, ''),
  notes: Joi.string().max(2000).optional().allow(null, ''),
  reminderBefore: Joi.number().min(0).max(1440).optional(),
});

// List appointments schema
const listAppointmentSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'confirmed', 'cancelled', 'completed', 'no_show').optional(),
  type: Joi.string().valid('consultation', 'examination', 'followup', 'procedure', 'other').optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
});

// Cancel appointment schema
const cancelAppointmentSchema = Joi.object({
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// Confirm appointment schema
const confirmAppointmentSchema = Joi.object({
  paymentStatus: Joi.string().valid('pending', 'paid', 'failed', 'refunded').optional(),
});

module.exports = {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentSchema,
  cancelAppointmentSchema,
  confirmAppointmentSchema,
};
