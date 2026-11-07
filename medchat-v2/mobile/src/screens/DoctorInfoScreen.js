/**
 * Doctor Info Screen
 * Detailed info about the clinic, doctor and this chat
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/config';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const formatValue = (value, fallback) => (value ? value : fallback);

const formatDate = (iso) => {
  if (!iso) return 'нет данных';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) {
    return 'нет данных';
  }
};

const DoctorInfoScreen = ({ navigation, route }) => {
  const { chatId } = route.params || {};
  const { token } = useAuth();
  const [chat, setChat] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadChat = useCallback(async () => {
    if (!chatId) {
      setError('Чат не найден');
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(API_BASE_URL + '/api/chats/' + chatId, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось загрузить информацию');
      setChat(data.data || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, token]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <MaterialIcons name="error" size={48} color={colors.error[500]} />
        <Text style={[textStyles.h5, styles.errorText]}>{error}</Text>
        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.retryButton]}
          onPress={loadChat}
        >
          <Text style={buttonStyles.buttonPrimaryText}>Повторить</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const doctor = chat.doctor || chat.Doctor || {};
  const clinic = chat.clinic || chat.Clinic || doctor.clinic || {};
  const settings = chat.settings || {};

  const rows = [
    { icon: 'business', label: 'Клиника', value: formatValue(clinic.name, 'Клиника не указана') },
    { icon: 'place', label: 'Адрес', value: formatValue(clinic.address, 'нет данных') },
    { icon: 'phone', label: 'Телефон', value: formatValue(clinic.phone, 'нет данных') },
    { icon: 'schedule', label: 'Часы работы клиники', value: formatValue(clinic.workingHours, 'нет данных') },
    { icon: 'person', label: 'Врач', value: formatValue(doctor.fullName || (doctor.lastName + ' ' + doctor.firstName), 'не указан') },
    { icon: 'school', label: 'Специальность', value: formatValue(doctor.specialty, 'нет данных') },
    { icon: 'workspace-premium', label: 'Квалификация', value: formatValue(doctor.qualification, 'нет данных') },
    { icon: 'access-time', label: 'Удобное время ответов врача', value: formatValue(settings.convenienceTime || doctor.convenienceTime, 'не указано') },
    { icon: 'event', label: 'Последний прием', value: formatDate(chat.lastAppointmentAt) },
    { icon: 'add-circle-outline', label: 'Чат добавлен', value: formatDate(chat.createdAt) },
    { icon: 'group', label: 'Добавил', value: formatValue(chat.addedBy, 'нет данных') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Информация</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadChat} />}
      >
        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.card]}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <MaterialIcons name={row.icon} size={22} color={colors.primary[600]} />
              <View style={styles.rowText}>
                <Text style={[textStyles.caption, styles.rowLabel]}>{row.label}</Text>
                <Text style={[textStyles.bodySmall, styles.rowValue]}>{row.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[textStyles.caption, styles.legalNote]}>
          Общение в чате не заменяет очную консультацию. При экстренных
          ситуациях вызывайте скорую помощь (103 / 112).
        </Text>
      </ScrollView>
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
  scrollContent: { padding: spacing[4], paddingBottom: spacing[8] },
  card: { padding: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing[2] },
  rowText: { marginLeft: spacing[3], flex: 1 },
  rowLabel: { color: colors.text.tertiary },
  rowValue: { color: colors.text.primary, marginTop: spacing[0.5] },
  errorText: { marginTop: spacing[2], textAlign: 'center', color: colors.text.secondary },
  retryButton: { marginTop: spacing[4] },
  legalNote: { color: colors.text.tertiary, textAlign: 'center', marginTop: spacing[4], lineHeight: 18 },
});

export default DoctorInfoScreen;
