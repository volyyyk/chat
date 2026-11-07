/**
 * Backup Validators
 * Names aligned with what routes/backups.js imports
 * (exportBackupSchema / importBackupSchema).
 */

const Joi = require('joi');

const DATA_TYPES = ['chats', 'files', 'contacts', 'settings', 'all'];

// Create backup schema
const createBackupSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  description: Joi.string().max(500).optional().allow(null, ''),
  password: Joi.string().min(8).max(100).required(),
  confirmPassword: Joi.string().min(8).max(100).required().valid(Joi.ref('password')),
  dataTypes: Joi.array().items(Joi.string().valid(...DATA_TYPES))
    .default(['chats', 'files', 'contacts', 'settings']),
  format: Joi.string().valid('json', 'zip', 'enc').default('json'),
});

// Restore backup schema
const restoreBackupSchema = Joi.object({
  password: Joi.string().min(8).max(100).required(),
  restoreOptions: Joi.object().optional(),
});

// List backups schema
const listBackupSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'completed', 'failed', 'deleted').optional(),
});

// Delete backup schema (requires the user's login password)
const deleteBackupSchema = Joi.object({
  password: Joi.string().min(8).max(100).required(),
  permanent: Joi.boolean().optional(),
});

// Export data schema
const exportBackupSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  password: Joi.string().min(8).max(100).optional(),
  dataTypes: Joi.array().items(Joi.string().valid(...DATA_TYPES))
    .default(['chats', 'files', 'contacts', 'settings']),
  format: Joi.string().valid('json', 'zip').default('json'),
});

// Import data schema (JSON import; multipart upload is not configured)
const importBackupSchema = Joi.object({
  dataType: Joi.string().valid(...DATA_TYPES).required(),
  data: Joi.required(),
  password: Joi.string().min(8).max(100).optional(),
});

// Legacy aliases (old names kept for compatibility)
const exportDataSchema = exportBackupSchema;
const importDataSchema = importBackupSchema;

module.exports = {
  createBackupSchema,
  restoreBackupSchema,
  listBackupSchema,
  deleteBackupSchema,
  exportBackupSchema,
  importBackupSchema,
  exportDataSchema,
  importDataSchema,
};
