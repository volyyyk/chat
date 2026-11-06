/**
 * Specialty Validators
 */

const Joi = require('joi');

// Create specialty schema
const createSpecialtySchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  code: Joi.string().min(2).max(50).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  shortName: Joi.string().min(2).max(100).optional().allow(null, ''),
  category: Joi.string().valid(
    'primary_care', 'specialty_care', 'surgical', 'diagnostic',
    'therapeutic', 'pediatric', 'mental_health', 'other'
  ).optional(),
  isActive: Joi.boolean().default(true),
  sortOrder: Joi.number().min(0).default(0),
  icon: Joi.string().max(100).optional().allow(null, ''),
  color: Joi.string().max(20).optional().allow(null, ''),
});

// Update specialty schema
const updateSpecialtySchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  code: Joi.string().min(2).max(50).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  shortName: Joi.string().min(2).max(100).optional().allow(null, ''),
  category: Joi.string().valid(
    'primary_care', 'specialty_care', 'surgical', 'diagnostic',
    'therapeutic', 'pediatric', 'mental_health', 'other'
  ).optional(),
  isActive: Joi.boolean().optional(),
  sortOrder: Joi.number().min(0).optional(),
  icon: Joi.string().max(100).optional().allow(null, ''),
  color: Joi.string().max(20).optional().allow(null, ''),
});

// List specialties schema
const listSpecialtySchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(50),
  category: Joi.string().valid(
    'primary_care', 'specialty_care', 'surgical', 'diagnostic',
    'therapeutic', 'pediatric', 'mental_health', 'other'
  ).optional(),
  isActive: Joi.boolean().optional(),
  search: Joi.string().optional(),
});

module.exports = {
  createSpecialtySchema,
  updateSpecialtySchema,
  listSpecialtySchema,
};
