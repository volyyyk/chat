/**
 * MedChat Mobile App - Empty State Component
 * Reusable empty state component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';

const EmptyState = ({
  icon = 'inbox',
  title = 'Нет данных',
  subtitle = '',
  showButton = false,
  buttonText = '',
  onButtonPress,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <MaterialIcons name={icon} size={48} color={colors.text.tertiary} />
      <Text style={[textStyles.h4, styles.title]}>{title}</Text>
      {subtitle ? (
        <Text style={[textStyles.bodySmall, styles.subtitle]}>
          {subtitle}
        </Text>
      ) : null}
      {showButton && buttonText && onButtonPress && (
        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.button]}
          onPress={onButtonPress}
        >
          <Text style={buttonStyles.buttonPrimaryText}>{buttonText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  
  title: {
    marginTop: spacing[3],
    color: colors.text.secondary,
  },
  
  subtitle: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.tertiary,
    maxWidth: '80%',
  },
  
  button: {
    marginTop: spacing[4],
  },
});

export default EmptyState;
