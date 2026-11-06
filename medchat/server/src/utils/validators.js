const { v4: uuidv4 } = require('uuid');

/**
 * Validates incoming message structure
 * @param {Object} message - Message to validate
 * @returns {string|null} Error message or null if valid
 */
function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return 'Message must be an object';
  }
  
  if (!message.type || typeof message.type !== 'string') {
    return 'Message type is required and must be a string';
  }
  
  // Validate based on message type
  switch (message.type) {
    case 'auth':
      return validateAuthMessage(message);
    case 'ping':
      return validatePingMessage(message);
    case 'pong':
      return null; // No validation needed for pong
    case 'message':
      return validateEncryptedMessage(message);
    case 'key_exchange':
      return validateKeyExchangeMessage(message);
    case 'generate_qr':
      return null; // No additional validation needed
    case 'get_doctor_info':
      return validateDoctorInfoMessage(message);
    case 'welcome':
    case 'auth_success':
    case 'auth_pending':
    case 'new_patient':
    case 'qr_generated':
    case 'doctor_info':
    case 'message_status':
    case 'error':
      return null; // Server-generated messages
    default:
      return `Unknown message type: ${message.type}`;
  }
}

/**
 * Validates authentication message
 */
function validateAuthMessage(message) {
  if (!message.role || (message.role !== 'doctor' && message.role !== 'patient')) {
    return 'Role must be "doctor" or "patient"';
  }
  
  if (message.role === 'doctor') {
    // Doctor ID is optional (will be generated if not provided)
    if (message.doctorId && typeof message.doctorId !== 'string') {
      return 'Doctor ID must be a string';
    }
    if (message.doctorId && !isValidUUID(message.doctorId)) {
      return 'Doctor ID must be a valid UUID';
    }
  }
  
  if (message.role === 'patient') {
    if (!message.doctorId || typeof message.doctorId !== 'string') {
      return 'Doctor ID is required for patient';
    }
    if (!isValidUUID(message.doctorId)) {
      return 'Doctor ID must be a valid UUID';
    }
    if (message.patientId && typeof message.patientId !== 'string') {
      return 'Patient ID must be a string';
    }
  }
  
  return null;
}

/**
 * Validates ping message
 */
function validatePingMessage(message) {
  // Ping messages can be empty
  return null;
}

/**
 * Validates encrypted message
 */
function validateEncryptedMessage(message) {
  if (!message.to || typeof message.to !== 'string') {
    return 'Recipient (to) is required';
  }
  
  if (!message.encryptedData || typeof message.encryptedData !== 'string') {
    return 'Encrypted data is required';
  }
  
  if (!message.nonce || typeof message.nonce !== 'string') {
    return 'Nonce is required';
  }
  
  if (message.from && typeof message.from !== 'string') {
    return 'Sender (from) must be a string';
  }
  
  if (message.timestamp && typeof message.timestamp !== 'number') {
    return 'Timestamp must be a number';
  }
  
  if (message.messageId && typeof message.messageId !== 'string') {
    return 'Message ID must be a string';
  }
  
  return null;
}

/**
 * Validates key exchange message
 */
function validateKeyExchangeMessage(message) {
  if (!message.to || typeof message.to !== 'string') {
    return 'Recipient (to) is required';
  }
  
  if (!message.publicKey || typeof message.publicKey !== 'string') {
    return 'Public key is required';
  }
  
  if (!message.keyType || typeof message.keyType !== 'string') {
    return 'Key type is required';
  }
  
  // Validate key type
  const validKeyTypes = ['X25519', 'Ed25519', 'RSA'];
  if (!validKeyTypes.includes(message.keyType)) {
    return `Invalid key type. Must be one of: ${validKeyTypes.join(', ')}`;
  }
  
  return null;
}

/**
 * Validates doctor info request message
 */
function validateDoctorInfoMessage(message) {
  if (!message.doctorId || typeof message.doctorId !== 'string') {
    return 'Doctor ID is required';
  }
  
  if (!isValidUUID(message.doctorId)) {
    return 'Doctor ID must be a valid UUID';
  }
  
  return null;
}

/**
 * Validates UUID format
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Creates error response object
 */
function createErrorResponse(code, message, details = {}) {
  return {
    type: 'error',
    code,
    message,
    timestamp: Date.now(),
    ...details
  };
}

/**
 * Creates success response object
 */
function createSuccessResponse(data = {}, message = 'Success') {
  return {
    type: 'success',
    message,
    data,
    timestamp: Date.now()
  };
}

/**
 * Validates doctor ID
 */
function validateDoctorId(doctorId) {
  if (!doctorId || typeof doctorId !== 'string') {
    return 'Doctor ID is required and must be a string';
  }
  if (!isValidUUID(doctorId)) {
    return 'Doctor ID must be a valid UUID';
  }
  return null;
}

/**
 * Validates patient ID
 */
function validatePatientId(patientId) {
  if (!patientId || typeof patientId !== 'string') {
    return 'Patient ID is required and must be a string';
  }
  // Patient ID can be any string (not necessarily UUID)
  return null;
}

module.exports = {
  validateMessage,
  validateAuthMessage,
  validateEncryptedMessage,
  validateKeyExchangeMessage,
  validateDoctorInfoMessage,
  isValidUUID,
  createErrorResponse,
  createSuccessResponse,
  validateDoctorId,
  validatePatientId
};
