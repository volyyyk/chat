/**
 * E-Prescription Validators
 */

const Joi = require('joi');

// Medication schema
const medicationSchema = Joi.object({
  name: Joi.string().min(2).max(500).required(),
  dosage: Joi.string().min(1).max(255).required(),
  frequency: Joi.string().min(1).max(255).required(),
  duration: Joi.string().min(1).max(255).required(),
  form: Joi.string().min(1).max(100).optional().allow(null, ''),
  route: Joi.string().min(1).max(100).optional().allow(null, ''),
  quantity: Joi.number().min(1).max(1000).optional(),
  notes: Joi.string().max(500).optional().allow(null, ''),
});

// Create e-prescription schema
const createEPrescriptionSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  chatId: Joi.string().uuid().optional().allow(null),
  diagnosis: Joi.string().min(2).max(2000).required(),
  medications: Joi.array().items(medicationSchema).min(1).required(),
  instructions: Joi.string().max(5000).optional().allow(null, ''),
  diagnosisCode: Joi.string().max(50).optional().allow(null, ''),
  diagnosisSystem: Joi.string().valid('ICD-10', 'ICD-11', 'other').optional(),
  validFrom: Joi.date().required(),
  validTo: Joi.date().required(),
  refills: Joi.number().min(0).max(12).default(0),
  refillInterval: Joi.number().min(1).max(365).optional(),
  status: Joi.string().valid('draft', 'active', 'cancelled', 'expired', 'completed').default('draft'),
});

// Update e-prescription schema
const updateEPrescriptionSchema = Joi.object({
  diagnosis: Joi.string().min(2).max(2000).optional(),
  medications: Joi.array().items(medicationSchema).optional(),
  instructions: Joi.string().max(5000).optional().allow(null, ''),
  diagnosisCode: Joi.string().max(50).optional().allow(null, ''),
  diagnosisSystem: Joi.string().valid('ICD-10', 'ICD-11', 'other').optional(),
  validFrom: Joi.date().optional(),
  validTo: Joi.date().optional(),
  refills: Joi.number().min(0).max(12).optional(),
  refillInterval: Joi.number().min(1).max(365).optional(),
  status: Joi.string().valid('draft', 'active', 'cancelled', 'expired', 'completed').optional(),
});

// List e-prescriptions schema
const listEPrescriptionSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  chatId: Joi.string().uuid().optional(),
  status: Joi.string().valid('draft', 'active', 'cancelled', 'expired', 'completed').optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
});

// Activate e-prescription schema
const activateEPrescriptionSchema = Joi.object({
  signature: Joi.string().max(1000).optional().allow(null, ''),
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
  activateEPrescriptionSchema,
  cancelEPrescriptionSchema,
};
