/**
 * MedChat Mobile App - Chat List Screen
 * List of all chats for patient or doctor
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, SafeAreaView, TextInput, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, chatStyles } from '../styles/commonStyles';
import { formatDateTime, formatChatTitle, truncateText } from '../utils/formatters';
import { parsePatientIdentifier } from '../utils/helpers';

const ChatListScreen = ({ navigation, route }) => {
  const { user, isAuthenticated } = useAuth();
  const { getChatList, searchChats, getUnreadCount } = useChat();
  const [chats, setChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChats, setFilteredChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load chats
  const loadChats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const chatList = await getChatList();
      
      if (chatList.length === 0) {
        // If no local chats, try to get from server (for doctor)
        if (user?.role === 'doctor') {
          // For doctor, we would fetch from server
          // This is a placeholder - actual implementation would call API
        }
      }

      setChats(chatList);
      setFilteredChats(chatList);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getChatList, user]);

  // Search chats
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);

    if (!query || query.trim().length === 0) {
      setFilteredChats(chats);
      return;
    }

    try {
      const results = await searchChats(query);
      setFilteredChats(results);
    } catch (err) {
      console.error('Search error:', err);
    }
  }, [chats, searchChats]);

  // Refresh chats
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  }, [loadChats]);

  // Navigate to chat
  const handleChatPress = useCallback((chat) => {
    navigation.navigate('Chat', { chatId: chat.id });
  }, [navigation]);

  // Navigate to QR scanner (patient)
  const handleScanQR = useCallback(() => {
    navigation.navigate('PatientSetup');
  }, [navigation]);

  // Navigate to settings
  const handleSettingsPress = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  // Initialize
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Filter chats when search query changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, handleSearch]);

  // Render chat item
  const renderChatItem = useCallback(({ item }) => {
    const isPatient = user?.role === 'patient';
    const { doctorId, patientLogin } = parsePatientIdentifier(item.id);

    // Determine chat title based on user role
    let title = formatChatTitle(item);
    let subtitle = '';

    if (isPatient) {
      // For patient, show doctor info
      title = item.doctorName || item.clinicName || 'Врач';
      subtitle = item.specialtyName ? `${item.specialtyName}, ${item.clinicName}` : item.clinicName || '';
    } else {
      // For doctor, show patient login
      title = patientLogin || item.patientLogin || 'Пациент';
      subtitle = item.clinicName || '';
    }

    // Get last message preview
    let lastMessage = '';
    if (item.lastMessage) {
      lastMessage = truncateText(item.lastMessage.content, 50);
      if (item.lastMessage.encrypted) {
        lastMessage = '[Зашифровано]';
      }
    }

    // Get unread count
    const unreadCount = item.unreadCount || 0;

    return (
      <TouchableOpacity
        style={[
          chatStyles.chatListItem,
          unreadCount > 0 && chatStyles.chatListItemActive,
        ]}
        onPress={() => handleChatPress(item)}
      >
        <View style={chatStyles.chatListItemAvatar}>
          <MaterialIcons
            name={isPatient ? 'local-hospital' : 'person'}
            size={24}
            color={colors.primary[600]}
          />
        </View>

        <View style={chatStyles.chatListItemInfo}>
          <View style={styles.chatHeader}>
            <Text style={chatStyles.chatListItemTitle}>{title}</Text>
            <Text style={chatStyles.chatListItemTime}>
              {item.updatedAt ? formatDateTime(item.updatedAt) : ''}
            </Text>
          </View>

          {lastMessage ? (
            <Text style={chatStyles.chatListItemSubtitle} numberOfLines={1}>
              {lastMessage}
            </Text>
          ) : (
            <Text style={[chatStyles.chatListItemSubtitle, styles.noMessages]}>
              Нет сообщений
            </Text>
          )}

          {subtitle ? (
            <Text style={[chatStyles.chatListItemSubtitle, styles.subtitle]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {unreadCount > 0 && (
          <View style={chatStyles.chatListItemUnread}>
            <Text style={chatStyles.chatListItemUnreadText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [user, handleChatPress]);

  // Render empty state
  const renderEmptyState = useCallback(() => {
    if (isLoading) return null;

    return (
      <View style={chatStyles.emptyState}>
        <MaterialIcons name="chat" size={48} color={colors.text.tertiary} />
        <Text style={[textStyles.h4, chatStyles.emptyStateTitle]}>
          Нет чатов
        </Text>
        <Text style={[textStyles.bodySmall, chatStyles.emptyStateSubtitle]}>
          {user?.role === 'patient'
            ? 'Отсканируйте QR-код врача или перейдите по ссылке'
            : 'Дождитесь, пока пациенты начнут чат с вами'}
        </Text>

        {user?.role === 'patient' && (
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.emptyButton]}
            onPress={handleScanQR}
          >
            <MaterialIcons name="qr-code-scanner" size={20} color={colors.text.primaryInverse} />
            <Text style={[buttonStyles.buttonPrimaryText, styles.emptyButtonText]}>
              Отсканировать QR-код
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isLoading, user, handleScanQR]);

  // Render header
  const renderHeader = useCallback(() => {
    return (
      <View style={styles.header}>
        <Text style={[textStyles.h2, styles.headerTitle]}>
          {user?.role === 'doctor' ? 'Мои чаты' : 'Чаты'}
        </Text>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleScanQR} style={styles.headerAction}>
            <MaterialIcons name="qr-code-scanner" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSettingsPress} style={styles.headerAction}>
            <MaterialIcons name="settings" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [user, handleScanQR, handleSettingsPress]);

  // Render search bar
  const renderSearchBar = useCallback(() => {
    return (
      <View style={chatStyles.searchContainer}>
        <View style={chatStyles.searchInput}>
          <MaterialIcons
            name="search"
            size={20}
            color={colors.text.tertiary}
            style={chatStyles.searchInputIcon}
          />
          <TextInput
            style={[chatStyles.searchInputText, textStyles.inputText]}
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
    );
  }, [searchQuery]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={chatStyles.errorContainer}>
          <MaterialIcons name="error" size={48} color={colors.error[500]} />
          <Text style={[textStyles.h4, chatStyles.errorText]}>
            Ошибка загрузки чатов
          </Text>
          <Text style={[textStyles.bodySmall, styles.errorSubtitle]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.retryButton]}
            onPress={loadChats}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderSearchBar()}

      {isLoading ? (
        <View style={chatStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState}
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    paddingTop: spacing[6],
    paddingBottom: spacing[2],
  },
  
  headerTitle: {
    color: colors.text.primary,
  },
  
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  
  headerAction: {
    padding: spacing[1],
  },
  
  listContent: {
    paddingBottom: spacing[4],
  },
  
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  
  noMessages: {
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  
  subtitle: {
    marginTop: spacing[0.5],
  },
  
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
    gap: spacing[1],
  },
  
  emptyButtonText: {
    marginLeft: spacing[1],
  },
  
  errorSubtitle: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.secondary,
  },
  
  retryButton: {
    marginTop: spacing[4],
  },
});

// Add RefreshControl for iOS
const RefreshControl = Platform.OS === 'ios' 
  ? require('react-native').RefreshControl 
  : ({ refreshing, onRefresh, children }) => children;

export default ChatListScreen;
