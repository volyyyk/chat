/**
 * Patient List Screen
 * 
 * Displays list of patients for doctor
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
  Alert,
  TextInput
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const PatientListScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    patients,
    conversations,
    isLoading: isDoctorLoading,
    error: doctorError,
    loadPatients,
    deletePatient
  } = useDoctor();
  
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load patients
  useEffect(() => {
    loadData();
  }, []);

  // Refresh data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setRefreshing(true);
      
      await loadPatients();
      
      setIsLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('Failed to load patients:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to load patients' 
      });
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [loadPatients]);

  // Filter patients
  const filteredPatients = patients.filter(patient => {
    const name = patient.name || `Patient ${patient.uniqueId?.substring(0, 8)}`;
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Navigate to chat
  const navigateToChat = (patient) => {
    const conversation = conversations.find(c => c.patientId === patient.id);
    if (conversation) {
      navigation.navigate('Chat', { conversation });
    }
  };

  // Navigate to patient files
  const navigateToPatientFiles = (patient) => {
    navigation.navigate('PatientFiles', { patient });
  };

  // Delete patient
  const handleDeletePatient = (patient) => {
    Alert.alert(
      'Delete Patient',
      `Are you sure you want to delete ${patient.name || `Patient ${patient.uniqueId?.substring(0, 8)}`}? This will also delete all messages and files associated with this patient.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await deletePatient(patient.id);
              setIsLoading(false);
            } catch (err) {
              console.error('Failed to delete patient:', err);
              setError({ 
                title: 'Error', 
                message: err.message || 'Failed to delete patient' 
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

  // Navigate back
  const navigateBack = () => {
    navigation.goBack();
  };

  // Render patient item
  const renderPatientItem = ({ item }) => {
    const conversation = conversations.find(c => c.patientId === item.id);
    const unreadCount = conversation?.unreadCount || 0;
    const lastMessage = conversation?.lastMessage || 'No messages yet';
    const lastMessageTime = conversation?.lastMessageTime;

    return (
      <TouchableOpacity
        style={[styles.patientItem, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}
        onPress={() => navigateToChat(item)}
      >
        <View style={styles.patientHeader}>
          <View style={[styles.patientAvatar, { 
            backgroundColor: theme.colors.doctor + '20'
          }]}>
            <Text style={[styles.patientAvatarText, { color: theme.colors.doctor }]}>
              {item.name ? item.name.charAt(0).toUpperCase() : 'P'}
            </Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={[styles.patientName, { color: theme.colors.text }]}>
              {item.name || `Patient ${item.uniqueId?.substring(0, 8)}`}
            </Text>
            <Text style={[styles.patientId, { color: theme.colors.textSecondary }]}>
              ID: {item.uniqueId}
            </Text>
          </View>
          <View style={styles.patientMeta}>
            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.patientFooter}>
          <Text 
            style={[styles.patientPreview, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {lastMessage.length > 40 ? `${lastMessage.substring(0, 40)}...` : lastMessage}
          </Text>
          <Text style={[styles.patientTime, { color: theme.colors.textSecondary }]}>
            {lastMessageTime ? formatTime(lastMessageTime) : 'No messages'}
          </Text>
        </View>
        
        <View style={styles.patientActions}>
          <TouchableOpacity
            style={[styles.actionButton, { 
              backgroundColor: theme.colors.primary + '20'
            }]}
            onPress={() => navigateToPatientFiles(item)}
          >
            <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>
              Files
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { 
              backgroundColor: theme.colors.error + '20'
            }]}
            onPress={() => handleDeletePatient(item)}
          >
            <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Format time
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (now - date < 86400000) { // Today
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (now - date < 172800000) { // Yesterday
      return 'Yesterday';
    } else if (now - date < 604800000) { // This week
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
          <Text style={[styles.backButtonText, { color: theme.colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          Patients
        </Text>
        <View style={styles.headerSpace} />
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
        {/* Search */}
        <View style={[styles.searchContainer, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <TextInput
            style={[styles.searchInput, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text
            }]}
            placeholder="Search patients..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Statistics */}
        <View style={styles.stats}>
          <Text style={[styles.statsText, { color: theme.colors.textSecondary }]}>
            {filteredPatients.length} patients found
          </Text>
        </View>

        {/* Patient List */}
        {filteredPatients.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
              No patients found
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
              Generate a QR code to allow patients to connect with you
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredPatients}
            renderItem={renderPatientItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.patientList}
            scrollEnabled={false}
          />
        )}
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
    borderBottomWidth: 1,
    borderBottomColor: '#00000020'
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  backButtonText: {
    fontSize: 20
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  headerSpace: {
    width: 40
  },
  scrollContainer: {
    padding: 16
  },
  searchContainer: {
    marginBottom: 16
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  stats: {
    marginBottom: 16
  },
  statsText: {
    fontSize: 14
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
  patientList: {
    gap: 12
  },
  patientItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  patientAvatarText: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  patientInfo: {
    flex: 1
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600'
  },
  patientId: {
    fontSize: 12
  },
  patientMeta: {
    alignItems: 'flex-end'
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
  patientFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  patientPreview: {
    fontSize: 14,
    flex: 1,
    marginRight: 8
  },
  patientTime: {
    fontSize: 12
  },
  patientActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end'
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    minWidth: 80
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600'
  }
});

export default PatientListScreen;
