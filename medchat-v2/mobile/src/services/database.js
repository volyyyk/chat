/**
 * Database Service
 * Handles local SQLite database operations
 */

import * as SQLite from 'expo-sqlite';
import { encryptionService } from './encryptionService';

const DB_NAME = 'medchat.db';

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database
   */
  async initDatabase() {
    if (this.isInitialized) return;

    try {
      this.db = SQLite.openDatabase(DB_NAME);
      
      // Create tables
      await this.createTables();
      
      this.isInitialized = true;
      console.log('Database initialized');
    } catch (err) {
      console.error('Error initializing database:', err);
      throw err;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        // Chats table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            chatId TEXT UNIQUE,
            doctorId TEXT,
            doctorName TEXT,
            doctorSpecialty TEXT,
            clinicId TEXT,
            clinicName TEXT,
            patientId TEXT,
            patientName TEXT,
            type TEXT,
            status TEXT,
            priority TEXT,
            lastMessage TEXT,
            lastMessageAt TEXT,
            lastMessageType TEXT,
            unreadCount INTEGER DEFAULT 0,
            createdAt TEXT,
            updatedAt TEXT,
            metadata TEXT
          )`
        );

        // Messages table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chatId TEXT,
            senderId TEXT,
            senderType TEXT,
            senderName TEXT,
            content TEXT,
            type TEXT,
            metadata TEXT,
            encryptedContent TEXT,
            nonce TEXT,
            publicKey TEXT,
            read INTEGER DEFAULT 0,
            sentAt TEXT,
            receivedAt TEXT,
            createdAt TEXT,
            FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE
          )`
        );

        // Files table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            chatId TEXT,
            messageId TEXT,
            filename TEXT,
            originalFilename TEXT,
            storagePath TEXT,
            fileType TEXT,
            size INTEGER,
            mimeType TEXT,
            url TEXT,
            thumbnailUrl TEXT,
            category TEXT,
            visibility TEXT,
            uploaderId TEXT,
            uploaderType TEXT,
            description TEXT,
            tags TEXT,
            autoDelete INTEGER DEFAULT 0,
            deleteAfterDays INTEGER,
            createdAt TEXT,
            updatedAt TEXT,
            FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
          )`
        );

        // Appointments table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY,
            doctorId TEXT,
            doctorName TEXT,
            clinicId TEXT,
            clinicName TEXT,
            patientId TEXT,
            patientName TEXT,
            startTime TEXT,
            endTime TEXT,
            type TEXT,
            status TEXT,
            reason TEXT,
            symptoms TEXT,
            notes TEXT,
            diagnosis TEXT,
            treatment TEXT,
            priority TEXT,
            createdAt TEXT,
            updatedAt TEXT
          )`
        );

        // E-Prescriptions table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS eprescriptions (
            id TEXT PRIMARY KEY,
            prescriptionNumber TEXT UNIQUE,
            doctorId TEXT,
            doctorName TEXT,
            patientId TEXT,
            patientName TEXT,
            appointmentId TEXT,
            type TEXT,
            title TEXT,
            description TEXT,
            medications TEXT,
            dosage TEXT,
            duration TEXT,
            instructions TEXT,
            diagnosis TEXT,
            notes TEXT,
            status TEXT,
            validUntil TEXT,
            createdAt TEXT,
            updatedAt TEXT,
            FOREIGN KEY (appointmentId) REFERENCES appointments(id) ON DELETE SET NULL
          )`
        );

        // Notifications table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT,
            type TEXT,
            data TEXT,
            read INTEGER DEFAULT 0,
            readAt TEXT,
            createdAt TEXT,
            updatedAt TEXT
          )`
        );

        // Backup table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS backups (
            id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            filename TEXT,
            storagePath TEXT,
            size INTEGER,
            dataTypes TEXT,
            format TEXT,
            status TEXT,
            createdAt TEXT,
            updatedAt TEXT
          )`
        );

        // Balance table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS balance (
            id TEXT PRIMARY KEY,
            userId TEXT,
            available INTEGER DEFAULT 0,
            reserved INTEGER DEFAULT 0,
            currency TEXT DEFAULT 'RUB',
            createdAt TEXT,
            updatedAt TEXT
          )`
        );

        // Transactions table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            userId TEXT,
            type TEXT,
            amount INTEGER,
            currency TEXT,
            paymentMethod TEXT,
            status TEXT,
            description TEXT,
            referenceId TEXT,
            metadata TEXT,
            createdAt TEXT,
            updatedAt TEXT
          )`
        );

        // Settings table
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
          )`
        );
      }, resolve, reject);
    });
  }

  /**
   * Save chat
   */
  async saveChat(chat) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO chats (
            id, chatId, doctorId, doctorName, doctorSpecialty, clinicId, clinicName,
            patientId, patientName, type, status, priority, lastMessage, lastMessageAt,
            lastMessageType, unreadCount, createdAt, updatedAt, metadata
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            chat.id,
            chat.chatId,
            chat.doctorId,
            chat.doctorName,
            chat.doctorSpecialty,
            chat.clinicId,
            chat.clinicName,
            chat.patientId,
            chat.patientName,
            chat.type,
            chat.status,
            chat.priority,
            chat.lastMessage,
            chat.lastMessageAt,
            chat.lastMessageType,
            chat.unreadCount || 0,
            chat.createdAt,
            chat.updatedAt,
            JSON.stringify(chat.metadata || {}),
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all chats
   */
  async getAllChats() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM chats ORDER BY lastMessageAt DESC`,
          [],
          (_, { rows }) => {
            const chats = [];
            for (let i = 0; i < rows.length; i++) {
              chats.push({
                ...rows.item(i),
                metadata: rows.item(i).metadata ? JSON.parse(rows.item(i).metadata) : {},
              });
            }
            resolve(chats);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get chat by ID
   */
  async getChatById(chatId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM chats WHERE id = ?`,
          [chatId],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve({
                ...rows.item(0),
                metadata: rows.item(0).metadata ? JSON.parse(rows.item(0).metadata) : {},
              });
            } else {
              resolve(null);
            }
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get chat by chatId
   */
  async getChatByChatId(chatId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM chats WHERE chatId = ?`,
          [chatId],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve({
                ...rows.item(0),
                metadata: rows.item(0).metadata ? JSON.parse(rows.item(0).metadata) : {},
              });
            } else {
              resolve(null);
            }
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save message
   */
  async saveMessage(message) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO messages (
            id, chatId, senderId, senderType, senderName, content, type,
            metadata, encryptedContent, nonce, publicKey, read, sentAt,
            receivedAt, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            message.id,
            message.chatId,
            message.senderId,
            message.senderType,
            message.senderName,
            message.content,
            message.type,
            JSON.stringify(message.metadata || {}),
            message.encryptedContent,
            message.nonce,
            message.publicKey,
            message.read ? 1 : 0,
            message.sentAt,
            message.receivedAt || new Date().toISOString(),
            message.createdAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get messages for chat
   */
  async getMessagesForChat(chatId, limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
          [chatId, limit, offset],
          (_, { rows }) => {
            const messages = [];
            for (let i = 0; i < rows.length; i++) {
              messages.push({
                ...rows.item(i),
                read: rows.item(i).read === 1,
                metadata: rows.item(i).metadata ? JSON.parse(rows.item(i).metadata) : {},
              });
            }
            resolve(messages);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get unread messages count for chat
   */
  async getUnreadMessagesCount(chatId, currentUserId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT COUNT(*) as count FROM messages WHERE chatId = ? AND senderId != ? AND read = 0`,
          [chatId, currentUserId],
          (_, { rows }) => {
            resolve(rows.item(0).count);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatId, currentUserId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `UPDATE messages SET read = 1 WHERE chatId = ? AND senderId != ? AND read = 0`,
          [chatId, currentUserId],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save file
   */
  async saveFile(file) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO files (
            id, chatId, messageId, filename, originalFilename, storagePath,
            fileType, size, mimeType, url, thumbnailUrl, category, visibility,
            uploaderId, uploaderType, description, tags, autoDelete, deleteAfterDays,
            createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            file.id,
            file.chatId,
            file.messageId,
            file.filename,
            file.originalFilename,
            file.storagePath,
            file.fileType,
            file.size,
            file.mimeType,
            file.url,
            file.thumbnailUrl,
            file.category,
            file.visibility,
            file.uploaderId,
            file.uploaderType,
            file.description,
            JSON.stringify(file.tags || []),
            file.autoDelete ? 1 : 0,
            file.deleteAfterDays,
            file.createdAt,
            file.updatedAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get files for chat
   */
  async getFilesForChat(chatId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM files WHERE chatId = ? ORDER BY createdAt DESC`,
          [chatId],
          (_, { rows }) => {
            const files = [];
            for (let i = 0; i < rows.length; i++) {
              files.push({
                ...rows.item(i),
                autoDelete: rows.item(i).autoDelete === 1,
                tags: rows.item(i).tags ? JSON.parse(rows.item(i).tags) : [],
              });
            }
            resolve(files);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save appointment
   */
  async saveAppointment(appointment) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO appointments (
            id, doctorId, doctorName, clinicId, clinicName, patientId, patientName,
            startTime, endTime, type, status, reason, symptoms, notes, diagnosis,
            treatment, priority, createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            appointment.id,
            appointment.doctorId,
            appointment.doctorName,
            appointment.clinicId,
            appointment.clinicName,
            appointment.patientId,
            appointment.patientName,
            appointment.startTime,
            appointment.endTime,
            appointment.type,
            appointment.status,
            appointment.reason,
            appointment.symptoms,
            appointment.notes,
            appointment.diagnosis,
            appointment.treatment,
            appointment.priority,
            appointment.createdAt,
            appointment.updatedAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all appointments
   */
  async getAllAppointments() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM appointments ORDER BY startTime DESC`,
          [],
          (_, { rows }) => {
            const appointments = [];
            for (let i = 0; i < rows.length; i++) {
              appointments.push(rows.item(i));
            }
            resolve(appointments);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save e-prescription
   */
  async saveEPrescription(prescription) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO eprescriptions (
            id, prescriptionNumber, doctorId, doctorName, patientId, patientName,
            appointmentId, type, title, description, medications, dosage, duration,
            instructions, diagnosis, notes, status, validUntil, createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            prescription.id,
            prescription.prescriptionNumber,
            prescription.doctorId,
            prescription.doctorName,
            prescription.patientId,
            prescription.patientName,
            prescription.appointmentId,
            prescription.type,
            prescription.title,
            prescription.description,
            JSON.stringify(prescription.medications || []),
            prescription.dosage,
            prescription.duration,
            prescription.instructions,
            prescription.diagnosis,
            prescription.notes,
            prescription.status,
            prescription.validUntil,
            prescription.createdAt,
            prescription.updatedAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all e-prescriptions
   */
  async getAllEPrescriptions() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM eprescriptions ORDER BY createdAt DESC`,
          [],
          (_, { rows }) => {
            const prescriptions = [];
            for (let i = 0; i < rows.length; i++) {
              prescriptions.push({
                ...rows.item(i),
                medications: rows.item(i).medications ? JSON.parse(rows.item(i).medications) : [],
              });
            }
            resolve(prescriptions);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save notification
   */
  async saveNotification(notification) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO notifications (
            id, title, body, type, data, read, readAt, createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            notification.id,
            notification.title,
            notification.body,
            notification.type,
            JSON.stringify(notification.data || {}),
            notification.read ? 1 : 0,
            notification.readAt,
            notification.createdAt,
            notification.updatedAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all notifications
   */
  async getAllNotifications() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM notifications ORDER BY createdAt DESC`,
          [],
          (_, { rows }) => {
            const notifications = [];
            for (let i = 0; i < rows.length; i++) {
              notifications.push({
                ...rows.item(i),
                read: rows.item(i).read === 1,
                data: rows.item(i).data ? JSON.parse(rows.item(i).data) : {},
              });
            }
            resolve(notifications);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get unread notifications count
   */
  async getUnreadNotificationsCount() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT COUNT(*) as count FROM notifications WHERE read = 0`,
          [],
          (_, { rows }) => {
            resolve(rows.item(0).count);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `DELETE FROM notifications WHERE id = ?`,
          [notificationId],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save backup info
   */
  async saveBackup(backup) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO backups (
            id, name, description, filename, storagePath, size, dataTypes, format, status, createdAt, updatedAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            backup.id,
            backup.name,
            backup.description,
            backup.filename,
            backup.storagePath,
            backup.size,
            JSON.stringify(backup.dataTypes || []),
            backup.format,
            backup.status,
            backup.createdAt,
            backup.updatedAt,
          ],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all backups
   */
  async getAllBackups() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM backups ORDER BY createdAt DESC`,
          [],
          (_, { rows }) => {
            const backups = [];
            for (let i = 0; i < rows.length; i++) {
              backups.push({
                ...rows.item(i),
                dataTypes: rows.item(i).dataTypes ? JSON.parse(rows.item(i).dataTypes) : [],
              });
            }
            resolve(backups);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Save setting
   */
  async saveSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`,
          [key, value],
          (_, result) => resolve(result),
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get setting
   */
  async getSetting(key, defaultValue = null) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT value FROM settings WHERE key = ?`,
          [key],
          (_, { rows }) => {
            if (rows.length > 0) {
              resolve(rows.item(0).value);
            } else {
              resolve(defaultValue);
            }
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Delete all data (for logout)
   */
  async deleteAllData() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql('DELETE FROM chats');
        tx.executeSql('DELETE FROM messages');
        tx.executeSql('DELETE FROM files');
        tx.executeSql('DELETE FROM appointments');
        tx.executeSql('DELETE FROM eprescriptions');
        tx.executeSql('DELETE FROM notifications');
        tx.executeSql('DELETE FROM backups');
        tx.executeSql('DELETE FROM balance');
        tx.executeSql('DELETE FROM transactions');
        tx.executeSql('DELETE FROM settings');
      }, resolve, reject);
    });
  }

  /**
   * Export all data for backup
   */
  async exportAllData() {
    try {
      const data = {
        chats: await this.getAllChats(),
        messages: await this.getAllMessages(),
        files: await this.getAllFiles(),
        appointments: await this.getAllAppointments(),
        eprescriptions: await this.getAllEPrescriptions(),
        notifications: await this.getAllNotifications(),
        backups: await this.getAllBackups(),
        settings: await this.getAllSettings(),
      };

      return data;
    } catch (err) {
      console.error('Error exporting data:', err);
      throw err;
    }
  }

  /**
   * Get all messages
   */
  async getAllMessages() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM messages`,
          [],
          (_, { rows }) => {
            const messages = [];
            for (let i = 0; i < rows.length; i++) {
              messages.push({
                ...rows.item(i),
                read: rows.item(i).read === 1,
                metadata: rows.item(i).metadata ? JSON.parse(rows.item(i).metadata) : {},
              });
            }
            resolve(messages);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all files
   */
  async getAllFiles() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM files`,
          [],
          (_, { rows }) => {
            const files = [];
            for (let i = 0; i < rows.length; i++) {
              files.push({
                ...rows.item(i),
                autoDelete: rows.item(i).autoDelete === 1,
                tags: rows.item(i).tags ? JSON.parse(rows.item(i).tags) : [],
              });
            }
            resolve(files);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `SELECT * FROM settings`,
          [],
          (_, { rows }) => {
            const settings = {};
            for (let i = 0; i < rows.length; i++) {
              settings[rows.item(i).key] = rows.item(i).value;
            }
            resolve(settings);
          },
          (_, err) => reject(err)
        );
      });
    });
  }

  /**
   * Encrypt data for backup
   */
  async encryptBackupData(data, password) {
    const salt = encryptionService.arrayBufferToBase64(
      encryptionService.generateRandomBytes(16)
    );
    const key = await encryptionService.deriveKeyFromPassword(password, salt);
    
    // Encrypt each data section
    const encryptedData = {};
    for (const [keyName, value] of Object.entries(data)) {
      const jsonString = JSON.stringify(value);
      const encrypted = encryptionService.encryptMessage(
        jsonString,
        encryptionService.arrayBufferToBase64(key),
        encryptionService.arrayBufferToBase64(key)
      );
      encryptedData[keyName] = encrypted;
    }

    return {
      data: encryptedData,
      salt,
      version: '1.0',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Decrypt backup data
   */
  async decryptBackupData(encryptedData, password) {
    const key = await encryptionService.deriveKeyFromPassword(
      password,
      encryptedData.salt
    );

    const decryptedData = {};
    for (const [keyName, value] of Object.entries(encryptedData.data)) {
      try {
        const decrypted = encryptionService.decryptMessage(
          value,
          encryptionService.arrayBufferToBase64(key)
        );
        decryptedData[keyName] = JSON.parse(decrypted);
      } catch (err) {
        console.error(`Error decrypting ${keyName}:`, err);
        throw new Error('Invalid password or corrupted backup');
      }
    }

    return decryptedData;
  }
}

// Singleton instance
export const databaseService = new DatabaseService();

// Initialize database on import
databaseService.initDatabase().catch(console.error);

// Export for direct use
export default databaseService;
