/**
 * Doctor Setup Screen
 * 
 * Allows doctor to set up their profile and generate QR code
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  Alert,
  Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import { useWebSocket } from '../services/WebSocketService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';

const DoctorSetupScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    doctorProfile,
    updateDoctorProfile,
    generateDoctorQRCode,
    isLoading: isDoctorLoading,
    error: doctorError
  } = useDoctor();
  
  const { isConnected, connectionState } = useWebSocket();
  
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [error, setError] = useState(null);

  // Load profile data
  useEffect(() => {
    if (doctorProfile) {
      setName(doctorProfile.name || '');
      setSpecialty(doctorProfile.specialty || '');
    }
  }, [doctorProfile]);

  // Check connection
  useEffect(() => {
    if (!isConnected() && connectionState !== 'connecting') {
      setError({ 
        title: 'Connection Error', 
        message: 'Please check your internet connection and try again' 
      });
    }
  }, [isConnected, connectionState]);

  // Generate QR code
  const handleGenerateQRCode = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Update profile
      const profile = await updateDoctorProfile({ name, specialty });
      
      // Generate QR code
      const qrData = await generateDoctorQRCode();
      
      setQrCodeData(qrData);
      setIsLoading(false);
      
      // Navigate to home after a delay
      setTimeout(() => {
        navigation.navigate('DoctorHome');
      }, 1000);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to generate QR code' 
      });
      setIsLoading(false);
    }
  }, [name, specialty, updateDoctorProfile, generateDoctorQRCode, navigation]);

  // Skip setup
  const handleSkip = () => {
    navigation.navigate('DoctorHome');
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Doctor Setup
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Set up your profile to start accepting patients
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Full Name
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text
              }]}
              placeholder="Enter your full name"
              placeholderTextColor={theme.colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Specialty
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text
              }]}
              placeholder="Enter your specialty (e.g., Cardiology, Pediatrics)"
              placeholderTextColor={theme.colors.textSecondary}
              value={specialty}
              onChangeText={setSpecialty}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.info}>
          <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
            How It Works
          </Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.primary }]}>1</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                Generate a unique QR code for your practice
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.primary }]}>2</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                Patients scan the QR code to connect with you
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.primary }]}>3</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                All communication is end-to-end encrypted
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}
            onPress={handleSkip}
          >
            <Text style={[styles.buttonText, { color: theme.colors.text }]}>
              Skip for Now
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, { 
              backgroundColor: theme.colors.primary
            }]}
            onPress={handleGenerateQRCode}
            disabled={isLoading || isDoctorLoading}
          >
            {isLoading || isDoctorLoading ? (
              <Text style={styles.buttonText}>Generating...</Text>
            ) : (
              <Text style={styles.buttonText}>Generate QR Code</Text>
            )}
          </TouchableOpacity>
        </View>

        {qrCodeData && (
          <View style={styles.qrPreview}>
            <Text style={[styles.qrTitle, { color: theme.colors.text }]}>
              Your QR Code
            </Text>
            <View style={[styles.qrBox, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}>
              <Text style={[styles.qrText, { color: theme.colors.textSecondary }]}>
                QR code generated successfully!
              </Text>
              <Text style={[styles.qrLink, { color: theme.colors.primary }]}>
                {qrCodeData.deepLink}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <LoadingOverlay visible={isLoading || isDoctorLoading} />
      
      <ErrorModal
        visible={!!error}
        title={error?.title || 'Error'}
        message={error?.message || 'An error occurred'}
        onDismiss={handleErrorDismiss}
      />
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
    marginBottom: 32
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16
  },
  form: {
    marginBottom: 32
  },
  inputGroup: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  info: {
    marginBottom: 32
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16
  },
  infoList: {
    gap: 12
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8
  },
  infoNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 12,
    width: 30,
    textAlign: 'center'
  },
  infoText: {
    fontSize: 14,
    flex: 1
  },
  buttons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    minHeight: 50
  },
  buttonSecondary: {
    borderWidth: 1
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  qrPreview: {
    marginTop: 24
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center'
  },
  qrBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  qrText: {
    fontSize: 14,
    marginBottom: 8
  },
  qrLink: {
    fontSize: 12,
    textAlign: 'center'
  }
});

export default DoctorSetupScreen;
