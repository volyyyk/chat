/**
 * Chat Screen
 * 
 * Displays messages between doctor and patient
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  Image
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import { usePatient } from '../services/PatientService';
import { useWebSocket } from '../services/WebSocketService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const ChatScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { conversation } = route.params || {};
  const { theme } = useTheme();
  
  const { 
    doctorProfile,
    sendMessageToPatient,
    getMessagesWithPatient,
    markAllMessagesAsRead
  } = useDoctor();
  
  const { 
    patientProfile,
    sendMessageToDoctor,
    getMessagesWithDoctor,
    markAllMessagesAsRead: markAllPatientMessagesAsRead
  } = usePatient();
  
  const { isConnected } = useWebSocket();
  
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  const flatListRef = useRef(null);

  // Determine mode and recipient
  const isDoctorMode = doctorProfile?.id === conversation?.doctorId;
  const recipientId = isDoctorMode ? conversation?.patientId : conversation?.doctorId;
  const recipientName = isDoctorMode 
    ? `Patient ${recipientId?.substring(0, 8)}`
    : 'Doctor';

  // Load messages
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setIsLoading(true);
        
        let loadedMessages = [];
        
        if (isDoctorMode) {
          loadedMessages = await getMessagesWithPatient(recipientId);
        } else {
          loadedMessages = await getMessagesWithDoctor();
        }
        
        setMessages(loadedMessages);
        setIsLoading(false);
        
        // Mark all messages as read
        if (isDoctorMode) {
          await markAllMessagesAsRead(conversation?.id);
        } else {
          await markAllPatientMessagesAsRead();
        }
        
        // Scroll to bottom
        setTimeout(() => {
          if (flatListRef.current && loadedMessages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      } catch (err) {
        console.error('Failed to load messages:', err);
        setError({ 
          title: 'Error', 
          message: err.message || 'Failed to load messages' 
        });
        setIsLoading(false);
      }
    };
    
    if (conversation?.id) {
      loadMessages();
    }
  }, [conversation, isDoctorMode, recipientId, getMessagesWithPatient, getMessagesWithDoctor, markAllMessagesAsRead, markAllPatientMessagesAsRead]);

  // Keyboard visibility
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => setIsKeyboardVisible(true)
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setIsKeyboardVisible(false)
    );
    
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || isSending) {
      return;
    }
    
    try {
      setIsSending(true);
      setError(null);
      
      let result;
      
      if (isDoctorMode) {
        result = await sendMessageToPatient(recipientId, messageText);
      } else {
        result = await sendMessageToDoctor(messageText);
      }
      
      if (result.success) {
        // Add message to local state
        const newMessage = {
          id: result.messageId,
          conversationId: conversation?.id,
          senderId: isDoctorMode ? doctorProfile?.id : patientProfile?.uniqueId,
          receiverId: recipientId,
          content: messageText,
          timestamp: result.timestamp || Date.now(),
          status: 'sent',
          isEncrypted: true,
          isRead: true
        };
        
        setMessages(prev => [...prev, newMessage]);
        setMessageText('');
        
        // Scroll to bottom
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      } else {
        setError({ 
          title: 'Error', 
          message: result.message || 'Failed to send message' 
        });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to send message' 
      });
    } finally {
      setIsSending(false);
    }
  }, [messageText, isSending, isDoctorMode, recipientId, sendMessageToPatient, sendMessageToDoctor, conversation, doctorProfile, patientProfile]);

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Render message item
  const renderMessageItem = ({ item }) => {
    const isFromMe = isDoctorMode 
      ? item.senderId === doctorProfile?.id 
      : item.senderId === patientProfile?.uniqueId;
    
    const showDate = shouldShowDate(item.timestamp, messages.indexOf(item));
    
    return (
      <View style={styles.messageContainer}>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateText, { color: theme.colors.textSecondary }]}>
              {formatDate(item.timestamp)}
            </Text>
          </View>
        )}
        
        <View style={[styles.messageItem, {
          alignItems: isFromMe ? 'flex-end' : 'flex-start'
        }]}>
          <View style={[styles.messageBubble, {
            backgroundColor: isFromMe ? theme.colors.primary : theme.colors.surface,
            borderColor: isFromMe ? theme.colors.primary : theme.colors.border
          }]}>
            <Text style={[styles.messageText, {
              color: isFromMe ? '#FFFFFF' : theme.colors.text
            }]}>
              {item.content}
            </Text>
            <View style={[styles.messageMeta, {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8
            }]}>
              <Text style={[styles.messageTime, {
                color: isFromMe ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textSecondary
              }]}>
                {formatTime(item.timestamp)}
              </Text>
              {isFromMe && (
                <Text style={[styles.messageStatus, {
                  color: isFromMe ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textSecondary
                }]}>
                  {item.status === 'delivered' ? '✓✓' : item.status === 'read' ? '✓✓' : '✓'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Check if date should be shown
  const shouldShowDate = (timestamp, index) => {
    if (index === 0) {
      return true;
    }
    
    const currentDate = new Date(timestamp);
    currentDate.setHours(0, 0, 0, 0);
    
    const prevMessage = messages[index - 1];
    if (!prevMessage) {
      return true;
    }
    
    const prevDate = new Date(prevMessage.timestamp);
    prevDate.setHours(0, 0, 0, 0);
    
    return currentDate.getTime() !== prevDate.getTime();
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (now - date < 86400000) { // Today
      return 'Today';
    } else if (now - date < 172800000) { // Yesterday
      return 'Yesterday';
    } else if (now - date < 604800000) { // This week
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  // Navigate back
  const navigateBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {/* Header */}
        <View style={[styles.header, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={[styles.backButtonText, { color: theme.colors.text }]}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {recipientName}
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              {isConnected() ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (flatListRef.current && messages.length > 0) {
              flatListRef.current.scrollToEnd({ animated: true });
            }
          }}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
                No messages yet
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
                Start a conversation with {recipientName}
              </Text>
            </View>
          )}
        />

        {/* Input Area */}
        <View style={[styles.inputArea, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <TextInput
            style={[styles.input, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text
            }]}
            placeholder={`Message ${recipientName}...`}
            placeholderTextColor={theme.colors.textSecondary}
            value={messageText}
            onChangeText={setMessageText}
            multiline={true}
            numberOfLines={Platform.OS === 'ios' ? null : 4}
            maxLength={config.messages.maxLength}
            onSubmitEditing={handleSendMessage}
            blurOnSubmit={Platform.OS === 'ios'}
          />
          <TouchableOpacity
            style={[styles.sendButton, { 
              backgroundColor: messageText.trim() ? theme.colors.primary : theme.colors.border
            }]}
            onPress={handleSendMessage}
            disabled={!messageText.trim() || isSending}
          >
            <Text style={[styles.sendButtonText, {
              color: messageText.trim() ? '#FFFFFF' : theme.colors.textSecondary
            }]}>
              →
            </Text>
          </TouchableOpacity>
        </View>

        <LoadingOverlay visible={isLoading || isSending} />
        
        <ErrorModal
          visible={!!error}
          title={error?.title || 'Error'}
          message={error?.message || 'An error occurred'}
          onDismiss={handleErrorDismiss}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  keyboardAvoidingView: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#00000020'
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  backButtonText: {
    fontSize: 20
  },
  headerContent: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  headerSubtitle: {
    fontSize: 12
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8
  },
  messageContainer: {
    marginBottom: 8
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 8
  },
  dateText: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 12,
    overflow: 'hidden'
  },
  messageItem: {
    flex: 1,
    marginBottom: 4
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22
  },
  messageMeta: {
    marginTop: 6,
    justifyContent: 'flex-end'
  },
  messageTime: {
    fontSize: 10
  },
  messageStatus: {
    fontSize: 10
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48
  },
  emptyStateText: {
    fontSize: 16,
    marginBottom: 8
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666'
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#00000020'
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 24,
    padding: 12,
    paddingRight: 48,
    fontSize: 16,
    marginRight: 8
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonText: {
    fontSize: 18
  }
});

export default ChatScreen;
