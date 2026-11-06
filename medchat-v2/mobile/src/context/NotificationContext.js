/**
 * Notification Context
 * Manages push notifications and in-app notifications
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { notificationService } from '../services/notificationService';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Request notification permissions
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Notification permissions not granted');
        }
      } catch (err) {
        console.error('Error requesting notification permissions:', err);
      }
    };

    requestPermissions();
  }, []);

  // Configure push notifications
  useEffect(() => {
    const configurePushNotifications = async () => {
      try {
        // Get push token
        const pushToken = await Notifications.getExpoPushTokenAsync();
        
        if (pushToken && user) {
          // Register device with server
          await notificationService.registerDevice(token, {
            deviceId: pushToken.data,
            deviceType: 'expo',
            pushToken: pushToken.data,
          });
        }

        // Set up notification listeners
        const subscription = Notifications.addNotificationReceivedListener((notification) => {
          handleNotification(notification);
        });

        const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          handleNotificationResponse(response);
        });

        return () => {
          subscription.remove();
          responseSubscription.remove();
        };
      } catch (err) {
        console.error('Error configuring push notifications:', err);
      }
    };

    if (user && token) {
      configurePushNotifications();
    }
  }, [user, token]);

  // Load notifications
  useEffect(() => {
    if (!user || !token) return;

    const loadNotifications = async () => {
      try {
        setIsLoading(true);
        const response = await notificationService.getNotifications(token);
        
        if (response.success) {
          setNotifications(response.data);
          setUnreadCount(response.data.filter(n => !n.read).length);
        }
      } catch (err) {
        console.error('Error loading notifications:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotifications();
  }, [user, token]);

  // Handle incoming notification
  const handleNotification = (notification) => {
    const newNotification = {
      id: notification.request.identifier,
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data,
      type: notification.request.content.data?.type || 'system',
      read: false,
      createdAt: new Date().toISOString(),
    };

    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
  };

  // Handle notification response (user tapped notification)
  const handleNotificationResponse = (response) => {
    const { notification } = response;
    const notificationData = notification.request.content.data;

    // Mark as read
    markAsRead(notification.request.identifier);

    // Navigate based on notification type
    switch (notificationData?.type) {
      case 'message':
        // Navigate to chat
        if (notificationData.chatId) {
          // Navigation would be handled by the app
        }
        break;
      case 'appointment':
        // Navigate to appointments
        break;
      case 'payment':
        // Navigate to payments
        break;
      default:
        break;
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await notificationService.markAsRead(token, notificationId);
      
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead(token);
      
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId) => {
    try {
      await notificationService.deleteNotification(token, notificationId);
      
      setNotifications(prev =>
        prev.filter(n => n.id !== notificationId)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError(err.message);
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    try {
      await notificationService.sendTestNotification(token);
    } catch (err) {
      console.error('Error sending test notification:', err);
      setError(err.message);
    }
  };

  // Schedule local notification
  const scheduleLocalNotification = async (title, body, data = {}, seconds = 10) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
          priority: 'high',
        },
        trigger: {
          seconds,
        },
      });
    } catch (err) {
      console.error('Error scheduling local notification:', err);
    }
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  const value = {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    sendTestNotification,
    scheduleLocalNotification,
    clearError,
    refreshNotifications: async () => {
      try {
        setIsLoading(true);
        const response = await notificationService.getNotifications(token);
        
        if (response.success) {
          setNotifications(response.data);
          setUnreadCount(response.data.filter(n => !n.read).length);
        }
      } catch (err) {
        console.error('Error refreshing notifications:', err);
      } finally {
        setIsLoading(false);
      }
    },
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
