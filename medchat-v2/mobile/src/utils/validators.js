/**
 * MedChat Mobile App - Input Validators
 * Validate user input for forms and API calls
 */

import config from '../config/config';

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number (Russian format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
const validatePhone = (phone) => {
  const phoneRegex = /^\+?7?[\d\s-()]{10,15}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - { valid: boolean, message: string }
 */
const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, message: 'Пароль должен содержать не менее 8 символов' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать хотя бы одну заглавную букву' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать хотя бы одну строчную букву' };
  }
  if (!/[\d]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать хотя бы одну цифру' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|]/.test(password)) {
    return { valid: false, message: 'Пароль должен содержать хотя бы один специальный символ' };
  }
  return { valid: true, message: '' };
};

/**
 * Validate clinic code
 * @param {string} code - Clinic code to validate
 * @returns {boolean} - True if valid
 */
const validateClinicCode = (code) => {
  return code && code.length === config.CLINIC_CODE_LENGTH && /^[A-Z0-9]+$/i.test(code);
};

/**
 * Validate doctor code
 * @param {string} code - Doctor code to validate
 * @returns {boolean} - True if valid
 */
const validateDoctorCode = (code) => {
  return code && code.length === config.DOCTOR_CODE_LENGTH && /^[A-Z0-9]+$/i.test(code);
};

/**
 * Validate patient login (unique per doctor)
 * @param {string} login - Patient login to validate
 * @returns {boolean} - True if valid
 */
const validatePatientLogin = (login) => {
  return login && login.length >= 3 && login.length <= 50 && /^[a-zA-Z0-9._-]+$/.test(login);
};

/**
 * Validate message content
 * @param {string} message - Message to validate
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateMessage = (message) => {
  if (!message || message.trim().length === 0) {
    return { valid: false, message: 'Сообщение не может быть пустым' };
  }
  if (message.length > config.MAX_MESSAGE_LENGTH) {
    return { valid: false, message: `Сообщение не может превышать ${config.MAX_MESSAGE_LENGTH} символов` };
  }
  return { valid: true, message: '' };
};

/**
 * Validate file for upload
 * @param {Object} file - File object with name, type, size
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateFile = (file) => {
  if (!file) {
    return { valid: false, message: 'Файл не выбран' };
  }
  if (!file.name) {
    return { valid: false, message: 'Недопустимое имя файла' };
  }
  if (file.size > config.MAX_FILE_SIZE) {
    return { valid: false, message: `Размер файла не должен превышать ${config.MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }
  if (!config.ALLOWED_FILE_TYPES.includes(file.type)) {
    return { valid: false, message: `Недопустимый тип файла. Разрешенные типы: ${config.ALLOWED_FILE_TYPES.join(', ')}` };
  }
  return { valid: true, message: '' };
};

/**
 * Validate time string (HH:MM format)
 * @param {string} time - Time string to validate
 * @returns {boolean} - True if valid
 */
const validateTime = (time) => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(time);
};

/**
 * Validate date string (YYYY-MM-DD format)
 * @param {string} date - Date string to validate
 * @returns {boolean} - True if valid
 */
const validateDate = (date) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
};

/**
 * Validate appointment data
 * @param {Object} appointment - Appointment data
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateAppointment = (appointment) => {
  if (!appointment.date) {
    return { valid: false, message: 'Дата обязательна' };
  }
  if (!validateDate(appointment.date)) {
    return { valid: false, message: 'Недопустимый формат даты (YYYY-MM-DD)' };
  }
  if (!appointment.time) {
    return { valid: false, message: 'Время обязательно' };
  }
  if (!validateTime(appointment.time)) {
    return { valid: false, message: 'Недопустимый формат времени (HH:MM)' };
  }
  if (!appointment.patientLogin) {
    return { valid: false, message: 'Логин пациента обязателен' };
  }
  if (!validatePatientLogin(appointment.patientLogin)) {
    return { valid: false, message: 'Недопустимый логин пациента' };
  }
  return { valid: true, message: '' };
};

/**
 * Validate e-prescription data
 * @param {Object} prescription - E-prescription data
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateEPrescription = (prescription) => {
  if (!prescription.patientLogin) {
    return { valid: false, message: 'Логин пациента обязателен' };
  }
  if (!prescription.medication) {
    return { valid: false, message: 'Название препарата обязательно' };
  }
  if (!prescription.dosage) {
    return { valid: false, message: 'Дозировка обязательна' };
  }
  if (!prescription.instructions) {
    return { valid: false, message: 'Инструкции по применению обязательны' };
  }
  if (!prescription.doctorId) {
    return { valid: false, message: 'ID врача обязателен' };
  }
  return { valid: true, message: '' };
};

/**
 * Validate review data
 * @param {Object} review - Review data
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateReview = (review) => {
  if (!review.rating) {
    return { valid: false, message: 'Оценка обязательна' };
  }
  if (review.rating < 1 || review.rating > 5) {
    return { valid: false, message: 'Оценка должна быть от 1 до 5' };
  }
  if (!review.comment) {
    return { valid: false, message: 'Комментарий обязателен' };
  }
  if (review.comment.length > 1000) {
    return { valid: false, message: 'Комментарий не должен превышать 1000 символов' };
  }
  if (!review.doctorId) {
    return { valid: false, message: 'ID врача обязателен' };
  }
  return { valid: true, message: '' };
};

/**
 * Validate convenient time range
 * @param {string} timeRange - Time range string (e.g., "09:00-18:00")
 * @returns {boolean} - True if valid
 */
const validateTimeRange = (timeRange) => {
  const timeRangeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])-([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRangeRegex.test(timeRange)) return false;
  
  const [start, end] = timeRange.split('-');
  const startTime = new Date(`1970-01-01T${start}:00`).getTime();
  const endTime = new Date(`1970-01-01T${end}:00`).getTime();
  
  return startTime < endTime;
};

/**
 * Validate search query
 * @param {string} query - Search query
 * @returns {boolean} - True if valid
 */
const validateSearchQuery = (query) => {
  return query && query.length >= 1 && query.length <= 100;
};

/**
 * Validate backup password
 * @param {string} password - Backup password
 * @returns {Object} - { valid: boolean, message: string }
 */
const validateBackupPassword = (password) => {
  if (!password) {
    return { valid: false, message: 'Пароль обязателен' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Пароль должен содержать не менее 8 символов' };
  }
  return { valid: true, message: '' };
};

// Export all validators
module.exports = {
  validateEmail,
  validatePhone,
  validatePassword,
  validateClinicCode,
  validateDoctorCode,
  validatePatientLogin,
  validateMessage,
  validateFile,
  validateTime,
  validateDate,
  validateAppointment,
  validateEPrescription,
  validateReview,
  validateTimeRange,
  validateSearchQuery,
  validateBackupPassword,
};
