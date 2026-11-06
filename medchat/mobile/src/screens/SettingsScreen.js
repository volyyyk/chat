/**
 * Settings Screen
 * 
 * Application settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  Switch,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useWebSocket } from '../services/WebSocketService';
import { useStorage } from '../services/StorageService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { theme, toggleTheme, setThemeMode } = useTheme();
  const { disconnect } = useWebSocket();
  const { clearAllData } = useStorage();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(theme.mode === 'dark');

  // Update dark mode state
  useEffect(() => {
    setDarkMode(theme.mode === 'dark');
  }, [theme.mode]);

  // Toggle dark mode
  const handleToggleDarkMode = () => {
    const newMode = darkMode ? 'light' : 'dark';
    setThemeMode(newMode);
    setDarkMode(!darkMode);
  };

  // Toggle notifications
  const handleToggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
  };

  // Clear all data
  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to clear all data? This will delete all messages, files, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await clearAllData();
              await disconnect();
              setIsLoading(false);
              
              // Navigate back to mode selection
              navigation.reset({
                index: 0,
                routes: [{ name: 'ModeSelection' }]
              });
            } catch (err) {
              console.error('Failed to clear all data:', err);
              setError({ 
                title: 'Error', 
                message: err.message || 'Failed to clear all data' 
              });
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      await disconnect();
      setIsLoading(false);
      
      // Navigate back to mode selection
      navigation.reset({
        index: 0,
        routes: [{ name: 'ModeSelection' }]
      });
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to disconnect' 
      });
      setIsLoading(false);
    }
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Navigate back
  const navigateBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={[styles.backButtonText, { color: theme.colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Settings
          </Text>
          <View style={styles.headerSpace} />
        </View>

        {/* Appearance Section */}
        <View style={[styles.section, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Appearance
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Dark Mode
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Enable dark theme for better night viewing
              </Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={handleToggleDarkMode}
              trackColor={{ 
                false: theme.colors.border,
                true: theme.colors.primary
              }}
              thumbColor={darkMode ? '#FFFFFF' : theme.colors.text}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={[styles.section, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Notifications
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Enable Notifications
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Receive notifications for new messages
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ 
                false: theme.colors.border,
                true: theme.colors.primary
              }}
              thumbColor={notificationsEnabled ? '#FFFFFF' : theme.colors.text}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={[styles.section, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            About
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                App Name
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {config.name}
              </Text>
            </View>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Version
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {config.version}
              </Text>
            </View>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Description
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                {config.description}
              </Text>
            </View>
          </View>
        </View>

        {/* Legal Section */}
        <View style={[styles.section, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Legal
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Privacy Policy
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Complies with Russian 152-ФЗ
              </Text>
            </View>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Data Protection
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                End-to-end encryption, local storage only
              </Text>
            </View>
          </View>
        </View>

        {/* Danger Zone Section */}
        <View style={[styles.section, { 
          backgroundColor: theme.colors.error + '10',
          borderColor: theme.colors.error + '30'
        }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.error }]}>
            Danger Zone
          </Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Disconnect
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Disconnect from current session
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dangerButton, { backgroundColor: theme.colors.error }]}
              onPress={handleDisconnect}
            >
              <Text style={styles.dangerButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                Clear All Data
              </Text>
              <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Permanently delete all local data
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dangerButton, { backgroundColor: theme.colors.error }]}
              onPress={handleClearAllData}
            >
              <Text style={styles.dangerButtonText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <LoadingOverlay visible={isLoading} />
      
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
  scrollContainer: {
    padding: 16
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
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
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  settingInfo: {
    flex: 1
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600'
  },
  settingDescription: {
    fontSize: 14,
    marginTop: 4
  },
  dangerButton: {
    padding: 12,
    borderRadius: 8,
    minWidth: 100
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  }
});

export default SettingsScreen;
