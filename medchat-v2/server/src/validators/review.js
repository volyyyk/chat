/**
 * Review Validators
 */

const Joi = require('joi');

// Create review schema
const createReviewSchema = Joi.object({
  doctorId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  rating: Joi.number().min(1).max(5).required(),
  title: Joi.string().max(200).optional(),
  comment: Joi.string().max(2000).optional(),
  anonymous: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string().max(50)).optional().default([]),
});

// Update review schema
const updateReviewSchema = Joi.object({
  rating: Joi.number().min(1).max(5).optional(),
  title: Joi.string().max(200).optional(),
  comment: Joi.string().max(2000).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
});

// Respond to review schema
const respondReviewSchema = Joi.object({
  response: Joi.string().max(2000).required(),
});

// List review schema
const listReviewSchema = Joi.object({
  doctorId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().optional(),
  rating: Joi.number().min(1).max(5).optional(),
  status: Joi.string().valid('pending', 'approved', 'rejected', 'published', 'hidden').optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});

module.exports = {
  createReviewSchema,
  updateReviewSchema,
  respondReviewSchema,
  listReviewSchema,
};
