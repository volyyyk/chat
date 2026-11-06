/**
 * Notification Service
 * Handles notification API calls
 */

import { API_BASE_URL } from '../config/config';

const API_URL = `${API_BASE_URL}/api`;

class NotificationService {
  /**
   * Register device for push notifications
   */
  async registerDevice(token, deviceData) {
    try {
      const response = await fetch(`${API_URL}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(deviceData),
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Get notifications
   */
  async getNotifications(token, params = {}) {
    try {
      const query = new URLSearchParams(params);
      const response = await fetch(`${API_URL}/notifications?${query}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(token, notificationId) {
    try {
      const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(token) {
    try {
      const response = await fetch(`${API_URL}/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(token, notificationId) {
    try {
      const response = await fetch(`${API_URL}/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification(token) {
    try {
      const response = await fetch(`${API_URL}/notifications/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: 'Test notification' }),
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(token) {
    try {
      const response = await fetch(`${API_URL}/notifications/unread-count`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return await response.json();
    } catch (err) {
      return {
        success: false,
        message: err.message,
        count: 0,
      };
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();
