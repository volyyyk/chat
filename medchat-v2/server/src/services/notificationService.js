/**
 * Notification Service
 * Handles all notification types (push, email, SMS)
 * Note: Email and SMS implementations are placeholders for future integration
 */

const models = require('../models');
const CryptoService = require('./cryptoService');

class NotificationService {
  /**
   * Send push notification
   * @param {string|Array<string>} userIds - User ID(s) to notify
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data payload
   * @param {Object} options - Notification options
   * @returns {Promise<Object>} - Notification result
   */
  static async sendPushNotification(userIds, title, body, data = {}, options = {}) {
    try {
      const userIdArray = Array.isArray(userIds) ? userIds : [userIds];

      // Get user devices
      const devices = await models.Device.findAll({
        where: { userId: userIdArray },
      });

      if (devices.length === 0) {
        return {
          success: false,
          message: 'No devices found for users',
          sentCount: 0,
        };
      }

      // In production, this would send actual push notifications
      // via Firebase Cloud Messaging (FCM) or Apple Push Notification Service (APNS)
      console.log(`Sending push notification to ${devices.length} devices:`);
      console.log(`Title: ${title}`);
      console.log(`Body: ${body}`);
      console.log(`Data: ${JSON.stringify(data)}`);

      // Save notification to database
      const notifications = [];
      for (const userId of userIdArray) {
        const notification = await models.Notification.create({
          userId,
          title,
          body,
          type: 'push',
          data,
          status: 'sent',
          sentAt: new Date(),
        });
        notifications.push(notification);
      }

      return {
        success: true,
        message: `Push notification sent to ${devices.length} devices`,
        sentCount: devices.length,
        notifications,
      };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return {
        success: false,
        error: error.message,
        sentCount: 0,
      };
    }
  }

  /**
   * Send email notification
   * @param {string|Array<string>} userIds - User ID(s) to notify
   * @param {string} subject - Email subject
   * @param {string} html - Email HTML content
   * @param {string} text - Email text content
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  static async sendEmail(userIds, subject, html, text = '', data = {}) {
    try {
      const userIdArray = Array.isArray(userIds) ? userIds : [userIds];

      // Get user emails
      const users = await models.User.findAll({
        where: { id: userIdArray },
        attributes: ['id', 'email'],
      });

      const validEmails = users.filter(u => u.email).map(u => u.email);

      if (validEmails.length === 0) {
        return {
          success: false,
          message: 'No valid email addresses found for users',
          sentCount: 0,
        };
      }

      // In production, this would send actual emails via SendGrid, Mailgun, or similar
      console.log(`Sending email to ${validEmails.length} addresses:`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML: ${html.substring(0, 100)}...`);

      // Save notification to database
      const notifications = [];
      for (const user of users) {
        const notification = await models.Notification.create({
          userId: user.id,
          title: subject,
          body: text || html.replace(/<[^>]*>/g, ''),
          type: 'email',
          data: { subject, html, text, ...data },
          status: 'sent',
          sentAt: new Date(),
        });
        notifications.push(notification);
      }

      return {
        success: true,
        message: `Email sent to ${validEmails.length} addresses`,
        sentCount: validEmails.length,
        notifications,
      };
    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        error: error.message,
        sentCount: 0,
      };
    }
  }

  /**
   * Send SMS notification
   * @param {string|Array<string>} phoneNumbers - Phone number(s) to notify
   * @param {string} message - SMS message
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  static async sendSMS(phoneNumbers, message, data = {}) {
    try {
      const phoneArray = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];

      // In production, this would send actual SMS via Twilio, SMS.ru, or similar
      console.log(`Sending SMS to ${phoneArray.length} numbers:`);
      console.log(`Message: ${message}`);

      // Save notification to database (if we can identify the user)
      const notifications = [];
      for (const phone of phoneArray) {
        // Try to find user by phone
        const user = await models.User.findOne({
          where: { phone },
          attributes: ['id'],
        });

        if (user) {
          const notification = await models.Notification.create({
            userId: user.id,
            title: 'SMS Notification',
            body: message,
            type: 'sms',
            data: { phone, message, ...data },
            status: 'sent',
            sentAt: new Date(),
          });
          notifications.push(notification);
        }
      }

      return {
        success: true,
        message: `SMS sent to ${phoneArray.length} numbers`,
        sentCount: phoneArray.length,
        notifications,
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      return {
        success: false,
        error: error.message,
        sentCount: 0,
      };
    }
  }

  /**
   * Send message notification
   * @param {string} chatId - Chat ID
   * @param {string} messageId - Message ID
   * @param {string} senderId - Sender ID
   * @param {string} content - Message content
   * @returns {Promise<Object>} - Notification result
   */
  static async sendMessageNotification(chatId, messageId, senderId, content) {
    try {
      // Get chat participants
      const chat = await models.Chat.findOne({
        where: { id: chatId },
        include: [
          { model: models.User, as: 'doctor', attributes: ['id'] },
          { model: models.User, as: 'patient', attributes: ['id'] },
        ],
      });

      if (!chat) {
        return {
          success: false,
          message: 'Chat not found',
        };
      }

      // Get recipient IDs (all participants except sender)
      const recipientIds = [];
      if (chat.doctor?.id && chat.doctor.id !== senderId) {
        recipientIds.push(chat.doctor.id);
      }
      if (chat.patient?.id && chat.patient.id !== senderId) {
        recipientIds.push(chat.patient.id);
      }

      if (recipientIds.length === 0) {
        return {
          success: true,
          message: 'No recipients to notify',
          sentCount: 0,
        };
      }

      // Get sender info
      const sender = await models.User.findOne({
        where: { id: senderId },
        attributes: ['id', 'username', 'firstName', 'lastName'],
      });

      const senderName = sender?.firstName && sender?.lastName
        ? `${sender.firstName} ${sender.lastName}`
        : sender?.username || 'Unknown';

      // Truncate content for notification
      const truncatedContent = content.length > 100
        ? `${content.substring(0, 100)}...`
        : content;

      // Send push notifications
      const pushResult = await this.sendPushNotification(
        recipientIds,
        `Новое сообщение от ${senderName}`,
        truncatedContent,
        { chatId, messageId, senderId },
        { type: 'message' }
      );

      // Save notifications to database
      const notifications = [];
      for (const recipientId of recipientIds) {
        const notification = await models.Notification.create({
          userId: recipientId,
          title: `Новое сообщение от ${senderName}`,
          body: truncatedContent,
          type: 'message',
          data: { chatId, messageId, senderId, content },
          status: 'sent',
          sentAt: new Date(),
        });
        notifications.push(notification);
      }

      return {
        success: true,
        message: `Message notification sent to ${recipientIds.length} recipients`,
        sentCount: recipientIds.length,
        notifications,
        pushResult,
      };
    } catch (error) {
      console.error('Error sending message notification:', error);
      return {
        success: false,
        error: error.message,
        sentCount: 0,
      };
    }
  }

