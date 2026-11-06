/**
 * Splash Screen
 * 
 * Displays while app is loading
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import config from '../config';

const SplashScreen = () => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Image
          source={require('../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {config.name}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Secure Doctor-Patient Communication
        </Text>
        <ActivityIndicator 
          size="large" 
          color={theme.colors.primary}
          style={styles.loader}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  content: {
    alignItems: 'center',
    padding: 24
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32
  },
  loader: {
    marginTop: 16
  }
});

export default SplashScreen;
