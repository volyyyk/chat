/**
 * Storage Service for MedChat
 * 
 * Manages local storage of messages, files, and application data
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import SQLite from 'react-native-sqlite-storage';
import config from '../config';

// Storage Context
const StorageContext = createContext(null);

// Database name
const DATABASE_NAME = config.storage.database;

// Table definitions
const TABLE_DEFINITIONS = {
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      receiverId TEXT NOT NULL,
      content TEXT,
      encryptedContent TEXT,
      nonce TEXT,
      timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'sent',
      isEncrypted INTEGER DEFAULT 1,
      isRead INTEGER DEFAULT 0,
      FOREIGN KEY (conversationId) REFERENCES conversations(id)
    )
  `,
  
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      doctorId TEXT,
      patientId TEXT,
      title TEXT,
      lastMessage TEXT,
      lastMessageTime INTEGER,
      unreadCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `,
  
  files: `
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      encryptedPath TEXT,
      nonce TEXT,
      description TEXT,
      uploadedBy TEXT NOT NULL,
      uploadedAt INTEGER NOT NULL,
      isEncrypted INTEGER DEFAULT 1,
      FOREIGN KEY (conversationId) REFERENCES conversations(id)
    )
  `,
  
  doctors: `
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT,
      specialty TEXT,
      publicKey TEXT,
      privateKey TEXT,
      qrCodeData TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `,
  
  patients: `
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      doctorId TEXT NOT NULL,
      name TEXT,
      uniqueId TEXT NOT NULL,
      publicKey TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      lastMessageTime INTEGER,
      FOREIGN KEY (doctorId) REFERENCES doctors(id)
    )
  `,
  
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      updatedAt INTEGER NOT NULL
    )
  `
};

// Initialize database
let database = null;

export const initDatabase = async () => {
  try {
    // Open database
    database = await SQLite.openDatabase({
      name: DATABASE_NAME,
      location: 'default',
      createFromLocation: 1
    });
    
    // Create tables
    for (const [tableName, definition] of Object.entries(TABLE_DEFINITIONS)) {
      await executeSql(definition);
    }
    
    console.log('Database initialized successfully');
    return database;
  } catch (err) {
    console.error('Failed to initialize database:', err);
    throw err;
  }
};

// Execute SQL query
const executeSql = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (!database) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    database.executeSql(
      sql,
      params,
      (_, result) => resolve(result),
      (_, error) => reject(error)
    );
  });
};

// Storage Provider Component
export const StorageProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize storage
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Initialize database if not already initialized
        if (!database) {
          await initDatabase();
        }
        
        setIsInitialized(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize storage:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    
    initialize();
  }, []);

  // ============ MESSAGE OPERATIONS ============

  // Save message
  const saveMessage = useCallback(async (message) => {
    try {
      const { 
        id, 
        conversationId, 
        senderId, 
        receiverId, 
        content, 
        encryptedContent,
        nonce,
        timestamp,
        status = 'sent',
        isEncrypted = true,
        isRead = false
      } = message;
      
      const sql = `
        INSERT OR REPLACE INTO messages 
        (id, conversationId, senderId, receiverId, content, encryptedContent, nonce, timestamp, status, isEncrypted, isRead)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        id,
        conversationId,
        senderId,
        receiverId,
        content || null,
        encryptedContent || null,
        nonce || null,
        timestamp || Date.now(),
        status,
        isEncrypted ? 1 : 0,
        isRead ? 1 : 0
      ];
      
      await executeSql(sql, params);
      
      // Update conversation
      await updateConversationLastMessage(conversationId, encryptedContent || content, timestamp || Date.now());
      
      return message;
    } catch (err) {
      console.error('Failed to save message:', err);
      throw err;
    }
  }, []);

  // Get messages for conversation
  const getMessages = useCallback(async (conversationId, limit = 50, offset = 0) => {
    try {
      const sql = `
        SELECT * FROM messages 
        WHERE conversationId = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `;
      
      const result = await executeSql(sql, [conversationId, limit, offset]);
      
      const messages = [];
      for (let i = 0; i < result.rows.length; i++) {
        messages.push(result.rows.item(i));
      }
      
      return messages.reverse(); // Return in chronological order
    } catch (err) {
      console.error('Failed to get messages:', err);
      throw err;
    }
  }, []);

  // Get message by ID
  const getMessageById = useCallback(async (id) => {
    try {
      const sql = 'SELECT * FROM messages WHERE id = ?';
      const result = await executeSql(sql, [id]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0);
      }
      return null;
    } catch (err) {
      console.error('Failed to get message by ID:', err);
      throw err;
    }
  }, []);

  // Update message status
  const updateMessageStatus = useCallback(async (id, status) => {
    try {
      const sql = 'UPDATE messages SET status = ? WHERE id = ?';
      await executeSql(sql, [status, id]);
    } catch (err) {
      console.error('Failed to update message status:', err);
      throw err;
    }
  }, []);

  // Mark message as read
  const markMessageAsRead = useCallback(async (id) => {
    try {
      const sql = 'UPDATE messages SET isRead = 1 WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to mark message as read:', err);
      throw err;
    }
  }, []);

  // Delete message
  const deleteMessage = useCallback(async (id) => {
    try {
      const sql = 'DELETE FROM messages WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to delete message:', err);
      throw err;
    }
  }, []);

  // ============ CONVERSATION OPERATIONS ============

  // Create or update conversation
  const saveConversation = useCallback(async (conversation) => {
    try {
      const {
        id,
        type,
        doctorId,
        patientId,
        title,
        lastMessage,
        lastMessageTime,
        unreadCount = 0
      } = conversation;
      
      const now = Date.now();
      
      const sql = `
        INSERT OR REPLACE INTO conversations 
        (id, type, doctorId, patientId, title, lastMessage, lastMessageTime, unreadCount, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT createdAt FROM conversations WHERE id = ?), ?), ?)
      `;
      
      const params = [
        id,
        type,
        doctorId || null,
        patientId || null,
        title || null,
        lastMessage || null,
        lastMessageTime || null,
        unreadCount,
        id,
        now,
        now
      ];
      
      await executeSql(sql, params);
      return conversation;
    } catch (err) {
      console.error('Failed to save conversation:', err);
      throw err;
    }
  }, []);

  // Get conversation by ID
  const getConversationById = useCallback(async (id) => {
    try {
      const sql = 'SELECT * FROM conversations WHERE id = ?';
      const result = await executeSql(sql, [id]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0);
      }
      return null;
    } catch (err) {
      console.error('Failed to get conversation by ID:', err);
      throw err;
    }
  }, []);

  // Get all conversations for doctor
  const getDoctorConversations = useCallback(async (doctorId) => {
    try {
      const sql = `
        SELECT * FROM conversations 
        WHERE type = 'doctor_patient' AND doctorId = ?
        ORDER BY lastMessageTime DESC
      `;
      
      const result = await executeSql(sql, [doctorId]);
      
      const conversations = [];
      for (let i = 0; i < result.rows.length; i++) {
        conversations.push(result.rows.item(i));
      }
      
      return conversations;
    } catch (err) {
      console.error('Failed to get doctor conversations:', err);
      throw err;
    }
  }, []);

  // Get all conversations for patient
  const getPatientConversations = useCallback(async (patientId) => {
    try {
      const sql = `
        SELECT * FROM conversations 
        WHERE type = 'doctor_patient' AND patientId = ?
        ORDER BY lastMessageTime DESC
      `;
      
      const result = await executeSql(sql, [patientId]);
      
      const conversations = [];
      for (let i = 0; i < result.rows.length; i++) {
        conversations.push(result.rows.item(i));
      }
      
      return conversations;
    } catch (err) {
      console.error('Failed to get patient conversations:', err);
      throw err;
    }
  }, []);

  // Update conversation last message
  const updateConversationLastMessage = useCallback(async (conversationId, message, timestamp) => {
    try {
      const sql = `
        UPDATE conversations 
        SET lastMessage = ?, lastMessageTime = ?, updatedAt = ?
        WHERE id = ?
      `;
      
      await executeSql(sql, [message, timestamp, timestamp, conversationId]);
    } catch (err) {
      console.error('Failed to update conversation last message:', err);
      throw err;
    }
  }, []);

  // Increment unread count
  const incrementUnreadCount = useCallback(async (conversationId) => {
    try {
      const sql = `
        UPDATE conversations 
        SET unreadCount = unreadCount + 1, updatedAt = ?
        WHERE id = ?
      `;
      
      await executeSql(sql, [Date.now(), conversationId]);
    } catch (err) {
      console.error('Failed to increment unread count:', err);
      throw err;
    }
  }, []);

  // Reset unread count
  const resetUnreadCount = useCallback(async (conversationId) => {
    try {
      const sql = 'UPDATE conversations SET unreadCount = 0, updatedAt = ? WHERE id = ?';
      await executeSql(sql, [Date.now(), conversationId]);
    } catch (err) {
      console.error('Failed to reset unread count:', err);
      throw err;
    }
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(async (id) => {
    try {
      // Delete messages first
      await executeSql('DELETE FROM messages WHERE conversationId = ?', [id]);
      
      // Delete files
      await executeSql('DELETE FROM files WHERE conversationId = ?', [id]);
      
      // Delete conversation
      const sql = 'DELETE FROM conversations WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      throw err;
    }
  }, []);

  // ============ FILE OPERATIONS ============

  // Save file metadata
  const saveFile = useCallback(async (file) => {
    try {
      const {
        id,
        conversationId,
        name,
        type,
        size,
        path,
        encryptedPath,
        nonce,
        description,
        uploadedBy,
        isEncrypted = true
      } = file;
      
      const uploadedAt = Date.now();
      
      const sql = `
        INSERT OR REPLACE INTO files 
        (id, conversationId, name, type, size, path, encryptedPath, nonce, description, uploadedBy, uploadedAt, isEncrypted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        id,
        conversationId,
        name,
        type,
        size,
        path,
        encryptedPath || null,
        nonce || null,
        description || null,
        uploadedBy,
        uploadedAt,
        isEncrypted ? 1 : 0
      ];
      
      await executeSql(sql, params);
      return file;
    } catch (err) {
      console.error('Failed to save file:', err);
      throw err;
    }
  }, []);

  // Get files for conversation
  const getFilesForConversation = useCallback(async (conversationId) => {
    try {
      const sql = `
        SELECT * FROM files 
        WHERE conversationId = ?
        ORDER BY uploadedAt DESC
      `;
      
      const result = await executeSql(sql, [conversationId]);
      
      const files = [];
      for (let i = 0; i < result.rows.length; i++) {
        files.push(result.rows.item(i));
      }
      
      return files;
    } catch (err) {
      console.error('Failed to get files for conversation:', err);
      throw err;
    }
  }, []);

  // Get file by ID
  const getFileById = useCallback(async (id) => {
    try {
      const sql = 'SELECT * FROM files WHERE id = ?';
      const result = await executeSql(sql, [id]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0);
      }
      return null;
    } catch (err) {
      console.error('Failed to get file by ID:', err);
      throw err;
    }
  }, []);

  // Delete file
  const deleteFile = useCallback(async (id) => {
    try {
      // Get file first to delete the actual file
      const file = await getFileById(id);
      
      if (file && file.path) {
        try {
          await FileSystem.deleteAsync(file.path);
        } catch (fileErr) {
          console.warn('Failed to delete file from filesystem:', fileErr);
        }
      }
      
      if (file && file.encryptedPath) {
        try {
          await FileSystem.deleteAsync(file.encryptedPath);
        } catch (fileErr) {
          console.warn('Failed to delete encrypted file from filesystem:', fileErr);
        }
      }
      
      const sql = 'DELETE FROM files WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to delete file:', err);
      throw err;
    }
  }, [getFileById]);

  // ============ DOCTOR OPERATIONS ============

  // Save doctor profile
  const saveDoctorProfile = useCallback(async (doctor) => {
    try {
      const {
        id,
        name,
        specialty,
        publicKey,
        privateKey,
        qrCodeData
      } = doctor;
      
      const now = Date.now();
      
      const sql = `
        INSERT OR REPLACE INTO doctors 
        (id, name, specialty, publicKey, privateKey, qrCodeData, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT createdAt FROM doctors WHERE id = ?), ?), ?)
      `;
      
      const params = [
        id,
        name || null,
        specialty || null,
        publicKey || null,
        privateKey || null,
        qrCodeData || null,
        id,
        now,
        now
      ];
      
      await executeSql(sql, params);
      return doctor;
    } catch (err) {
      console.error('Failed to save doctor profile:', err);
      throw err;
    }
  }, []);

  // Get doctor profile
  const getDoctorProfile = useCallback(async (id) => {
    try {
      const sql = 'SELECT * FROM doctors WHERE id = ?';
      const result = await executeSql(sql, [id]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0);
      }
      return null;
    } catch (err) {
      console.error('Failed to get doctor profile:', err);
      throw err;
    }
  }, []);

  // Delete doctor profile
  const deleteDoctorProfile = useCallback(async (id) => {
    try {
      const sql = 'DELETE FROM doctors WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to delete doctor profile:', err);
      throw err;
    }
  }, []);

  // ============ PATIENT OPERATIONS ============

  // Save patient profile
  const savePatientProfile = useCallback(async (patient) => {
    try {
      const {
        id,
        doctorId,
        name,
        uniqueId,
        publicKey
      } = patient;
      
      const now = Date.now();
      
      const sql = `
        INSERT OR REPLACE INTO patients 
        (id, doctorId, name, uniqueId, publicKey, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT createdAt FROM patients WHERE id = ?), ?), ?)
      `;
      
      const params = [
        id,
        doctorId,
        name || null,
        uniqueId,
        publicKey || null,
        id,
        now,
        now
      ];
      
      await executeSql(sql, params);
      return patient;
    } catch (err) {
      console.error('Failed to save patient profile:', err);
      throw err;
    }
  }, []);

  // Get patient profile
  const getPatientProfile = useCallback(async (id) => {
    try {
      const sql = 'SELECT * FROM patients WHERE id = ?';
      const result = await executeSql(sql, [id]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0);
      }
      return null;
    } catch (err) {
      console.error('Failed to get patient profile:', err);
      throw err;
    }
  }, []);

  // Get patients for doctor
  const getPatientsForDoctor = useCallback(async (doctorId) => {
    try {
      const sql = `
        SELECT * FROM patients 
        WHERE doctorId = ?
        ORDER BY updatedAt DESC
      `;
      
      const result = await executeSql(sql, [doctorId]);
      
      const patients = [];
      for (let i = 0; i < result.rows.length; i++) {
        patients.push(result.rows.item(i));
      }
      
      return patients;
    } catch (err) {
      console.error('Failed to get patients for doctor:', err);
      throw err;
    }
  }, []);

  // Delete patient profile
  const deletePatientProfile = useCallback(async (id) => {
    try {
      const sql = 'DELETE FROM patients WHERE id = ?';
      await executeSql(sql, [id]);
    } catch (err) {
      console.error('Failed to delete patient profile:', err);
      throw err;
    }
  }, []);

  // ============ SETTINGS OPERATIONS ============

  // Save setting
  const saveSetting = useCallback(async (key, value) => {
    try {
      const id = key;
      const now = Date.now();
      
      const sql = `
        INSERT OR REPLACE INTO settings 
        (id, key, value, updatedAt)
        VALUES (?, ?, ?, ?)
      `;
      
      await executeSql(sql, [id, key, value, now]);
    } catch (err) {
      console.error('Failed to save setting:', err);
      throw err;
    }
  }, []);

  // Get setting
  const getSetting = useCallback(async (key) => {
    try {
      const sql = 'SELECT value FROM settings WHERE key = ?';
      const result = await executeSql(sql, [key]);
      
      if (result.rows.length > 0) {
        return result.rows.item(0).value;
      }
      return null;
    } catch (err) {
      console.error('Failed to get setting:', err);
      throw err;
    }
  }, []);

  // Get all settings
  const getAllSettings = useCallback(async () => {
    try {
      const sql = 'SELECT * FROM settings';
      const result = await executeSql(sql);
      
      const settings = {};
      for (let i = 0; i < result.rows.length; i++) {
        const item = result.rows.item(i);
        settings[item.key] = item.value;
      }
      
      return settings;
    } catch (err) {
      console.error('Failed to get all settings:', err);
      throw err;
    }
  }, []);

  // Delete setting
  const deleteSetting = useCallback(async (key) => {
    try {
      const sql = 'DELETE FROM settings WHERE key = ?';
      await executeSql(sql, [key]);
    } catch (err) {
      console.error('Failed to delete setting:', err);
      throw err;
    }
  }, []);

  // ============ FILE SYSTEM OPERATIONS ============

  // Get app directory
  const getAppDirectory = useCallback(async () => {
    try {
      const dir = FileSystem.documentDirectory + 'MedChat/';
      
      // Create directory if it doesn't exist
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      
      return dir;
    } catch (err) {
      console.error('Failed to get app directory:', err);
      throw err;
    }
  }, []);

  // Save file to filesystem
  const saveFileToFilesystem = useCallback(async (filePath, data, encoding = 'base64') => {
    try {
      const appDir = await getAppDirectory();
      const fullPath = appDir + filePath;
      
      await FileSystem.writeAsStringAsync(fullPath, data, { encoding });
      return fullPath;
    } catch (err) {
      console.error('Failed to save file to filesystem:', err);
      throw err;
    }
  }, [getAppDirectory]);

  // Read file from filesystem
  const readFileFromFilesystem = useCallback(async (filePath, encoding = 'base64') => {
    try {
      const appDir = await getAppDirectory();
      const fullPath = appDir + filePath;
      
      const data = await FileSystem.readAsStringAsync(fullPath, { encoding });
      return data;
    } catch (err) {
      console.error('Failed to read file from filesystem:', err);
      throw err;
    }
  }, [getAppDirectory]);

  // Delete file from filesystem
  const deleteFileFromFilesystem = useCallback(async (filePath) => {
    try {
      const appDir = await getAppDirectory();
      const fullPath = appDir + filePath;
      
      await FileSystem.deleteAsync(fullPath);
    } catch (err) {
      console.error('Failed to delete file from filesystem:', err);
      throw err;
    }
  }, [getAppDirectory]);

  // Check if file exists
  const fileExists = useCallback(async (filePath) => {
    try {
      const appDir = await getAppDirectory();
      const fullPath = appDir + filePath;
      
      const info = await FileSystem.getInfoAsync(fullPath);
      return info.exists;
    } catch (err) {
      console.error('Failed to check file existence:', err);
      return false;
    }
  }, [getAppDirectory]);

  // Get file info
  const getFileInfo = useCallback(async (filePath) => {
    try {
      const appDir = await getAppDirectory();
      const fullPath = appDir + filePath;
      
      const info = await FileSystem.getInfoAsync(fullPath);
      return info;
    } catch (err) {
      console.error('Failed to get file info:', err);
      throw err;
    }
  }, [getAppDirectory]);

  // Clear all data
  const clearAllData = useCallback(async () => {
    try {
      // Delete all tables
      await executeSql('DELETE FROM messages');
      await executeSql('DELETE FROM conversations');
      await executeSql('DELETE FROM files');
      await executeSql('DELETE FROM doctors');
      await executeSql('DELETE FROM patients');
      await executeSql('DELETE FROM settings');
      
      // Clear AsyncStorage
      await AsyncStorage.clear();
      
      // Delete app directory
      const appDir = await getAppDirectory();
      await FileSystem.deleteAsync(appDir, { idempotent: true });
      
      return true;
    } catch (err) {
      console.error('Failed to clear all data:', err);
      throw err;
    }
  }, [getAppDirectory]);

  // Context value
  const contextValue = {
    // State
    isInitialized,
    isLoading,
    error,
    
    // Database operations
    executeSql,
    
    // Message operations
    saveMessage,
    getMessages,
    getMessageById,
    updateMessageStatus,
    markMessageAsRead,
    deleteMessage,
    
    // Conversation operations
    saveConversation,
    getConversationById,
    getDoctorConversations,
    getPatientConversations,
    updateConversationLastMessage,
    incrementUnreadCount,
    resetUnreadCount,
    deleteConversation,
    
    // File operations
    saveFile,
    getFilesForConversation,
    getFileById,
    deleteFile,
    
    // Doctor operations
    saveDoctorProfile,
    getDoctorProfile,
    deleteDoctorProfile,
    
    // Patient operations
    savePatientProfile,
    getPatientProfile,
    getPatientsForDoctor,
    deletePatientProfile,
    
    // Settings operations
    saveSetting,
    getSetting,
    getAllSettings,
    deleteSetting,
    
    // File system operations
    getAppDirectory,
    saveFileToFilesystem,
    readFileFromFilesystem,
    deleteFileFromFilesystem,
    fileExists,
    getFileInfo,
    
    // Utility operations
    clearAllData,
    initDatabase
  };

  return (
    <StorageContext.Provider value={contextValue}>
      {children}
    </StorageContext.Provider>
  );
};

// Custom hook to use Storage context
export const useStorage = () => {
  const context = useContext(StorageContext);
  
  if (!context) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  
  return context;
};

// Export database instance
export { database, executeSql, initDatabase, TABLE_DEFINITIONS };
