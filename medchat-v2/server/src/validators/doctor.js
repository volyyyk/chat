/**
 * Doctor Validators
 */

const Joi = require('joi');

// Create doctor schema
const createDoctorSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  clinicId: Joi.string().uuid().required(),
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
  licenseIssuer: Joi.string().max(255).optional().allow(null, ''),
  licenseDate: Joi.date().optional().allow(null),
  licenseExpiry: Joi.date().optional().allow(null),
  specialties: Joi.array().items(Joi.string().uuid()).default([]),
  primarySpecialtyId: Joi.string().uuid().optional().allow(null),
  degree: Joi.string().max(100).optional().allow(null, ''),
  title: Joi.string().max(100).optional().allow(null, ''),
  experienceYears: Joi.number().min(0).max(100).default(0),
  bio: Joi.string().max(5000).optional().allow(null, ''),
  consultationPrice: Joi.number().min(0).default(0),
  consultationDuration: Joi.number().min(5).max(240).default(30),
  isAvailable: Joi.boolean().default(true),
  workingHours: Joi.array().items(Joi.object({
    day: Joi.number().min(0).max(6).required(),
    start: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
    end: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
  })).default([]),
  convenientResponseTime: Joi.string().max(255).optional().allow(null, ''),
  category: Joi.string().valid(
    'therapist', 'surgeon', 'cardiologist', 'neurologist', 'pediatrician',
    'gynecologist', 'urologist', 'dermatologist', 'ophthalmologist',
    'otolaryngologist', 'psychiatrist', 'endocrinologist', 'gastroenterologist',
    'oncologist', 'other'
  ).optional().allow(null, ''),
  doctorNumber: Joi.string().max(20).optional().allow(null, ''),
});

// Update doctor schema
const updateDoctorSchema = Joi.object({
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
  licenseIssuer: Joi.string().max(255).optional().allow(null, ''),
  licenseDate: Joi.date().optional().allow(null),
  licenseExpiry: Joi.date().optional().allow(null),
  specialties: Joi.array().items(Joi.string().uuid()).optional(),
  primarySpecialtyId: Joi.string().uuid().optional().allow(null),
  degree: Joi.string().max(100).optional().allow(null, ''),
  title: Joi.string().max(100).optional().allow(null, ''),
  experienceYears: Joi.number().min(0).max(100).optional(),
  bio: Joi.string().max(5000).optional().allow(null, ''),
  consultationPrice: Joi.number().min(0).optional(),
  consultationDuration: Joi.number().min(5).max(240).optional(),
  isAvailable: Joi.boolean().optional(),
  workingHours: Joi.array().items(Joi.object({
    day: Joi.number().min(0).max(6).required(),
    start: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
    end: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
  })).optional(),
  convenientResponseTime: Joi.string().max(255).optional().allow(null, ''),
  category: Joi.string().valid(
    'therapist', 'surgeon', 'cardiologist', 'neurologist', 'pediatrician',
    'gynecologist', 'urologist', 'dermatologist', 'ophthalmologist',
    'otolaryngologist', 'psychiatrist', 'endocrinologist', 'gastroenterologist',
    'oncologist', 'other'
  ).optional().allow(null, ''),
  doctorNumber: Joi.string().max(20).optional().allow(null, ''),
});

// Update doctor settings schema
const updateDoctorSettingsSchema = Joi.object({
  notificationSettings: Joi.object({
    newMessages: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentNotifications: Joi.boolean().optional(),
    reviewNotifications: Joi.boolean().optional(),
    systemNotifications: Joi.boolean().optional(),
  }).optional(),
  fileRetentionDays: Joi.number().min(1).max(30).default(3),
  consultationPrice: Joi.number().min(0).optional(),
  consultationDuration: Joi.number().min(5).max(240).optional(),
  isAvailable: Joi.boolean().optional(),
  workingHours: Joi.array().items(Joi.object({
    day: Joi.number().min(0).max(6).required(),
    start: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
    end: Joi.string().pattern(/^[0-9]{2}:[0-9]{2}$/).required(),
  })).optional(),
  convenientResponseTime: Joi.string().max(255).optional().allow(null, ''),
});

// List doctors schema
const listDoctorSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  clinicId: Joi.string().uuid().optional(),
  specialty: Joi.string().uuid().optional(),
  verified: Joi.boolean().optional(),
  search: Joi.string().optional(),
  isOnline: Joi.boolean().optional(),
  category: Joi.string().valid(
    'therapist', 'surgeon', 'cardiologist', 'neurologist', 'pediatrician',
    'gynecologist', 'urologist', 'dermatologist', 'ophthalmologist',
    'otolaryngologist', 'psychiatrist', 'endocrinologist', 'gastroenterologist',
    'oncologist', 'other'
  ).optional(),
});

// Doctor profile schema
const doctorProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  middleName: Joi.string().min(1).max(100).optional().allow(null, ''),
  avatar: Joi.string().uri().optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
});

// Invite doctor schema (by clinic admin)
const inviteDoctorSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  specialties: Joi.array().items(Joi.string().uuid()).optional().default([]),
  message: Joi.string().max(1000).optional().allow(null, ''),
});

module.exports = {
  createDoctorSchema,
  updateDoctorSchema,
  updateDoctorSettingsSchema,
  listDoctorSchema,
  doctorProfileSchema,
  inviteDoctorSchema,
};
