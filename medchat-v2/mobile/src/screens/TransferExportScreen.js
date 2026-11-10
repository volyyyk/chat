/**
 * Transfer Export Screen
 * Показ одноразового QR переноса данных (чаты + E2E-ключи) на новое
 * устройство. Токен живёт 10 минут, одноразовый; ключ шифрования blob'а
 * есть только в этом QR. РИСК: увидевший QR получит доступ к сессии и
 * ключам - показывать только лично, экрану нового устройства.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../hooks/useAuth';
import { createTransfer } from '../services/transferService';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, cardStyles } from '../styles/commonStyles';

const TransferExportScreen = ({ navigation }) => {
  const { token, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState(null);

  const start = async () => {
    setBusy(true);
    try {
      const result = await createTransfer(token, user.id);
      setTransfer(result);
    } catch (err) {
      Alert.alert('Ошибка', err.message || 'Не удалось создать перенос');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Перенос на новое устройство</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!transfer ? (
          <>
            <View style={[cardStyles.cardBase, styles.warningCard]}>
              <MaterialIcons name="warning" size={24} color={colors.primary[600]} />
              <Text style={[textStyles.bodySmall, styles.warningText]}>
                QR содержит одноразовый доступ к вашим чатам и ключам шифрования
                на 10 минут. Покажите его только лично, на новом устройстве.
                Не делайте скриншотов.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={start}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Создать QR переноса</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.qrCard}>
              <QRCode value={transfer.qrValue} size={240} backgroundColor="#fff" />
            </View>
            <Text style={[textStyles.bodySmall, styles.hint]}>
              Откройте на новом устройстве: сканер - «Перенос данных», и
              отсканируйте этот QR. Он одноразовый и действует 10 минут.
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setTransfer(null)}
            >
              <Text style={styles.actionButtonText}>Создать новый QR</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[2],
  },
  backButton: { padding: spacing[1], marginRight: spacing[2] },
  headerTitle: { color: colors.text.primary, flex: 1 },
  scrollContent: { padding: spacing[4] },
  warningCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[4],
  },
  warningText: { color: colors.text.secondary, marginLeft: spacing[2], flex: 1 },
  actionButton: {
    marginTop: spacing[2],
    backgroundColor: colors.primary[600],
    borderRadius: spacing[2],
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  qrCard: {
    alignItems: 'center', padding: spacing[4],
    backgroundColor: '#fff', borderRadius: spacing[3], marginBottom: spacing[3],
  },
  hint: { color: colors.text.secondary, textAlign: 'center', marginBottom: spacing[3] },
});

export default TransferExportScreen;
