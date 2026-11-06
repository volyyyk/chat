/**
 * MedChat Mobile App - Patient Home Screen
 * Main screen for patients
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, chatStyles, cardStyles } from '../styles/commonStyles';
import { formatDateTime, formatChatTitle, truncateText, formatFileRetentionWarning } from '../utils/formatters';

const PatientHomeScreen = ({ navigation }) => {
  const { user, isAuthenticated } = useAuth();
  const { getChatList, createChat, joinChatViaQR } = useChat();
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientInfo, setPatientInfo] = useState(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load patient info
      const info = await database.getPatientInfo();
      setPatientInfo(info);

      // Load chats
      const chatList = await getChatList();
      setChats(chatList);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getChatList]);

  // Initialize
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh data
  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

  // Navigate to chat
  const handleChatPress = useCallback((chat) => {
    navigation.navigate('Chat', { chatId: chat.id });
  }, [navigation]);

  // Navigate to QR scanner
  const handleScanQR = useCallback(() => {
    navigation.navigate('PatientSetup');
  }, [navigation]);

  // Navigate to settings
  const handleSettingsPress = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  // Navigate to all chats
  const handleAllChatsPress = useCallback(() => {
    navigation.navigate('Chats');
  }, [navigation]);

  // Render chat item
  const renderChatItem = useCallback(({ item }) => {
    const title = formatChatTitle(item);
    const lastMessage = item.lastMessage 
      ? truncateText(item.lastMessage.content, 40)
      : 'Нет сообщений';
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
          <MaterialIcons name="local-hospital" size={24} color={colors.primary[600]} />
        </View>

        <View style={chatStyles.chatListItemInfo}>
          <View style={styles.chatHeader}>
            <Text style={chatStyles.chatListItemTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={chatStyles.chatListItemTime}>
              {item.updatedAt ? formatDateTime(item.updatedAt) : ''}
            </Text>
          </View>

          <Text style={chatStyles.chatListItemSubtitle} numberOfLines={1}>
            {lastMessage}
          </Text>
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
  }, [handleChatPress]);

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
          Отсканируйте QR-код врача или перейдите по ссылке
        </Text>

        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.emptyButton]}
          onPress={handleScanQR}
        >
          <MaterialIcons name="qr-code-scanner" size={20} color={colors.text.primaryInverse} />
          <Text style={[buttonStyles.buttonPrimaryText, styles.emptyButtonText]}>
            Отсканировать QR-код
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [isLoading, handleScanQR]);

  // Render recent chats
  const renderRecentChats = useCallback(() => {
    if (chats.length === 0) return null;

    return (
      <View style={styles.recentChatsContainer}>
        <View style={styles.recentChatsHeader}>
          <Text style={[textStyles.h5, styles.recentChatsTitle]}>Недавние чаты</Text>
          {chats.length > 3 && (
            <TouchableOpacity onPress={handleAllChatsPress}>
              <Text style={[textStyles.link, styles.allChatsLink]}>Все чаты</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={chats.slice(0, 3)}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
      </View>
    );
  }, [chats, renderChatItem, handleAllChatsPress]);

  // Render info section
  const renderInfoSection = useCallback(() => {
    return (
      <View style={styles.infoContainer}>
        <MaterialIcons name="info" size={20} color={colors.text.tertiary} />
        <Text style={[textStyles.caption, styles.infoText]}>
          {formatFileRetentionWarning()}
        </Text>
      </View>
    );
  }, []);

  // Render quick actions
  const renderQuickActions = useCallback(() => {
    return (
      <View style={styles.quickActionsContainer}>
        <Text style={[textStyles.h5, styles.quickActionsTitle]}>Быстрые действия</Text>
        
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[cardStyles.cardBase, cardStyles.cardElevated, styles.quickAction]}
            onPress={handleScanQR}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="qr-code-scanner" size={24} color={colors.primary[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>QR-код</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cardStyles.cardBase, cardStyles.cardElevated, styles.quickAction]}
            onPress={() => navigation.navigate('Appointments')}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="event" size={24} color={colors.secondary[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>Записи</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cardStyles.cardBase, cardStyles.cardElevated, styles.quickAction]}
            onPress={() => navigation.navigate('EPrescriptions')}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="description" size={24} color={colors.success[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>Рецепты</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[cardStyles.cardBase, cardStyles.cardElevated, styles.quickAction]}
            onPress={handleSettingsPress}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="settings" size={24} color={colors.warning[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>Настройки</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [navigation, handleScanQR, handleSettingsPress]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={chatStyles.errorContainer}>
          <MaterialIcons name="error" size={48} color={colors.error[500]} />
          <Text style={[textStyles.h4, chatStyles.errorText]}>
            Ошибка загрузки данных
          </Text>
          <Text style={[textStyles.bodySmall, styles.errorSubtitle]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.retryButton]}
            onPress={loadData}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={(
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
        )}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[textStyles.h2, styles.headerTitle]}>Главная</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleSettingsPress} style={styles.headerAction}>
              <MaterialIcons name="settings" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Patient info */}
        {patientInfo && (
          <View style={styles.patientInfoContainer}>
            <View style={styles.patientInfo}>
              <View style={styles.patientInfoAvatar}>
                <MaterialIcons name="account-circle" size={48} color={colors.primary[600]} />
              </View>
              <View style={styles.patientInfoText}>
                <Text style={[textStyles.h4, styles.patientInfoName]}>
                  Пациент: {patientInfo.login}
                </Text>
                <Text style={[textStyles.bodySmall, styles.patientInfoDoctor]}>
                  Врач: {patientInfo.doctorName}
                </Text>
                <Text style={[textStyles.caption, styles.patientInfoClinic]}>
                  {patientInfo.clinicName}
                </Text>
              </View>
            </View>
          </View>
        )}

        {renderInfoSection()}
        {renderQuickActions()}
        {renderRecentChats()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  scrollContent: {
    padding: spacing[4],
    paddingTop: spacing[6],
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  headerTitle: {
    color: colors.text.primary,
  },
  
  headerActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  
  headerAction: {
    padding: spacing[1],
  },
  
  patientInfoContainer: {
    marginBottom: spacing[4],
  },
  
  patientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.surface.primary,
    borderRadius: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  patientInfoAvatar: {
    marginRight: spacing[3],
  },
  
  patientInfoText: {
    flex: 1,
  },
  
  patientInfoName: {
    color: colors.text.primary,
  },
  
  patientInfoDoctor: {
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  patientInfoClinic: {
    color: colors.text.tertiary,
    marginTop: spacing[0.5],
  },
  
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.warning[50],
    borderRadius: spacing[2],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  
  infoText: {
    marginLeft: spacing[2],
    color: colors.warning[800],
  },
  
  quickActionsContainer: {
    marginBottom: spacing[4],
  },
  
  quickActionsTitle: {
    marginBottom: spacing[2],
    color: colors.text.primary,
  },
  
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  
  quickAction: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '23%',
    minWidth: 80,
    height: 80,
  },
  
  quickActionIcon: {
    marginBottom: spacing[1],
  },
  
  quickActionText: {
    textAlign: 'center',
    color: colors.text.secondary,
  },
  
  recentChatsContainer: {
    marginBottom: spacing[4],
  },
  
  recentChatsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  
  recentChatsTitle: {
    color: colors.text.primary,
  },
  
  allChatsLink: {
    color: colors.primary[600],
  },
  
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

export default PatientHomeScreen;