  /**
   * Send appointment reminder
   * @param {string} appointmentId - Appointment ID
   * @returns {Promise<Object>} - Notification result
   */
  static async sendAppointmentReminder(appointmentId) {
    try {
      const appointment = await models.Appointment.findOne({
        where: { id: appointmentId },
        include: [
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
        ],
      });

      if (!appointment) {
        return {
          success: false,
          message: 'Appointment not found',
        };
      }

      // Send to patient
      const patientResult = await this.sendPushNotification(
        [appointment.patientId],
        'Напоминание о приеме',
        `У вас запланирован прием у врача ${appointment.Doctor?.fullName || 'Unknown'} в ${new Date(appointment.startTime).toLocaleString('ru-RU')}`,
        { appointmentId, type: 'appointment_reminder' },
        { type: 'appointment' }
      );

      // Send to doctor
      const doctorResult = await this.sendPushNotification(
        [appointment.doctorId],
        'Напоминание о приеме',
        `У вас запланирован прием с пациентом ${appointment.Patient?.fullName || 'Unknown'} в ${new Date(appointment.startTime).toLocaleString('ru-RU')}`,
        { appointmentId, type: 'appointment_reminder' },
        { type: 'appointment' }
      );

      // Save notifications
      const patientNotification = await models.Notification.create({
        userId: appointment.patientId,
        title: 'Напоминание о приеме',
        body: `У вас запланирован прием у врача ${appointment.Doctor?.fullName || 'Unknown'}`,
        type: 'appointment',
        data: { appointmentId },
        status: 'sent',
        sentAt: new Date(),
      });

      const doctorNotification = await models.Notification.create({
        userId: appointment.doctorId,
        title: 'Напоминание о приеме',
        body: `У вас запланирован прием с пациентом ${appointment.Patient?.fullName || 'Unknown'}`,
        type: 'appointment',
        data: { appointmentId },
        status: 'sent',
        sentAt: new Date(),
      });

      return {
        success: true,
        message: 'Appointment reminder sent',
        sentCount: 2,
        notifications: [patientNotification, doctorNotification],
        patientResult,
        doctorResult,
      };
    } catch (error) {
      console.error('Error sending appointment reminder:', error);
      return {
        success: false,
        error: error.message,
        sentCount: 0,
      };
    }
  }

