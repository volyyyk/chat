/**
 * Chat Context
 * Manages chat state and WebSocket connections
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { chatService } from '../services/chatService';
import { encryptionService } from '../services/encryptionService';

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});

  const socketRef = useRef(null);
  const messageQueueRef = useRef([]);

  // Initialize chat service
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setChats([]);
      setActiveChat(null);
      setMessages({});
      return;
    }

    const initialize = async () => {
      try {
        setIsLoading(true);
        
        // Load chats
        const loadedChats = await chatService.getChats(token);
        setChats(loadedChats.data || []);
        
        // Initialize message storage
        const messagesMap = {};
        for (const chat of loadedChats.data || []) {
          const chatMessages = await chatService.getMessages(token, chat.id);
          messagesMap[chat.id] = chatMessages.data || [];
        }
        setMessages(messagesMap);
        
        // Connect WebSocket
        await connectWebSocket();
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing chat:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      disconnectWebSocket();
    };
  }, [isAuthenticated, token]);

  // Connect WebSocket
  const connectWebSocket = async () => {
    try {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const socket = await chatService.connectWebSocket(token);
      socketRef.current = socket;

      // Set up event listeners
      socket.on('connect', () => {
        setIsConnected(true);
        // Process queued messages
        processMessageQueue();
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      socket.on('error', (err) => {
        console.error('WebSocket error:', err);
        setError(err.message);
      });

      socket.on('newMessage', (encryptedMessage) => {
        handleNewMessage(encryptedMessage);
      });

      socket.on('messageRead', (data) => {
        handleMessageRead(data);
      });

      socket.on('userTyping', (data) => {
        handleUserTyping(data);
      });

      socket.on('chatCreated', (chat) => {
        setChats(prev => [chat, ...prev]);
      });

      socket.on('chatUpdated', (updatedChat) => {
        setChats(prev => 
          prev.map(c => c.id === updatedChat.id ? updatedChat : c)
        );
      });

      setIsConnected(true);
    } catch (err) {
      console.error('Error connecting WebSocket:', err);
      setError(err.message);
    }
  };

  // Disconnect WebSocket
  const disconnectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
  };

  // Process message queue
  const processMessageQueue = () => {
    if (!isConnected || !socketRef.current) return;

    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      socketRef.current.emit('sendMessage', message);
    }
  };

  // Handle new message
  const handleNewMessage = async (encryptedMessage) => {
    try {
      const decryptedMessage = await encryptionService.decryptMessage(
        encryptedMessage,
        user.privateKey
      );

      const chatId = decryptedMessage.chatId;
      
      setMessages(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), decryptedMessage],
      }));

      // Update unread count if not active chat
      if (activeChat?.id !== chatId) {
        setUnreadCounts(prev => ({
          ...prev,
          [chatId]: (prev[chatId] || 0) + 1,
        }));
      }

      // Update chat last message
      setChats(prev => 
        prev.map(chat => 
          chat.id === chatId 
            ? {
                ...chat,
                lastMessage: decryptedMessage,
                lastMessageAt: new Date().toISOString(),
                unreadCount: (chat.unreadCount || 0) + (activeChat?.id === chatId ? 0 : 1),
              }
            : chat
        )
      );
    } catch (err) {
      console.error('Error handling new message:', err);
    }
  };

  // Handle message read
  const handleMessageRead = (data) => {
    const { chatId, messageId, userId } = data;
    
    // Mark message as read locally
    setMessages(prev => ({
      ...prev,
      [chatId]: prev[chatId]?.map(msg =>
        msg.id === messageId ? { ...msg, read: true } : msg
      ),
    }));

    // Update unread count
    if (userId !== user.id) {
      setUnreadCounts(prev => {
        const newCount = Math.max(0, (prev[chatId] || 0) - 1);
        return { ...prev, [chatId]: newCount };
      });

      setChats(prev =>
        prev.map(chat =>
          chat.id === chatId
            ? { ...chat, unreadCount: Math.max(0, (chat.unreadCount || 0) - 1) }
            : chat
        )
      );
    }
  };

  // Handle user typing
  const handleUserTyping = (data) => {
    const { chatId, userId, isTyping } = data;
    
    setTypingUsers(prev => ({
      ...prev,
      [`${chatId}_${userId}`]: isTyping,
    }));
  };

  // Send message
  const sendMessage = async (chatId, content, type = 'text', metadata = {}) => {
    try {
      if (!isConnected) {
        // Queue message if not connected
        messageQueueRef.current.push({ chatId, content, type, metadata });
        return;
      }

      const message = {
        chatId,
        content,
        type,
        metadata,
        senderId: user.id,
        senderType: user.role,
      };

      // Encrypt message
      const encryptedMessage = await encryptionService.encryptMessage(
        message,
        user.privateKey,
        user.publicKey
      );

      // Send via WebSocket
      socketRef.current.emit('sendMessage', encryptedMessage);

      // Add to local messages immediately
      setMessages(prev => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), message],
      }));

      // Update chat last message
      setChats(prev =>
        prev.map(chat =>
          chat.id === chatId
            ? { ...chat, lastMessage: message, lastMessageAt: new Date().toISOString() }
            : chat
        )
      );

      return message;
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
      throw err;
    }
  };

  // Send file
  const sendFile = async (chatId, file, type = 'document') => {
    try {
      if (!isConnected) {
        throw new Error('Not connected to chat server');
      }

      // Upload file to server
      const uploadResponse = await chatService.uploadFile(token, chatId, file);

      if (uploadResponse.success) {
        const fileMessage = {
          chatId,
          content: uploadResponse.file.filename,
          type: 'file',
          metadata: {
            fileId: uploadResponse.file.id,
            fileName: file.name,
            fileSize: file.size,
            fileType: type,
            url: uploadResponse.file.url,
          },
          senderId: user.id,
          senderType: user.role,
        };

        // Encrypt and send message
        const encryptedMessage = await encryptionService.encryptMessage(
          fileMessage,
          user.privateKey,
          user.publicKey
        );

        socketRef.current.emit('sendMessage', encryptedMessage);

        // Add to local messages
        setMessages(prev => ({
          ...prev,
          [chatId]: [...(prev[chatId] || []), fileMessage],
        }));

        return fileMessage;
      }
    } catch (err) {
      console.error('Error sending file:', err);
      setError(err.message);
      throw err;
    }
  };

  // Create chat
  const createChat = async (doctorId, initialMessage = null) => {
    try {
      const response = await chatService.createChat(token, { doctorId });
      
      if (response.success) {
        const newChat = response.data;
        setChats(prev => [newChat, ...prev]);
        
        if (initialMessage) {
          await sendMessage(newChat.id, initialMessage);
        }
        
        return newChat;
      }
      
      return null;
    } catch (err) {
      console.error('Error creating chat:', err);
      setError(err.message);
      throw err;
    }
  };

  // Join chat via QR code
  const joinChatViaQR = async (qrData) => {
    try {
      const response = await chatService.joinChatViaQR(token, qrData);
      
      if (response.success) {
        const chat = response.data;
        
        // Check if chat already exists
        const existingChat = chats.find(c => c.id === chat.id);
        if (!existingChat) {
          setChats(prev => [chat, ...prev]);
        }
        
        return chat;
      }
      
      return null;
    } catch (err) {
      console.error('Error joining chat via QR:', err);
      setError(err.message);
      throw err;
    }
  };

  // Get chat by ID
  const getChat = async (chatId) => {
    try {
      const response = await chatService.getChat(token, chatId);
      return response.success ? response.data : null;
    } catch (err) {
      console.error('Error getting chat:', err);
      throw err;
    }
  };

  // Get messages for chat
  const getMessages = async (chatId, page = 1, limit = 50) => {
    try {
      const response = await chatService.getMessages(token, chatId, { page, limit });
      return response.success ? response.data : [];
    } catch (err) {
      console.error('Error getting messages:', err);
      throw err;
    }
  };

  // Load more messages
  const loadMoreMessages = async (chatId) => {
    try {
      const currentMessages = messages[chatId] || [];
      const lastMessageId = currentMessages.length > 0 ? currentMessages[0].id : null;
      
      const response = await chatService.getMessages(token, chatId, {
        before: lastMessageId,
        limit: 50,
      });

      if (response.success && response.data.length > 0) {
        setMessages(prev => ({
          ...prev,
          [chatId]: [...response.data, ...(prev[chatId] || [])],
        }));
      }

      return response.data;
    } catch (err) {
      console.error('Error loading more messages:', err);
      throw err;
    }
  };

  // Mark messages as read
  const markMessagesAsRead = async (chatId) => {
    try {
      if (activeChat?.id !== chatId) return;

      const unreadMessages = (messages[chatId] || []).filter(m => !m.read && m.senderId !== user.id);
      
      if (unreadMessages.length > 0) {
        await chatService.markMessagesAsRead(token, chatId);
        
        setMessages(prev => ({
          ...prev,
          [chatId]: prev[chatId]?.map(msg =>
            msg.senderId !== user.id ? { ...msg, read: true } : msg
          ),
        }));

        setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
        setChats(prev =>
          prev.map(chat =>
            chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
          )
        );
      }
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  };

  // Set active chat
  const setActiveChatHandler = async (chat) => {
    if (activeChat?.id === chat.id) return;

    setActiveChat(chat);
    
    // Mark messages as read when chat is opened
    await markMessagesAsRead(chat.id);
  };

  // Send typing indicator
  const sendTypingIndicator = (chatId, isTyping) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('typing', { chatId, isTyping });
    }
  };

  // Search chats
  const searchChats = (query) => {
    if (!query) return chats;

    const lowerQuery = query.toLowerCase();
    return chats.filter(chat =>
      chat.doctor?.fullName?.toLowerCase().includes(lowerQuery) ||
      chat.clinic?.name?.toLowerCase().includes(lowerQuery) ||
      chat.specialty?.toLowerCase().includes(lowerQuery) ||
      chat.lastMessage?.content?.toLowerCase().includes(lowerQuery)
    );
  };

  // Get unread count for a chat
  const getUnreadCount = (chatId) => {
    return unreadCounts[chatId] || 0;
  };

  // Get total unread count
  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  };

  // Is user typing in a chat
  const isUserTyping = (chatId, userId) => {
    return typingUsers[`${chatId}_${userId}`] || false;
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  const value = {
    chats,
    activeChat,
    messages,
    unreadCounts,
    isConnected,
    isLoading,
    error,
    totalUnreadCount: getTotalUnreadCount(),
    sendMessage,
    sendFile,
    createChat,
    joinChatViaQR,
    getChat,
    getMessages,
    loadMoreMessages,
    markMessagesAsRead,
    setActiveChat: setActiveChatHandler,
    sendTypingIndicator,
    searchChats,
    getUnreadCount,
    isUserTyping,
    clearError,
    refreshChats: async () => {
      try {
        const response = await chatService.getChats(token);
        setChats(response.data || []);
      } catch (err) {
        console.error('Error refreshing chats:', err);
      }
    },
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export default ChatContext;
