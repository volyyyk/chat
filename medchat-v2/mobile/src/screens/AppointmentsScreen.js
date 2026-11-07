/**
 * Appointments Screen
 * Patient appointments (list, cancel, reminders)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/config';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const formatDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
};

const STATUS_LABELS = {
  scheduled: 'Запланирован',
  confirmed: 'Подтвержден',
  completed: 'Завершен',
  cancelled: 'Отменен',
  no_show: 'Неявка',
};

const AppointmentsScreen = ({ navigation }) => {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(API_BASE_URL + '/api/appointments?limit=50', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось загрузить записи');
      setAppointments(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = (appointment) => {
    Alert.alert('Отменить запись?', 'Врач будет уведомлен об отмене.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(
              API_BASE_URL + '/api/appointments/' + appointment.id + '/cancel',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ reason: 'Отменено пациентом' }),
              }
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Не удалось отменить');
            load();
          } catch (err) {
            Alert.alert('Ошибка', err.message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.item]}>
      <View style={styles.itemIcon}>
        <MaterialIcons name="event" size={26} color={colors.primary[600]} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[textStyles.bodySmall, styles.itemTitle]}>
          {(item.doctor && (item.doctor.fullName || item.doctorName)) || 'Прием'}
        </Text>
        <Text style={[textStyles.caption, styles.itemMeta]}>
          {formatDateTime(item.scheduledAt || item.date)}
        </Text>
        <Text style={[textStyles.caption, styles.itemStatus]}>
          {STATUS_LABELS[item.status] || item.status || ''}
          {item.type ? ' · ' + item.type : ''}
        </Text>
      </View>
      {(item.status === 'scheduled' || item.status === 'confirmed') && (
        <TouchableOpacity style={styles.itemAction} onPress={() => handleCancel(item)}>
          <MaterialIcons name="cancel" size={22} color={colors.error[500]} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Записи на прием</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error" size={48} color={colors.error[500]} />
          <Text style={[textStyles.bodySmall, styles.errorText]}>{error}</Text>
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.retryButton]}
            onPress={load}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="event-busy" size={48} color={colors.text.tertiary} />
              <Text style={[textStyles.bodySmall, styles.emptyText]}>Записей нет</Text>
              <Text style={[textStyles.caption, styles.emptyHint]}>
                Запись доступна через администратора клиники
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[2],
  },
  backButton: { padding: spacing[1], marginRight: spacing[2] },
  headerTitle: { color: colors.text.primary },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  item: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[2],
  },
  itemIcon: {
    width: 44, height: 44, borderRadius: spacing[3],
    backgroundColor: colors.primary[50] || colors.background.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  itemInfo: { flex: 1, marginLeft: spacing[3] },
  itemTitle: { color: colors.text.primary },
  itemMeta: { color: colors.text.secondary, marginTop: spacing[0.5] },
  itemStatus: { color: colors.text.tertiary, marginTop: spacing[0.5] },
  itemAction: { padding: spacing[1], marginLeft: spacing[2] },
  errorText: { marginTop: spacing[2], color: colors.text.secondary, textAlign: 'center' },
  retryButton: { marginTop: spacing[4] },
  emptyText: { marginTop: spacing[2], color: colors.text.secondary },
  emptyHint: { marginTop: spacing[1], color: colors.text.tertiary },
});

export default AppointmentsScreen;
