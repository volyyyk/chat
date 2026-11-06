const { v4: uuidv4 } = require('uuid');
const { validateMessage, createErrorResponse } = require('./utils/validators');
const { encryptMessage, decryptMessage } = require('./utils/crypto');

class MessageRouter {
  constructor(wss, config, logger) {
    this.wss = wss;
    this.config = config;
    this.logger = logger;
    
    // Connection tracking
    this.connections = new Map(); // connectionId -> ws
    this.doctors = new Map(); // doctorId -> Set of patient connections
    this.patients = new Map(); // patientId -> Set of connections
    this.pendingAuth = new Map(); // connectionId -> auth data
    
    // Rate limiting tracking
    this.messageCounts = new Map(); // ip -> { count, lastReset }
    
    // Initialize cleanup
    this.setupCleanup();
  }
  
  setupCleanup() {
    // Clean up old connections periodically
    setInterval(() => {
      this.cleanupConnections();
    }, this.config.session.cleanupInterval);
    
    // Reset rate limiting counters
    setInterval(() => {
      this.messageCounts.clear();
    }, 60000);
  }
  
  cleanupConnections() {
    const now = Date.now();
    const timeout = this.config.session.timeout;
    
    for (const [connectionId, ws] of this.connections) {
      if (ws.lastMessageTime && (now - ws.lastMessageTime) > timeout) {
        this.logger.info(`Closing idle connection ${connectionId}`);
        ws.close(1000, 'Idle timeout');
        this.connections.delete(connectionId);
      }
    }
  }
  
  handleMessage(ws, message, req) {
    const connectionId = ws.connectionId;
    const ip = ws.ip;
    
    // Update last message time
    ws.lastMessageTime = Date.now();
    
    // Rate limiting
    if (this.config.security.rateLimiting) {
      if (this.isRateLimited(ip)) {
        ws.send(JSON.stringify(createErrorResponse('RATE_LIMITED', 'Too many messages')));
        return;
      }
      this.incrementMessageCount(ip);
    }
    
    try {
      // Parse message
      let messageData;
      try {
        messageData = JSON.parse(message.toString());
      } catch (error) {
        throw new Error('Invalid JSON format');
      }
      
      // Validate message
      const validationError = validateMessage(messageData);
      if (validationError) {
        throw new Error(validationError);
      }
      
      this.logger.debug('Received message', { 
        connectionId, 
        type: messageData.type,
        from: messageData.from
      });
      
      // Handle different message types
      switch (messageData.type) {
        case 'auth':
          this.handleAuth(ws, messageData);
          break;
        case 'ping':
          this.handlePing(ws, messageData);
          break;
        case 'message':
          this.handleEncryptedMessage(ws, messageData);
          break;
        case 'key_exchange':
          this.handleKeyExchange(ws, messageData);
          break;
        case 'generate_qr':
          this.handleGenerateQR(ws, messageData);
          break;
        case 'get_doctor_info':
          this.handleGetDoctorInfo(ws, messageData);
          break;
        default:
          ws.send(JSON.stringify(createErrorResponse('INVALID_MESSAGE_TYPE', 'Unknown message type')));
      }
    } catch (error) {
      this.logger.error('Message handling error', { 
        error: error.message,
        connectionId,
        ip
      });
      ws.send(JSON.stringify(createErrorResponse('BAD_REQUEST', error.message)));
    }
  }
  
  handleAuth(ws, messageData) {
    const { role, doctorId, patientId } = messageData;
    const connectionId = ws.connectionId;
    
    // Validate role
    if (role !== 'doctor' && role !== 'patient') {
      ws.send(JSON.stringify(createErrorResponse('INVALID_ROLE', 'Role must be doctor or patient')));
      return;
    }
    
    // Validate IDs
    if (role === 'doctor' && !doctorId) {
      ws.send(JSON.stringify(createErrorResponse('MISSING_DOCTOR_ID', 'Doctor ID is required')));
      return;
    }
    
    if (role === 'patient' && (!doctorId || !patientId)) {
      ws.send(JSON.stringify(createErrorResponse('MISSING_IDS', 'Doctor ID and Patient ID are required')));
      return;
    }
    
    // Generate IDs if not provided
    const finalDoctorId = doctorId || uuidv4();
    const finalPatientId = patientId || uuidv4();
    
    // Store authentication data
    ws.authenticated = true;
    ws.role = role;
    ws.doctorId = role === 'doctor' ? finalDoctorId : doctorId;
    ws.patientId = role === 'patient' ? finalPatientId : null;
    
    // Track connections
    this.connections.set(connectionId, ws);
    
    if (role === 'doctor') {
      if (!this.doctors.has(finalDoctorId)) {
        this.doctors.set(finalDoctorId, new Set());
      }
      this.doctors.get(finalDoctorId).add(connectionId);
      
      this.logger.info(`Doctor authenticated: ${finalDoctorId}`, { connectionId });
      
      // Send auth success with doctorId
      ws.send(JSON.stringify({
        type: 'auth_success',
        role: 'doctor',
        doctorId: finalDoctorId,
        timestamp: Date.now()
      }));
    } else {
      // Patient authentication
      if (!this.doctors.has(doctorId)) {
        // Doctor not online yet, store pending
        this.pendingAuth.set(connectionId, { doctorId, patientId: finalPatientId });
        
        this.logger.info(`Patient waiting for doctor: ${doctorId}`, { connectionId, patientId: finalPatientId });
        
        // Send auth pending
        ws.send(JSON.stringify({
          type: 'auth_pending',
          role: 'patient',
          doctorId,
          patientId: finalPatientId,
          message: 'Waiting for doctor to come online',
          timestamp: Date.now()
        }));
      } else {
        // Doctor is online
        this.patients.set(finalPatientId, new Set([connectionId]));
        this.doctors.get(doctorId).add(connectionId);
        
        this.logger.info(`Patient authenticated: ${finalPatientId} for doctor ${doctorId}`, { connectionId });
        
        // Notify doctor about new patient
        this.notifyDoctorAboutPatient(doctorId, finalPatientId, connectionId);
        
        // Send auth success
        ws.send(JSON.stringify({
          type: 'auth_success',
          role: 'patient',
          doctorId,
          patientId: finalPatientId,
          timestamp: Date.now()
        }));
      }
    }
  }
  
