/**
 * MedChat Mobile App - Doctor Home Screen
 * Main screen for doctors
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useNotifications } from '../hooks/useNotifications';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, chatStyles, cardStyles } from '../styles/commonStyles';
import { formatDateTime, formatDoctorName, formatChatTitle, truncateText } from '../utils/formatters';

const DoctorHomeScreen = ({ navigation }) => {
  const { user, isAuthenticated, checkDoctorVerification, logout } = useAuth();
  const { getChatList } = useChat();
  const { getUnreadCount } = useNotifications();
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVerified, setIsVerified] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState({
    totalPatients: 0,
    newMessages: 0,
    appointments: 0,
  });

  // Check verification status
  useEffect(() => {
    const checkVerification = async () => {
      if (isAuthenticated && user) {
        const result = await checkDoctorVerification();
        setIsVerified(result.verified);
      }
    };

    checkVerification();
  }, [isAuthenticated, user, checkDoctorVerification]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load chats
      const chatList = await getChatList();
      setChats(chatList.slice(0, 5)); // Show first 5 chats

      // Load unread count
      const count = await getUnreadCount();
      setUnreadCount(count);

      // Load stats (mock data for now)
      setStats({
        totalPatients: chatList.length,
        newMessages: count,
        appointments: 3, // Mock
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getChatList, getUnreadCount]);

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

  // Navigate to QR code
  const handleQRCodePress = useCallback(() => {
    navigation.navigate('QRCode');
  }, [navigation]);

  // Navigate to all chats
  const handleAllChatsPress = useCallback(() => {
    navigation.navigate('Chats');
  }, [navigation]);

  // Navigate to settings
  const handleSettingsPress = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('ModeSelection');
          },
        },
      ]
    );
  }, [logout, navigation]);

  // Render verification message
  const renderVerificationMessage = useCallback(() => {
    if (isVerified === null) return null;

    if (!isVerified) {
      return (
        <View style={styles.verificationContainer}>
          <MaterialIcons name="warning" size={24} color={colors.warning[600]} />
          <Text style={[textStyles.bodySmall, styles.verificationText]}>
            Ожидается подтверждение от клиники. Обратитесь к руководству.
          </Text>
        </View>
      );
    }

    return null;
  }, [isVerified]);

  // Render stats
  const renderStats = useCallback(() => {
    return (
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <MaterialIcons name="group" size={24} color={colors.primary[600]} />
          <View style={styles.statInfo}>
            <Text style={[textStyles.h5, styles.statValue]}>{stats.totalPatients}</Text>
            <Text style={[textStyles.caption, styles.statLabel]}>Пациентов</Text>
          </View>
        </View>

        <View style={styles.statItem}>
          <MaterialIcons name="message" size={24} color={colors.secondary[600]} />
          <View style={styles.statInfo}>
            <Text style={[textStyles.h5, styles.statValue]}>{stats.newMessages}</Text>
            <Text style={[textStyles.caption, styles.statLabel]}>Новых сообщений</Text>
          </View>
        </View>

        <View style={styles.statItem}>
          <MaterialIcons name="event" size={24} color={colors.success[600]} />
          <View style={styles.statInfo}>
            <Text style={[textStyles.h5, styles.statValue]}>{stats.appointments}</Text>
            <Text style={[textStyles.caption, styles.statLabel]}>Записей</Text>
          </View>
        </View>
      </View>
    );
  }, [stats]);

  // Render quick actions
  const renderQuickActions = useCallback(() => {
    return (
      <View style={styles.quickActionsContainer}>
        <Text style={[textStyles.h5, styles.quickActionsTitle]}>Быстрые действия</Text>
        
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[cardStyles.cardBase, cardStyles.cardElevated, styles.quickAction]}
            onPress={handleQRCodePress}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="qr-code" size={24} color={colors.primary[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>Мой QR-код</Text>
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
            onPress={() => navigation.navigate('Backup')}
          >
            <View style={styles.quickActionIcon}>
              <MaterialIcons name="backup" size={24} color={colors.warning[600]} />
            </View>
            <Text style={[textStyles.bodySmall, styles.quickActionText]}>Бэкап</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [navigation, handleQRCodePress]);

  // Render recent chats
  const renderRecentChats = useCallback(() => {
    if (chats.length === 0) return null;

    return (
      <View style={styles.recentChatsContainer}>
        <View style={styles.recentChatsHeader}>
          <Text style={[textStyles.h5, styles.recentChatsTitle]}>Недавние чаты</Text>
          <TouchableOpacity onPress={handleAllChatsPress}>
            <Text style={[textStyles.link, styles.allChatsLink]}>Все чаты</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recentChats}>
          {chats.map((chat) => {
            const title = formatChatTitle(chat);
            const lastMessage = chat.lastMessage 
              ? truncateText(chat.lastMessage.content, 40)
              : 'Нет сообщений';

            return (
              <TouchableOpacity
                key={chat.id}
                style={chatStyles.chatListItem}
                onPress={() => handleChatPress(chat)}
              >
                <View style={chatStyles.chatListItemAvatar}>
                  <MaterialIcons name="person" size={24} color={colors.primary[600]} />
                </View>

                <View style={chatStyles.chatListItemInfo}>
                  <Text style={chatStyles.chatListItemTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={chatStyles.chatListItemSubtitle} numberOfLines={1}>
                    {lastMessage}
                  </Text>
                </View>

                {chat.unreadCount > 0 && (
                  <View style={chatStyles.chatListItemUnread}>
                    <Text style={chatStyles.chatListItemUnreadText}>
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }, [chats, handleChatPress, handleAllChatsPress]);

  // Render doctor info
  const renderDoctorInfo = useCallback(() => {
    if (!user) return null;

    return (
      <View style={styles.doctorInfoContainer}>
        <View style={styles.doctorInfo}>
          <View style={styles.doctorInfoAvatar}>
            <MaterialIcons name="account-circle" size={48} color={colors.primary[600]} />
          </View>
          <View style={styles.doctorInfoText}>
            <Text style={[textStyles.h4, styles.doctorInfoName]}>
              {formatDoctorName(user)}
            </Text>
            <Text style={[textStyles.bodySmall, styles.doctorInfoSpecialty]}>
              {user.specialty?.name || 'Специальность не указана'}
            </Text>
            <Text style={[textStyles.caption, styles.doctorInfoClinic]}>
              {user.clinic?.name || 'Клиника не указана'}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [user]);

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
            <TouchableOpacity onPress={handleLogout} style={styles.headerAction}>
              <MaterialIcons name="logout" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {renderVerificationMessage()}
        {renderDoctorInfo()}
        {renderStats()}
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
  
  verificationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.warning[50],
    borderRadius: spacing[2],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  
  verificationText: {
    marginLeft: spacing[2],
    color: colors.warning[800],
  },
  
  doctorInfoContainer: {
    marginBottom: spacing[4],
  },
  
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.surface.primary,
    borderRadius: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  doctorInfoAvatar: {
    marginRight: spacing[3],
  },
  
  doctorInfoText: {
    flex: 1,
  },
  
  doctorInfoName: {
    color: colors.text.primary,
  },
  
  doctorInfoSpecialty: {
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  doctorInfoClinic: {
    color: colors.text.tertiary,
    marginTop: spacing[0.5],
  },
  
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.primary,
    padding: spacing[3],
    borderRadius: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.primary,
    flex: 1,
    marginHorizontal: spacing[1],
  },
  
  statInfo: {
    marginLeft: spacing[2],
  },
  
  statValue: {
    color: colors.text.primary,
  },
  
  statLabel: {
    color: colors.text.tertiary,
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
  
  recentChats: {
    gap: spacing[1],
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

export default DoctorHomeScreen;
