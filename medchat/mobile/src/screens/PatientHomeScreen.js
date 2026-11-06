/**
 * Patient Home Screen
 * 
 * Main screen for patients to communicate with their doctor
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
import { usePatient } from '../services/PatientService';
import { useWebSocket } from '../services/WebSocketService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const PatientHomeScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    patientProfile,
    conversation,
    messages,
    doctorInfo,
    isLoading: isPatientLoading,
    error: patientError,
    loadMessages,
    connectToDoctor,
    disconnectFromDoctor
  } = usePatient();
  
  const { isConnected, connectionState } = useWebSocket();
  
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Check if connected to doctor
  useEffect(() => {
    if (!conversation && !isLoading) {
      // Not connected to doctor yet
      navigation.navigate('PatientSetup');
    }
  }, [conversation, isLoading, navigation]);

  // Refresh data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setRefreshing(true);
      
      if (conversation) {
        await loadMessages();
      }
      
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
  }, [conversation, loadMessages]);

  // Navigate to chat
  const navigateToChat = () => {
    if (conversation) {
      navigation.navigate('Chat', { conversation });
    }
  };

  // Navigate to settings
  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  // Reconnect to doctor
  const handleReconnect = async () => {
    try {
      if (!doctorInfo?.doctorId || !patientProfile?.uniqueId) {
        navigation.navigate('PatientSetup');
        return;
      }
      
      setIsLoading(true);
      await connectToDoctor(doctorInfo.doctorId, patientProfile.uniqueId);
      await loadData();
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to reconnect:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to reconnect to doctor' 
      });
      setIsLoading(false);
    }
  };

  // Disconnect from doctor
  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from your doctor? You will need to reconnect to continue communication.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Disconnect', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await disconnectFromDoctor();
              navigation.navigate('PatientSetup');
              setIsLoading(false);
            } catch (err) {
              console.error('Failed to disconnect:', err);
              setError({ 
                title: 'Error', 
                message: err.message || 'Failed to disconnect' 
              });
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Render message item
  const renderMessageItem = ({ item }) => {
    const isFromMe = item.senderId === patientProfile?.uniqueId;
    
    return (
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
          <Text style={[styles.messageTime, {
            color: isFromMe ? 'rgba(255, 255, 255, 0.7)' : theme.colors.textSecondary
          }]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {patientProfile?.name || 'Patient'}
          </Text>
          {conversation && (
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
              Connected to Doctor
            </Text>
          )}
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
        {/* Connection Status */}
        <View style={[styles.connectionStatus, { 
          backgroundColor: isConnected() ? theme.colors.success + '20' : theme.colors.error + '20'
        }]}>
          {isConnected() ? (
            <Text style={[styles.connectionStatusText, { 
              color: isConnected() ? theme.colors.success : theme.colors.error 
            }]}>
              ✓ Connected to Doctor
            </Text>
          ) : (
            <View style={styles.connectionStatusRow}>
              <Text style={[styles.connectionStatusText, { 
                color: isConnected() ? theme.colors.success : theme.colors.error 
              }]}>
                ✗ Disconnected
              </Text>
              <TouchableOpacity
                style={[styles.reconnectButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleReconnect}
              >
                <Text style={styles.reconnectButtonText}>Reconnect</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Doctor Info */}
        {doctorInfo && (
          <View style={[styles.doctorInfo, { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border
          }]}>
            <View style={styles.doctorAvatar}>
              <Text style={[styles.doctorAvatarText, { color: theme.colors.doctor }]}>
                👨⚕️
              </Text>
            </View>
            <View style={styles.doctorDetails}>
              <Text style={[styles.doctorName, { color: theme.colors.text }]}>
                Your Doctor
              </Text>
              <Text style={[styles.doctorId, { color: theme.colors.textSecondary }]}>
                ID: {doctorInfo.doctorId}
              </Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickAction, { 
              backgroundColor: theme.colors.primary
            }]}
            onPress={navigateToChat}
          >
            <Text style={styles.quickActionIcon}>💬</Text>
            <Text style={styles.quickActionText}>New Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}
            onPress={handleDisconnect}
          >
            <Text style={[styles.quickActionIcon, { color: theme.colors.error }]}>🔌</Text>
            <Text style={[styles.quickActionText, { color: theme.colors.error }]}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <View style={styles.messages}>
          <Text style={[styles.messagesTitle, { color: theme.colors.text }]}>
            Recent Messages
          </Text>
          
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
                No messages yet
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
                Start a conversation with your doctor
              </Text>
            </View>
          ) : (
            <View style={styles.messagesList}>
              {messages.slice(0, 5).map(message => (
                <View key={message.id} style={styles.messageItemContainer}>
                  {renderMessageItem({ item: message })}
                </View>
              ))}
              
              {messages.length > 5 && (
                <TouchableOpacity
                  style={[styles.viewAllButton, { 
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border
                  }]}
                  onPress={navigateToChat}
                >
                  <Text style={[styles.viewAllButtonText, { color: theme.colors.text }]}>
                    View All Messages
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {messages.length}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Messages
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {conversation?.unreadCount || 0}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Unread
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.text }]}>
              {conversation ? '1' : '0'}
            </Text>
            <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>
              Doctors
            </Text>
          </View>
        </View>

        {/* Privacy Notice */}
        <View style={[styles.privacy, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.privacyText, { color: theme.colors.textSecondary }]}>
            🔒 All messages are end-to-end encrypted and stored only on your device.
          </Text>
        </View>
      </ScrollView>

      <LoadingOverlay visible={isLoading || isPatientLoading} />
      
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
  connectionStatus: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  connectionStatusText: {
    fontSize: 14,
    fontWeight: '600'
  },
  reconnectButton: {
    padding: 8,
    borderRadius: 4,
    minWidth: 100
  },
  reconnectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24
  },
  doctorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.2)'
  },
  doctorAvatarText: {
    fontSize: 24
  },
  doctorDetails: {
    flex: 1
  },
  doctorName: {
    fontSize: 18,
    fontWeight: '600'
  },
  doctorId: {
    fontSize: 14
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
  messages: {
    marginBottom: 24
  },
  messagesTitle: {
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
  messagesList: {
    gap: 12
  },
  messageItemContainer: {
    paddingHorizontal: 8
  },
  messageItem: {
    flex: 1,
    marginBottom: 8
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
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right'
  },
  viewAllButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 16
  },
  viewAllButtonText: {
    fontSize: 16,
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
  privacy: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  privacyText: {
    fontSize: 12,
    textAlign: 'center'
  }
});

export default PatientHomeScreen;
