/**
 * QR Code Screen
 * 
 * Displays QR code for doctor to share with patients
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  Share,
  Alert,
  Clipboard
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';
import QRCode from 'react-native-qrcode-svg';

const QRCodeScreen = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    doctorProfile,
    generateDoctorQRCode,
    isLoading: isDoctorLoading,
    error: doctorError
  } = useDoctor();
  
  const [qrCodeData, setQrCodeData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Generate QR code on mount
  useEffect(() => {
    const generateQR = async () => {
      try {
        setIsLoading(true);
        const qrData = await generateDoctorQRCode();
        setQrCodeData(qrData);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        setError({ 
          title: 'Error', 
          message: err.message || 'Failed to generate QR code' 
        });
        setIsLoading(false);
      }
    };
    
    if (doctorProfile) {
      generateQR();
    }
  }, [doctorProfile, generateDoctorQRCode]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      if (qrCodeData?.deepLink) {
        await Clipboard.setString(qrCodeData.deepLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setError({ 
        title: 'Error', 
        message: 'Failed to copy to clipboard' 
      });
    }
  }, [qrCodeData]);

  // Share QR code
  const handleShare = useCallback(async () => {
    try {
      if (qrCodeData) {
        await Share.share({
          message: `Connect with me on ${config.name}: ${qrCodeData.deepLink}`,
          title: 'Share Doctor QR Code'
        });
      }
    } catch (err) {
      console.error('Failed to share:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to share' 
      });
    }
  }, [qrCodeData]);

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Navigate back
  const navigateBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
            <Text style={[styles.backButtonText, { color: theme.colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Your QR Code
          </Text>
          <View style={styles.headerSpace} />
        </View>

        {/* Description */}
        <View style={styles.description}>
          <Text style={[styles.descriptionText, { color: theme.colors.textSecondary }]}>
            Share this QR code with your patients so they can connect with you securely.
          </Text>
        </View>

        {/* QR Code */}
        {qrCodeData && (
          <View style={[styles.qrContainer, { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border
          }]}>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={qrCodeData.deepLink}
                size={config.qr.size}
                color={config.qr.color.dark}
                backgroundColor={config.qr.color.light}
              />
            </View>
            
            <Text style={[styles.qrLabel, { color: theme.colors.textSecondary }]}>
              Doctor ID: {qrCodeData.doctorId}
            </Text>
          </View>
        )}

        {/* Deep Link */}
        {qrCodeData && (
          <View style={[styles.linkContainer, { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border
          }]}>
            <Text style={[styles.linkLabel, { color: theme.colors.textSecondary }]}>
              Deep Link
            </Text>
            <View style={styles.linkRow}>
              <Text 
                style={[styles.linkText, { color: theme.colors.primary }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {qrCodeData.deepLink}
              </Text>
              <TouchableOpacity
                style={[styles.copyButton, { 
                  backgroundColor: copied ? theme.colors.success : theme.colors.primary
                }]}
                onPress={handleCopy}
              >
                <Text style={styles.copyButtonText}>
                  {copied ? '✓ Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={[styles.instructionsTitle, { color: theme.colors.text }]}>
            How to Share
          </Text>
          <View style={styles.instructionsList}>
            <View style={styles.instructionItem}>
              <Text style={[styles.instructionNumber, { color: theme.colors.primary }]}>1</Text>
              <Text style={[styles.instructionText, { color: theme.colors.textSecondary }]}>
                Show this QR code to your patient
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={[styles.instructionNumber, { color: theme.colors.primary }]}>2</Text>
              <Text style={[styles.instructionText, { color: theme.colors.textSecondary }]}>
                Patient scans the code using their camera or QR scanner
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={[styles.instructionNumber, { color: theme.colors.primary }]}>3</Text>
              <Text style={[styles.instructionText, { color: theme.colors.textSecondary }]}>
                Patient enters their unique ID and connects
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, { 
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary
            }]}
            onPress={handleShare}
          >
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, { 
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }]}
            onPress={handleCopy}
          >
            <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Copy Link</Text>
          </TouchableOpacity>
        </View>

        {/* Security Notice */}
        <View style={[styles.securityNotice, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.securityIcon, { color: theme.colors.success }]}>🔒</Text>
          <Text style={[styles.securityText, { color: theme.colors.textSecondary }]}>
            This QR code is unique to you. Only share it with patients you want to connect with.
          </Text>
        </View>
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
    padding: 24
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  backButtonText: {
    fontSize: 20
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  headerSpace: {
    width: 40
  },
  description: {
    marginBottom: 32
  },
  descriptionText: {
    fontSize: 16,
    textAlign: 'center'
  },
  qrContainer: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24
  },
  qrCodeWrapper: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16
  },
  qrLabel: {
    fontSize: 14
  },
  linkContainer: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24
  },
  linkLabel: {
    fontSize: 14,
    marginBottom: 8
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  linkText: {
    fontSize: 14,
    flex: 1
  },
  copyButton: {
    padding: 8,
    borderRadius: 6,
    minWidth: 80
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  instructions: {
    marginBottom: 24
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16
  },
  instructionsList: {
    gap: 12
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8
  },
  instructionNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    marginRight: 12,
    width: 30,
    textAlign: 'center'
  },
  instructionText: {
    fontSize: 14,
    flex: 1
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1
  },
  securityIcon: {
    fontSize: 20,
    marginTop: 2
  },
  securityText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20
  }
});

export default QRCodeScreen;
