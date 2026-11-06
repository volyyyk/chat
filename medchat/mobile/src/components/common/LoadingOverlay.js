/**
 * Loading Overlay Component
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../utils/ThemeContext';
import config from '../../config';

const LoadingOverlay = ({ visible = false, text = 'Loading...' }) => {
  const { theme } = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <ActivityIndicator 
          size="large" 
          color={theme.colors.primary}
        />
        {text && (
          <Text style={[styles.text, { color: theme.colors.text }]}>
            {text}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.9
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    minWidth: 150
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500'
  }
});

export default LoadingOverlay;