  notifyDoctorAboutPatient(doctorId, patientId, patientConnectionId) {
    const doctorConnections = this.doctors.get(doctorId);
    if (!doctorConnections) return;
    
    doctorConnections.forEach((connId) => {
      const doctorWs = this.connections.get(connId);
      if (doctorWs && doctorWs.readyState === 1) { // 1 = OPEN
        doctorWs.send(JSON.stringify({
          type: 'new_patient',
          patientId,
          connectionId: patientConnectionId,
          timestamp: Date.now()
        }));
      }
    });
  }
  
  handlePing(ws, messageData) {
    ws.send(JSON.stringify({
      type: 'pong',
      timestamp: Date.now()
    }));
  }
  
  handleEncryptedMessage(ws, messageData) {
    if (!ws.authenticated) {
      ws.send(JSON.stringify(createErrorResponse('NOT_AUTHENTICATED', 'Authentication required')));
      return;
    }
    
    const { to, encryptedData, nonce, from, timestamp } = messageData;
    
    // Validate required fields
    if (!to || !encryptedData || !nonce) {
      ws.send(JSON.stringify(createErrorResponse('MISSING_FIELDS', 'Missing required fields')));
      return;
    }
    
    // Determine recipient
    let recipients = [];
    
    if (ws.role === 'doctor') {
      // Doctor sending to patient
      const patientConnections = this.patients.get(to);
      if (patientConnections) {
        recipients = Array.from(patientConnections);
      }
    } else if (ws.role === 'patient') {
      // Patient sending to doctor
      const doctorConnections = this.doctors.get(ws.doctorId);
      if (doctorConnections) {
        recipients = Array.from(doctorConnections).filter(
          connId => connId !== ws.connectionId
        );
      }
    }
    
    if (recipients.length === 0) {
      this.logger.warn(`No recipients found for message from ${ws.connectionId} to ${to}`);
      ws.send(JSON.stringify({
        type: 'message_status',
        status: 'no_recipients',
        messageId: messageData.messageId || uuidv4(),
        timestamp: Date.now()
      }));
      return;
    }
    
    // Forward message to recipients
    const messageId = messageData.messageId || uuidv4();
    const forwardMessage = {
      type: 'message',
      from: ws.role === 'doctor' ? ws.doctorId : ws.patientId,
      to: ws.role === 'doctor' ? to : ws.doctorId,
      encryptedData,
      nonce,
      messageId,
      timestamp: timestamp || Date.now(),
      relayedBy: ws.connectionId
    };
    
    recipients.forEach((recipientConnId) => {
      const recipientWs = this.connections.get(recipientConnId);
      if (recipientWs && recipientWs.readyState === 1) {
        recipientWs.send(JSON.stringify(forwardMessage));
        
        this.logger.debug(`Forwarded message ${messageId} to ${recipientConnId}`, {
          from: ws.connectionId,
          to: recipientConnId
        });
      }
    });
    
    // Send delivery confirmation
    ws.send(JSON.stringify({
      type: 'message_status',
      status: 'delivered',
      messageId,
      recipients: recipients.length,
      timestamp: Date.now()
    }));
  }
  
