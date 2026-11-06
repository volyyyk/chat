/**
 * MedChat Mobile App - Patient Setup Screen
 * Patient onboarding and QR scanning
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { MaterialIcons } from '@expo/vector-icons';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, chatStyles } from '../styles/commonStyles';
import { parseQRCodeData, generatePatientIdentifier } from '../utils/helpers';
import { formatFileRetentionWarning } from '../utils/formatters';

const PatientSetupScreen = ({ navigation }) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [patientLogin, setPatientLogin] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [clinicId, setClinicId] = useState('');
  
  const { createChat } = useChat();

  // Request camera permission
  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Handle QR code scan
  const handleBarCodeScanned = useCallback(async ({ type, data }) => {
    setScanned(true);
    setScanning(false);

    try {
      const qrData = parseQRCodeData(data);

      if (!qrData) {
        Alert.alert('Ошибка', 'Неверный QR код. Пожалуйста, отсканируйте код врача MedChat.');
        setScanned(false);
        setScanning(true);
        return;
      }

      // Store doctor info temporarily
      setDoctorId(qrData.doctorId);
      setClinicId(qrData.clinicId);

      // Ask for patient login
      Alert.prompt(
        'Ваш логин',
        'Введите уникальный логин для этого врача (он будет виден только этому врачу)',
        [
          { text: 'Отмена', onPress: () => setScanned(false), style: 'cancel' },
          {
            text: 'OK',
            onPress: async (login) => {
              if (!login || login.trim().length < 3) {
                Alert.alert('Ошибка', 'Логин должен содержать не менее 3 символов');
                return;
              }

              // Create chat
              const chat = await createChat(qrData.doctorId, qrData.clinicId, login);

              if (chat) {
                // Save patient info
                await database.savePatientInfo({
                  login,
                  doctorId: qrData.doctorId,
                  clinicId: qrData.clinicId,
                  doctorName: qrData.doctorName || 'Врач',
                  clinicName: qrData.clinicName || 'Клиника',
                  specialtyName: qrData.specialtyName || '',
                });

                // Navigate to chat
                navigation.replace('PatientMain', {
                  screen: 'Chat',
                  params: { chatId: chat.id },
                });
              } else {
                Alert.alert('Ошибка', 'Не удалось создать чат');
                setScanned(false);
                setScanning(true);
              }
            },
          },
        ],
        'plain-text',
        '',
        'default'
      );
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось обработать QR код');
      setScanned(false);
      setScanning(true);
    }
  }, [createChat, navigation]);

  // Handle manual entry
  const handleManualEntry = async () => {
    if (!doctorId || !clinicId || !patientLogin) {
      Alert.alert('Ошибка', 'Пожалуйста, заполните все поля');
      return;
    }

    try {
      const chat = await createChat(doctorId, clinicId, patientLogin);

      if (chat) {
        await database.savePatientInfo({
          login: patientLogin,
          doctorId,
          clinicId,
          doctorName: 'Врач',
          clinicName: 'Клиника',
          specialtyName: '',
        });

        navigation.replace('PatientMain', {
          screen: 'Chat',
          params: { chatId: chat.id },
        });
      } else {
        Alert.alert('Ошибка', 'Не удалось создать чат');
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось создать чат');
    }
  };

  // Toggle between QR scanner and manual entry
  const toggleManualEntry = () => {
    setShowManualEntry(!showManualEntry);
    setScanned(false);
    setScanning(!showManualEntry);
  };

  // Reset scanner
  const resetScanner = () => {
    setScanned(false);
    setScanning(true);
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={textStyles.body}>Запрос разрешения на камеру...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="camera-alt" size={48} color={colors.error[500]} />
          <Text style={[textStyles.h4, styles.errorTitle]}>Нет доступа к камере</Text>
          <Text style={[textStyles.bodySmall, styles.errorText]}>
            Пожалуйста, предоставьте разрешение на использование камеры
            в настройках устройства.
          </Text>
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.button]}
            onPress={toggleManualEntry}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Ввести данные вручную</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {showManualEntry ? (
        <View style={styles.manualEntryContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={toggleManualEntry} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[textStyles.h3, styles.headerTitle]}>Ввод данных</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>ID врача</Text>
              <View style={[styles.inputContainer, styles.input]}>
                <Text style={textStyles.inputText}>{doctorId || 'Не указан'}</Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>ID клиники</Text>
              <View style={[styles.inputContainer, styles.input]}>
                <Text style={textStyles.inputText}>{clinicId || 'Не указан'}</Text>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>
                Ваш уникальный логин *
              </Text>
              <View style={[styles.inputContainer, styles.input]}>
                <Text style={textStyles.inputText}>{patientLogin || 'Введите логин'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.button]}
              onPress={handleManualEntry}
            >
              <Text style={buttonStyles.buttonPrimaryText}>Создать чат</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoContainer}>
            <MaterialIcons name="info" size={20} color={colors.text.tertiary} />
            <Text style={[textStyles.caption, styles.infoText]}>
              {formatFileRetentionWarning()}
            </Text>
          </View>
        </View>
      ) : scanning ? (
        <View style={styles.scannerContainer}>
          <BarCodeScanner
            onBarCodeScanned={handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />

          <View style={chatStyles.qrScannerOverlay}>
            <View style={chatStyles.qrScannerFrame}>
              <View style={[chatStyles.qrScannerFrameCorner, chatStyles.qrScannerFrameCornerTopLeft]} />
              <View style={[chatStyles.qrScannerFrameCorner, chatStyles.qrScannerFrameCornerTopRight]} />
              <View style={[chatStyles.qrScannerFrameCorner, chatStyles.qrScannerFrameCornerBottomLeft]} />
              <View style={[chatStyles.qrScannerFrameCorner, chatStyles.qrScannerFrameCornerBottomRight]} />
            </View>
          </View>

          <View style={chatStyles.qrScannerInstructions}>
            <MaterialIcons name="qr-code-scanner" size={24} color={colors.primary[600]} />
            <Text style={chatStyles.qrScannerInstructionsText}>
              Отсканируйте QR-код врача
            </Text>
          </View>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[buttonStyles.buttonGhost, styles.toggleButton]}
              onPress={toggleManualEntry}
            >
              <Text style={[buttonStyles.buttonGhostText, styles.toggleText]}>
                Ввести данные вручную
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.successContainer}>
          <MaterialIcons name="check-circle" size={64} color={colors.success[500]} />
          <Text style={[textStyles.h3, styles.successTitle]}>QR-код отсканирован!</Text>
          <Text style={[textStyles.bodySmall, styles.successText]}>
            Введите свой уникальный логин для этого врача
          </Text>

          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.button]}
            onPress={resetScanner}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Отсканировать другой код</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  
  errorTitle: {
    marginTop: spacing[4],
    color: colors.error[500],
  },
  
  errorText: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.secondary,
  },
  
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  
  toggleContainer: {
    position: 'absolute',
    bottom: spacing[6],
    left: spacing[4],
    right: spacing[4],
    alignItems: 'center',
  },
  
  toggleButton: {
    backgroundColor: colors.surface.primary,
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  toggleText: {
    color: colors.text.primary,
  },
  
  manualEntryContainer: {
    flex: 1,
    padding: spacing[4],
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  backButton: {
    padding: spacing[1],
    marginRight: spacing[2],
  },
  
  headerTitle: {
    color: colors.text.primary,
  },
  
  form: {
    flex: 1,
  },
  
  field: {
    marginBottom: spacing[4],
  },
  
  label: {
    marginBottom: spacing[1],
    color: colors.text.primary,
  },
  
  inputContainer: {
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[2],
    padding: spacing[3],
  },
  
  input: {
    minHeight: spacing[10],
  },
  
  button: {
    marginTop: spacing[2],
  },
  
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.warning[50],
    borderRadius: spacing[2],
  },
  
  infoText: {
    marginLeft: spacing[2],
    color: colors.warning[800],
  },
  
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  
  successTitle: {
    marginTop: spacing[4],
    color: colors.success[500],
  },
  
  successText: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.secondary,
  },
});

export default PatientSetupScreen;
