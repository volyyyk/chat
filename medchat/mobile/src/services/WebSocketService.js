/**
 * WebSocket Service for MedChat
 * 
 * Manages WebSocket connection to the server
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';

// WebSocket Context
const WebSocketContext = createContext(null);

// Message types
const MESSAGE_TYPES = {
  AUTH: 'auth',
  AUTH_SUCCESS: 'auth_success',
  AUTH_PENDING: 'auth_pending',
  MESSAGE: 'message',
  KEY_EXCHANGE: 'key_exchange',
  PING: 'ping',
  PONG: 'pong',
  WELCOME: 'welcome',
  ERROR: 'error',
  NEW_PATIENT: 'new_patient',
  QR_GENERATED: 'qr_generated',
  DOCTOR_INFO: 'doctor_info',
  MESSAGE_STATUS: 'message_status'
};

// Connection states
const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

// WebSocket Provider Component
export const WebSocketProvider = ({ children, config: serverConfig }) => {
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [connectionId, setConnectionId] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authData, setAuthData] = useState(null);
  
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const messageQueueRef = useRef([]);
  const listenersRef = useRef(new Map());
  const pendingMessagesRef = useRef(new Set());
  
  // Connection URL
  const getConnectionUrl = useCallback(() => {
    const baseConfig = serverConfig || config.server;
    return baseConfig.url;
  }, [serverConfig]);

  // Connect to WebSocket server
  const connect = useCallback(async () => {
    try {
      const url = getConnectionUrl();
      
      setConnectionState(CONNECTION_STATES.CONNECTING);
      setReconnectAttempts(0);
      setLastError(null);
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Create new WebSocket connection
      const newSocket = new WebSocket(url);
      
      // Event handlers
      newSocket.onopen = () => {
        setConnectionState(CONNECTION_STATES.CONNECTED);
        setReconnectAttempts(0);
        setSocket(newSocket);
        
        // Send queued messages
        if (messageQueueRef.current.length > 0) {
          messageQueueRef.current.forEach(msg => {
            if (newSocket.readyState === WebSocket.OPEN) {
              newSocket.send(JSON.stringify(msg));
            }
          });
          messageQueueRef.current = [];
        }
        
        // Start ping interval
        startPingInterval(newSocket);
      };
      
      newSocket.onmessage = (event) => {
        handleMessage(event, newSocket);
      };
      
      newSocket.onclose = (event) => {
        handleClose(event, newSocket);
      };
      
      newSocket.onerror = (event) => {
        handleError(event, newSocket);
      };
      
      setSocket(newSocket);
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setConnectionState(CONNECTION_STATES.ERROR);
      setLastError(error.message);
      
      // Attempt to reconnect
      scheduleReconnect();
    }
  }, [getConnectionUrl]);

  // Start ping interval
  const startPingInterval = useCallback((socketInstance) => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    pingIntervalRef.current = setInterval(() => {
      if (socketInstance && socketInstance.readyState === WebSocket.OPEN) {
        socketInstance.send(JSON.stringify({ type: MESSAGE_TYPES.PING, timestamp: Date.now() }));
      }
    }, 30000); // Ping every 30 seconds
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event, socketInstance) => {
    try {
      const message = JSON.parse(event.data);
      
      // Handle welcome message
      if (message.type === MESSAGE_TYPES.WELCOME) {
        setConnectionId(message.connectionId);
        return;
      }
      
      // Handle auth success
      if (message.type === MESSAGE_TYPES.AUTH_SUCCESS) {
        setIsAuthenticated(true);
        setAuthData({
          role: message.role,
          doctorId: message.doctorId,
          patientId: message.patientId
        });
      }
      
      // Handle auth pending
      if (message.type === MESSAGE_TYPES.AUTH_PENDING) {
        setIsAuthenticated(false);
        setAuthData({
          role: message.role,
          doctorId: message.doctorId,
          patientId: message.patientId
        });
      }
      
      // Handle pong
      if (message.type === MESSAGE_TYPES.PONG) {
        return; // No action needed
      }
      
      // Handle error
      if (message.type === MESSAGE_TYPES.ERROR) {
        setLastError(message.message || message.code);
        return;
      }
      
      // Notify listeners
      notifyListeners(message);
      
    } catch (error) {
      console.error('Error parsing message:', error);
      setLastError('Failed to parse message');
    }
  }, []);

  // Handle connection close
  const handleClose = useCallback((event, socketInstance) => {
    setConnectionState(CONNECTION_STATES.DISCONNECTED);
    setSocket(null);
    setIsAuthenticated(false);
    
    // Clean up
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Attempt to reconnect if not intentional close
    if (event.code !== 1000) { // 1000 = Normal closure
      scheduleReconnect();
    }
  }, []);

  // Handle connection error
  const handleError = useCallback((event, socketInstance) => {
    console.error('WebSocket error:', event);
    setLastError('Connection error');
    setConnectionState(CONNECTION_STATES.ERROR);
    
    // Clean up
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Attempt to reconnect
    scheduleReconnect();
  }, []);

  // Schedule reconnection
  const scheduleReconnect = useCallback(() => {
    const maxAttempts = (serverConfig || config.server).maxReconnectAttempts || 10;
    const reconnectInterval = (serverConfig || config.server).reconnectInterval || 5000;
    
    if (reconnectAttempts >= maxAttempts) {
      setConnectionState(CONNECTION_STATES.ERROR);
      setLastError(`Failed to connect after ${maxAttempts} attempts`);
      return;
    }
    
    setConnectionState(CONNECTION_STATES.RECONNECTING);
    setReconnectAttempts(prev => prev + 1);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, reconnectInterval);
  }, [connect, reconnectAttempts, serverConfig]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socket) {
      // Close with normal closure code
      socket.close(1000, 'Normal closure');
    }
    
    // Clear timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    setConnectionState(CONNECTION_STATES.DISCONNECTED);
    setSocket(null);
    setIsAuthenticated(false);
    setAuthData(null);
  }, [socket]);

  // Send message
  const sendMessage = useCallback((message) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      // Queue message if not connected
      messageQueueRef.current.push(message);
      return false;
    }
    
    try {
      const messageWithId = {
        ...message,
        messageId: message.messageId || uuidv4(),
        timestamp: Date.now()
      };
      
      socket.send(JSON.stringify(messageWithId));
      pendingMessagesRef.current.add(messageWithId.messageId);
      
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      setLastError('Failed to send message');
      return false;
    }
  }, [socket]);

  // Authenticate with server
  const authenticate = useCallback((role, doctorId = null, patientId = null) => {
    const authMessage = {
      type: MESSAGE_TYPES.AUTH,
      role,
      doctorId,
      patientId
    };
    
    return sendMessage(authMessage);
  }, [sendMessage]);

  // Generate QR code
  const generateQRCode = useCallback(() => {
    const message = {
      type: 'generate_qr'
    };
    
    return sendMessage(message);
  }, [sendMessage]);

  // Get doctor info
  const getDoctorInfo = useCallback((doctorId) => {
    const message = {
      type: 'get_doctor_info',
      doctorId
    };
    
    return sendMessage(message);
  }, [sendMessage]);

  // Subscribe to message type
  const subscribe = useCallback((type, callback) => {
    const listenerId = uuidv4();
    listenersRef.current.set(listenerId, { type, callback });
    
    return () => {
      listenersRef.current.delete(listenerId);
    };
  }, []);

  // Notify listeners
  const notifyListeners = useCallback((message) => {
    listenersRef.current.forEach((listener) => {
      if (listener.type === message.type || listener.type === '*') {
        try {
          listener.callback(message);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      }
    });
  }, []);

  // Check if connected
  const isConnected = useCallback(() => {
    return connectionState === CONNECTION_STATES.CONNECTED;
  }, [connectionState]);

  // Get connection status
  const getConnectionStatus = useCallback(() => {
    return {
      state: connectionState,
      isConnected: isConnected(),
      isAuthenticated,
      connectionId,
      authData,
      lastError
    };
  }, [connectionState, isConnected, isAuthenticated, connectionId, authData, lastError]);

  // Network connectivity check
  useEffect(() => {
    const unsubscribe = NetInfo.addListener(state => {
      if (state.isConnected && connectionState === CONNECTION_STATES.DISCONNECTED) {
        // Reconnect when network is restored
        connect();
      }
    });

    return () => unsubscribe();
  }, [connectionState, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [disconnect]);

  // Context value
  const contextValue = {
    // State
    socket,
    connectionState,
    connectionId,
    isAuthenticated,
    authData,
    lastError,
    
    // Actions
    connect,
    disconnect,
    sendMessage,
    authenticate,
    generateQRCode,
    getDoctorInfo,
    subscribe,
    
    // Helpers
    isConnected,
    getConnectionStatus,
    MESSAGE_TYPES,
    CONNECTION_STATES
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Custom hook to use WebSocket context
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  
  return context;
};

// Export constants
export { MESSAGE_TYPES, CONNECTION_STATES };
