/**
 * MedChat Mobile App - Splash Screen
 * Initial loading screen
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { chatStyles } from '../styles/commonStyles';

const SplashScreen = ({ navigation }) => {
  const { isInitialized, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (isInitialized) {
      // Navigate based on auth state
      if (isAuthenticated) {
        // Check user role and navigate accordingly
        if (user?.role === 'doctor') {
          navigation.replace('DoctorMain');
        } else {
          navigation.replace('PatientMain');
        }
      } else {
        // Check if we need to show onboarding
        navigation.replace('ModeSelection');
      }
    }
  }, [isInitialized, isAuthenticated, user, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color={colors.primary[600]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
});

export default SplashScreen;
