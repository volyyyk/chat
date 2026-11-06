/**
 * Chat Service
 * Handles chat API calls and WebSocket connections
 */

import io from 'socket.io-client';
import { API_BASE_URL, WS_BASE_URL } from '../config/config';

const API_URL = `${API_BASE_URL}/api`;

class ChatService {
  constructor() {
    this.socket = null;
    this.token = null;
    this.user = null;
  }

  /**
   * Initialize chat service
   */
  async initialize(token, user) {
    this.token = token;
    this.user = user;
  }

  /**
   * Connect to WebSocket server
   */
  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        resolve(this.socket);
        return;
      }

      const socket = io(WS_BASE_URL, {
        transports: ['websocket'],
        auth: {
          token: this.token,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        this.socket = socket;
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        console.error('WebSocket connection error:', err);
        reject(err);
      });

      socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      socket.on('reconnect', () => {
        console.log('WebSocket reconnected');
      });
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
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
   * Get chat by ID
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
   * Join chat via QR code
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
   * Upload file
   */
  async uploadFile(token, chatId, file) {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type || 'application/octet-stream',
      });
      formData.append('chatId', chatId);
      formData.append('type', 'patient_upload');
      formData.append('visibility', 'shared');
      formData.append('autoDelete', 'true');
      formData.append('deleteAfterDays', '3');

      const response = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
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
