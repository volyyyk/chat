/**
 * MedChat Mobile App - useNotifications Hook
 * Notification state and actions
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { NotificationContext } from '../context/NotificationContext';
import { notificationService } from '../services/notificationService';
import { database } from '../services/database';
import config from '../config/config';
import * as Notifications from 'expo-notifications';
import * as Permissions from 'expo-permissions';

/**
 * Custom hook for notifications
 * @returns {Object} - Notification state and actions
 */
export const useNotifications = () => {
  const { state, dispatch } = useContext(NotificationContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);

  // Request notification permissions
  const requestPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { status } = await Notifications.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status !== 'granted') {
        throw new Error('Разрешение на уведомления не предоставлено');
      }

      // Configure notification handling
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Get push notification token
      const token = await Notifications.getExpoPushTokenAsync();
      
      if (token) {
        // Save token to server
        await notificationService.registerDevice(token.data);
      }

      return { success: true, hasPermission: true };
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message, hasPermission: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check notification permissions
  const checkPermissions = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasPermission(status === 'granted');
      return { hasPermission: status === 'granted' };
    } catch (err) {
      setError(err.message);
      return { hasPermission: false };
    }
  }, []);

  // Register device for push notifications
  const registerDevice = useCallback(async (userId) => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await Notifications.getExpoPushTokenAsync();
      
      if (!token) {
        throw new Error('Не удалось получить токен устройства');
      }

      const result = await notificationService.registerDevice(token.data, userId);

      if (result.success) {
        return { success: true, deviceId: result.deviceId };
      } else {
        throw new Error(result.message || 'Ошибка регистрации устройства');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Unregister device
  const unregisterDevice = useCallback(async () => {
    try {
      const token = await Notifications.getExpoPushTokenAsync();
      
      if (token) {
        await notificationService.unregisterDevice(token.data);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    }
  }, []);

  // Get in-app notifications
  const getNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await notificationService.getNotifications();

      if (result.success) {
        // Save to local database
        await database.saveNotifications(result.notifications);

        // Update context
        dispatch({
          type: 'SET_NOTIFICATIONS',
          payload: result.notifications,
        });

        return result.notifications;
      } else {
        throw new Error(result.message || 'Ошибка загрузки уведомлений');
      }
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const result = await notificationService.markAsRead(notificationId);

      if (result.success) {
        // Update in local database
        await database.markNotificationAsRead(notificationId);

        // Update context
        dispatch({
          type: 'MARK_READ',
          payload: { notificationId },
        });

        return true;
      } else {
        throw new Error(result.message || 'Ошибка при marking уведомления как прочитанного');
      }
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [dispatch]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const result = await notificationService.markAllAsRead();

      if (result.success) {
        // Update in local database
        await database.markAllNotificationsAsRead();

        // Update context
        dispatch({ type: 'MARK_ALL_READ' });

        return true;
      } else {
        throw new Error(result.message || 'Ошибка при marking всех уведомлений как прочитанных');
      }
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [dispatch]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      const result = await notificationService.deleteNotification(notificationId);

      if (result.success) {
        // Delete from local database
        await database.deleteNotification(notificationId);

        // Update context
        dispatch({
          type: 'DELETE_NOTIFICATION',
          payload: { notificationId },
        });

        return true;
      } else {
        throw new Error(result.message || 'Ошибка удаления уведомления');
      }
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [dispatch]);

  // Send notification (doctor to patient)
  const sendNotification = useCallback(async (patientLogin, title, body, data = {}) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await notificationService.sendNotification(
        patientLogin,
        title,
        body,
        data
      );

      if (result.success) {
        return { success: true, notificationId: result.notificationId };
      } else {
        throw new Error(result.message || 'Ошибка отправки уведомления');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Configure notification settings
  const configureSettings = useCallback(async (settings) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await notificationService.configureSettings(settings);

      if (result.success) {
        // Save settings to local database
        await database.saveNotificationSettings(settings);

        // Update context
        dispatch({
          type: 'SET_SETTINGS',
          payload: settings,
        });

        return true;
      } else {
        throw new Error(result.message || 'Ошибка настройки уведомлений');
      }
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  // Get notification settings
  const getSettings = useCallback(async () => {
    try {
      // Load from local database first
      const settings = await database.getNotificationSettings();

      if (settings) {
        dispatch({
          type: 'SET_SETTINGS',
          payload: settings,
        });
        return settings;
      }

      // If not in local, try to get from server
      const result = await notificationService.getSettings();

      if (result.success) {
        await database.saveNotificationSettings(result.settings);
        dispatch({
          type: 'SET_SETTINGS',
          payload: result.settings,
        });
        return result.settings;
      }

      // Return default settings
      const defaultSettings = {
        sound: true,
        vibration: true,
        newMessage: true,
        appointmentReminder: true,
        fileUpload: true,
        system: true,
      };

      return defaultSettings;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [dispatch]);

  // Schedule local notification
  const scheduleLocalNotification = useCallback(async (title, body, seconds) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title || config.NOTIFICATION_TITLE,
          body,
          sound: 'default',
          vibrate: true,
        },
        trigger: {
          seconds,
        },
      });

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Cancel all scheduled notifications
  const cancelAllNotifications = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Get unread notification count
  const getUnreadCount = useCallback(async () => {
    try {
      const count = await database.getUnreadNotificationCount();
      return count;
    } catch (err) {
      setError(err.message);
      return 0;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize notifications
  useEffect(() => {
    const initialize = async () => {
      await checkPermissions();
      await getSettings();
      await getNotifications();
    };

    initialize();
  }, [checkPermissions, getSettings, getNotifications]);

  // Listen for push notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      // Handle received notification
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: notification.request.identifier,
          title: notification.request.content.title,
          body: notification.request.content.body,
          data: notification.request.content.data,
          read: false,
          createdAt: new Date().toISOString(),
        },
      });

      // Save to local database
      database.saveNotification({
        id: notification.request.identifier,
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data,
        read: false,
        createdAt: new Date().toISOString(),
      });
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // Handle notification tap
      const notificationId = response.notification.request.identifier;
      markAsRead(notificationId);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [dispatch, markAsRead]);

  return {
    // State
    notifications: state.notifications,
    settings: state.settings,
    isLoading,
    error,
    hasPermission,
    unreadCount: state.unreadCount,

    // Actions
    requestPermissions,
    checkPermissions,
    registerDevice,
    unregisterDevice,
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    sendNotification,
    configureSettings,
    getSettings,
    scheduleLocalNotification,
    cancelAllNotifications,
    getUnreadCount,
    clearError,
  };
};

export default useNotifications;
