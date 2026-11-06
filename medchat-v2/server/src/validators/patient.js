/**
 * Patient Validators
 */

const Joi = require('joi');

// Create patient schema
const createPatientSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().optional().allow(null),
  clinicId: Joi.string().uuid().optional().allow(null),
  patientNumber: Joi.string().max(50).optional().allow(null, ''),
  dateOfBirth: Joi.date().optional().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').optional().allow(null),
  bloodType: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional().allow(null),
  medicalHistory: Joi.string().max(10000).optional().allow(null, ''),
  allergies: Joi.string().max(5000).optional().allow(null, ''),
  chronicConditions: Joi.string().max(5000).optional().allow(null, ''),
  emergencyContactName: Joi.string().max(255).optional().allow(null, ''),
  emergencyContactPhone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  emergencyContactRelationship: Joi.string().max(100).optional().allow(null, ''),
  insuranceCompany: Joi.string().max(255).optional().allow(null, ''),
  insurancePolicyNumber: Joi.string().max(100).optional().allow(null, ''),
  insuranceExpiry: Joi.date().optional().allow(null),
  preferredLanguage: Joi.string().length(2).default('ru'),
  preferredCommunication: Joi.array().items(Joi.string().valid('chat', 'email', 'sms')).default(['chat']),
  lastAppointmentDate: Joi.date().optional().allow(null),
  nextAppointmentDate: Joi.date().optional().allow(null),
  chatCreatedAt: Joi.date().optional().allow(null),
  addedBy: Joi.string().valid('clinic', 'doctor', 'patient', 'system').default('patient'),
});

// Update patient schema
const updatePatientSchema = Joi.object({
  patientNumber: Joi.string().max(50).optional().allow(null, ''),
  dateOfBirth: Joi.date().optional().allow(null),
  gender: Joi.string().valid('male', 'female', 'other').optional().allow(null),
  bloodType: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-').optional().allow(null),
  medicalHistory: Joi.string().max(10000).optional().allow(null, ''),
  allergies: Joi.string().max(5000).optional().allow(null, ''),
  chronicConditions: Joi.string().max(5000).optional().allow(null, ''),
  emergencyContactName: Joi.string().max(255).optional().allow(null, ''),
  emergencyContactPhone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
  emergencyContactRelationship: Joi.string().max(100).optional().allow(null, ''),
  insuranceCompany: Joi.string().max(255).optional().allow(null, ''),
  insurancePolicyNumber: Joi.string().max(100).optional().allow(null, ''),
  insuranceExpiry: Joi.date().optional().allow(null),
  preferredLanguage: Joi.string().length(2).optional(),
  preferredCommunication: Joi.array().items(Joi.string().valid('chat', 'email', 'sms')).optional(),
  lastAppointmentDate: Joi.date().optional().allow(null),
  nextAppointmentDate: Joi.date().optional().allow(null),
});

// Update patient settings schema
const updatePatientSettingsSchema = Joi.object({
  notificationSettings: Joi.object({
    newMessages: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    paymentRequests: Joi.boolean().optional(),
    prescriptionNotifications: Joi.boolean().optional(),
    systemNotifications: Joi.boolean().optional(),
  }).optional(),
  preferredLanguage: Joi.string().length(2).optional(),
  preferredCommunication: Joi.array().items(Joi.string().valid('chat', 'email', 'sms')).optional(),
});

// List patients schema
const listPatientSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
  doctorId: Joi.string().uuid().optional(),
  clinicId: Joi.string().uuid().optional(),
  search: Joi.string().optional(),
  status: Joi.string().valid('active', 'inactive', 'archived', 'blocked', 'deleted').optional(),
});

// Patient profile schema
const patientProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(100).optional(),
  lastName: Joi.string().min(1).max(100).optional(),
  middleName: Joi.string().min(1).max(100).optional().allow(null, ''),
  avatar: Joi.string().uri().optional().allow(null, ''),
  phone: Joi.string().pattern(/^\+?[0-9\s-()]{10,20}$/).optional().allow(null, ''),
});

// Add patient to doctor schema
const addPatientToDoctorSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  patientNumber: Joi.string().max(50).optional(),
});

module.exports = {
  createPatientSchema,
  updatePatientSchema,
  updatePatientSettingsSchema,
  listPatientSchema,
  patientProfileSchema,
  addPatientToDoctorSchema,
};
