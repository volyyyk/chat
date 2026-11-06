/**
 * Notification Service for MedChat
 * 
 * Manages local notifications
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import config from '../config';

// Notification Context
const NotificationContext = createContext(null);

// Notification Service Provider Component
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [permission, setPermission] = useState(null);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          sound: 'default'
        });
      }
      
      const { status } = await Notifications.requestPermissionsAsync();
      setPermission(status);
      return status === 'granted';
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return false;
    }
  }, []);

  // Show notification
  const showNotification = useCallback(async (title, body, data = {}) => {
    try {
      // Check permission
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          console.warn('Notification permission not granted');
          return;
        }
      }
      
      // Show notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title || config.notifications.title,
          body: body,
          data,
          sound: config.notifications.sound ? 'default' : null,
          vibrate: config.notifications.vibration ? [0, 250, 250, 250] : null,
          priority: 'high'
        },
        trigger: null // Show immediately
      });
      
      // Store notification
      const notification = {
        id: Date.now().toString(),
        title,
        body,
        data,
        timestamp: Date.now(),
        read: false
      };
      
      setNotifications(prev => [notification, ...prev].slice(0, 20));
      
      return notification;
    } catch (err) {
      console.error('Failed to show notification:', err);
      return null;
    }
  }, [permission, requestPermission]);

  // Show alert
  const showAlert = useCallback((title, message, buttons = [{ text: 'OK' }]) => {
    Alert.alert(title, message, buttons);
  }, []);

  // Show toast (simple notification)
  const showToast = useCallback((message, duration = 3000) => {
    // For now, just show an alert
    // In a real app, you would use a toast library
    Alert.alert('MedChat', message);
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, read: true }))
    );
  }, []);

  // Clear notification
  const clearNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Get unread count
  const getUnreadCount = useCallback(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  // Configure notification handler
  useEffect(() => {
    // Handle notification when app is foregrounded
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      // Store notification
      const newNotification = {
        id: notification.request.identifier || Date.now().toString(),
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data,
        timestamp: Date.now(),
        read: false
      };
      
      setNotifications(prev => [newNotification, ...prev].slice(0, 20));
    });

    // Handle notification response
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      // Mark notification as read
      markAsRead(response.notification.request.identifier);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [markAsRead]);

  // Context value
  const contextValue = {
    // State
    notifications,
    permission,
    
    // Actions
    requestPermission,
    showNotification,
    showAlert,
    showToast,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    getUnreadCount
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

// Custom hook to use Notification context
export const useNotification = () => {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  
  return context;
};
