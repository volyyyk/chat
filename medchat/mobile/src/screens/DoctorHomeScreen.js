/**
 * Doctor Home Screen
 * 
 * Main screen for doctors to manage patients and view conversations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  FlatList,
  RefreshControl,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import { useWebSocket } from '../services/WebSocketService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const DoctorHomeScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    doctorProfile,
    patients,
    conversations,
    isLoading: isDoctorLoading,
    error: doctorError,
    loadPatients,
    loadConversations,
    getUnreadCount
  } = useDoctor();
  
  const { isConnected, connectionState } = useWebSocket();
  
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Refresh data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setRefreshing(true);
      
      await Promise.all([
        loadPatients(),
        loadConversations()
      ]);
      
      setIsLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to load data' 
      });
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [loadPatients, loadConversations]);

  // Navigate to QR code screen
  const navigateToQRCode = () => {
    navigation.navigate('QRCode');
  };

  // Navigate to patient list
  const navigateToPatientList = () => {
    navigation.navigate('PatientList');
  };

  // Navigate to settings
  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  // Navigate to chat
  const navigateToChat = (conversation) => {
    navigation.navigate('Chat', { conversation });
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Render conversation item
  const renderConversationItem = ({ item }) => {
    const patient = patients.find(p => p.id === item.patientId);
    const unreadCount = item.unreadCount || 0;
    
    return (
      <TouchableOpacity
        style={[styles.conversationItem, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}
        onPress={() => navigateToChat(item)}
      >
        <View style={styles.conversationHeader}>
          <View style={[styles.conversationAvatar, { 
            backgroundColor: theme.colors.doctor + '20'
          }]}>
            <Text style={[styles.conversationAvatarText, { color: theme.colors.doctor }]}>
              {patient?.name ? patient.name.charAt(0).toUpperCase() : 'P'}
            </Text>
          </View>
          <View style={styles.conversationInfo}>
            <Text style={[styles.conversationName, { color: theme.colors.text }]}>
              {patient?.name || `Patient ${item.patientId.substring(0, 8)}`}
            </Text>
            <Text style={[styles.conversationPreview, { color: theme.colors.textSecondary }]}>
              {item.lastMessage ? (
                item.lastMessage.length > 40 
                  ? `${item.lastMessage.substring(0, 40)}...` 
                  : item.lastMessage
              ) : 'No messages yet'}
            </Text>
          </View>
          <View style={styles.conversationMeta}>
            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
            {item.lastMessageTime && (
              <Text style={[styles.conversationTime, { color: theme.colors.textSecondary }]}>
                {formatTime(item.lastMessageTime)}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (now - date < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (now - date < 604800000) { // Less than 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Format date for header
  const formatDateHeader = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (now - date < 86400000) { // Today
      return 'Today';
    } else if (now - date < 172800000) { // Yesterday
      return 'Yesterday';
    } else if (now - date < 604800000) { // This week
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  // Group conversations by date
  const groupConversationsByDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    const grouped = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };
    
    conversations.forEach(conv => {
      const date = new Date(conv.lastMessageTime || conv.createdAt);
      date.setHours(0, 0, 0, 0);
      
      if (date >= today) {
        grouped.today.push(conv);
      } else if (date >= yesterday) {
        grouped.yesterday.push(conv);
      } else if (date >= thisWeek) {
        grouped.thisWeek.push(conv);
      } else {
        grouped.older.push(conv);
      }
    });
    
    return grouped;
  };

  const groupedConversations = groupConversationsByDate();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {doctorProfile?.name || 'Doctor'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
            {doctorProfile?.specialty || 'Medical Professional'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: theme.colors.surface }]}
            onPress={navigateToSettings}
          >
            <Text style={[styles.headerButtonText, { color: theme.colors.text }]}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadData}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickAction, { 
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary
            }]}
            onPress={navigateToQRCode}
          >
            <Text style={styles.quickActionIcon}>📷</Text>
            <Text style={styles.quickActionText}>Generate QR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}
            onPress={navigateToPatientList}
          >
            <Text style={[styles.quickActionIcon, { color: theme.colors.text }]}>👥</Text>
            <Text style={[styles.quickActionText, { color: theme.colors.text }]}>Patients</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        <View style={[styles.connectionStatus, { 
          backgroundColor: isConnected() ? theme.colors.success + '20' : theme.colors.error + '20'
        }]}>
          <Text style={[styles.connectionStatusText, { 
            color: isConnected() ? theme.colors.success : theme.colors.error 
          }]}>
            {isConnected() ? '✓ Online' : '✗ Offline'}
          </Text>
        </View>

        {/* Statistics */}
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {conversations.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Conversations
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {patients.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Patients
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {getUnreadCount()}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Unread
            </Text>
          </View>
        </View>

        {/* Conversations */}
        <View style={styles.conversations}>
          <Text style={[styles.conversationsTitle, { color: theme.colors.text }]}>
            Recent Conversations
          </Text>
          
          {conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
                No conversations yet
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
                Generate a QR code to allow patients to connect with you
              </Text>
            </View>
          ) : (
            <View style={styles.conversationGroups}>
              {groupedConversations.today.length > 0 && (
                <View style={styles.conversationGroup}>
                  <Text style={[styles.conversationGroupTitle, { color: theme.colors.textSecondary }]}>
                    Today
                  </Text>
                  {groupedConversations.today.map(conv => (
                    <View key={conv.id} style={styles.conversationItemContainer}>
                      {renderConversationItem({ item: conv })}
                    </View>
                  ))}
                </View>
              )}
              
              {groupedConversations.yesterday.length > 0 && (
                <View style={styles.conversationGroup}>
                  <Text style={[styles.conversationGroupTitle, { color: theme.colors.textSecondary }]}>
                    Yesterday
                  </Text>
                  {groupedConversations.yesterday.map(conv => (
                    <View key={conv.id} style={styles.conversationItemContainer}>
                      {renderConversationItem({ item: conv })}
                    </View>
                  ))}
                </View>
              )}
              
              {groupedConversations.thisWeek.length > 0 && (
                <View style={styles.conversationGroup}>
                  <Text style={[styles.conversationGroupTitle, { color: theme.colors.textSecondary }]}>
                    This Week
                  </Text>
                  {groupedConversations.thisWeek.map(conv => (
                    <View key={conv.id} style={styles.conversationItemContainer}>
                      {renderConversationItem({ item: conv })}
                    </View>
                  ))}
                </View>
              )}
              
              {groupedConversations.older.length > 0 && (
                <View style={styles.conversationGroup}>
                  <Text style={[styles.conversationGroupTitle, { color: theme.colors.textSecondary }]}>
                    Older
                  </Text>
                  {groupedConversations.older.map(conv => (
                    <View key={conv.id} style={styles.conversationItemContainer}>
                      {renderConversationItem({ item: conv })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <LoadingOverlay visible={isLoading || isDoctorLoading} />
      
      <ErrorModal
        visible={!!error}
        title={error?.title || 'Error'}
        message={error?.message || 'An error occurred'}
        onDismiss={handleErrorDismiss}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8
  },
  headerContent: {
    flex: 1
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  headerSubtitle: {
    fontSize: 14
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerButtonText: {
    fontSize: 16
  },
  scrollContainer: {
    padding: 16
  },
  quickActions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24
  },
  quickAction: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  connectionStatus: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24
  },
  connectionStatusText: {
    fontSize: 14,
    fontWeight: '600'
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24
  },
  statItem: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    alignItems: 'center'
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4
  },
  conversations: {
    marginBottom: 24
  },
  conversationsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateText: {
    fontSize: 16,
    marginBottom: 8
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center'
  },
  conversationGroups: {
    gap: 24
  },
  conversationGroup: {
    marginBottom: 16
  },
  conversationGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  conversationItemContainer: {
    marginBottom: 8
  },
  conversationItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row'
  },
  conversationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  conversationAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  conversationAvatarText: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  conversationInfo: {
    flex: 1
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4
  },
  conversationPreview: {
    fontSize: 14
  },
  conversationMeta: {
    alignItems: 'flex-end',
    gap: 8
  },
  unreadBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  conversationTime: {
    fontSize: 12
  }
});

export default DoctorHomeScreen;
