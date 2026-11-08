/**
 * MedChat Mobile App
 * Main application entry point
 */

import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme as DefaultTheme } from 'react-native-paper';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/services/database';
import { loadFonts } from './src/utils/fonts';

// Custom theme
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2563eb',
    secondary: '#1e40af',
    tertiary: '#3b82f6',
    background: '#f8fafc',
    surface: '#ffffff',
    error: '#ef4444',
    success: '#22c55e',
    warning: '#f59e0b',
    info: '#3b82f6',
  },
};

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize database
        await initDatabase();

        // Load fonts
        await loadFonts();

        // Keep splash screen visible while we load resources
        await SplashScreen.preventAutoHideAsync();

        // NOTE: the previous artificial 2-second delay ("to simulate
        // loading") was removed — startup now takes only as long as the
        // real work (DB + fonts) requires.
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <NotificationProvider>
              <NavigationContainer>
                <StatusBar
                  style="dark"
                  backgroundColor={theme.colors.background}
                />
                <AppNavigator />
              </NavigationContainer>
            </NotificationProvider>
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
