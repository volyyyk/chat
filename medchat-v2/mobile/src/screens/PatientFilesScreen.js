/**
 * Patient Files Screen (doctor view)
 * Files attached to the patient card, sortable by time and name
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../hooks/useAuth';
import { fileService } from '../services/fileService';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

const PatientFilesScreen = ({ navigation, route }) => {
  const { chatId, patientId, patientName } = route.params || {};
  const { token } = useAuth();
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [sortBy, setSortBy] = useState('time'); // 'time' | 'name'
  const [error, setError] = useState(null);

  const loadFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = chatId ? { chatId } : {};
      const result = await fileService.list(token, params);
      if (!result.success) throw new Error(result.message);
      setFiles(result.files || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [token, chatId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const sortedFiles = () => {
    const copy = [...files];
    if (sortBy === 'name') {
      copy.sort((a, b) => (a.originalName || a.name || '').localeCompare(b.originalName || b.name || '', 'ru'));
    } else {
      copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return copy;
  };

  const handleSort = () => {
    setSortBy(sortBy === 'time' ? 'name' : 'time');
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.type !== 'success') return;

      Alert.alert(
        'Отправить файл',
        'Файлы, загруженные врачом, хранятся на сервере 3 дня, затем автоматически удаляются. Продолжить?',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Отправить',
            onPress: async () => {
              setIsUploading(true);
              const uploadResult = await fileService.upload(
                token,
                result.uri,
                result.name,
                result.mimeType,
                {
                  chatId,
                  type: 'doctor_upload',
                  autoDelete: true,
                  deleteAfterDays: 3,
                  visibility: 'doctor_only',
                }
              );
              setIsUploading(false);
              if (!uploadResult.success) {
                Alert.alert('Ошибка', uploadResult.message);
                return;
              }
              loadFiles();
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Ошибка', err.message);
    }
  };

  const handleDownload = async (file) => {
    try {
      const url = fileService.getDownloadUrl(token, file.id);
      const target = FileSystem.cacheDirectory + (file.originalName || file.name || 'file');
      const download = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(download.uri);
      } else {
        Alert.alert('Готово', 'Файл скачан: ' + download.uri);
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось скачать файл');
    }
  };

  const handleDelete = (file) => {
    Alert.alert('Удалить файл?', (file.originalName || file.name || '') + ' будет удален безвозвратно.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const result = await fileService.remove(token, file.id);
          if (!result.success) {
            Alert.alert('Ошибка', result.message);
            return;
          }
          loadFiles();
        },
      },
    ]);
  };

  const renderFile = ({ item }) => (
    <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.fileCard]}>
      <MaterialIcons name="description" size={28} color={colors.primary[600]} />
      <View style={styles.fileInfo}>
        <Text style={[textStyles.bodySmall, styles.fileName]} numberOfLines={1}>
          {item.originalName || item.name}
        </Text>
        <Text style={[textStyles.caption, styles.fileMeta]}>
          {formatSize(item.size)} · {formatDate(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity style={styles.fileAction} onPress={() => handleDownload(item)}>
        <MaterialIcons name="download" size={22} color={colors.text.secondary} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.fileAction} onPress={() => handleDelete(item)}>
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
        <View style={styles.headerText}>
          <Text style={[textStyles.h5, styles.headerTitle]} numberOfLines={1}>
            {patientName || 'Файлы пациента'}
          </Text>
          <Text style={[textStyles.caption, styles.headerSubtitle]}>Файлы и информация</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.sortButton} onPress={handleSort}>
          <MaterialIcons name="sort" size={20} color={colors.primary[600]} />
          <Text style={styles.sortText}>
            Сортировка: {sortBy === 'time' ? 'по времени' : 'по названию'}
          </Text>
        </TouchableOpacity>
        <Text style={[textStyles.caption, styles.countText]}>Всего: {files.length}</Text>
      </View>

      {isUploading && (
        <View style={styles.uploadingRow}>
          <ActivityIndicator size="small" color={colors.primary[600]} />
          <Text style={[textStyles.caption, styles.uploadingText]}>Загрузка файла...</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error" size={48} color={colors.error[500]} />
          <Text style={[textStyles.bodySmall, styles.errorText]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedFiles()}
          keyExtractor={(item) => item.id}
          renderItem={renderFile}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadFiles} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="folder-open" size={48} color={colors.text.tertiary} />
              <Text style={[textStyles.bodySmall, styles.emptyText]}>Файлов пока нет</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.uploadButton]}
        onPress={handlePickFile}
        disabled={isUploading}
      >
        <Text style={buttonStyles.buttonPrimaryText}>Загрузить новый файл</Text>
      </TouchableOpacity>
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
  headerText: { flex: 1 },
  headerTitle: { color: colors.text.primary },
  headerSubtitle: { color: colors.text.tertiary },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[4], marginBottom: spacing[2],
  },
  sortButton: { flexDirection: 'row', alignItems: 'center' },
  sortText: { marginLeft: spacing[1], color: colors.primary[600], fontSize: 13 },
  countText: { color: colors.text.tertiary },
  uploadingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingVertical: spacing[1],
  },
  uploadingText: { marginLeft: spacing[2], color: colors.text.secondary },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[6] },
  fileCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[2],
  },
  fileInfo: { flex: 1, marginLeft: spacing[3], marginRight: spacing[2] },
  fileName: { color: colors.text.primary },
  fileMeta: { color: colors.text.tertiary, marginTop: spacing[0.5] },
  fileAction: { padding: spacing[1], marginLeft: spacing[1] },
  uploadButton: {
    margin: spacing[4], alignItems: 'center',
  },
  errorText: { marginTop: spacing[2], color: colors.text.secondary, textAlign: 'center' },
  emptyText: { marginTop: spacing[2], color: colors.text.tertiary },
});

export default PatientFilesScreen;
