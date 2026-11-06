/**
 * MedChat Mobile App
 * 
 * Main application component
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar, StyleSheet, View, Text, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { WebSocketProvider } from './services/WebSocketService';
import { CryptoProvider } from './services/CryptoService';
import { StorageProvider } from './services/StorageService';
import { DoctorProvider } from './services/DoctorService';
import { PatientProvider } from './services/PatientService';
import { NotificationProvider } from './services/NotificationService';
import { ThemeProvider } from './utils/ThemeContext';

// Screens
import SplashScreen from './screens/SplashScreen';
import ModeSelectionScreen from './screens/ModeSelectionScreen';
import DoctorSetupScreen from './screens/DoctorSetupScreen';
import PatientSetupScreen from './screens/PatientSetupScreen';
import DoctorHomeScreen from './screens/DoctorHomeScreen';
import PatientHomeScreen from './screens/PatientHomeScreen';
import ChatScreen from './screens/ChatScreen';
import PatientListScreen from './screens/PatientListScreen';
import PatientFilesScreen from './screens/PatientFilesScreen';
import QRCodeScreen from './screens/QRCodeScreen';
import SettingsScreen from './screens/SettingsScreen';
import ConsentScreen from './screens/ConsentScreen';
import ConnectionErrorScreen from './screens/ConnectionErrorScreen';

// Components
import LoadingOverlay from './components/LoadingOverlay';
import ErrorModal from './components/ErrorModal';

// Services
import { initDatabase } from './services/StorageService';
import config from './config';

const Stack = createNativeStackNavigator();

const App = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isConsentGiven, setIsConsentGiven] = useState(false);
  const [mode, setMode] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [error, setError] = useState(null);
  const [isDbInitialized, setIsDbInitialized] = useState(false);

  // Initialize database
  useEffect(() => {
    const initializeDb = async () => {
      try {
        await initDatabase();
        setIsDbInitialized(true);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        setError({ title: 'Database Error', message: 'Failed to initialize local storage' });
      }
    };
    
    initializeDb();
  }, []);

  // Check consent
  useEffect(() => {
    if (!isDbInitialized) return;
    
    const checkConsent = async () => {
      try {
        const consent = await AsyncStorage.getItem('@medchat_consent_given');
        setIsConsentGiven(consent === 'true');
      } catch (err) {
        console.error('Failed to check consent:', err);
      }
    };
    
    checkConsent();
  }, [isDbInitialized]);

  // Check mode
  useEffect(() => {
    if (!isDbInitialized || !isConsentGiven) return;
    
    const checkMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem('@medchat_mode');
        if (savedMode) {
          setMode(savedMode);
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to check mode:', err);
        setIsLoading(false);
      }
    };
    
    checkMode();
  }, [isDbInitialized, isConsentGiven]);

  // Check network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addListener(state => {
      setIsConnected(state.isConnected);
      
      if (!state.isConnected) {
        setError({ 
          title: 'No Internet Connection', 
          message: 'Please check your internet connection and try again' 
        });
      }
    });

    // Initial check
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Handle consent
  const handleConsent = useCallback(async (agreed) => {
    if (agreed) {
      try {
        await AsyncStorage.setItem('@medchat_consent_given', 'true');
        setIsConsentGiven(true);
      } catch (err) {
        console.error('Failed to save consent:', err);
        setError({ title: 'Error', message: 'Failed to save consent' });
      }
    } else {
      // User declined consent, exit or show limited functionality
      setIsLoading(false);
    }
  }, []);

  // Handle mode selection
  const handleModeSelect = useCallback(async (selectedMode) => {
    try {
      await AsyncStorage.setItem('@medchat_mode', selectedMode);
      setMode(selectedMode);
    } catch (err) {
      console.error('Failed to save mode:', err);
      setError({ title: 'Error', message: 'Failed to save mode selection' });
    }
  }, []);

  // Handle error
  const handleErrorDismiss = useCallback(() => {
    setError(null);
  }, []);

  // Render loading state
  if (isLoading || !isDbInitialized) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>
          <SplashScreen />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  // Render consent screen if consent not given
  if (!isConsentGiven) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>
          <ConsentScreen onConsent={handleConsent} />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  // Render connection error screen if not connected
  if (!isConnected) {
    return (
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.container}>
          <ConnectionErrorScreen onRetry={() => setIsConnected(true)} />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  // Main app navigation
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <ThemeProvider>
          <WebSocketProvider config={config.server}>
            <CryptoProvider>
              <StorageProvider>
                <NotificationProvider>
                  <NavigationContainer>
                    <Stack.Navigator
                      initialRouteName={mode ? (mode === config.modes.DOCTOR ? 'DoctorHome' : 'PatientHome') : 'ModeSelection'}
                      screenOptions={{
                        headerShown: false,
                        animation: 'slide_from_right',
                        contentStyle: { backgroundColor: config.colors.background }
                      }}
                    >
                      {/* Common Screens */}
                      <Stack.Screen
                        name="ModeSelection"
                        component={ModeSelectionScreen}
                        options={{ title: 'Select Mode' }}
                      />
                      
                      {/* Doctor Screens */}
                      <Stack.Screen
                        name="DoctorSetup"
                        component={DoctorSetupScreen}
                        options={{ title: 'Doctor Setup' }}
                      />
                      <Stack.Screen
                        name="DoctorHome"
                        component={DoctorHomeScreen}
                        options={{ title: 'Doctor Home' }}
                      />
                      <Stack.Screen
                        name="PatientList"
                        component={PatientListScreen}
                        options={{ title: 'Patients' }}
                      />
                      <Stack.Screen
                        name="Chat"
                        component={ChatScreen}
                        options={{ title: 'Chat' }}
                      />
                      <Stack.Screen
                        name="PatientFiles"
                        component={PatientFilesScreen}
                        options={{ title: 'Patient Files' }}
                      />
                      <Stack.Screen
                        name="QRCode"
                        component={QRCodeScreen}
                        options={{ title: 'QR Code' }}
                      />
                      <Stack.Screen
                        name="Settings"
                        component={SettingsScreen}
                        options={{ title: 'Settings' }}
                      />
                      
                      {/* Patient Screens */}
                      <Stack.Screen
                        name="PatientSetup"
                        component={PatientSetupScreen}
                        options={{ title: 'Patient Setup' }}
                      />
                      <Stack.Screen
                        name="PatientHome"
                        component={PatientHomeScreen}
                        options={{ title: 'Patient Home' }}
                      />
                    </Stack.Navigator>
                  </NavigationContainer>
                </NotificationProvider>
              </StorageProvider>
            </CryptoProvider>
          </WebSocketProvider>
        </ThemeProvider>
        
        {/* Error Modal */}
        <ErrorModal
          visible={!!error}
          title={error?.title || 'Error'}
          message={error?.message || 'An error occurred'}
          onDismiss={handleErrorDismiss}
        />
        
        {/* Loading Overlay */}
        <LoadingOverlay visible={isLoading} />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: config.colors.background
  }
});

export default App;
