/**
 * Backup Screen
 * Encrypted cloud backup with password + local export/import
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, Switch, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../hooks/useAuth';
import { backupService } from '../services/backupService';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

const BackupScreen = ({ navigation }) => {
  const { token } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [backups, setBackups] = useState([]);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [listResult, settingsResult] = await Promise.all([
        backupService.list(token),
        backupService.getSettings(token),
      ]);
      if (listResult.success) setBackups(listResult.backups);
      if (settingsResult.success) setSettings(settingsResult.settings);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const validatePassword = () => {
    if (password.length < 8) {
      Alert.alert('Пароль', 'Пароль должен быть не короче 8 символов');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Пароль', 'Пароли не совпадают');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validatePassword()) return;
    setIsWorking(true);
    const result = await backupService.create(token, password);
    setIsWorking(false);
    if (!result.success) {
      Alert.alert('Ошибка', result.message);
      return;
    }
    Alert.alert('Готово', 'Зашифрованная копия создана');
    setConfirmPassword('');
    loadAll();
  };

  const handleRestore = (backup) => {
    Alert.alert(
      'Восстановление',
      'Введите пароль от копии для восстановления данных. Текущие данные будут заменены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Восстановить',
          onPress: async () => {
            if (!restorePassword) {
              Alert.alert('Пароль', 'Введите пароль от копии в поле выше');
              return;
            }
            setIsWorking(true);
            const verify = await backupService.verifyPassword(token, backup.id, restorePassword);
            if (!verify.success || !verify.valid) {
              setIsWorking(false);
              Alert.alert('Ошибка', 'Неверный пароль копии');
              return;
            }
            const result = await backupService.restore(token, backup.id, restorePassword);
            setIsWorking(false);
            if (result.success) {
              Alert.alert('Готово', 'Данные восстановлены');
            } else {
              Alert.alert('Ошибка', result.message);
            }
          },
        },
      ]
    );
  };

  const handleDelete = (backup) => {
    Alert.alert('Удалить копию?', 'Копия будет удалена безвозвратно.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const result = await backupService.remove(token, backup.id, restorePassword);
          if (!result.success) {
            Alert.alert('Ошибка', result.message);
            return;
          }
          loadAll();
        },
      },
    ]);
  };

  const handleExport = async () => {
    if (!validatePassword()) return;
    setIsWorking(true);
    const result = await backupService.exportLocal(token, password);
    setIsWorking(false);
    if (!result.success || !result.downloadUrl) {
      Alert.alert('Ошибка', result.message || 'Не удалось экспортировать');
      return;
    }
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.downloadUrl);
      } else {
        Alert.alert('Готово', 'Файл сохранен: ' + result.downloadUrl);
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось сохранить файл');
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.type !== 'success') return;
      if (!restorePassword) {
        Alert.alert('Пароль', 'Введите пароль от файла копии в поле выше');
        return;
      }
      setIsWorking(true);
      const importResult = await backupService.importLocal(token, result.uri, result.name, restorePassword);
      setIsWorking(false);
      if (!importResult.success) {
        Alert.alert('Ошибка', importResult.message);
        return;
      }
      Alert.alert('Готово', 'Данные импортированы');
      loadAll();
    } catch (err) {
      Alert.alert('Ошибка', err.message);
    }
  };

  const handleAutoBackupToggle = async (value) => {
    const updated = { ...(settings || {}), autoBackup: value };
    setSettings(updated);
    await backupService.updateSettings(token, { autoBackup: value });
  };

  const renderItem = ({ item }) => (
    <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.backupItem]}>
      <View style={styles.backupInfo}>
        <Text style={[textStyles.bodySmall, styles.backupName]}>
          Копия от {formatDate(item.createdAt)}
        </Text>
        <Text style={[textStyles.caption, styles.backupMeta]}>
          {item.type === 'auto' ? 'Автоматическая' : 'Ручная'} · {item.status || 'completed'}
        </Text>
      </View>
      <TouchableOpacity style={styles.backupAction} onPress={() => handleRestore(item)}>
        <MaterialIcons name="restore" size={22} color={colors.primary[600]} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.backupAction} onPress={() => handleDelete(item)}>
        <MaterialIcons name="delete-outline" size={22} color={colors.error[500]} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Резервные копии</Text>
      </View>

      {isWorking && (
        <View style={styles.workingRow}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <FlatList
          data={backups}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadAll} />}
          ListHeaderComponent={
            <View>
              <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.card]}>
                <Text style={[textStyles.bodySmall, styles.paragraph]}>
                  Копия шифруется вашим паролем по схеме XChaCha20-Poly1305.
                  Без пароля восстановить данные невозможно. Пароль не
                  передается на сервер в открытом виде.
                </Text>

                <Text style={[textStyles.bodySmall, styles.label]}>Пароль для новой копии</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Минимум 8 символов"
                  placeholderTextColor={colors.text.tertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                <Text style={[textStyles.bodySmall, styles.label]}>Подтвердите пароль</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Повторите пароль"
                  placeholderTextColor={colors.text.tertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.actionButton]}
                  onPress={handleCreate}
                  disabled={isWorking}
                >
                  <Text style={buttonStyles.buttonPrimaryText}>Создать облачную копию</Text>
                </TouchableOpacity>

                <View style={styles.rowButtons}>
                  <TouchableOpacity
                    style={[buttonStyles.buttonSecondary, buttonStyles.buttonMedium, styles.halfButton]}
                    onPress={handleExport}
                    disabled={isWorking}
                  >
                    <Text style={buttonStyles.buttonSecondaryText}>Экспорт на устройство</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[buttonStyles.buttonSecondary, buttonStyles.buttonMedium, styles.halfButton]}
                    onPress={handleImport}
                    disabled={isWorking}
                  >
                    <Text style={buttonStyles.buttonSecondaryText}>Импорт из файла</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.card]}>
                <View style={styles.switchRow}>
                  <Text style={[textStyles.bodySmall, styles.switchLabel]}>
                    Автоматическое копирование
                  </Text>
                  <Switch
                    value={!!(settings && settings.autoBackup)}
                    onValueChange={handleAutoBackupToggle}
                    trackColor={{ false: colors.border.primary, true: colors.primary[600] }}
                  />
                </View>
                <Text style={[textStyles.caption, styles.switchNote]}>
                  Пароль авточастых копий совпадает с паролем последней ручной копии
                </Text>
              </View>

              <Text style={[textStyles.bodySmall, styles.label]}>
                Пароль существующей копии (для восстановления и импорта)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Пароль от копии"
                placeholderTextColor={colors.text.tertiary}
                value={restorePassword}
                onChangeText={setRestorePassword}
                secureTextEntry
              />

              <Text style={[textStyles.h5, styles.listTitle]}>Мои копии ({backups.length})</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="cloud-off" size={48} color={colors.text.tertiary} />
              <Text style={[textStyles.bodySmall, styles.emptyText]}>Копий пока нет</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[2],
  },
  backButton: { padding: spacing[1], marginRight: spacing[2] },
  headerTitle: { color: colors.text.primary },
  workingRow: { alignItems: 'center', paddingVertical: spacing[1] },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[8] },
  card: { padding: spacing[4], marginBottom: spacing[3] },
  paragraph: { color: colors.text.secondary, marginBottom: spacing[3], lineHeight: 20 },
  label: { color: colors.text.secondary, marginBottom: spacing[2] },
  input: {
    borderWidth: 1, borderColor: colors.border.primary,
    borderRadius: spacing[2], padding: spacing[3],
    color: colors.text.primary, backgroundColor: colors.surface.primary,
    marginBottom: spacing[3],
  },
  actionButton: { alignItems: 'center' },
  rowButtons: { flexDirection: 'row', gap: spacing[2] },
  halfButton: { flex: 1, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { color: colors.text.primary, flex: 1, marginRight: spacing[2] },
  switchNote: { color: colors.text.tertiary, marginTop: spacing[2] },
  listTitle: { color: colors.text.primary, marginVertical: spacing[3] },
  backupItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[2],
  },
  backupInfo: { flex: 1 },
  backupName: { color: colors.text.primary },
  backupMeta: { color: colors.text.tertiary, marginTop: spacing[0.5] },
  backupAction: { padding: spacing[1], marginLeft: spacing[1] },
  emptyText: { marginTop: spacing[2], color: colors.text.tertiary },
});

export default BackupScreen;
