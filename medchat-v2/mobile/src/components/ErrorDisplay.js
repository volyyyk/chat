/**
 * MedChat Mobile App - Error Display Component
 * Reusable error display component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';

const ErrorDisplay = ({
  error,
  icon = 'error',
  title = 'Ошибка',
  showRetry = false,
  onRetry,
  retryText = 'Повторить',
  style,
}) => {
  if (!error) return null;

  return (
    <View style={[styles.container, style]}>
      <MaterialIcons name={icon} size={48} color={colors.error[500]} />
      <Text style={[textStyles.h4, styles.title]}>{title}</Text>
      <Text style={[textStyles.bodySmall, styles.message]}>
        {typeof error === 'string' ? error : error.message}
      </Text>
      {showRetry && onRetry && (
        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.retryButton]}
          onPress={onRetry}
        >
          <Text style={buttonStyles.buttonPrimaryText}>{retryText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  
  title: {
    marginTop: spacing[3],
    color: colors.error[500],
  },
  
  message: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.secondary,
  },
  
  retryButton: {
    marginTop: spacing[4],
  },
});

export default ErrorDisplay;
