/**
 * Connection Error Screen
 * 
 * Displays when there's no internet connection
 */

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import NetInfo from '@react-native-community/netinfo';

const ConnectionErrorScreen = ({ onRetry = () => {} }) => {
  const { theme } = useTheme();
  const [isChecking, setIsChecking] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Check connection status
  useEffect(() => {
    const checkConnection = async () => {
      const state = await NetInfo.fetch();
      setIsConnected(state.isConnected);
      setIsChecking(false);
    };

    checkConnection();

    // Listen for connection changes
    const unsubscribe = NetInfo.addListener(state => {
      setIsConnected(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Auto-retry when connection is restored
  useEffect(() => {
    if (isConnected && !isChecking) {
      onRetry();
    }
  }, [isConnected, isChecking, onRetry]);

  // Manual retry
  const handleRetry = () => {
    setIsChecking(true);
    onRetry();
  };

  if (isChecking) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.text }]}>
            Checking connection...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🌐</Text>
        </View>
        
        <Text style={[styles.title, { color: theme.colors.text }]}>
          No Internet Connection
        </Text>
        
        <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
          It looks like you're not connected to the internet. Please check your connection and try again.
        </Text>
        
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.colors.primary }]}
          onPress={handleRetry}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  icon: {
    fontSize: 40
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center'
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32
  },
  retryButton: {
    padding: 16,
    borderRadius: 8,
    minWidth: 120
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  }
});

export default ConnectionErrorScreen;
