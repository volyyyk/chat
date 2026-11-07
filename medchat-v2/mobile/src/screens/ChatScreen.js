/**
 * MedChat Mobile App - Chat Screen
 * Main chat interface for messaging
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, FlatList, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, chatStyles } from '../styles/commonStyles';
import { formatMessageTime, formatFileSize, formatDoctorInfo, formatFileRetentionWarning } from '../utils/formatters';
import { parsePatientIdentifier, isFileExpired } from '../utils/helpers';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paymentService } from '../services/paymentService';

const ChatScreen = ({ navigation, route }) => {
  const { chatId } = route.params || {};
  const { user } = useAuth();
  const {
    messages,
    isLoading,
    error,
    hasMore,
    isSending,
    convenientTime,
    doctorInfo,
    patientInfo,
    files,
    isTyping,
    messagesEndRef,
    loadMoreMessages,
    sendMessage,
    sendFile,
    loadChatInfo,
    loadFiles,
    markMessagesAsRead,
    setTypingStatus,
    clearError,
  } = useChat(chatId);

  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDoctorInfo, setShowDoctorInfo] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Voice message state
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const soundRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const flatListRef = useRef(null);

  // Load chat info
  useEffect(() => {
    if (chatId) {
      loadChatInfo();
      loadFiles();
      markMessagesAsRead();
    }
  }, [chatId, loadChatInfo, loadFiles, markMessagesAsRead]);

  // Mark messages as read when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (chatId) {
        markMessagesAsRead();
      }
    });

    return unsubscribe;
  }, [navigation, chatId, markMessagesAsRead]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Handle typing status
  const handleMessageChange = useCallback((text) => {
    setNewMessage(text);
    setTypingStatus(text.length > 0);
  }, [setTypingStatus]);

  // Send message (with paid-message check for patients)
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || isSending) return;

    const message = newMessage.trim();
    setNewMessage('');
    setShowEmojiPicker(false);

    // Patients: check the free period before sending
    if (user?.role === 'patient') {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const check = await paymentService.checkFree(token, chatId);
        if (check.success && check.isFree === false) {
          // Free period is over: redirect to payment screen,
          // the pending message is sent after successful payment
          navigation.navigate('Payment', { chatId, pendingMessage: message });
          return;
        }
      } catch (err) {
        // Fail-open: if the check service is unavailable, send anyway
        console.warn('checkFree failed, sending anyway:', err.message);
      }
    }

    try {
      await sendMessage(message);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }, [newMessage, isSending, sendMessage, user, chatId, navigation]);

  // Start voice recording
  const startVoiceRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Нет разрешения на микрофон');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(rec);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      Alert.alert('Ошибка', 'Не удалось начать запись');
    }
  }, []);

  // Stop voice recording and send the voice message
  const stopVoiceRecording = useCallback(async (send) => {
    if (!recording) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!send || !uri) return;

      const info = await FileSystem.getInfoAsync(uri);
      const voiceFile = {
        uri,
        name: `voice_${Date.now()}.m4a`,
        type: 'audio/m4a',
        size: info.exists ? info.size : 0,
      };

      setIsUploading(true);
      await sendFile(voiceFile);
    } catch (err) {
      console.error('Error sending voice message:', err);
      Alert.alert('Ошибка', 'Не удалось отправить голосовое сообщение');
    } finally {
      setIsUploading(false);
    }
  }, [recording, sendFile]);

  // Play / stop a voice message
  const togglePlayVoice = useCallback(async (file) => {
    try {
      if (playingId) {
        await soundRef.current?.unloadAsync();
        soundRef.current = null;
        setPlayingId(null);
        if (playingId === (file.id || file.name)) return;
      }

      const { sound } = await Audio.Sound.createAsync({ uri: file.url || file.uri });
      soundRef.current = sound;
      setPlayingId(file.id || file.name);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          setPlayingId(null);
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('Error playing voice message:', err);
      Alert.alert('Ошибка', 'Не удалось воспроизвести сообщение');
    }
  }, [playingId]);

  // Pick file
  const pickFile = useCallback(async (type = 'document') => {
    try {
      let result;

      if (type === 'image') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Ошибка', 'Нет разрешения на доступ к фото');
          return;
        }

        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: false,
          quality: 0.8,
        });

        if (result.canceled) return;

        result = {
          uri: result.assets[0].uri,
          name: result.assets[0].fileName || `image_${Date.now()}.jpg`,
          type: result.assets[0].type || 'image/jpeg',
          size: result.assets[0].fileSize || 0,
        };
      } else {
        result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'text/plain', 'image/*'],
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        result = {
          uri: result.assets[0].uri,
          name: result.assets[0].name,
          type: result.assets[0].mimeType,
          size: result.assets[0].size,
        };
      }

      setSelectedFile(result);
      setShowFileMenu(false);

      // Ask for confirmation before sending
      Alert.alert(
        'Отправить файл?',
        `Файл: ${result.name}\nРазмер: ${formatFileSize(result.size)}`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Отправить',
            onPress: async () => {
              setIsUploading(true);
              try {
                await sendFile(result);
                setSelectedFile(null);
              } catch (err) {
                Alert.alert('Ошибка', 'Не удалось отправить файл');
              } finally {
                setIsUploading(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error picking file:', err);
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    }
  }, [sendFile]);

  // Render message bubble
  const renderMessageBubble = useCallback(({ item }) => {
    const isPatient = user?.role === 'patient';
    const isMyMessage = isPatient 
      ? item.sender === 'patient' 
      : item.sender === 'doctor';

    // Determine message style based on sender
    const bubbleStyle = isMyMessage
      ? [chatStyles.messageBubble, chatStyles.messageBubblePatient]
      : [chatStyles.messageBubble, chatStyles.messageBubbleDoctor];

    const textStyle = isMyMessage
      ? [chatStyles.messageText, chatStyles.messageTextPatient]
      : [chatStyles.messageText, chatStyles.messageTextDoctor];

    // Handle file messages
    if (item.file) {
      return (
        <View style={bubbleStyle}>
          <View style={styles.fileMessage}>
            <MaterialIcons
              name="insert-drive-file"
              size={24}
              color={isMyMessage ? colors.text.primaryInverse : colors.primary[600]}
            />
            <View style={styles.fileInfo}>
              <Text style={textStyle} numberOfLines={1}>
                {item.file.name || 'Файл'}
              </Text>
              <Text style={[textStyle, styles.fileSize]}>
                {formatFileSize(item.file.size || 0)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => Alert.alert('Скачать', 'Функция скачивания будет доступна скоро')}
            >
              <MaterialIcons
                name="download"
                size={20}
                color={isMyMessage ? colors.text.primaryInverse : colors.primary[600]}
              />
            </TouchableOpacity>
          </View>
          <Text style={[chatStyles.messageTime, isMyMessage && styles.myMessageTime]}>
            {formatMessageTime(item.createdAt)}
          </Text>
        </View>
      );
    }

    // Handle voice messages
    const fileType = item.file?.type || item.file?.mimeType || '';
    if (item.file && fileType.indexOf('audio') === 0) {
      const isPlaying = playingId === (item.file.id || item.file.name);
      return (
        <View style={bubbleStyle}>
          <TouchableOpacity
            style={styles.voiceMessage}
            onPress={() => togglePlayVoice(item.file)}
          >
            <MaterialIcons
              name={isPlaying ? 'pause' : 'play-arrow'}
              size={28}
              color={isMyMessage ? colors.text.primaryInverse : colors.primary[600]}
            />
            <View style={styles.voiceInfo}>
              <Text style={textStyle}>Голосовое сообщение</Text>
              <Text style={[textStyle, styles.fileSize]}>
                {formatMessageTime(item.createdAt)}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.messageFooter}>
            <Text style={[chatStyles.messageTime, isMyMessage && styles.myMessageTime]}>
              {formatMessageTime(item.createdAt)}
            </Text>
          </View>
        </View>
      );
    }

    // Handle system messages
    if (item.sender === 'system') {
      return (
        <View style={[chatStyles.messageBubble, chatStyles.messageBubbleSystem]}>
          <Text style={[chatStyles.messageText, chatStyles.messageTextSystem]}>
            {item.content}
          </Text>
          <Text style={[chatStyles.messageTime, styles.systemMessageTime]}>
            {formatMessageTime(item.createdAt)}
          </Text>
        </View>
      );
    }

    // Regular text message
    return (
      <View style={bubbleStyle}>
        <Text style={textStyle}>{item.content}</Text>
        <View style={styles.messageFooter}>
          <Text style={[chatStyles.messageTime, isMyMessage && styles.myMessageTime]}>
            {formatMessageTime(item.createdAt)}
          </Text>
          {item.status && (
            <View style={styles.messageStatus}>
              {item.status === 'delivered' && (
                <MaterialIcons
                  name="done-all"
                  size={16}
                  color={isMyMessage ? colors.text.primaryInverse : colors.text.tertiary}
                />
              )}
              {item.status === 'read' && (
                <MaterialIcons
                  name="done-all"
                  size={16}
                  color={colors.primary[500]}
                />
              )}
            </View>
          )}
        </View>
      </View>
    );
  }, [user, playingId, togglePlayVoice]);

  // Render header
  const renderHeader = useCallback(() => {
    if (!doctorInfo && !patientInfo) return null;

    const isPatient = user?.role === 'patient';
    const name = isPatient
      ? formatDoctorInfo(doctorInfo, {}, {})
      : patientInfo?.login || 'Пациент';

    return (
      <TouchableOpacity
        style={chatStyles.chatHeader}
        onPress={() => setShowDoctorInfo(true)}
      >
        <View style={chatStyles.chatHeaderLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={chatStyles.chatHeaderBack}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={chatStyles.chatHeaderInfo}>
            <Text style={chatStyles.chatHeaderTitle} numberOfLines={1}>
              {name}
            </Text>
            {isPatient && convenientTime && (
              <Text style={chatStyles.chatHeaderSubtitle} numberOfLines={1}>
                {convenientTime}
              </Text>
            )}
          </View>
        </View>

        <View style={chatStyles.chatHeaderActions}>
          <TouchableOpacity style={styles.headerAction} onPress={() => setShowFiles(true)}>
            <MaterialIcons name="attach-file" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerAction} onPress={() => navigation.navigate('Settings')}>
            <MaterialIcons name="more-vert" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [doctorInfo, patientInfo, user, convenientTime, navigation]);

  // Render input bar
  const renderInputBar = useCallback(() => {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        style={styles.inputBarContainer}
      >
        <View style={chatStyles.inputBarContainer}>
          {showEmojiPicker && (
            <View style={styles.emojiPicker}>
              <Text>Emoji picker placeholder</Text>
              <TouchableOpacity
                style={styles.emojiClose}
                onPress={() => setShowEmojiPicker(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          )}

          <View style={chatStyles.inputBar}>
            <TouchableOpacity
              style={chatStyles.emojiButton}
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <MaterialCommunityIcons
                name="emoticon-happy-outline"
                size={24}
                color={colors.text.tertiary}
              />
            </TouchableOpacity>

            <TextInput
              style={[chatStyles.inputBarText, textStyles.inputText]}
              placeholder="Введите сообщение..."
              value={newMessage}
              onChangeText={handleMessageChange}
              onSubmitEditing={handleSendMessage}
              placeholderTextColor={colors.chat.inputPlaceholder}
              multiline
              blurOnSubmit={false}
              autoCapitalize="sentences"
              autoCorrect
            />

            {isUploading ? (
              <ActivityIndicator size="small" color={colors.primary[600]} />
            ) : isRecording ? (
              <View style={styles.recordingRow}>
                <TouchableOpacity
                  style={styles.recordingCancelButton}
                  onPress={() => stopVoiceRecording(false)}
                >
                  <MaterialIcons name="close" size={22} color={colors.error[500]} />
                </TouchableOpacity>
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTime}>{recordingSeconds} сек</Text>
                </View>
                <TouchableOpacity
                  style={[chatStyles.sendButton, styles.recordingSendButton]}
                  onPress={() => stopVoiceRecording(true)}
                >
                  <MaterialIcons name="send" size={24} color={colors.text.primaryInverse} />
                </TouchableOpacity>
              </View>
            ) : newMessage.trim().length === 0 ? (
              <TouchableOpacity
                style={chatStyles.emojiButton}
                onPress={startVoiceRecording}
              >
                <MaterialIcons name="mic" size={24} color={colors.text.tertiary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={chatStyles.sendButton}
                onPress={handleSendMessage}
                disabled={isSending}
              >
                <MaterialIcons name="send" size={24} color={colors.text.primaryInverse} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.fileButton}
            onPress={() => setShowFileMenu(true)}
          >
            <MaterialIcons name="attach-file" size={24} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }, [
    newMessage,
    showEmojiPicker,
    isUploading,
    isSending,
    isRecording,
    recordingSeconds,
    recording,
    handleMessageChange,
    handleSendMessage,
    startVoiceRecording,
    stopVoiceRecording,
  ]);

  // Render convenient time overlay
  const renderConvenientTime = useCallback(() => {
    if (!convenientTime || user?.role !== 'patient') return null;

    return (
      <View style={chatStyles.convenientTimeContainer}>
        <Text style={chatStyles.convenientTimeText}>{convenientTime}</Text>
      </View>
    );
  }, [convenientTime, user]);

  // Render file menu
  const renderFileMenu = useCallback(() => {
    return (
      <Modal
        visible={showFileMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFileMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setShowFileMenu(false)}
        >
          <View style={styles.modalContent}>
            <Text style={[textStyles.h5, styles.modalTitle]}>Выберите файл</Text>
            
            <TouchableOpacity
              style={[buttonStyles.buttonGhost, styles.modalButton]}
              onPress={() => {
                setShowFileMenu(false);
                pickFile('image');
              }}
            >
              <MaterialIcons name="image" size={24} color={colors.text.primary} />
              <Text style={[buttonStyles.buttonGhostText, styles.modalButtonText]}>
                Фото
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[buttonStyles.buttonGhost, styles.modalButton]}
              onPress={() => {
                setShowFileMenu(false);
                pickFile('document');
              }}
            >
              <MaterialIcons name="description" size={24} color={colors.text.primary} />
              <Text style={[buttonStyles.buttonGhostText, styles.modalButtonText]}>
                Документ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[buttonStyles.buttonGhost, styles.modalButton]}
              onPress={() => setShowFileMenu(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text.tertiary} />
              <Text style={[buttonStyles.buttonGhostText, styles.modalButtonText, styles.cancelText]}>
                Отмена
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }, [showFileMenu, pickFile]);

  // Render doctor info modal
  const renderDoctorInfoModal = useCallback(() => {
    if (!doctorInfo) return null;

    return (
      <Modal
        visible={showDoctorInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDoctorInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.doctorInfoModal]}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowDoctorInfo(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>

            <View style={styles.doctorInfoHeader}>
              <View style={styles.doctorInfoAvatar}>
                <MaterialIcons name="account-circle" size={48} color={colors.primary[600]} />
              </View>
              <Text style={[textStyles.h4, styles.doctorInfoName]}>
                {formatDoctorInfo(doctorInfo, {}, {})}
              </Text>
            </View>

            <View style={styles.doctorInfoDetails}>
              <View style={styles.doctorInfoRow}>
                <MaterialIcons name="local-hospital" size={20} color={colors.text.secondary} />
                <Text style={[textStyles.bodySmall, styles.doctorInfoText]}>
                  Клиника: {doctorInfo.clinicName || 'Неизвестно'}
                </Text>
              </View>
              <View style={styles.doctorInfoRow}>
                <MaterialIcons name="work" size={20} color={colors.text.secondary} />
                <Text style={[textStyles.bodySmall, styles.doctorInfoText]}>
                  Специальность: {doctorInfo.specialtyName || 'Неизвестно'}
                </Text>
              </View>
              <View style={styles.doctorInfoRow}>
                <MaterialIcons name="schedule" size={20} color={colors.text.secondary} />
                <Text style={[textStyles.bodySmall, styles.doctorInfoText]}>
                  Удобное время: {convenientTime}
                </Text>
              </View>
            </View>

            <View style={styles.doctorInfoWarning}>
              <MaterialIcons name="info" size={20} color={colors.warning[600]} />
              <Text style={[textStyles.caption, styles.warningText]}>
                {formatFileRetentionWarning()}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }, [showDoctorInfo, doctorInfo, convenientTime]);

  // Render files modal
  const renderFilesModal = useCallback(() => {
    if (!files || files.length === 0) return null;

    return (
      <Modal
        visible={showFiles}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFiles(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.filesModal]}>
            <View style={styles.filesHeader}>
              <Text style={[textStyles.h4, styles.filesTitle]}>Файлы</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowFiles(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={files.filter(f => !isFileExpired(f.createdAt))}
              renderItem={({ item }) => (
                <View style={styles.fileItem}>
                  <MaterialIcons name="insert-drive-file" size={24} color={colors.primary[600]} />
                  <View style={styles.fileItemInfo}>
                    <Text style={[textStyles.bodySmall, styles.fileItemName]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[textStyles.caption, styles.fileItemSize]}>
                      {formatFileSize(item.size)} • {formatMessageTime(item.createdAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.fileItemAction}
                    onPress={() => Alert.alert('Действие', 'Функция будет доступна скоро')}
                  >
                    <MaterialIcons name="more-vert" size={20} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </View>
              )}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={(
                <View style={styles.emptyFiles}>
                  <Text style={[textStyles.bodySmall, styles.emptyFilesText]}>
                    Нет файлов
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    );
  }, [showFiles, files]);

  // Render typing indicator
  const renderTypingIndicator = useCallback(() => {
    if (!isTyping) return null;

    return (
      <View style={[chatStyles.messageBubble, chatStyles.messageBubbleDoctor]}>
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={colors.text.tertiary} />
          <Text style={[chatStyles.messageText, chatStyles.messageTextDoctor, styles.typingText]}>
            Печатает...
          </Text>
        </View>
      </View>
    );
  }, [isTyping]);

  // Render loading more indicator
  const renderLoadingMore = useCallback(() => {
    if (!hasMore || isLoading) return null;

    return (
      <View style={chatStyles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary[600]} />
      </View>
    );
  }, [hasMore, isLoading]);

  // Render error
  const renderError = useCallback(() => {
    if (!error) return null;

    return (
      <View style={chatStyles.errorContainer}>
        <MaterialIcons name="error" size={24} color={colors.error[500]} />
        <Text style={[textStyles.bodySmall, chatStyles.errorText]}>{error}</Text>
        <TouchableOpacity onPress={clearError}>
          <Text style={[textStyles.link, styles.clearError]}>Очистить</Text>
        </TouchableOpacity>
      </View>
    );
  }, [error, clearError]);

  // Main render
  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}

      {isLoading && messages.length === 0 ? (
        <View style={chatStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageBubble}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderTypingIndicator}
          ListFooterComponent={renderLoadingMore}
          ListEmptyComponent={(
            <View style={chatStyles.emptyState}>
              <MaterialIcons name="chat" size={48} color={colors.text.tertiary} />
              <Text style={[textStyles.h4, chatStyles.emptyStateTitle]}>
                Нет сообщений
              </Text>
              <Text style={[textStyles.bodySmall, chatStyles.emptyStateSubtitle]}>
                Начните чат с врачом
              </Text>
            </View>
          )}
          contentContainerStyle={styles.messagesContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          inverted
          onEndReached={loadMoreMessages}
          onEndReachedThreshold={0.5}
        />
      )}

      {renderError()}
      {renderConvenientTime()}
      {renderInputBar()}
      {renderFileMenu()}
      {renderDoctorInfoModal()}
      {renderFilesModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  messagesContainer: {
    paddingTop: spacing[2],
  },
  
  inputBarContainer: {
    position: 'relative',
  },
  
  fileMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  
  fileInfo: {
    flex: 1,
  },
  
  fileSize: {
    fontSize: 11,
    opacity: 0.7,
  },

  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },

  voiceInfo: {
    flex: 1,
  },

  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },

  recordingCancelButton: {
    padding: spacing[1],
  },

  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
  },

  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error[500],
  },

  recordingTime: {
    fontSize: 13,
    color: colors.text.primary,
  },

  recordingSendButton: {
    opacity: 1,
  },
  
  downloadButton: {
    padding: spacing[1],
  },
  
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  
  myMessageTime: {
    color: colors.text.primaryInverse,
  },
  
  systemMessageTime: {
    color: colors.text.tertiary,
  },
  
  messageStatus: {
    marginLeft: spacing[2],
  },
  
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  
  typingText: {
    fontStyle: 'italic',
    color: colors.text.tertiary,
  },
  
  fileButton: {
    position: 'absolute',
    right: spacing[2],
    bottom: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[2],
  },
  
  headerAction: {
    padding: spacing[1],
  },
  
  emojiPicker: {
    position: 'absolute',
    bottom: spacing[12],
    left: 0,
    right: 0,
    backgroundColor: colors.surface.primary,
    padding: spacing[2],
    borderRadius: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  emojiClose: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
    padding: spacing[1],
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  modalContent: {
    backgroundColor: colors.surface.primary,
    borderRadius: spacing[3],
    padding: spacing[4],
    minWidth: 280,
    maxWidth: '90%',
  },
  
  modalTitle: {
    marginBottom: spacing[3],
    color: colors.text.primary,
    textAlign: 'center',
  },
  
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    marginVertical: spacing[1],
    borderRadius: spacing[2],
  },
  
  modalButtonText: {
    marginLeft: spacing[2],
    color: colors.text.primary,
  },
  
  cancelText: {
    color: colors.text.tertiary,
  },
  
  modalClose: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    padding: spacing[1],
  },
  
  doctorInfoModal: {
    maxWidth: '95%',
    maxHeight: '80%',
  },
  
  doctorInfoHeader: {
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  
  doctorInfoAvatar: {
    marginBottom: spacing[2],
  },
  
  doctorInfoName: {
    color: colors.text.primary,
  },
  
  doctorInfoDetails: {
    marginBottom: spacing[3],
  },
  
  doctorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[2],
    marginBottom: spacing[1],
  },
  
  doctorInfoText: {
    marginLeft: spacing[2],
    color: colors.text.primary,
  },
  
  doctorInfoWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    backgroundColor: colors.warning[50],
    borderRadius: spacing[2],
  },
  
  warningText: {
    marginLeft: spacing[2],
    color: colors.warning[800],
  },
  
  filesModal: {
    maxWidth: '95%',
    maxHeight: '80%',
  },
  
  filesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
    paddingBottom: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  
  filesTitle: {
    color: colors.text.primary,
  },
  
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[2],
    marginBottom: spacing[1],
  },
  
  fileItemInfo: {
    flex: 1,
    marginLeft: spacing[2],
  },
  
  fileItemName: {
    color: colors.text.primary,
  },
  
  fileItemSize: {
    color: colors.text.tertiary,
  },
  
  fileItemAction: {
    padding: spacing[1],
  },
  
  emptyFiles: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  emptyFilesText: {
    color: colors.text.tertiary,
  },
  
  clearError: {
    marginLeft: spacing[2],
  },
});

export default ChatScreen;

