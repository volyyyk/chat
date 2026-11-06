/**
 * Mode Selection Screen
 * 
 * Allows user to choose between Doctor and Patient mode
 */

import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  Image,
  ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import config from '../config';
import LoadingOverlay from '../components/common/LoadingOverlay';

const ModeSelectionScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const handleDoctorSelect = () => {
    setIsLoading(true);
    setTimeout(() => {
      navigation.navigate('DoctorSetup');
      setIsLoading(false);
    }, 500);
  };

  const handlePatientSelect = () => {
    setIsLoading(true);
    setTimeout(() => {
      navigation.navigate('PatientSetup');
      setIsLoading(false);
    }, 500);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
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
        </View>

        <View style={styles.description}>
          <Text style={[styles.descriptionText, { color: theme.colors.textSecondary }]}>
            Choose your mode to continue
          </Text>
        </View>

        <View style={styles.options}>
          {/* Doctor Option */}
          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: theme.colors.surface }]}
            onPress={handleDoctorSelect}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.colors.doctor + '20' }]}>
              <Text style={[styles.optionIconText, { color: theme.colors.doctor }]}>
                👨⚕️
              </Text>
            </View>
            <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
              Doctor
            </Text>
            <Text style={[styles.optionDescription, { color: theme.colors.textSecondary }]}>
              Provide medical consultation to your patients
            </Text>
            <View style={[styles.optionArrow, { backgroundColor: theme.colors.primary + '20' }]}>
              <Text style={[styles.optionArrowText, { color: theme.colors.primary }]}>
                →
              </Text>
            </View>
          </TouchableOpacity>

          {/* Patient Option */}
          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: theme.colors.surface }]}
            onPress={handlePatientSelect}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.colors.patient + '20' }]}>
              <Text style={[styles.optionIconText, { color: theme.colors.patient }]}>
                👩💙
              </Text>
            </View>
            <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
              Patient
            </Text>
            <Text style={[styles.optionDescription, { color: theme.colors.textSecondary }]}>
              Connect with your doctor for consultation
            </Text>
            <View style={[styles.optionArrow, { backgroundColor: theme.colors.success + '20' }]}>
              <Text style={[styles.optionArrowText, { color: theme.colors.success }]}>
                →
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.features}>
          <Text style={[styles.featuresTitle, { color: theme.colors.text }]}>
            Features
          </Text>
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Text style={[styles.featureIcon, { color: theme.colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>
                End-to-End Encryption
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={[styles.featureIcon, { color: theme.colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>
                Local Data Storage
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={[styles.featureIcon, { color: theme.colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>
                152-ФЗ Compliant
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={[styles.featureIcon, { color: theme.colors.success }]}>✓</Text>
              <Text style={[styles.featureText, { color: theme.colors.textSecondary }]}>
                No Central Database
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <LoadingOverlay visible={isLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContainer: {
    padding: 24,
    paddingBottom: 48
  },
  header: {
    alignItems: 'center',
    marginBottom: 32
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center'
  },
  description: {
    marginBottom: 32
  },
  descriptionText: {
    fontSize: 16,
    textAlign: 'center'
  },
  options: {
    gap: 20,
    marginBottom: 40
  },
  optionCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center'
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  optionIconText: {
    fontSize: 32
  },
  optionContent: {
    flex: 1
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4
  },
  optionDescription: {
    fontSize: 14
  },
  optionArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  optionArrowText: {
    fontSize: 20
  },
  features: {
    marginTop: 24
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center'
  },
  featuresList: {
    gap: 12
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    fontWeight: 'bold'
  },
  featureText: {
    fontSize: 14,
    flex: 1
  }
});

export default ModeSelectionScreen;
