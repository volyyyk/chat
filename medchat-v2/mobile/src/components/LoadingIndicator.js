/**
 * MedChat Mobile App - Loading Indicator Component
 * Reusable loading indicator component
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles } from '../styles/commonStyles';

const LoadingIndicator = ({
  size = 'large',
  color = colors.primary[600],
  text = '',
  style,
  textStyle,
}) => {
  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={color} />
      {text ? (
        <Text style={[textStyles.bodySmall, styles.text, textStyle]}>
          {text}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  
  text: {
    marginTop: spacing[2],
    color: colors.text.secondary,
  },
});

export default LoadingIndicator;
