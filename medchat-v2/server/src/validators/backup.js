/**
 * Backup Validators
 */

const Joi = require('joi');

// Create backup schema
const createBackupSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(500).optional().allow(null, ''),
  password: Joi.string().min(8).max(100).required(),
  confirmPassword: Joi.string().min(8).max(100).required().valid(Joi.ref('password')),
});

// Restore backup schema
const restoreBackupSchema = Joi.object({
  backupId: Joi.string().uuid().required(),
  password: Joi.string().min(8).max(100).required(),
});

// List backups schema
const listBackupSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

// Delete backup schema
const deleteBackupSchema = Joi.object({
  password: Joi.string().min(8).max(100).required(),
});

// Export data schema
const exportDataSchema = Joi.object({
  password: Joi.string().min(8).max(100).required(),
  dataTypes: Joi.array().items(Joi.string().valid(
    'users', 'clinics', 'doctors', 'patients', 'chats', 'messages',
    'files', 'transactions', 'specialties', 'appointments',
    'eprescriptions', 'reminders', 'reviews'
  )).default(['users', 'clinics', 'doctors', 'patients', 'chats', 'messages']),
  format: Joi.string().valid('json', 'zip').default('json'),
});

// Import data schema
const importDataSchema = Joi.object({
  password: Joi.string().min(8).max(100).required(),
  file: Joi.any().required(), // Multipart file
});

module.exports = {
  createBackupSchema,
  restoreBackupSchema,
  listBackupSchema,
  deleteBackupSchema,
  exportDataSchema,
  importDataSchema,
};
