/**
 * User Validators
 *
 * IMPORTANT: the schema names exported here must match what routes/users.js
 * imports. Previously the routes imported updateUserSchema / changePasswordSchema /
 * updateProfileSchema / updatePreferencesSchema / searchUsersSchema, none of
 * which existed here — validate(undefined) then threw on every request and
 * ALL of those endpoints returned 500. The schemas below restore validation.
 */

const Joi = require('joi');

// ---------------------------------------------------------------------------
// Schemas actually used by routes/users.js
// ---------------------------------------------------------------------------

// PUT /api/users/me — update own profile.
// currentPassword is required by the controller only when identity fields
// (email/username) actually change; it is validated here so that the
// controller can safely trust it.
const updateUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).optional(),
  email: Joi.string().email().max(255).optional(),
  firstName: Joi.string().min(1).max(100).optional().allow(null, ''),
  lastName: Joi.string().min(1).max(100).optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  timezone: Joi.string().max(50).optional(),
  language: Joi.string().max(10).optional(),
  currentPassword: Joi.string().max(128).optional(),
});

// PUT /api/users/me/password — change password
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({ 'any.only': 'New passwords do not match' }),
});

// PUT /api/users/me/profile — doctor/patient specific profile fields
const updateProfileSchema = Joi.object({
  fullName: Joi.string().max(300).optional(),
  dateOfBirth: Joi.date().iso().optional(),
  gender: Joi.string().max(20).optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  address: Joi.string().max(500).optional().allow(null, ''),
  city: Joi.string().max(100).optional().allow(null, ''),
  region: Joi.string().max(100).optional().allow(null, ''),
  postalCode: Joi.string().max(20).optional().allow(null, ''),
  country: Joi.string().max(100).optional().allow(null, ''),
  // Doctor specific
  specialtyIds: Joi.array().items(Joi.string().uuid()).max(20).optional(),
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
  qualification: Joi.string().max(255).optional().allow(null, ''),
  experienceYears: Joi.number().integer().min(0).max(70).optional(),
  consultationPrice: Joi.number().min(0).max(1000000).optional(),
  availableSlots: Joi.array().max(100).optional(),
  // Patient specific
  bloodType: Joi.string().max(10).optional().allow(null, ''),
  allergies: Joi.array().max(100).optional(),
  chronicDiseases: Joi.array().max(100).optional(),
  insuranceNumber: Joi.string().max(100).optional().allow(null, ''),
  emergencyContact: Joi.object({
    name: Joi.string().max(200).optional(),
    phone: Joi.string().max(20).optional(),
    relation: Joi.string().max(50).optional(),
  }).optional().allow(null),
});

// PUT /api/users/me/preferences — preferences are a JSONB document.
// Every documented preference key is listed explicitly so stripUnknown
// removes junk instead of storing it into the DB.
const updatePreferencesSchema = Joi.object({
  notifications: Joi.object({
    email: Joi.boolean(),
    push: Joi.boolean(),
    sms: Joi.boolean(),
  }).optional(),
  messageNotifications: Joi.boolean().optional(),
  appointmentReminders: Joi.boolean().optional(),
  paymentNotifications: Joi.boolean().optional(),
  theme: Joi.string().valid('light', 'dark', 'system').optional(),
  fontSize: Joi.string().valid('small', 'medium', 'large').optional(),
  language: Joi.string().max(10).optional(),
  timezone: Joi.string().max(50).optional(),
  convenientTime: Joi.object({
    start: Joi.string().max(5).optional(),
    end: Joi.string().max(5).optional(),
    days: Joi.array().items(Joi.number().integer().min(0).max(6)).max(7).optional(),
  }).optional(),
  autoDownloadFiles: Joi.boolean().optional(),
  showFilePreviews: Joi.boolean().optional(),
  enableEncryption: Joi.boolean().optional(),
}).unknown(true);

// GET /api/users — admin list filters (query string)
const searchUsersSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  role: Joi.string().valid('clinic_admin', 'doctor', 'patient', 'system_admin').optional(),
  status: Joi.string().valid('active', 'inactive', 'pending', 'banned', 'deleted').optional(),
  clinicId: Joi.string().uuid().optional(),
  search: Joi.string().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Legacy schemas (kept for compatibility with any other importers)
// ---------------------------------------------------------------------------

// Update user profile schema
const updateUserProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  middleName: Joi.string().min(1).max(100).optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  avatar: Joi.string().uri().optional().allow(null, ''),
  language: Joi.string().length(2).default('ru'),
  timezone: Joi.string().max(50).default('Europe/Moscow'),
  notificationSettings: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
    messageNotifications: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentNotifications: Joi.boolean().optional(),
  }).optional(),
});

// Update user settings schema
const updateUserSettingsSchema = Joi.object({
  language: Joi.string().length(2).optional(),
  timezone: Joi.string().max(50).optional(),
  notificationSettings: Joi.object({
    email: Joi.boolean().optional(),
    push: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
    messageNotifications: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentNotifications: Joi.boolean().optional(),
  }).optional(),
});

// List users schema (admin only)
const listUserSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  role: Joi.string().valid('clinic_admin', 'doctor', 'patient', 'system_admin').optional(),
  status: Joi.string().valid('active', 'inactive', 'pending', 'banned', 'deleted').optional(),
  clinicId: Joi.string().uuid().optional(),
  search: Joi.string().optional(),
});

// Update user status schema (admin only)
const updateUserStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive', 'pending', 'banned', 'deleted').required(),
  reason: Joi.string().max(500).optional().allow(null, ''),
});

// Consent schema
const consentSchema = Joi.object({
  consentGiven: Joi.boolean().required(),
  consentVersion: Joi.string().max(50).optional(),
});

module.exports = {
  // Schemas used by routes/users.js
  updateUserSchema,
  changePasswordSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  searchUsersSchema,
  // Legacy names (kept so other code importing them keeps working)
  updateUserProfileSchema,
  updateUserSettingsSchema,
  listUserSchema,
  updateUserStatusSchema,
  consentSchema,
};