  /**
   * Send payment notification
   * @param {string} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {number} amount - Amount
   * @param {string} currency - Currency
   * @param {string} type - Transaction type
   * @returns {Promise<Object>} - Notification result
   */
  static async sendPaymentNotification(userId, transactionId, amount, currency = 'RUB', type) {
    try {
      const transactionTypes = {
        message_payment: 'Оплата сообщения',
        file_payment: 'Оплата загрузки файла',
        subscription: 'Оплата подписки',
        deposit: 'Пополнение баланса',
        withdrawal: 'Вывод средств',
        payout: 'Выплата',
        refund: 'Возврат средств',
      };

      const title = transactionTypes[type] || 'Уведомление об оплате';
      const body = `Списано ${amount} ${currency} за ${title.toLowerCase()}`;

      // Send push notification
      const pushResult = await this.sendPushNotification(
        [userId],
        title,
        body,
        { transactionId, amount, currency, type },
        { type: 'payment' }
      );

      // Save notification
      const notification = await models.Notification.create({
        userId,
        title,
        body,
        type: 'payment',
        data: { transactionId, amount, currency, type },
        status: 'sent',
        sentAt: new Date(),
      });

      return {
        success: true,
        message: 'Payment notification sent',
        notification,
        pushResult,
      };
    } catch (error) {
      console.error('Error sending payment notification:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send backup notification
   * @param {string} userId - User ID
   * @param {string} backupId - Backup ID
   * @param {string} status - Backup status
   * @returns {Promise<Object>} - Notification result
   */
  static async sendBackupNotification(userId, backupId, status) {
    try {
      const statusMessages = {
        completed: 'Резервное копирование завершено',
        failed: 'Ошибка резервного копирования',
        restoring: 'Восстановление из резервной копии',
      };

      const title = 'Резервное копирование';
      const body = statusMessages[status] || `Резервное копирование: ${status}`;

      // Send push notification
      const pushResult = await this.sendPushNotification(
        [userId],
        title,
        body,
        { backupId, status },
        { type: 'backup' }
      );

      // Save notification
      const notification = await models.Notification.create({
        userId,
        title,
        body,
        type: 'backup',
        data: { backupId, status },
        status: 'sent',
        sentAt: new Date(),
      });

      return {
        success: true,
        message: 'Backup notification sent',
        notification,
        pushResult,
      };
    } catch (error) {
      console.error('Error sending backup notification:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user notifications
   * @param {string} userId - User ID
   * @param {Object} options - Options (page, limit, status, type)
   * @returns {Promise<Object>} - Notifications list
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        unreadOnly = false,
      } = options;

      const where = { userId };

      if (status) where.status = status;
      if (type) where.type = type;
      if (unreadOnly) where.read = false;

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Notification.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      return {
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID (for access control)
   * @returns {Promise<Object>} - Result
   */
  static async markAsRead(notificationId, userId) {
    try {
      const notification = await models.Notification.findOne({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        return {
          success: false,
          message: 'Notification not found or not accessible',
        };
      }

      await notification.update({
        read: true,
        readAt: new Date(),
      });

      return {
        success: true,
        data: notification,
        message: 'Notification marked as read',
      };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Mark all notifications as read
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result
   */
  static async markAllAsRead(userId) {
    try {
      const result = await models.Notification.update(
        { read: true, readAt: new Date() },
        { where: { userId, read: false } }
      );

      return {
        success: true,
        message: `Marked ${result[0]} notifications as read`,
        count: result[0],
      };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete notification
   * @param {string} notificationId - Notification ID
   * @param {string} userId - User ID (for access control)
   * @returns {Promise<Object>} - Result
   */
  static async deleteNotification(notificationId, userId) {
    try {
      const notification = await models.Notification.findOne({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        return {
          success: false,
          message: 'Notification not found or not accessible',
        };
      }

      await notification.destroy();

      return {
        success: true,
        message: 'Notification deleted',
      };
    } catch (error) {
      console.error('Error deleting notification:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get unread notification count
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Count result
   */
  static async getUnreadCount(userId) {
    try {
      const count = await models.Notification.count({
        where: { userId, read: false },
      });

      return {
        success: true,
        count,
      };
    } catch (error) {
      console.error('Error getting unread count:', error);
      return {
        success: false,
        error: error.message,
        count: 0,
      };
    }
  }

  /**
   * Send bulk notifications
   * @param {Array<Object>} notifications - Array of notification objects
   * @returns {Promise<Object>} - Bulk send result
   */
  static async sendBulkNotifications(notifications) {
    try {
      const results = [];

      for (const notification of notifications) {
        const {
          userIds,
          title,
          body,
          type,
          data,
          method = 'push',
        } = notification;

        let result;
        switch (method) {
          case 'push':
            result = await this.sendPushNotification(userIds, title, body, data, { type });
            break;
          case 'email':
            result = await this.sendEmail(userIds, title, body, '', data);
            break;
          case 'sms':
            result = await this.sendSMS(userIds, body, data);
            break;
          default:
            result = await this.sendPushNotification(userIds, title, body, data, { type });
        }

        results.push(result);
      }

      const totalSent = results.reduce((sum, r) => sum + (r.sentCount || 0), 0);

      return {
        success: true,
        message: `Sent ${totalSent} notifications in bulk`,
        results,
        totalSent,
      };
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      return {
        success: false,
        error: error.message,
        totalSent: 0,
      };
    }
  }
}

module.exports = NotificationService;
