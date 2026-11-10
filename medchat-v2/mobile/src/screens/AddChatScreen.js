/**
 * Add Chat Screen
 * Scan doctor QR code or enter clinic/doctor code manually
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/config';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';
import { parseTransferQr, receiveTransfer } from '../services/transferService';

const AddChatScreen = ({ navigation }) => {
  const { token, user, applySession } = useAuth();
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [patientLogin, setPatientLogin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCode, setPendingCode] = useState(null);
  const [mode, setMode] = useState('add'); // add | transfer
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Create chat from a scanned or manually entered code
  const createChat = async (code) => {
    if (!patientLogin.trim()) {
      Alert.alert('Логин', 'Введите уникальный логин, чтобы врач мог вас опознать');
      return;
    }
    setIsSubmitting(true);
    try {
      const consentAccepted = await AsyncStorage.getItem('consentAccepted');
      const response = await fetch(API_BASE_URL + '/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          qrCode: code,
          patientLogin: patientLogin.trim(),
          consentAccepted: consentAccepted === 'true',
          type: 'individual',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Не удалось добавить чат');
      }
      Alert.alert('Готово', 'Чат добавлен', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Ошибка', err.message);
    } finally {
      setIsSubmitting(false);
      setPendingCode(null);
    }
  };

  // Перенос данных со старого устройства (режим «Перенос данных»)
  const startTransfer = (parsed) => {
    Alert.alert(
      'Перенос данных',
      'Перенести чаты и ключи шифрования со старого устройства на это?',
      [
        { text: 'Отмена', style: 'cancel', onPress: () => setScanned(false) },
        {
          text: 'Перенести',
          onPress: async () => {
            setTransferBusy(true);
            try {
              await receiveTransfer(parsed.token, parsed.keyB64, applySession);
              Alert.alert('Готово', 'Данные перенесены, вы вошли в свой профиль.');
              navigation.goBack();
            } catch (err) {
              Alert.alert('Ошибка', err.message || 'Перенос не удался');
              setScanned(false);
            } finally {
              setTransferBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleBarCodeScanned = ({ data }) => {
    setScanned(true);
    if (mode === 'transfer') {
      const parsed = parseTransferQr(data);
      if (!parsed) {
        Alert.alert(
          'Не тот QR',
          'Это не QR переноса данных. Отсканируйте QR переноса со старого устройства (Настройки - Перенос на новое устройство) или переключитесь в режим «Добавить чат».'
        );
        setScanned(false);
        return;
      }
      startTransfer(parsed);
      return;
    }
    let code = data;
    try {
      const parsed = JSON.parse(data);
      code = parsed.chatId || parsed.code || data;
    } catch (e) {
      // Plain code or deep link
      if (data.indexOf('medchat://') === 0) {
        code = data.replace('medchat://add/', '');
      }
    }
    setPendingCode(code);
    setScanned(false);
  };

  const handleManualCode = () => {
    if (!manualCode.trim()) {
      Alert.alert('Код', 'Введите код клиники или врача');
      return;
    }
    setPendingCode(manualCode.trim());
  };

  if (isSubmitting || pendingCode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setPendingCode(null); }} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[textStyles.h4, styles.headerTitle]}>Новый чат</Text>
        </View>
        <View style={styles.formContainer}>
          <Text style={[textStyles.bodySmall, styles.hint]}>
            Код: {pendingCode}
          </Text>
          <Text style={[textStyles.bodySmall, styles.hint]}>
            Введите уникальный логин (его увидит врач, чтобы опознать вас)
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ваш логин, например: Петров1980"
            placeholderTextColor={colors.text.tertiary}
            value={patientLogin}
            onChangeText={setPatientLogin}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.submitButton]}
            onPress={() => createChat(pendingCode)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={buttonStyles.buttonPrimaryText}>Добавить чат</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (transferBusy) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[textStyles.bodySmall, styles.permissionText]}>
          Переносим данные...
        </Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.center}>
        <MaterialIcons name="no-photography" size={48} color={colors.error[500]} />
        <Text style={[textStyles.h5, styles.permissionText]}>
          Нет доступа к камере. Введите код вручную ниже.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>
          {mode === 'transfer' ? 'Перенос данных' : 'Добавить чат'}
        </Text>
      </View>

      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'add' && styles.modeButtonActive]}
          onPress={() => setMode('add')}
        >
          <Text style={[styles.modeButtonText, mode === 'add' && styles.modeButtonTextActive]}>
            Добавить чат
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'transfer' && styles.modeButtonActive]}
          onPress={() => setMode('transfer')}
        >
          <Text style={[styles.modeButtonText, mode === 'transfer' && styles.modeButtonTextActive]}>
            Перенос данных
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
          barCodeTypes={[BarCodeScanner.Constants.BarCodeType.qr]}
        />
        <View style={styles.scannerFrame} />
        <Text style={[textStyles.bodySmall, styles.scannerHint]}>
          {mode === 'transfer' ? 'Отсканируйте QR переноса со старого устройства' : 'Наведите камеру на QR-код врача'}
        </Text>
      </View>

      {mode === 'add' && (
      <View style={styles.manualContainer}>
        <Text style={[textStyles.bodySmall, styles.manualTitle]}>
          Или введите код клиники или врача:
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Например: CLN-8F2A1D"
          placeholderTextColor={colors.text.tertiary}
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.submitButton]}
          onPress={handleManualCode}
        >
          <Text style={buttonStyles.buttonPrimaryText}>Продолжить</Text>
        </TouchableOpacity>
      </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[4], backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[2],
  },
  backButton: { padding: spacing[1], marginRight: spacing[2] },
  headerTitle: { color: colors.text.primary },
  scannerContainer: {
    height: 300, margin: spacing[4], borderRadius: spacing[3],
    overflow: 'hidden', backgroundColor: '#000',
  },
  scannerFrame: {
    position: 'absolute', top: 80, left: 60, right: 60, bottom: 80,
    borderWidth: 2, borderColor: colors.primary[600], borderRadius: spacing[2],
  },
  scannerHint: {
    position: 'absolute', bottom: spacing[3], left: 0, right: 0,
    textAlign: 'center', color: '#fff',
  },
  modeToggle: {
    flexDirection: 'row', marginHorizontal: spacing[4], marginTop: spacing[2],
    backgroundColor: colors.surface.primary, borderRadius: spacing[2],
    borderWidth: 1, borderColor: colors.border.primary,
  },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: spacing[2], borderRadius: spacing[2] },
  modeButtonActive: { backgroundColor: colors.primary[600] },
  modeButtonText: { color: colors.text.secondary, fontSize: 14 },
  modeButtonTextActive: { color: '#fff', fontWeight: '600' },
  manualContainer: { padding: spacing[4] },
  manualTitle: { color: colors.text.secondary, marginBottom: spacing[2] },
  input: {
    borderWidth: 1, borderColor: colors.border.primary,
    borderRadius: spacing[2], padding: spacing[3],
    color: colors.text.primary, backgroundColor: colors.surface.primary,
    marginBottom: spacing[3],
  },
  submitButton: { alignItems: 'center' },
  formContainer: { padding: spacing[4] },
  hint: { color: colors.text.secondary, marginBottom: spacing[3] },
  permissionText: { marginTop: spacing[3], textAlign: 'center', color: colors.text.secondary },
});

export default AddChatScreen;
