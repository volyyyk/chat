/**
 * Clinic Validators
 */

const Joi = require('joi');

// Create clinic schema
const createClinicSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  code: Joi.string().min(4).max(20).required(),
  shortName: Joi.string().min(2).max(100).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  address: Joi.string().max(1000).optional().allow(null, ''),
  city: Joi.string().min(2).max(100).required(),
  region: Joi.string().min(2).max(100).optional().allow(null, ''),
  postalCode: Joi.string().min(5).max(20).optional().allow(null, ''),
  country: Joi.string().min(2).max(100).default('Россия'),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  email: Joi.string().email({ tlds: { allow: false } }).optional().allow(null, ''),
  website: Joi.string().uri().optional().allow(null, ''),
  legalEntityName: Joi.string().max(255).optional().allow(null, ''),
  inn: Joi.string().length(10).pattern(/^[0-9]+$/).optional().allow(null, ''),
  kpp: Joi.string().length(9).pattern(/^[0-9]+$/).optional().allow(null, ''),
  ogrn: Joi.string().length(13).pattern(/^[0-9]+$/).optional().allow(null, ''),
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
  licenseIssuer: Joi.string().max(255).optional().allow(null, ''),
  licenseDate: Joi.date().optional().allow(null),
  workingHours: Joi.array().items(Joi.object({
    day: Joi.number().min(0).max(6).required(),
    start: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
    end: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
  })).default([]),
  subscriptionPlan: Joi.string().valid('free', 'basic', 'pro', 'enterprise').default('free'),
  doctorSharePercent: Joi.number().min(0).max(100).default(80),
  clinicSharePercent: Joi.number().min(0).max(100).default(20),
  yooMoneyEnabled: Joi.boolean().default(false),
  tinkoffEnabled: Joi.boolean().default(false),
  stripeEnabled: Joi.boolean().default(false),
});

// Update clinic schema
const updateClinicSchema = Joi.object({
  name: Joi.string().min(2).max(255).optional(),
  shortName: Joi.string().min(2).max(100).optional().allow(null, ''),
  description: Joi.string().max(5000).optional().allow(null, ''),
  address: Joi.string().max(1000).optional().allow(null, ''),
  city: Joi.string().min(2).max(100).optional(),
  region: Joi.string().min(2).max(100).optional().allow(null, ''),
  postalCode: Joi.string().min(5).max(20).optional().allow(null, ''),
  country: Joi.string().min(2).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  email: Joi.string().email({ tlds: { allow: false } }).optional().allow(null, ''),
  website: Joi.string().uri().optional().allow(null, ''),
  legalEntityName: Joi.string().max(255).optional().allow(null, ''),
  inn: Joi.string().length(10).pattern(/^[0-9]+$/).optional().allow(null, ''),
  kpp: Joi.string().length(9).pattern(/^[0-9]+$/).optional().allow(null, ''),
  ogrn: Joi.string().length(13).pattern(/^[0-9]+$/).optional().allow(null, ''),
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
  licenseIssuer: Joi.string().max(255).optional().allow(null, ''),
  licenseDate: Joi.date().optional().allow(null),
  workingHours: Joi.array().items(Joi.object({
    day: Joi.number().min(0).max(6).required(),
    start: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
    end: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
  })).optional(),
  subscriptionPlan: Joi.string().valid('free', 'basic', 'pro', 'enterprise').optional(),
  doctorSharePercent: Joi.number().min(0).max(100).optional(),
  clinicSharePercent: Joi.number().min(0).max(100).optional(),
  yooMoneyEnabled: Joi.boolean().optional(),
  tinkoffEnabled: Joi.boolean().optional(),
  stripeEnabled: Joi.boolean().optional(),
});

// Query parameters for listing clinics
const listClinicSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  city: Joi.string().optional(),
  region: Joi.string().optional(),
  verified: Joi.boolean().optional(),
  search: Joi.string().optional(),
  status: Joi.string().valid('active', 'inactive', 'pending', 'suspended', 'deleted').optional(),
});

// Verify clinic doctor schema
const verifyDoctorSchema = Joi.object({
  doctorId: Joi.string().uuid().required(),
  verified: Joi.boolean().required(),
  notes: Joi.string().max(1000).optional().allow(null, ''),
});

module.exports = {
  createClinicSchema,
  updateClinicSchema,
  listClinicSchema,
  verifyDoctorSchema,
};
