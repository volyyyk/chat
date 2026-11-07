/**
 * E-Prescriptions Screen
 * Electronic prescriptions with doctor signature
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, RefreshControl, TextInput, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/config';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch (e) {
    return '';
  }
};

const EPrescriptionsScreen = ({ navigation }) => {
  const { token, user } = useAuth();
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ diagnosis: '', medications: '', recommendations: '' });

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(API_BASE_URL + '/api/eprescriptions?limit=50', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось загрузить рецепты');
      setPrescriptions(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.diagnosis.trim() || !form.medications.trim()) {
      Alert.alert('Ошибка', 'Заполните диагноз и назначения');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(API_BASE_URL + '/api/eprescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          diagnosis: form.diagnosis.trim(),
          medications: form.medications
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ name, dosage: '', frequency: '', duration: '' })),
          recommendations: form.recommendations.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось создать рецепт');
      setShowCreate(false);
      setForm({ diagnosis: '', medications: '', recommendations: '' });
      load();
    } catch (err) {
      Alert.alert('Ошибка', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSign = async (prescription) => {
    Alert.alert(
      'Подписать рецепт?',
      'Рецепт будет подписан вашей электронной подписью и станет доступен пациенту.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Подписать',
          onPress: async () => {
            try {
              const response = await fetch(
                API_BASE_URL + '/api/eprescriptions/' + prescription.id + '/sign',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                  },
                  body: JSON.stringify({}),
                }
              );
              const data = await response.json();
              if (!response.ok) throw new Error(data.message || 'Не удалось подписать');
              load();
            } catch (err) {
              Alert.alert('Ошибка', err.message);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.item]}>
      <View style={styles.itemHeader}>
        <MaterialIcons
          name={item.isSigned ? 'verified' : 'pending-actions'}
          size={22}
          color={item.isSigned ? colors.success[600] : colors.warning[600]}
        />
        <Text style={[textStyles.bodySmall, styles.itemTitle]}>
          {item.diagnosis || 'Рецепт'}
        </Text>
        <Text style={[textStyles.caption, styles.itemDate]}>
          {formatDate(item.createdAt)}
        </Text>
      </View>

      {(item.medications || []).map((med, idx) => (
        <Text key={idx} style={[textStyles.caption, styles.medication]}>
          💊 {med.name}
          {med.dosage ? ' · ' + med.dosage : ''}
          {med.frequency ? ' · ' + med.frequency : ''}
        </Text>
      ))}

      {item.validUntil ? (
        <Text style={[textStyles.caption, styles.itemMeta]}>
          Действителен до: {formatDate(item.validUntil)}
        </Text>
      ) : null}

      <View style={styles.itemFooter}>
        {item.isSigned ? (
          <View style={styles.signedBadge}>
            <MaterialIcons name="check-circle" size={16} color={colors.success[600]} />
            <Text style={[textStyles.caption, styles.signedText]}>Подписан</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.signButton]}
            onPress={() => handleSign(item)}
          >
            <Text style={buttonStyles.buttonPrimaryText}>Подписать</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Электронные рецепты</Text>
        {user && user.role === 'doctor' && (
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreate(true)}>
            <MaterialIcons name="add" size={26} color={colors.primary[600]} />
          </TouchableOpacity>
        )}
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
          data={prescriptions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="receipt-long" size={48} color={colors.text.tertiary} />
              <Text style={[textStyles.bodySmall, styles.emptyText]}>Рецептов нет</Text>
            </View>
          }
        />
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[cardStyles.cardBase, styles.modalContent]}>
            <View style={styles.modalHeader}>
              <Text style={[textStyles.h5, styles.modalTitle]}>Новый рецепт</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.modalClose}>
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <Text style={[textStyles.caption, styles.label]}>Диагноз</Text>
            <TextInput
              style={styles.input}
              placeholder="Диагноз"
              placeholderTextColor={colors.text.tertiary}
              value={form.diagnosis}
              onChangeText={(v) => setForm({ ...form, diagnosis: v })}
            />

            <Text style={[textStyles.caption, styles.label]}>Назначения (каждое с новой строки)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder={'Парацетамол 500мг\nИбупрофен 200мг'}
              placeholderTextColor={colors.text.tertiary}
              value={form.medications}
              onChangeText={(v) => setForm({ ...form, medications: v })}
              multiline
            />

            <Text style={[textStyles.caption, styles.label]}>Рекомендации</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Рекомендации"
              placeholderTextColor={colors.text.tertiary}
              value={form.recommendations}
              onChangeText={(v) => setForm({ ...form, recommendations: v })}
              multiline
            />

            <TouchableOpacity
              style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.createButton]}
              onPress={handleCreate}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={buttonStyles.buttonPrimaryText}>Создать рецепт</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  headerTitle: { color: colors.text.primary, flex: 1 },
  addButton: { padding: spacing[1] },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  item: { padding: spacing[4], marginBottom: spacing[2] },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] },
  itemTitle: { flex: 1, marginLeft: spacing[2], color: colors.text.primary },
  itemDate: { color: colors.text.tertiary },
  medication: { color: colors.text.secondary, marginBottom: spacing[1] },
  itemMeta: { color: colors.text.tertiary, marginTop: spacing[1] },
  itemFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[2] },
  signedBadge: { flexDirection: 'row', alignItems: 'center' },
  signedText: { marginLeft: spacing[1], color: colors.success[600] },
  signButton: { paddingVertical: spacing[1], paddingHorizontal: spacing[3], borderRadius: spacing[2] },
  errorText: { marginTop: spacing[2], color: colors.text.secondary, textAlign: 'center' },
  retryButton: { marginTop: spacing[4] },
  emptyText: { marginTop: spacing[2], color: colors.text.tertiary },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: spacing[4],
  },
  modalContent: { width: '100%', maxWidth: 420, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[3] },
  modalTitle: { flex: 1, color: colors.text.primary },
  modalClose: { padding: spacing[1] },
  label: { color: colors.text.secondary, marginBottom: spacing[1] },
  input: {
    borderWidth: 1, borderColor: colors.border.primary,
    borderRadius: spacing[2], padding: spacing[3],
    color: colors.text.primary, backgroundColor: colors.surface.primary,
    marginBottom: spacing[3],
  },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  createButton: { alignItems: 'center' },
});

export default EPrescriptionsScreen;