  handleKeyExchange(ws, messageData) {
    if (!ws.authenticated) {
      ws.send(JSON.stringify(createErrorResponse('NOT_AUTHENTICATED', 'Authentication required')));
      return;
    }
    
    const { to, publicKey, keyType } = messageData;
    
    if (!to || !publicKey || !keyType) {
      ws.send(JSON.stringify(createErrorResponse('MISSING_FIELDS', 'Missing required fields')));
      return;
    }
    
    // Forward key exchange to recipient
    const recipients = this.getRecipients(ws, to);
    
    if (recipients.length === 0) {
      ws.send(JSON.stringify(createErrorResponse('NO_RECIPIENT', 'Recipient not found')));
      return;
    }
    
    const forwardMessage = {
      type: 'key_exchange',
      from: ws.role === 'doctor' ? ws.doctorId : ws.patientId,
      to: ws.role === 'doctor' ? to : ws.doctorId,
      publicKey,
      keyType,
      timestamp: Date.now()
    };
    
    recipients.forEach((recipientConnId) => {
      const recipientWs = this.connections.get(recipientConnId);
      if (recipientWs && recipientWs.readyState === 1) {
        recipientWs.send(JSON.stringify(forwardMessage));
      }
    });
  }
  
  handleGenerateQR(ws, messageData) {
    if (!ws.authenticated || ws.role !== 'doctor') {
      ws.send(JSON.stringify(createErrorResponse('UNAUTHORIZED', 'Only doctors can generate QR codes')));
      return;
    }
    
    const doctorId = ws.doctorId;
    
    // Generate QR code data
    const qrData = {
      type: 'medchat_doctor',
      doctorId,
      version: '1.0.0',
      timestamp: Date.now()
    };
    
    // Generate deep link
    const deepLink = `medchat://connect?doctorId=${doctorId}`;
    
    ws.send(JSON.stringify({
      type: 'qr_generated',
      doctorId,
      qrData,
      deepLink,
      timestamp: Date.now()
    }));
  }
  
  handleGetDoctorInfo(ws, messageData) {
    if (!ws.authenticated) {
      ws.send(JSON.stringify(createErrorResponse('NOT_AUTHENTICATED', 'Authentication required')));
      return;
    }
    
    const { doctorId } = messageData;
    
    if (!doctorId) {
      ws.send(JSON.stringify(createErrorResponse('MISSING_DOCTOR_ID', 'Doctor ID is required')));
      return;
    }
    
    const isOnline = this.doctors.has(doctorId);
    const patientCount = isOnline ? this.doctors.get(doctorId).size : 0;
    
    ws.send(JSON.stringify({
      type: 'doctor_info',
      doctorId,
      isOnline,
      patientCount,
      timestamp: Date.now()
    }));
  }
  
  getRecipients(ws, to) {
    const recipients = [];
    
    if (ws.role === 'doctor') {
      // Doctor sending to patient
      const patientConnections = this.patients.get(to);
      if (patientConnections) {
        return Array.from(patientConnections);
      }
    } else if (ws.role === 'patient') {
      // Patient sending to doctor
      const doctorConnections = this.doctors.get(ws.doctorId);
      if (doctorConnections) {
        return Array.from(doctorConnections).filter(
          connId => connId !== ws.connectionId
        );
      }
    }
    
    return recipients;
  }
  
  handleDisconnect(ws) {
    const connectionId = ws.connectionId;
    
    // Remove from connections
    this.connections.delete(connectionId);
    
    // Remove from doctors
    if (ws.role === 'doctor' && ws.doctorId) {
      const doctorConnections = this.doctors.get(ws.doctorId);
      if (doctorConnections) {
        doctorConnections.delete(connectionId);
        if (doctorConnections.size === 0) {
          this.doctors.delete(ws.doctorId);
        }
      }
    }
    
    // Remove from patients
    if (ws.role === 'patient' && ws.patientId) {
      const patientConnections = this.patients.get(ws.patientId);
      if (patientConnections) {
        patientConnections.delete(connectionId);
        if (patientConnections.size === 0) {
          this.patients.delete(ws.patientId);
        }
      }
    }
    
    // Remove from pending auth
    this.pendingAuth.delete(connectionId);
    
    // Remove from rate limiting
    if (ws.ip) {
      this.messageCounts.delete(ws.ip);
    }
    
    this.logger.info(`Connection removed: ${connectionId}`);
  }
  
  isRateLimited(ip) {
    const now = Date.now();
    const limit = this.config.limits.maxMessagesPerMinute;
    
    const countData = this.messageCounts.get(ip);
    
    if (!countData) {
      return false;
    }
    
    // Reset counter if minute has passed
    if (now - countData.lastReset > 60000) {
      countData.count = 0;
      countData.lastReset = now;
    }
    
    return countData.count >= limit;
  }
  
  incrementMessageCount(ip) {
    const now = Date.now();
    
    let countData = this.messageCounts.get(ip);
    
    if (!countData) {
      countData = { count: 0, lastReset: now };
      this.messageCounts.set(ip, countData);
    }
    
    // Reset counter if minute has passed
    if (now - countData.lastReset > 60000) {
      countData.count = 0;
      countData.lastReset = now;
    }
    
    countData.count++;
  }
  
  // Public methods for testing
  getConnectionCount() {
    return this.connections.size;
  }
  
  getDoctorCount() {
    return this.doctors.size;
  }
  
  getPatientCount() {
    return this.patients.size;
  }
}

module.exports = MessageRouter;
