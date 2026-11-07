/**
 * E-Prescription Validators
 * Aligned with the EPrescription model (medications is a JSONB array,
 * dosage/frequency/duration may be empty strings from the mobile client).
 */

const Joi = require('joi');

// Medication schema
const medicationSchema = Joi.object({
  name: Joi.string().min(1).max(500).required(),
  dosage: Joi.string().max(255).optional().allow(null, ''),
  frequency: Joi.string().max(255).optional().allow(null, ''),
  duration: Joi.string().max(255).optional().allow(null, ''),
  form: Joi.string().max(100).optional().allow(null, ''),
  route: Joi.string().max(100).optional().allow(null, ''),
  quantity: Joi.number().min(1).max(1000).optional(),
  notes: Joi.string().max(500).optional().allow(null, ''),
});

// Create e-prescription schema
const createEPrescriptionSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  appointmentId: Joi.string().uuid().optional().allow(null),
  chatId: Joi.string().optional().allow(null),
  type: Joi.string().valid('medication', 'procedure', 'test', 'referral', 'certificate', 'other')
    .default('medication'),
  title: Joi.string().max(200).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  medications: Joi.array().items(medicationSchema).min(1).required(),
  dosage: Joi.string().max(500).optional().allow(null, ''),
  duration: Joi.string().max(100).optional().allow(null, ''),
  instructions: Joi.string().max(5000).optional().allow(null, ''),
  // Alias for instructions used by the mobile client
  recommendations: Joi.string().max(5000).optional().allow(null, ''),
  diagnosis: Joi.string().min(2).max(2000).required(),
  notes: Joi.string().max(2000).optional().allow(null, ''),
  validUntil: Joi.date().optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
});

// Update e-prescription schema
const updateEPrescriptionSchema = Joi.object({
  type: Joi.string().valid('medication', 'procedure', 'test', 'referral', 'certificate', 'other')
    .optional(),
  title: Joi.string().max(200).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  medications: Joi.array().items(medicationSchema).min(1).optional(),
  dosage: Joi.string().max(500).optional().allow(null, ''),
  duration: Joi.string().max(100).optional().allow(null, ''),
  instructions: Joi.string().max(5000).optional().allow(null, ''),
  recommendations: Joi.string().max(5000).optional().allow(null, ''),
  diagnosis: Joi.string().max(2000).optional().allow(null, ''),
  notes: Joi.string().max(2000).optional().allow(null, ''),
  validUntil: Joi.date().optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  status: Joi.string().valid('draft', 'active', 'cancelled', 'fulfilled', 'expired').optional(),
});

// List e-prescriptions schema
const listEPrescriptionSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  status: Joi.string().valid('draft', 'active', 'cancelled', 'fulfilled', 'expired').optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
});

// Sign e-prescription schema (electronic signature)
const signEPrescriptionSchema = Joi.object({
  signature: Joi.string().max(2000).optional().allow(null, ''),
});

// Cancel e-prescription schema
const cancelEPrescriptionSchema = Joi.object({
  reason: Joi.string().max(500).optional().allow(null, ''),
});

module.exports = {
  medicationSchema,
  createEPrescriptionSchema,
  updateEPrescriptionSchema,
  listEPrescriptionSchema,
  signEPrescriptionSchema,
  cancelEPrescriptionSchema,
};
