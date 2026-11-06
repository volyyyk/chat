/**
 * Doctor Service for MedChat
 * 
 * Manages doctor-specific functionality
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWebSocket, MESSAGE_TYPES, CONNECTION_STATES } from './WebSocketService';
import { useCrypto } from './CryptoService';
import { useStorage } from './StorageService';
import { useNotification } from './NotificationService';
import config from '../config';

// Doctor Context
const DoctorContext = createContext(null);

// Doctor Service Provider Component
export const DoctorProvider = ({ children }) => {
  const { 
    connect, 
    disconnect, 
    sendMessage, 
    authenticate, 
    generateQRCode,
    subscribe,
    isConnected,
    getConnectionStatus,
    connectionState
  } = useWebSocket();
  
  const { 
    generateX25519KeyPair,
    deriveSharedSecret,
    deriveEncryptionKey,
    encryptMessage,
    decryptMessage,
    getKeyPair,
    storeSessionKey,
    getSessionKey,
    removeSessionKey
  } = useCrypto();
  
  const { 
    saveDoctorProfile,
    getDoctorProfile,
    getPatientsForDoctor,
    savePatientProfile,
    getPatientProfile,
    saveConversation,
    getConversationById,
    getDoctorConversations,
    saveMessage,
    getMessages,
    saveFile,
    getFilesForConversation,
    deleteFile
  } = useStorage();
  
  const { showNotification } = useNotification();
  
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [patients, setPatients] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(false);

  // Initialize doctor service
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Load doctor profile
        await loadDoctorProfile();
        
        // Connect to WebSocket
        await connect();
        
        // Authenticate
        await authenticateDoctor();
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize doctor service:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    
    initialize();
  }, []);

  // Load doctor profile
  const loadDoctorProfile = useCallback(async () => {
    try {
      const profile = await getDoctorProfile('doctor');
      
      if (profile) {
        setDoctorProfile(profile);
      } else {
        // Create new profile if not exists
        const newProfile = {
          id: 'doctor',
          name: '',
          specialty: '',
          publicKey: null,
          privateKey: null
        };
        
        await saveDoctorProfile(newProfile);
        setDoctorProfile(newProfile);
      }
    } catch (err) {
      console.error('Failed to load doctor profile:', err);
      throw err;
    }
  }, [getDoctorProfile, saveDoctorProfile]);

  // Authenticate doctor
  const authenticateDoctor = useCallback(async () => {
    try {
      const profile = await getDoctorProfile('doctor');
      
      if (!profile) {
        throw new Error('Doctor profile not found');
      }
      
      // Generate key pair if not exists
      let keyPair = getKeyPair('doctor');
      
      if (!keyPair) {
        keyPair = generateX25519KeyPair();
        
        // Update profile with key pair
        profile.publicKey = keyPair.publicKey;
        profile.privateKey = keyPair.privateKey;
        
        await saveDoctorProfile(profile);
        setDoctorProfile(profile);
      }
      
      // Authenticate with server
      const doctorId = profile.id || uuidv4();
      
      const success = authenticate('doctor', doctorId);
      
      if (!success) {
        throw new Error('Failed to authenticate doctor');
      }
      
      setIsOnline(true);
      
      // Setup message listeners
      setupMessageListeners();
      
      return doctorId;
    } catch (err) {
      console.error('Failed to authenticate doctor:', err);
      throw err;
    }
  }, [getDoctorProfile, saveDoctorProfile, getKeyPair, generateX25519KeyPair, authenticate, setupMessageListeners]);

  // Setup message listeners
  const setupMessageListeners = useCallback(() => {
    // Subscribe to new patient notifications
    subscribe('new_patient', async (message) => {
      try {
        const { patientId, connectionId } = message;
        
        // Create new patient profile
        const newPatient = {
          id: uuidv4(),
          doctorId: doctorProfile.id,
          uniqueId: patientId,
          name: `Patient ${patientId.substring(0, 8)}`,
          publicKey: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await savePatientProfile(newPatient);
        
        // Create conversation
        const conversationId = uuidv4();
        const conversation = {
          id: conversationId,
          type: 'doctor_patient',
          doctorId: doctorProfile.id,
          patientId: newPatient.id,
          title: newPatient.name,
          lastMessage: null,
          lastMessageTime: null,
          unreadCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        
        await saveConversation(conversation);
        
        // Reload patients and conversations
        await loadPatients();
        await loadConversations();
        
        // Show notification
        showNotification('New Patient', `New patient connected: ${patientId}`);
      } catch (err) {
        console.error('Error handling new patient:', err);
      }
    });
    
    // Subscribe to messages
    subscribe('message', async (message) => {
      try {
        const { from, to, encryptedData, nonce, messageId, timestamp } = message;
        
        // Check if this is for us
        if (to !== doctorProfile.id) {
          return;
        }
        
        // Get session key for this patient
        const sessionKey = getSessionKey(from);
        
        if (!sessionKey) {
          console.warn('No session key for patient:', from);
          return;
        }
        
        // Decrypt message
        const decryptedContent = decryptMessage(encryptedData, nonce, sessionKey);
        
        // Find conversation
        const patient = patients.find(p => p.uniqueId === from);
        
        if (!patient) {
          console.warn('Patient not found:', from);
          return;
        }
        
        const conversation = conversations.find(c => c.patientId === patient.id);
        
        if (!conversation) {
          console.warn('Conversation not found for patient:', from);
          return;
        }
        
        // Save message
        const savedMessage = await saveMessage({
          id: messageId,
          conversationId: conversation.id,
          senderId: from,
          receiverId: doctorProfile.id,
          encryptedContent: encryptedData,
          nonce,
          content: decryptedContent,
          timestamp: timestamp || Date.now(),
          status: 'delivered',
          isEncrypted: true,
          isRead: false
        });
        
        // Update conversation
        await saveConversation({
          ...conversation,
          lastMessage: decryptedContent.substring(0, 50) + (decryptedContent.length > 50 ? '...' : ''),
          lastMessageTime: timestamp || Date.now(),
          unreadCount: conversation.unreadCount + 1,
          updatedAt: Date.now()
        });
        
        // Reload conversations
        await loadConversations();
        
        // Show notification
        showNotification('New Message', `New message from ${patient.name}`);
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
    
    // Subscribe to key exchange
    subscribe('key_exchange', async (message) => {
      try {
        const { from, publicKey, keyType } = message;
        
        // This should be a patient sending their public key
        const patient = patients.find(p => p.uniqueId === from);
        
        if (!patient) {
          console.warn('Patient not found for key exchange:', from);
          return;
        }
        
        // Get our private key
        const keyPair = getKeyPair('doctor');
        
        if (!keyPair) {
          console.error('Doctor key pair not available');
          return;
        }
        
        // Derive shared secret
        const sharedSecret = deriveSharedSecret(keyPair.privateKey, publicKey);
        
        // Derive encryption key
        const sessionKey = await deriveEncryptionKey(sharedSecret, from);
        
        // Store session key
        await storeSessionKey(from, sessionKey);
        
        // Update patient profile with public key
        patient.publicKey = publicKey;
        await savePatientProfile(patient);
        
        console.log('Key exchange completed with patient:', from);
      } catch (err) {
        console.error('Error handling key exchange:', err);
      }
    });
    
    // Subscribe to errors
    subscribe('error', (message) => {
      console.error('Server error:', message);
      setError(message.message || message.code);
    });
  }, [subscribe, doctorProfile, patients, conversations, showNotification, getSessionKey, decryptMessage, saveMessage, saveConversation, loadConversations, savePatientProfile]);

  // Load patients
  const loadPatients = useCallback(async () => {
    try {
      const loadedPatients = await getPatientsForDoctor(doctorProfile?.id || 'doctor');
      setPatients(loadedPatients);
      return loadedPatients;
    } catch (err) {
      console.error('Failed to load patients:', err);
      throw err;
    }
  }, [doctorProfile, getPatientsForDoctor]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const loadedConversations = await getDoctorConversations(doctorProfile?.id || 'doctor');
      setConversations(loadedConversations);
      return loadedConversations;
    } catch (err) {
      console.error('Failed to load conversations:', err);
      throw err;
    }
  }, [doctorProfile, getDoctorConversations]);

  // Update doctor profile
  const updateDoctorProfile = useCallback(async (updates) => {
    try {
      const profile = { ...doctorProfile, ...updates, updatedAt: Date.now() };
      await saveDoctorProfile(profile);
      setDoctorProfile(profile);
      return profile;
    } catch (err) {
      console.error('Failed to update doctor profile:', err);
      throw err;
    }
  }, [doctorProfile, saveDoctorProfile]);

  // Generate QR code
  const generateDoctorQRCode = useCallback(async () => {
    try {
      const doctorId = doctorProfile?.id || 'doctor';
      
      // Request QR code from server
      const success = generateQRCode();
      
      if (!success) {
        throw new Error('Failed to generate QR code');
      }
      
      // Generate deep link
      const deepLink = `medchat://connect?doctorId=${doctorId}`;
      
      // Update profile with QR code data
      const qrCodeData = {
        doctorId,
        deepLink,
        timestamp: Date.now()
      };
      
      await updateDoctorProfile({ qrCodeData });
      
      return {
        qrCodeData,
        deepLink,
        doctorId
      };
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      throw err;
    }
  }, [doctorProfile, generateQRCode, updateDoctorProfile]);

  // Start key exchange with patient
  const startKeyExchange = useCallback(async (patientId) => {
    try {
      const patient = patients.find(p => p.id === patientId);
      
      if (!patient) {
        throw new Error('Patient not found');
      }
      
      // Get our key pair
      const keyPair = getKeyPair('doctor');
      
      if (!keyPair) {
        throw new Error('Doctor key pair not available');
      }
      
      // Send public key to patient
      const message = {
        type: 'key_exchange',
        to: patient.uniqueId,
        publicKey: keyPair.publicKey,
        keyType: 'X25519'
      };
      
      const success = sendMessage(message);
      
      if (!success) {
        throw new Error('Failed to send public key');
      }
      
      // Store that we initiated key exchange
      patient.keyExchangeInitiated = true;
      await savePatientProfile(patient);
      
      return true;
    } catch (err) {
      console.error('Failed to start key exchange:', err);
      throw err;
    }
  }, [patients, getKeyPair, sendMessage, savePatientProfile]);

  // Send message to patient
  const sendMessageToPatient = useCallback(async (patientId, messageText, attachments = []) => {
    try {
      const patient = patients.find(p => p.id === patientId);
      
      if (!patient) {
        throw new Error('Patient not found');
      }
      
      // Find conversation
      const conversation = conversations.find(c => c.patientId === patientId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Get session key
      const sessionKey = getSessionKey(patient.uniqueId);
      
      if (!sessionKey) {
        // Try to initiate key exchange
        await startKeyExchange(patientId);
        return { success: false, message: 'Key exchange required' };
      }
      
      // Encrypt message
      const encrypted = encryptMessage(messageText, sessionKey);
      
      // Generate message ID
      const messageId = uuidv4();
      const timestamp = Date.now();
      
      // Send message to server
      const message = {
        type: 'message',
        to: patient.uniqueId,
        from: doctorProfile.id,
        encryptedData: encrypted.ciphertext,
        nonce: encrypted.nonce,
        messageId,
        timestamp
      };
      
      const success = sendMessage(message);
      
      if (!success) {
        throw new Error('Failed to send message');
      }
      
      // Save message locally
      await saveMessage({
        id: messageId,
        conversationId: conversation.id,
        senderId: doctorProfile.id,
        receiverId: patient.uniqueId,
        encryptedContent: encrypted.ciphertext,
        nonce: encrypted.nonce,
        content: messageText,
        timestamp,
        status: 'sent',
        isEncrypted: true,
        isRead: true
      });
      
      // Update conversation
      await saveConversation({
        ...conversation,
        lastMessage: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
        lastMessageTime: timestamp,
        updatedAt: timestamp
      });
      
      // Reload conversations
      await loadConversations();
      
      return {
        success: true,
        messageId,
        timestamp
      };
    } catch (err) {
      console.error('Failed to send message to patient:', err);
      throw err;
    }
  }, [patients, conversations, doctorProfile, getSessionKey, encryptMessage, sendMessage, startKeyExchange, saveMessage, saveConversation, loadConversations]);

  // Get messages with patient
  const getMessagesWithPatient = useCallback(async (patientId, limit = 50, offset = 0) => {
    try {
      const conversation = conversations.find(c => c.patientId === patientId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      const messages = await getMessages(conversation.id, limit, offset);
      
      // Decrypt messages
      const decryptedMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.isEncrypted && msg.encryptedContent && msg.nonce) {
            const sessionKey = getSessionKey(msg.senderId);
            
            if (sessionKey) {
              try {
                const decrypted = decryptMessage(msg.encryptedContent, msg.nonce, sessionKey);
                return { ...msg, content: decrypted };
              } catch (err) {
                console.warn('Failed to decrypt message:', err);
                return msg;
              }
            }
          }
          return msg;
        })
      );
      
      return decryptedMessages;
    } catch (err) {
      console.error('Failed to get messages with patient:', err);
      throw err;
    }
  }, [conversations, getMessages, getSessionKey, decryptMessage]);

  // Add file to patient card
  const addFileToPatient = useCallback(async (patientId, file) => {
    try {
      const patient = patients.find(p => p.id === patientId);
      
      if (!patient) {
        throw new Error('Patient not found');
      }
      
      // Find conversation
      const conversation = conversations.find(c => c.patientId === patientId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Create file record
      const fileId = uuidv4();
      const now = Date.now();
      
      const fileRecord = {
        id: fileId,
        conversationId: conversation.id,
        name: file.name,
        type: file.type,
        size: file.size,
        path: file.uri,
        encryptedPath: file.encryptedUri || null,
        nonce: file.nonce || null,
        description: file.description || '',
        uploadedBy: doctorProfile.id,
        uploadedAt: now,
        isEncrypted: file.isEncrypted || false
      };
      
      await saveFile(fileRecord);
      
      // Update conversation
      await saveConversation({
        ...conversation,
        updatedAt: now
      });
      
      return fileRecord;
    } catch (err) {
      console.error('Failed to add file to patient:', err);
      throw err;
    }
  }, [patients, conversations, doctorProfile, saveFile, saveConversation]);

  // Get files for patient
  const getFilesForPatient = useCallback(async (patientId) => {
    try {
      const conversation = conversations.find(c => c.patientId === patientId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      const files = await getFilesForConversation(conversation.id);
      return files;
    } catch (err) {
      console.error('Failed to get files for patient:', err);
      throw err;
    }
  }, [conversations, getFilesForConversation]);

  // Delete file from patient card
  const deleteFileFromPatient = useCallback(async (fileId) => {
    try {
      await deleteFile(fileId);
    } catch (err) {
      console.error('Failed to delete file from patient:', err);
      throw err;
    }
  }, [deleteFile]);

  // Delete patient
  const deletePatient = useCallback(async (patientId) => {
    try {
      // Find patient
      const patient = patients.find(p => p.id === patientId);
      
      if (!patient) {
        throw new Error('Patient not found');
      }
      
      // Find conversation
      const conversation = conversations.find(c => c.patientId === patientId);
      
      if (conversation) {
        // Delete conversation and all related data
        await deleteConversation(conversation.id);
      }
      
      // Delete patient profile
      await deletePatientProfile(patientId);
      
      // Remove session key
      await removeSessionKey(patient.uniqueId);
      
      // Reload patients and conversations
      await loadPatients();
      await loadConversations();
      
      return true;
    } catch (err) {
      console.error('Failed to delete patient:', err);
      throw err;
    }
  }, [patients, conversations, deleteConversation, deletePatientProfile, removeSessionKey, loadPatients, loadConversations]);

  // Delete conversation
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      // Delete all messages in conversation
      await executeSql('DELETE FROM messages WHERE conversationId = ?', [conversationId]);
      
      // Delete all files in conversation
      await executeSql('DELETE FROM files WHERE conversationId = ?', [conversationId]);
      
      // Delete conversation
      await executeSql('DELETE FROM conversations WHERE id = ?', [conversationId]);
      
      // Reload conversations
      await loadConversations();
      
      return true;
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      throw err;
    }
  }, [loadConversations]);

  // Mark all messages as read
  const markAllMessagesAsRead = useCallback(async (conversationId) => {
    try {
      await executeSql('UPDATE messages SET isRead = 1 WHERE conversationId = ?', [conversationId]);
      
      // Reset unread count
      await executeSql('UPDATE conversations SET unreadCount = 0 WHERE id = ?', [conversationId]);
      
      // Reload conversations
      await loadConversations();
      
      return true;
    } catch (err) {
      console.error('Failed to mark all messages as read:', err);
      throw err;
    }
  }, [loadConversations]);

  // Context value
  const contextValue = {
    // State
    doctorProfile,
    patients,
    conversations,
    isLoading,
    error,
    isOnline,
    connectionState,
    
    // Actions
    connect,
    disconnect,
    loadDoctorProfile,
    authenticateDoctor,
    updateDoctorProfile,
    generateDoctorQRCode,
    loadPatients,
    loadConversations,
    startKeyExchange,
    sendMessageToPatient,
    getMessagesWithPatient,
    addFileToPatient,
    getFilesForPatient,
    deleteFileFromPatient,
    deletePatient,
    deleteConversation,
    markAllMessagesAsRead,
    
    // Helpers
    getPatientById: (id) => patients.find(p => p.id === id),
    getConversationByPatientId: (patientId) => conversations.find(c => c.patientId === patientId),
    getUnreadCount: () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  };

  return (
    <DoctorContext.Provider value={contextValue}>
      {children}
    </DoctorContext.Provider>
  );
};

// Custom hook to use Doctor context
export const useDoctor = () => {
  const context = useContext(DoctorContext);
  
  if (!context) {
    throw new Error('useDoctor must be used within a DoctorProvider');
  }
  
  return context;
};
