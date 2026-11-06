/**
 * Patient Service for MedChat
 * 
 * Manages patient-specific functionality
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

// Patient Context
const PatientContext = createContext(null);

// Patient Service Provider Component
export const PatientProvider = ({ children }) => {
  const { 
    connect, 
    disconnect, 
    sendMessage, 
    authenticate,
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
    savePatientProfile,
    getPatientProfile,
    saveConversation,
    getConversationById,
    getPatientConversations,
    saveMessage,
    getMessages
  } = useStorage();
  
  const { showNotification } = useNotification();
  
  const [patientProfile, setPatientProfile] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [doctorInfo, setDoctorInfo] = useState(null);

  // Initialize patient service
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Load patient profile
        await loadPatientProfile();
        
        // Connect to WebSocket
        await connect();
        
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize patient service:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    
    initialize();
  }, []);

  // Load patient profile
  const loadPatientProfile = useCallback(async () => {
    try {
      const profile = await getPatientProfile('patient');
      
      if (profile) {
        setPatientProfile(profile);
        
        // Load conversation
        const conv = await getConversationById(profile.conversationId);
        if (conv) {
          setConversation(conv);
        }
      } else {
        // Create new profile if not exists
        const newProfile = {
          id: 'patient',
          doctorId: null,
          uniqueId: null,
          name: '',
          publicKey: null,
          privateKey: null,
          conversationId: null
        };
        
        await savePatientProfile(newProfile);
        setPatientProfile(newProfile);
      }
    } catch (err) {
      console.error('Failed to load patient profile:', err);
      throw err;
    }
  }, [getPatientProfile, savePatientProfile, getConversationById]);

  // Connect to doctor
  const connectToDoctor = useCallback(async (doctorId, patientUniqueId) => {
    try {
      setIsLoading(true);
      
      // Generate key pair if not exists
      let keyPair = getKeyPair('patient');
      
      if (!keyPair) {
        keyPair = generateX25519KeyPair();
      }
      
      // Create or update patient profile
      const profile = {
        id: 'patient',
        doctorId,
        uniqueId: patientUniqueId || uuidv4(),
        name: '',
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        conversationId: null
      };
      
      await savePatientProfile(profile);
      setPatientProfile(profile);
      
      // Authenticate with server
      const success = authenticate('patient', doctorId, profile.uniqueId);
      
      if (!success) {
        throw new Error('Failed to authenticate patient');
      }
      
      setIsOnline(true);
      
      // Setup message listeners
      setupMessageListeners();
      
      // Create conversation
      const conversationId = uuidv4();
      const conversation = {
        id: conversationId,
        type: 'doctor_patient',
        doctorId,
        patientId: profile.uniqueId,
        title: `Chat with Doctor`,
        lastMessage: null,
        lastMessageTime: null,
        unreadCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await saveConversation(conversation);
      profile.conversationId = conversationId;
      await savePatientProfile(profile);
      setConversation(conversation);
      
      setIsLoading(false);
      
      return {
        success: true,
        conversationId,
        patientUniqueId: profile.uniqueId
      };
    } catch (err) {
      console.error('Failed to connect to doctor:', err);
      setError(err.message);
      setIsLoading(false);
      throw err;
    }
  }, [getKeyPair, generateX25519KeyPair, savePatientProfile, authenticate, setupMessageListeners, saveConversation]);

  // Setup message listeners
  const setupMessageListeners = useCallback(() => {
    // Subscribe to auth success
    subscribe('auth_success', async (message) => {
      try {
        if (message.role === 'patient') {
          // Store doctor info
          setDoctorInfo({
            doctorId: message.doctorId,
            patientId: message.patientId
          });
          
          // Initialize key exchange
          await initiateKeyExchange();
        }
      } catch (err) {
        console.error('Error handling auth success:', err);
      }
    });
    
    // Subscribe to messages
    subscribe('message', async (message) => {
      try {
        const { from, to, encryptedData, nonce, messageId, timestamp } = message;
        
        // Check if this is for us
        if (to !== patientProfile?.uniqueId) {
          return;
        }
        
        // Get session key
        const sessionKey = getSessionKey(from);
        
        if (!sessionKey) {
          console.warn('No session key for doctor:', from);
          return;
        }
        
        // Decrypt message
        const decryptedContent = decryptMessage(encryptedData, nonce, sessionKey);
        
        // Save message
        const savedMessage = await saveMessage({
          id: messageId,
          conversationId: conversation?.id,
          senderId: from,
          receiverId: patientProfile.uniqueId,
          encryptedContent: encryptedData,
          nonce,
          content: decryptedContent,
          timestamp: timestamp || Date.now(),
          status: 'delivered',
          isEncrypted: true,
          isRead: false
        });
        
        // Update conversation
        if (conversation) {
          await saveConversation({
            ...conversation,
            lastMessage: decryptedContent.substring(0, 50) + (decryptedContent.length > 50 ? '...' : ''),
            lastMessageTime: timestamp || Date.now(),
            unreadCount: conversation.unreadCount + 1,
            updatedAt: Date.now()
          });
          setConversation(prev => prev ? { ...prev, unreadCount: prev.unreadCount + 1 } : null);
        }
        
        // Reload messages
        await loadMessages();
        
        // Show notification
        showNotification('New Message', 'New message from doctor');
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
    
    // Subscribe to key exchange
    subscribe('key_exchange', async (message) => {
      try {
        const { from, publicKey, keyType } = message;
        
        // This should be the doctor sending their public key
        if (from !== doctorInfo?.doctorId) {
          return;
        }
        
        // Get our private key
        const keyPair = getKeyPair('patient');
        
        if (!keyPair) {
          console.error('Patient key pair not available');
          return;
        }
        
        // Derive shared secret
        const sharedSecret = deriveSharedSecret(keyPair.privateKey, publicKey);
        
        // Derive encryption key
        const sessionKey = await deriveEncryptionKey(sharedSecret, from);
        
        // Store session key
        await storeSessionKey(from, sessionKey);
        
        console.log('Key exchange completed with doctor:', from);
      } catch (err) {
        console.error('Error handling key exchange:', err);
      }
    });
    
    // Subscribe to errors
    subscribe('error', (message) => {
      console.error('Server error:', message);
      setError(message.message || message.code);
    });
  }, [subscribe, patientProfile, conversation, doctorInfo, showNotification, getSessionKey, decryptMessage, saveMessage, saveConversation, loadMessages]);

  // Initiate key exchange
  const initiateKeyExchange = useCallback(async () => {
    try {
      if (!doctorInfo?.doctorId || !patientProfile) {
        return;
      }
      
      // Get our key pair
      const keyPair = getKeyPair('patient');
      
      if (!keyPair) {
        throw new Error('Patient key pair not available');
      }
      
      // Send public key to doctor
      const message = {
        type: 'key_exchange',
        to: doctorInfo.doctorId,
        publicKey: keyPair.publicKey,
        keyType: 'X25519'
      };
      
      const success = sendMessage(message);
      
      if (!success) {
        throw new Error('Failed to send public key');
      }
      
      console.log('Key exchange initiated with doctor:', doctorInfo.doctorId);
    } catch (err) {
      console.error('Failed to initiate key exchange:', err);
      throw err;
    }
  }, [doctorInfo, patientProfile, getKeyPair, sendMessage]);

  // Load messages
  const loadMessages = useCallback(async (limit = 50, offset = 0) => {
    try {
      if (!conversation?.id) {
        return [];
      }
      
      const loadedMessages = await getMessages(conversation.id, limit, offset);
      
      // Decrypt messages
      const decryptedMessages = await Promise.all(
        loadedMessages.map(async (msg) => {
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
      
      setMessages(decryptedMessages);
      return decryptedMessages;
    } catch (err) {
      console.error('Failed to load messages:', err);
      throw err;
    }
  }, [conversation, getMessages, getSessionKey, decryptMessage]);

  // Send message to doctor
  const sendMessageToDoctor = useCallback(async (messageText) => {
    try {
      if (!conversation || !doctorInfo?.doctorId) {
        throw new Error('Not connected to doctor');
      }
      
      // Get session key
      const sessionKey = getSessionKey(doctorInfo.doctorId);
      
      if (!sessionKey) {
        // Try to initiate key exchange
        await initiateKeyExchange();
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
        to: doctorInfo.doctorId,
        from: patientProfile.uniqueId,
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
        senderId: patientProfile.uniqueId,
        receiverId: doctorInfo.doctorId,
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
      
      // Reload messages
      await loadMessages();
      
      return {
        success: true,
        messageId,
        timestamp
      };
    } catch (err) {
      console.error('Failed to send message to doctor:', err);
      throw err;
    }
  }, [conversation, doctorInfo, patientProfile, getSessionKey, encryptMessage, sendMessage, initiateKeyExchange, saveMessage, saveConversation, loadMessages]);

  // Update patient profile
  const updatePatientProfile = useCallback(async (updates) => {
    try {
      const profile = { ...patientProfile, ...updates, updatedAt: Date.now() };
      await savePatientProfile(profile);
      setPatientProfile(profile);
      return profile;
    } catch (err) {
      console.error('Failed to update patient profile:', err);
      throw err;
    }
  }, [patientProfile, savePatientProfile]);

  // Disconnect from doctor
  const disconnectFromDoctor = useCallback(async () => {
    try {
      // Remove session key
      if (doctorInfo?.doctorId) {
        await removeSessionKey(doctorInfo.doctorId);
      }
      
      // Clear conversation
      setConversation(null);
      setMessages([]);
      
      // Clear doctor info
      setDoctorInfo(null);
      
      // Update profile
      const profile = { ...patientProfile, doctorId: null, conversationId: null };
      await savePatientProfile(profile);
      setPatientProfile(profile);
      
      // Disconnect from server
      disconnect();
      
      setIsOnline(false);
      
      return true;
    } catch (err) {
      console.error('Failed to disconnect from doctor:', err);
      throw err;
    }
  }, [doctorInfo, patientProfile, removeSessionKey, savePatientProfile, disconnect]);

  // Mark all messages as read
  const markAllMessagesAsRead = useCallback(async () => {
    try {
      if (!conversation?.id) {
        return false;
      }
      
      await executeSql('UPDATE messages SET isRead = 1 WHERE conversationId = ?', [conversation.id]);
      
      // Reset unread count
      await executeSql('UPDATE conversations SET unreadCount = 0 WHERE id = ?', [conversation.id]);
      
      setConversation(prev => prev ? { ...prev, unreadCount: 0 } : null);
      
      return true;
    } catch (err) {
      console.error('Failed to mark all messages as read:', err);
      throw err;
    }
  }, [conversation]);

  // Context value
  const contextValue = {
    // State
    patientProfile,
    conversation,
    messages,
    isLoading,
    error,
    isOnline,
    connectionState,
    doctorInfo,
    
    // Actions
    connect,
    disconnect,
    loadPatientProfile,
    connectToDoctor,
    updatePatientProfile,
    sendMessageToDoctor,
    loadMessages,
    disconnectFromDoctor,
    markAllMessagesAsRead,
    
    // Helpers
    getMessageById: (id) => messages.find(m => m.id === id),
    getUnreadCount: () => conversation?.unreadCount || 0
  };

  return (
    <PatientContext.Provider value={contextValue}>
      {children}
    </PatientContext.Provider>
  );
};

// Custom hook to use Patient context
export const usePatient = () => {
  const context = useContext(PatientContext);
  
  if (!context) {
    throw new Error('usePatient must be used within a PatientProvider');
  }
  
  return context;
};
