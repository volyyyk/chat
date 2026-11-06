/**
 * File Validators
 */

const Joi = require('joi');

// Upload file schema (multipart form data handled separately)
const uploadFileSchema = Joi.object({
  chatId: Joi.string().uuid().optional().allow(null),
  messageId: Joi.string().uuid().optional().allow(null),
  type: Joi.string().valid('doctor_upload', 'patient_upload').optional(),
  category: Joi.string().valid(
    'medical_record', 'analysis', 'prescription', 'referral', 'certificate',
    'photo', 'video', 'audio', 'document', 'other'
  ).optional(),
  description: Joi.string().max(1000).optional().allow(null, ''),
  tags: Joi.array().items(Joi.string().max(50)).optional().default([]),
  visibility: Joi.string().valid('private', 'doctor_only', 'patient_only', 'shared', 'public').default('shared'),
  autoDelete: Joi.boolean().default(false),
  deleteAfterDays: Joi.number().min(1).max(30).default(3),
});

// List files schema
const listFileSchema = Joi.object({
  chatId: Joi.string().uuid().optional(),
  messageId: Joi.string().uuid().optional(),
  uploaderId: Joi.string().uuid().optional(),
  ownerType: Joi.string().valid('doctor', 'patient', 'clinic', 'system').optional(),
  ownerId: Joi.string().uuid().optional(),
  category: Joi.string().valid(
    'medical_record', 'analysis', 'prescription', 'referral', 'certificate',
    'photo', 'video', 'audio', 'document', 'other'
  ).optional(),
  visibility: Joi.string().valid('private', 'doctor_only', 'patient_only', 'shared', 'public').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  search: Joi.string().optional(),
});

// Update file schema
const updateFileSchema = Joi.object({
  description: Joi.string().max(1000).optional().allow(null, ''),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  category: Joi.string().valid(
    'medical_record', 'analysis', 'prescription', 'referral', 'certificate',
    'photo', 'video', 'audio', 'document', 'other'
  ).optional(),
  visibility: Joi.string().valid('private', 'doctor_only', 'patient_only', 'shared', 'public').optional(),
  autoDelete: Joi.boolean().optional(),
  deleteAfterDays: Joi.number().min(1).max(30).optional(),
});

// File metadata schema
const fileMetadataSchema = Joi.object({
  patientId: Joi.string().uuid().optional(),
  appointmentId: Joi.string().uuid().optional(),
  diagnosis: Joi.string().max(500).optional().allow(null, ''),
  notes: Joi.string().max(2000).optional().allow(null, ''),
});

module.exports = {
  uploadFileSchema,
  listFileSchema,
  updateFileSchema,
  fileMetadataSchema,
};
