/**
 * MedChat Mobile App - Data Formatters
 * Format dates, times, messages, and other data for display
 */

import config from '../config/config';

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @param {string} format - Format string (e.g., 'YYYY-MM-DD', 'DD/MM/YYYY')
 * @returns {string} - Formatted date
 */
const formatDate = (date, format = 'DD/MM/YYYY') => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const pad = (num) => num.toString().padStart(2, '0');
  
  const formats = {
    'YYYY-MM-DD': `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    'DD/MM/YYYY': `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    'MM/DD/YYYY': `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`,
    'YYYY.MM.DD': `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    'DD MMM YYYY': `${pad(d.getDate())} ${getMonthName(d.getMonth())} ${d.getFullYear()}`,
    'MMMM DD, YYYY': `${getMonthName(d.getMonth(), true)} ${pad(d.getDate())}, ${d.getFullYear()}`,
  };
  
  return formats[format] || formatDate(d, 'DD/MM/YYYY');
};

/**
 * Get month name
 * @param {number} month - Month index (0-11)
 * @param {boolean} full - Return full month name
 * @returns {string} - Month name
 */
const getMonthName = (month, full = false) => {
  const months = [
    'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
    'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
  ];
  const fullMonths = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return full ? fullMonths[month] : months[month];
};

/**
 * Format time for display
 * @param {string|Date} time - Time to format
 * @param {boolean} showSeconds - Show seconds
 * @returns {string} - Formatted time
 */
const formatTime = (time, showSeconds = false) => {
  if (!time) return '';
  
  const d = new Date(time);
  if (isNaN(d.getTime())) return '';
  
  const pad = (num) => num.toString().padStart(2, '0');
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  
  return showSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
};

/**
 * Format date and time together
 * @param {string|Date} date - Date to format
 * @returns {string} - Formatted date and time
 */
const formatDateTime = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  return `${formatDate(d, 'DD/MM/YYYY')} ${formatTime(d)}`;
};

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to format
 * @returns {string} - Relative time string
 */
const formatRelativeTime = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const diff = now - d;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  const getRussianPlural = (num, one, few, many) => {
    if (num % 10 === 1 && num % 100 !== 11) return one;
    if (num % 10 >= 2 && num % 10 <= 4 && (num % 100 < 10 || num % 100 >= 20)) return few;
    return many;
  };
  
  if (seconds < 60) {
    return `только что`;
  } else if (minutes < 60) {
    return `${minutes} ${getRussianPlural(minutes, 'минуту', 'минуты', 'минут')} назад`;
  } else if (hours < 24) {
    return `${hours} ${getRussianPlural(hours, 'час', 'часа', 'часов')} назад`;
  } else if (days < 7) {
    return `${days} ${getRussianPlural(days, 'день', 'дня', 'дней')} назад`;
  } else if (weeks < 4) {
    return `${weeks} ${getRussianPlural(weeks, 'неделю', 'недели', 'недель')} назад`;
  } else if (months < 12) {
    return `${months} ${getRussianPlural(months, 'месяц', 'месяца', 'месяцев')} назад`;
  } else {
    return `${years} ${getRussianPlural(years, 'год', 'года', 'лет')} назад`;
  }
};

/**
 * Format message time (show date if different day)
 * @param {string|Date} date - Message date
 * @returns {string} - Formatted message time
 */
const formatMessageTime = (date) => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const isSameDay = d.getDate() === now.getDate() &&
                   d.getMonth() === now.getMonth() &&
                   d.getFullYear() === now.getFullYear();
  
  if (isSameDay) {
    return formatTime(d);
  }
  
  const isSameYear = d.getFullYear() === now.getFullYear();
  return isSameYear ? formatDate(d, 'DD MMM') : formatDate(d, 'DD MMM YYYY');
};

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format currency (RUB)
 * @param {number} amount - Amount in rubles
 * @returns {string} - Formatted currency
 */
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '';
  
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Format doctor name
 * @param {Object} doctor - Doctor object
 * @returns {string} - Formatted doctor name
 */
const formatDoctorName = (doctor) => {
  if (!doctor) return 'Неизвестный врач';
  
  const parts = [];
  if (doctor.lastName) parts.push(doctor.lastName);
  if (doctor.firstName) parts.push(doctor.firstName);
  if (doctor.middleName) parts.push(doctor.middleName);
  
  return parts.join(' ') || 'Неизвестный врач';
};

/**
 * Format patient identifier
 * @param {string} patientLogin - Patient login
 * @returns {string} - Formatted patient identifier
 */
const formatPatientIdentifier = (patientLogin) => {
  if (!patientLogin) return 'Неизвестный пациент';
  return `Пациент: ${patientLogin}`;
};

/**
 * Format clinic name
 * @param {Object} clinic - Clinic object
 * @returns {string} - Formatted clinic name
 */
const formatClinicName = (clinic) => {
  if (!clinic) return 'Неизвестная клиника';
  return clinic.name || 'Неизвестная клиника';
};

/**
 * Format specialty name
 * @param {Object} specialty - Specialty object
 * @returns {string} - Formatted specialty name
 */
const formatSpecialtyName = (specialty) => {
  if (!specialty) return '';
  return specialty.name || '';
};

/**
 * Format chat title
 * @param {Object} chat - Chat object
 * @returns {string} - Formatted chat title
 */
const formatChatTitle = (chat) => {
  if (!chat) return 'Новый чат';
  
  const parts = [];
  if (chat.clinicName) parts.push(chat.clinicName);
  if (chat.specialtyName) parts.push(chat.specialtyName);
  if (chat.doctorName) parts.push(chat.doctorName);
  
  return parts.join(', ') || 'Новый чат';
};

/**
 * Format appointment time
 * @param {Object} appointment - Appointment object
 * @returns {string} - Formatted appointment time
 */
const formatAppointmentTime = (appointment) => {
  if (!appointment) return '';
  
  const date = appointment.date ? new Date(appointment.date) : new Date();
  const time = appointment.time || '';
  
  if (isNaN(date.getTime())) return time;
  
  return `${formatDate(date, 'DD/MM/YYYY')} в ${time}`;
};

/**
 * Format e-prescription
 * @param {Object} prescription - E-prescription object
 * @returns {string} - Formatted prescription
 */
const formatEPrescription = (prescription) => {
  if (!prescription) return '';
  
  const parts = [];
  if (prescription.medication) parts.push(prescription.medication);
  if (prescription.dosage) parts.push(prescription.dosage);
  if (prescription.instructions) parts.push(prescription.instructions);
  
  return parts.join(', ') || '';
};

/**
 * Format convenient time range
 * @param {string} timeRange - Time range string
 * @returns {string} - Formatted convenient time
 */
const formatConvenientTime = (timeRange) => {
  if (!timeRange) return `Удобное время: ${config.DEFAULT_CONVENIENT_TIME}`;
  return `Удобное время для ответов: ${timeRange}`;
};

/**
 * Format file retention warning
 * @returns {string} - File retention warning
 */
const formatFileRetentionWarning = () => {
  return `Файлы, загруженные врачом, удаляются с сервиса через ${config.FILE_RETENTION_DAYS} дня`;
};

/**
 * Format payment info
 * @param {number} messageCount - Number of messages
 * @param {boolean} isFreePeriod - Is in free period
 * @returns {string} - Payment info
 */
const formatPaymentInfo = (messageCount, isFreePeriod) => {
  if (isFreePeriod) {
    return `Бесплатные сообщения (осталось ${config.FREE_MESSAGE_DAYS - messageCount} дней)`;
  }
  return `Стоимость сообщения: ${formatCurrency(config.MESSAGE_COST_RUB)}`;
};

/**
 * Format balance
 * @param {number} balance - Balance in rubles
 * @returns {string} - Formatted balance
 */
const formatBalance = (balance) => {
  return `Баланс: ${formatCurrency(balance)}`;
};

/**
 * Format rating
 * @param {number} rating - Rating (1-5)
 * @returns {string} - Formatted rating
 */
const formatRating = (rating) => {
  if (rating === undefined || rating === null) return 'Без оценки';
  return `${rating}/5`;
};

/**
 * Format doctor info for chat header
 * @param {Object} doctor - Doctor object
 * @param {Object} clinic - Clinic object
 * @param {Object} specialty - Specialty object
 * @returns {string} - Formatted doctor info
 */
const formatDoctorInfo = (doctor, clinic, specialty) => {
  const parts = [];
  
  if (clinic && clinic.name) {
    parts.push(`Клиника: ${clinic.name}`);
  }
  if (specialty && specialty.name) {
    parts.push(`Специальность: ${specialty.name}`);
  }
  if (doctor) {
    parts.push(`Врач: ${formatDoctorName(doctor)}`);
  }
  
  return parts.join(' \| ');
};

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
const truncateText = (text, maxLength = 100) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Capitalize first letter
 * @param {string} text - Text to capitalize
 * @returns {string} - Capitalized text
 */
const capitalizeFirstLetter = (text) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * Format phone number for display
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number
 */
const formatPhone = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Format as +7 (XXX) XXX-XX-XX
  if (digits.startsWith('7') && digits.length === 11) {
    return `+7 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7, 9)}-${digits.substring(9)}`;
  }
  
  return phone;
};

// Export all formatters
module.exports = {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeTime,
  formatMessageTime,
  formatFileSize,
  formatCurrency,
  formatDoctorName,
  formatPatientIdentifier,
  formatClinicName,
  formatSpecialtyName,
  formatChatTitle,
  formatAppointmentTime,
  formatEPrescription,
  formatConvenientTime,
  formatFileRetentionWarning,
  formatPaymentInfo,
  formatBalance,
  formatRating,
  formatDoctorInfo,
  truncateText,
  capitalizeFirstLetter,
  formatPhone,
  getMonthName,
};
