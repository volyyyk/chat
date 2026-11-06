/**
 * Patient Setup Screen
 * 
 * Allows patient to connect to a doctor using QR code or link
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
  Linking,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { usePatient } from '../services/PatientService';
import { useWebSocket } from '../services/WebSocketService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';
import * as Clipboard from '@react-native-clipboard/clipboard';

const PatientSetupScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    connectToDoctor,
    patientProfile,
    isLoading: isPatientLoading,
    error: patientError
  } = usePatient();
  
  const { isConnected, connectionState } = useWebSocket();
  
  const [doctorId, setDoctorId] = useState('');
  const [patientUniqueId, setPatientUniqueId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scannedData, setScannedData] = useState(null);

  // Load profile data
  useEffect(() => {
    if (patientProfile) {
      setPatientUniqueId(patientProfile.uniqueId || '');
      if (patientProfile.doctorId) {
        setDoctorId(patientProfile.doctorId);
      }
    }
  }, [patientProfile]);

  // Check for deep link
  useEffect(() => {
    const handleDeepLink = async () => {
      try {
        // Check if app was opened from a deep link
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          handleDeepLinkUrl(initialUrl);
        }
      } catch (err) {
        console.error('Failed to get initial URL:', err);
      }
    };

    handleDeepLink();

    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLinkUrl(url);
    });

    return () => subscription.remove();
  }, []);

  // Handle deep link URL
  const handleDeepLinkUrl = (url) => {
    try {
      if (!url) return;

      // Parse medchat:// URL
      if (url.startsWith('medchat://')) {
        const urlObj = new URL(url);
        const doctorId = urlObj.searchParams.get('doctorId');
        
        if (doctorId) {
          setDoctorId(doctorId);
          setScannedData({ doctorId });
        }
      }
    } catch (err) {
      console.error('Failed to parse deep link:', err);
    }
  };

  // Handle QR code scan (would be called from QR scanner)
  const handleQRCodeScan = (data) => {
    try {
      // Parse QR code data
      if (data.startsWith('medchat://')) {
        const urlObj = new URL(data);
        const doctorId = urlObj.searchParams.get('doctorId');
        
        if (doctorId) {
          setDoctorId(doctorId);
          setScannedData({ doctorId });
          return;
        }
      }

      // Try to parse as JSON
      try {
        const qrData = JSON.parse(data);
        if (qrData.type === 'medchat_doctor' && qrData.doctorId) {
          setDoctorId(qrData.doctorId);
          setScannedData(qrData);
          return;
        }
      } catch (e) {
        // Not JSON, try as plain doctorId
        setDoctorId(data);
        setScannedData({ doctorId: data });
      }
    } catch (err) {
      console.error('Failed to parse QR code:', err);
      setError({ 
        title: 'Invalid QR Code', 
        message: 'The scanned QR code is not valid for MedChat' 
      });
    }
  };

  // Connect to doctor
  const handleConnect = useCallback(async () => {
    try {
      if (!doctorId) {
        setError({ 
          title: 'Error', 
          message: 'Please enter or scan a doctor ID' 
        });
        return;
      }

      if (!patientUniqueId) {
        setError({ 
          title: 'Error', 
          message: 'Please enter your unique ID' 
        });
        return;
      }

      setIsLoading(true);
      setError(null);

      // Connect to doctor
      const result = await connectToDoctor(doctorId, patientUniqueId);

      if (result.success) {
        // Navigate to patient home
        navigation.navigate('PatientHome');
      } else {
        setError({ 
          title: 'Connection Failed', 
          message: result.message || 'Failed to connect to doctor' 
        });
      }
    } catch (err) {
      console.error('Failed to connect to doctor:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to connect to doctor' 
      });
    } finally {
      setIsLoading(false);
    }
  }, [doctorId, patientUniqueId, connectToDoctor, navigation]);

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const clipboardContent = await Clipboard.getString();
      
      // Try to parse as medchat URL
      if (clipboardContent.startsWith('medchat://')) {
        handleDeepLinkUrl(clipboardContent);
        return;
      }

      // Try to parse as doctorId
      if (clipboardContent.length > 0) {
        setDoctorId(clipboardContent);
      }
    } catch (err) {
      console.error('Failed to paste from clipboard:', err);
    }
  };

  // Generate random unique ID
  const generateUniqueId = () => {
    const randomId = Math.random().toString(36).substring(2, 10) + 
                     Math.random().toString(36).substring(2, 10);
    setPatientUniqueId(randomId);
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Open QR scanner (placeholder - would use expo-barcode-scanner in real app)
  const openQRScanner = () => {
    // In a real app, you would navigate to a QR scanner screen
    Alert.alert(
      'QR Scanner',
      'In a real app, this would open the QR code scanner. For now, you can paste a doctor ID or use the demo ID below.',
      [
        { text: 'Use Demo ID', onPress: () => setDoctorId('demo-doctor-123') },
        { text: 'OK' }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Patient Setup
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Connect with your doctor for secure communication
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Doctor ID or QR Code
            </Text>
            <View style={styles.qrInput}>
              <TextInput
                style={[styles.input, styles.inputWithIcon, { 
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.text
                }]}
                placeholder="Enter doctor ID or paste link"
                placeholderTextColor={theme.colors.textSecondary}
                value={doctorId}
                onChangeText={setDoctorId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.qrButton, { backgroundColor: theme.colors.primary }]}
                onPress={openQRScanner}
              >
                <Text style={styles.qrButtonText}>📷</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={handlePaste}>
              <Text style={[styles.pasteText, { color: theme.colors.primary }]}>
                Paste from clipboard
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Your Unique ID
            </Text>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text
              }]}
              placeholder="Enter your unique ID (visible only to your doctor)"
              placeholderTextColor={theme.colors.textSecondary}
              value={patientUniqueId}
              onChangeText={setPatientUniqueId}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={generateUniqueId}>
              <Text style={[styles.generateText, { color: theme.colors.primary }]}>
                Generate random ID
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {scannedData && (
          <View style={styles.scannedData}>
            <Text style={[styles.scannedTitle, { color: theme.colors.success }]}>
              ✓ Doctor ID detected
            </Text>
            <Text style={[styles.scannedId, { color: theme.colors.text }]}>
              {scannedData.doctorId}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
            How It Works
          </Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.success }]}>1</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                Get a unique ID from your doctor or scan their QR code
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.success }]}>2</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                Enter your unique ID (visible only to your doctor)
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoNumber, { color: theme.colors.success }]}>3</Text>
              <Text style={[styles.infoText, { color: theme.colors.textSecondary }]}>
                All messages are encrypted and stored locally on your device
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, { 
              backgroundColor: theme.colors.success
            }]}
            onPress={handleConnect}
            disabled={isLoading || isPatientLoading}
          >
            {isLoading || isPatientLoading ? (
              <Text style={styles.buttonText}>Connecting...</Text>
            ) : (
              <Text style={styles.buttonText}>Connect to Doctor</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.privacy}>
          <Text style={[styles.privacyText, { color: theme.colors.textSecondary }]}>
            Your unique ID is only visible to your doctor. 
            All communication is end-to-end encrypted and complies with Russian 152-ФЗ.
          </Text>
        </View>
      </ScrollView>

      <LoadingOverlay visible={isLoading || isPatientLoading} />
      
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
  qrInput: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16
  },
  inputWithIcon: {
    marginRight: 8
  },
  qrButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  qrButtonText: {
    fontSize: 20
  },
  pasteText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right'
  },
  generateText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right'
  },
  scannedData: {
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  scannedTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  scannedId: {
    fontSize: 16,
    fontWeight: 'bold'
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
    marginBottom: 24
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPrimary: {
    minHeight: 50
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  privacy: {
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8
  },
  privacyText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18
  }
});

export default PatientSetupScreen;
