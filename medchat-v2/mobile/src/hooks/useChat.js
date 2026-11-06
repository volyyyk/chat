/**
 * MedChat Mobile App - useChat Hook
 * Chat state and actions for patient and doctor
 */

import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { ChatContext } from '../context/ChatContext';
import { chatService } from '../services/chatService';
import { database } from '../services/database';
import { encryptionService } from '../services/encryptionService';
import config from '../config/config';
import { generateChatId, generateMessageId, isFileExpired, getFileExpirationDate } from '../utils/helpers';
import { formatMessageTime, formatDateTime } from '../utils/formatters';
import { debounce } from '../utils/helpers';

/**
 * Custom hook for chat functionality
 * @param {string} chatId - Current chat ID
 * @returns {Object} - Chat state and actions
 */
export const useChat = (chatId) => {
  const { state: chatState, dispatch: chatDispatch } = useContext(ChatContext);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [convenientTime, setConvenientTime] = useState(config.DEFAULT_CONVENIENT_TIME);
  const [doctorInfo, setDoctorInfo] = useState(null);
  const [patientInfo, setPatientInfo] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [files, setFiles] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef(null);
  const pageRef = useRef(1);

  // Load chat messages
  const loadMessages = useCallback(async (reset = false) => {
    if (!chatId) return;

    try {
      setIsLoading(true);
      setError(null);

      const currentPage = reset ? 1 : pageRef.current;
      
      // Load from local database first
      const localMessages = await database.getMessages(chatId, {
        page: currentPage,
        limit: config.PAGINATION_LIMIT,
      });

      if (localMessages.length > 0) {
        // Sort by date (newest first)
        const sortedMessages = localMessages.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );

        setMessages(reset ? sortedMessages : [...messages, ...sortedMessages]);
        setHasMore(sortedMessages.length === config.PAGINATION_LIMIT);
        pageRef.current = reset ? 1 : currentPage + 1;
      } else {
        // If no local messages, try to load from server (for doctor)
        const result = await chatService.getMessages(chatId, {
          page: currentPage,
          limit: config.PAGINATION_LIMIT,
        });

        if (result.success && result.messages.length > 0) {
          // Decrypt messages
          const decryptedMessages = await Promise.all(
            result.messages.map(async (msg) => {
              try {
                if (msg.encrypted) {
                  const decrypted = await encryptionService.decryptMessage(
                    msg.content,
                    msg.iv
                  );
                  return { ...msg, content: decrypted, decrypted: true };
                }
                return msg;
              } catch (err) {
                console.error('Decryption error:', err);
                return msg;
              }
            })
          );

          // Save to local database
          await database.saveMessages(chatId, decryptedMessages);

          // Sort and set
          const sortedMessages = decryptedMessages.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );

          setMessages(reset ? sortedMessages : [...messages, ...sortedMessages]);
          setHasMore(decryptedMessages.length === config.PAGINATION_LIMIT);
          pageRef.current = reset ? 1 : currentPage + 1;
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, messages]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(() => {
    if (!isLoading && hasMore) {
      loadMessages(false);
    }
  }, [isLoading, hasMore, loadMessages]);

  // Refresh messages
  const refreshMessages = useCallback(() => {
    pageRef.current = 1;
    loadMessages(true);
  }, [loadMessages]);

  // Send message
  const sendMessage = useCallback(async (content, file = null) => {
    if (!chatId || !content) return null;

    try {
      setIsSending(true);
      setError(null);

      const messageId = generateMessageId();
      const timestamp = new Date().toISOString();

      // Create message object
      const message = {
        id: messageId,
        chatId,
        content,
        sender: 'patient', // Will be updated based on user role
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'sending',
        encrypted: false,
        file: file ? {
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          url: file.url,
        } : null,
      };

      // Encrypt message content
      try {
        const encrypted = await encryptionService.encryptMessage(content);
        message.content = encrypted.encrypted;
        message.iv = encrypted.iv;
        message.encrypted = true;
      } catch (err) {
        console.warn('Encryption failed, sending unencrypted:', err);
      }

      // Save to local database
      await database.saveMessage(chatId, message);

      // Add to messages list
      setMessages([message, ...messages]);

      // Send via WebSocket
      const result = await chatService.sendMessage(chatId, {
        content: message.content,
        iv: message.iv,
        encrypted: message.encrypted,
        file: message.file,
      });

      if (result.success) {
        // Update message status
        await database.updateMessage(chatId, messageId, { status: 'delivered' });
        setMessages(messages.map(m => 
          m.id === messageId ? { ...m, status: 'delivered' } : m
        ));
      } else {
        throw new Error(result.message || 'Ошибка отправки сообщения');
      }

      // Scroll to bottom
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollToEnd({ animated: true });
        }
      }, 100);

      return message;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSending(false);
    }
  }, [chatId, messages]);

  // Send file
  const sendFile = useCallback(async (file) => {
    if (!chatId) return null;

    try {
      setIsSending(true);
      setError(null);

      // Upload file first
      const uploadResult = await chatService.uploadFile(file);

      if (!uploadResult.success) {
        throw new Error(uploadResult.message || 'Ошибка загрузки файла');
      }

      // Send message with file
      const message = await sendMessage(`[Файл] ${file.name}`, {
        id: uploadResult.file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        url: uploadResult.file.url,
      });

      return message;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSending(false);
    }
  }, [chatId, sendMessage]);

  // Load chat info
  const loadChatInfo = useCallback(async () => {
    if (!chatId) return;

    try {
      // Load from local database
      const chat = await database.getChat(chatId);

      if (chat) {
        setDoctorInfo(chat.doctor);
        setPatientInfo(chat.patient);
        setConvenientTime(chat.convenientTime || config.DEFAULT_CONVENIENT_TIME);
      } else {
        // Try to load from server
        const result = await chatService.getChat(chatId);

        if (result.success) {
          setDoctorInfo(result.chat.doctor);
          setPatientInfo(result.chat.patient);
          setConvenientTime(result.chat.convenientTime || config.DEFAULT_CONVENIENT_TIME);

          // Save to local database
          await database.saveChat(chatId, {
            ...result.chat,
            convenientTime: result.chat.convenientTime || config.DEFAULT_CONVENIENT_TIME,
          });
        }
      }
    } catch (err) {
      console.error('Error loading chat info:', err);
    }
  }, [chatId]);

  // Load files for doctor
  const loadFiles = useCallback(async () => {
    if (!chatId) return;

    try {
      const result = await chatService.getFiles(chatId);

      if (result.success) {
        // Filter out expired files
        const validFiles = result.files.filter(file => !isFileExpired(file.createdAt));
        setFiles(validFiles);
      }
    } catch (err) {
      console.error('Error loading files:', err);
    }
  }, [chatId]);

  // Upload file to patient card (doctor only)
  const uploadPatientFile = useCallback(async (file, patientLogin) => {
    try {
      const result = await chatService.uploadPatientFile(chatId, patientLogin, file);

      if (result.success) {
        // Reload files
        await loadFiles();
        return result.file;
      } else {
        throw new Error(result.message || 'Ошибка загрузки файла');
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [chatId, loadFiles]);

  // Delete file
  const deleteFile = useCallback(async (fileId) => {
    try {
      const result = await chatService.deleteFile(fileId);

      if (result.success) {
        setFiles(files.filter(f => f.id !== fileId));
        return true;
      } else {
        throw new Error(result.message || 'Ошибка удаления файла');
      }
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [files]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    if (!chatId) return;

    try {
      // Mark as read in local database
      await database.markMessagesAsRead(chatId);

      // Mark as read on server
      await chatService.markMessagesAsRead(chatId);

      // Update unread count
      setUnreadCount(0);

      // Update in chat context
      chatDispatch({
        type: 'MARK_CHAT_READ',
        payload: { chatId },
      });
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }, [chatId, chatDispatch]);

  // Set typing status
  const setTypingStatus = useCallback(async (isTyping) => {
    if (!chatId) return;

    try {
      setIsTyping(isTyping);
      await chatService.setTypingStatus(chatId, isTyping);
    } catch (err) {
      console.error('Error setting typing status:', err);
    }
  }, [chatId]);

  // Update convenient time (doctor only)
  const updateConvenientTime = useCallback(async (timeRange) => {
    try {
      const result = await chatService.updateConvenientTime(chatId, timeRange);

      if (result.success) {
        setConvenientTime(timeRange);
        
        // Update in local database
        const chat = await database.getChat(chatId);
        if (chat) {
          await database.saveChat(chatId, { ...chat, convenientTime: timeRange });
        }

        return true;
      } else {
        throw new Error(result.message || 'Ошибка обновления времени');
      }
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [chatId]);

  // Get chat list
  const getChatList = useCallback(async () => {
    try {
      const chats = await database.getChats();
      return chats;
    } catch (err) {
      console.error('Error getting chat list:', err);
      return [];
    }
  }, []);

  // Create new chat (patient)
  const createChat = useCallback(async (doctorId, clinicId, patientLogin) => {
    try {
      const chatId = generateChatId(doctorId, patientLogin);

      // Check if chat already exists
      const existingChat = await database.getChat(chatId);
      if (existingChat) {
        return existingChat;
      }

      // Create new chat
      const chat = {
        id: chatId,
        doctorId,
        clinicId,
        patientLogin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
      };

      // Save to local database
      await database.saveChat(chatId, chat);

      // Add to chat context
      chatDispatch({
        type: 'ADD_CHAT',
        payload: chat,
      });

      return chat;
    } catch (err) {
      console.error('Error creating chat:', err);
      return null;
    }
  }, [chatDispatch]);

  // Join chat via QR code
  const joinChatViaQR = useCallback(async (qrData) => {
    try {
      const data = JSON.parse(qrData);

      if (data.type !== 'medchat_doctor') {
        throw new Error('Неверный QR код');
      }

      // Create chat
      const chat = await createChat(data.doctorId, data.clinicId, '');

      if (chat) {
        return { success: true, chatId: chat.id, chat };
      } else {
        throw new Error('Ошибка создания чата');
      }
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    }
  }, [createChat]);

  // Search chats
  const searchChats = useCallback(async (query) => {
    try {
      const chats = await database.getChats();
      
      const filtered = chats.filter(chat => {
        const searchLower = query.toLowerCase();
        return (
          (chat.doctorName && chat.doctorName.toLowerCase().includes(searchLower)) ||
          (chat.clinicName && chat.clinicName.toLowerCase().includes(searchLower)) ||
          (chat.specialtyName && chat.specialtyName.toLowerCase().includes(searchLower)) ||
          (chat.patientLogin && chat.patientLogin.toLowerCase().includes(searchLower))
        );
      });

      return filtered;
    } catch (err) {
      console.error('Error searching chats:', err);
      return [];
    }
  }, []);

  // Get unread count for a chat
  const getUnreadCount = useCallback(async (chatId) => {
    try {
      const count = await database.getUnreadCount(chatId);
      return count;
    } catch (err) {
      console.error('Error getting unread count:', err);
      return 0;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize chat when chatId changes
  useEffect(() => {
    if (chatId) {
      loadMessages(true);
      loadChatInfo();
      loadFiles();
      markMessagesAsRead();
    } else {
      setMessages([]);
      setDoctorInfo(null);
      setPatientInfo(null);
      setFiles([]);
    }
  }, [chatId, loadMessages, loadChatInfo, loadFiles, markMessagesAsRead]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Listen for new messages from WebSocket
  useEffect(() => {
    if (!chatId) return;

    const handleNewMessage = async (message) => {
      if (message.chatId === chatId) {
        // Decrypt message if needed
        let decryptedMessage = message;
        
        try {
          if (message.encrypted) {
            const decrypted = await encryptionService.decryptMessage(
              message.content,
              message.iv
            );
            decryptedMessage = { ...message, content: decrypted, decrypted: true };
          }
        } catch (err) {
          console.error('Decryption error:', err);
        }

        // Save to local database
        await database.saveMessage(chatId, decryptedMessage);

        // Add to messages list
        setMessages(prev => [decryptedMessage, ...prev]);

        // Mark as read after a delay
        setTimeout(() => {
          markMessagesAsRead();
        }, 1000);
      }
    };

    // Subscribe to new messages
    chatService.on('newMessage', handleNewMessage);

    // Subscribe to typing status
    chatService.on('typingStatus', (data) => {
      if (data.chatId === chatId) {
        setIsTyping(data.isTyping);
      }
    });

    return () => {
      chatService.off('newMessage', handleNewMessage);
      chatService.off('typingStatus');
    };
  }, [chatId, markMessagesAsRead]);

  return {
    // State
    messages,
    isLoading,
    error,
    hasMore,
    isSending,
    convenientTime,
    doctorInfo,
    patientInfo,
    unreadCount,
    files,
    isTyping,
    messagesEndRef,

    // Actions
    loadMessages,
    loadMoreMessages,
    refreshMessages,
    sendMessage,
    sendFile,
    loadChatInfo,
    loadFiles,
    uploadPatientFile,
    deleteFile,
    markMessagesAsRead,
    setTypingStatus,
    updateConvenientTime,
    getChatList,
    createChat,
    joinChatViaQR,
    searchChats,
    getUnreadCount,
    clearError,
  };
};

export default useChat;
