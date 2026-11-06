/**
 * Authentication Validators
 * Joi schemas for request validation
 */

const Joi = require('joi');

// Password validation regex
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Email validation
const emailValidation = Joi.string().email().required().messages({
  'string.email': 'Please provide a valid email address',
  'any.required': 'Email is required',
});

// Password validation
const passwordValidation = Joi.string().pattern(passwordRegex).min(8).required().messages({
  'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  'string.min': 'Password must be at least 8 characters long',
  'any.required': 'Password is required',
});

// Register schema
const registerSchema = Joi.object({
  email: emailValidation,
  password: passwordValidation,
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, '').messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  role: Joi.string().valid('doctor', 'patient', 'clinic_admin').required().messages({
    'any.only': 'Role must be one of: doctor, patient, clinic_admin',
    'any.required': 'Role is required',
  }),
  firstName: Joi.string().min(1).max(100).required().messages({
    'string.min': 'First name must be at least 1 character long',
    'string.max': 'First name must be at most 100 characters long',
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(1).max(100).required().messages({
    'string.min': 'Last name must be at least 1 character long',
    'string.max': 'Last name must be at most 100 characters long',
    'any.required': 'Last name is required',
  }),
  middleName: Joi.string().min(1).max(100).optional().allow(null, '').messages({
    'string.min': 'Middle name must be at least 1 character long',
    'string.max': 'Middle name must be at most 100 characters long',
  }),
  clinicCode: Joi.string().min(4).max(20).optional().allow(null, '').messages({
    'string.min': 'Clinic code must be at least 4 characters long',
    'string.max': 'Clinic code must be at most 20 characters long',
  }),
  consentGiven: Joi.boolean().default(true),
  consentVersion: Joi.string().optional(),
});

// Login schema
const loginSchema = Joi.object({
  email: emailValidation,
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

// Refresh token schema
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
  }),
});

// Forgot password schema
const forgotPasswordSchema = Joi.object({
  email: emailValidation,
});

// Reset password schema
const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    'any.required': 'Reset token is required',
  }),
  newPassword: passwordValidation,
});

// Change password schema
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: passwordValidation,
});

// Auth schema (for protected routes)
const authSchema = Joi.object({
  authorization: Joi.string().required().messages({
    'any.required': 'Authorization header is required',
  }),
});

module.exports = {
  authSchema,
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
