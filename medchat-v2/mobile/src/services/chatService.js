/**
 * Chat Service
 * Handles chat API calls and WebSocket connections.
 * Matches the MedChat v2 server API (see src/index.js socket handlers):
 *   joinChat(chatRef, cb) -> cb({ ok } | { error })
 *   'typing' { chatId, isTyping }  ->  'userTyping' { userId, isTyping, chatId }
 *   server emits: newMessage, chatUpdated, messageRead
 */

import io from 'socket.io-client';
import { API_BASE_URL, WS_BASE_URL } from '../config/config';

const API_URL = `${API_BASE_URL}/api`;

class ChatService {
  constructor() {
    this.socket = null;
    this.token = null;
    this.user = null;
    this.connectPromise = null;
    // Handlers survive socket re-creation and are re-attached on connect
    this._handlers = {};
  }

  /**
   * Initialize chat service
   */
  async initialize(token, user) {
    this.token = token;
    this.user = user;
  }

  /**
   * Connect to WebSocket server (idempotent, safe to call repeatedly).
   * Returns the connected socket. Falls back to REST-only mode on failure
   * after the configured number of attempts.
   */
  async connectWebSocket(tokenArg) {
    if (tokenArg) {
      this.token = tokenArg;
    }

    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      // A previously disconnected socket object cannot be reused reliably
      if (this.socket) {
        try { this.socket.disconnect(); } catch (e) { /* ignore */ }
        this.socket = null;
      }

      const socket = io(WS_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: {
          token: this.token,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };

      const onConnect = () => {
        this.socket = socket;
        this.connectPromise = null;
        cleanup();
        this._attachHandlers(socket);
        resolve(socket);
      };

      const onError = (err) => {
        this.connectPromise = null;
        cleanup();
        reject(err);
      };

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);

      socket.on('disconnect', () => {
        // socket.io will auto-reconnect; handlers stay attached
      });
    });

    return this.connectPromise;
  }

  /**
   * (Re)attach recorded event handlers to a socket
   */
  _attachHandlers(socket) {
    Object.keys(this._handlers).forEach((event) => {
      this._handlers[event].forEach((cb) => {
        socket.off(event, cb);
        socket.on(event, cb);
      });
    });
  }

  /**
   * Subscribe to a socket event (also survives reconnections)
   */
  on(event, callback) {
    if (!this._handlers[event]) {
      this._handlers[event] = [];
    }
    this._handlers[event].push(callback);
    if (this.socket) {
      this.socket.on(event, callback);
    }
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from a socket event
   */
  off(event, callback) {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter((cb) => cb !== callback);
    }
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  /**
   * Emit a socket event if connected
   */
  emit(event, payload) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, payload);
      return true;
    }
    return false;
  }

  /**
   * Join a chat room (server verifies membership against the DB)
   */
  joinChat(chatRef, callback) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('joinChat', chatRef, callback || (() => {}));
    } else if (typeof callback === 'function') {
      callback({ error: 'not_connected' });
    }
  }

  /**
   * Leave a chat room
   */
  leaveChat(chatRef) {
    if (this.socket) {
      this.socket.emit('leaveChat', chatRef);
    }
  }

  /**
   * Typing indicator
   */
  setTypingStatus(chatId, isTyping) {
    return this.emit('typing', { chatId, isTyping: !!isTyping });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectPromise = null;
    this.token = null;
    this.user = null;
    this._handlers = {};
  }

  /**
   * Get all chats
   */
  async getChats(token) {
    try {
      const response = await fetch(`${API_URL}/chats`, {
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
   * Get chat by ID (UUID) or human-readable chatId
   */
  async getChat(token, chatId) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}`, {
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
   * Create new chat
   */
  async createChat(token, data) {
    try {
      const response = await fetch(`${API_URL}/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
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
   * Resolve a chat by its human-readable chatId (QR code flow)
   */
  async joinChatViaQR(token, qrData) {
    try {
      const response = await fetch(`${API_URL}/chats/by-chatid/${qrData}`, {
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
   * Get messages for a chat
   */
  async getMessages(token, chatId, params = {}) {
    try {
      const query = new URLSearchParams(params);
      const response = await fetch(`${API_URL}/chats/${chatId}/messages?${query}`, {
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
   * Send message
   */
  async sendMessage(token, chatId, message) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(message),
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
   * Mark messages as read
   */
  async markMessagesAsRead(token, chatId) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
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
   * Upload file (multipart). Returns the raw file record on success
   * or { success: false, message } on failure.
   */
  async uploadFile(tokenArg, chatId, file) {
    const token = tokenArg || this.token;
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
      });
      formData.append('chatId', chatId);
      formData.append('type', 'patient_upload');
      formData.append('visibility', 'shared');

      // NOTE: do not set Content-Type manually - React Native must set
      // the multipart boundary itself, otherwise the request fails.
      const response = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          message: data.error || data.message || 'Ошибка загрузки файла',
        };
      }

      // Server returns the raw file record (201) or { success, data }
      if (data && data.id) {
        return data;
      }
      if (data && data.data) {
        return data.data;
      }
      return data;
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * List files of a chat
   */
  async getFiles(token, chatId, limit = 100) {
    try {
      const response = await fetch(`${API_URL}/files?chatId=${chatId}&limit=${limit}`, {
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
        data: [],
      };
    }
  }

  /**
   * Download file
   */
  async downloadFile(token, fileId) {
    try {
      const response = await fetch(`${API_URL}/files/${fileId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        return {
          success: true,
          blob,
          url: URL.createObjectURL(blob),
        };
      }

      return {
        success: false,
        message: 'Failed to download file',
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Search chats
   */
  async searchChats(token, query) {
    try {
      const response = await fetch(`${API_URL}/chats?search=${encodeURIComponent(query)}`, {
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
   * Get chat participants
   */
  async getParticipants(token, chatId) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}/participants`, {
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
   * Get chat settings
   */
  async getSettings(token, chatId) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}/settings`, {
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
   * Generate QR code for chat
   */
  async generateQRCode(token, chatId) {
    try {
      const response = await fetch(`${API_URL}/chats/${chatId}/qrcode`, {
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
}

// Singleton instance
export const chatService = new ChatService();
