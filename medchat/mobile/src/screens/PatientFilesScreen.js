/**
 * Patient Files Screen
 * 
 * Displays files uploaded by doctor for a specific patient
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  SafeAreaView,
  ScrollView,
  FlatList,
  RefreshControl,
  Alert,
  Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useDoctor } from '../services/DoctorService';
import LoadingOverlay from '../components/common/LoadingOverlay';
import ErrorModal from '../components/common/ErrorModal';
import config from '../config';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const PatientFilesScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { patient } = route.params || {};
  const { theme } = useTheme();
  
  const { 
    getFilesForPatient,
    addFileToPatient,
    deleteFileFromPatient,
    isLoading: isDoctorLoading
  } = useDoctor();
  
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Load files
  useEffect(() => {
    if (patient?.id) {
      loadFiles();
    }
  }, [patient]);

  // Load files
  const loadFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setRefreshing(true);
      
      const loadedFiles = await getFilesForPatient(patient.id);
      setFiles(loadedFiles);
      
      setIsLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to load files' 
      });
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [patient, getFilesForPatient]);

  // Add file
  const handleAddFile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Open document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: config.files.allowedTypes,
        copyToCacheDirectory: true
      });
      
      if (result.canceled) {
        setIsLoading(false);
        return;
      }
      
      const { uri, name, size, mimeType } = result.assets[0];
      
      // Check file size
      if (size > config.files.maxSize) {
        setError({ 
          title: 'Error', 
          message: `File size exceeds maximum limit of ${config.files.maxSize / (1024 * 1024)}MB` 
        });
        setIsLoading(false);
        return;
      }
      
      // Create file record
      const fileRecord = {
        id: Date.now().toString(),
        name,
        type: mimeType,
        size,
        uri,
        description: ''
      };
      
      // Add file to patient
      await addFileToPatient(patient.id, fileRecord);
      
      // Reload files
      await loadFiles();
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to add file:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to add file' 
      });
      setIsLoading(false);
    }
  }, [patient, addFileToPatient, loadFiles]);

  // Delete file
  const handleDeleteFile = (file) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await deleteFileFromPatient(file.id);
              await loadFiles();
              setIsLoading(false);
            } catch (err) {
              console.error('Failed to delete file:', err);
              setError({ 
                title: 'Error', 
                message: err.message || 'Failed to delete file' 
              });
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  // Open file
  const handleOpenFile = async (file) => {
    try {
      if (Platform.OS === 'android') {
        // On Android, we can open the file directly
        await FileSystem.getContentUriAsync(file.uri);
      } else {
        // On iOS, we can share the file
        Alert.alert(
          'File',
          `File: ${file.name}\nSize: ${formatFileSize(file.size)}\nType: ${file.type}`,
          [
            { text: 'OK' }
          ]
        );
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      setError({ 
        title: 'Error', 
        message: err.message || 'Failed to open file' 
      });
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) {
      return `${bytes} bytes`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
  };

  // Format date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle error dismiss
  const handleErrorDismiss = () => {
    setError(null);
  };

  // Navigate back
  const navigateBack = () => {
    navigation.goBack();
  };

  // Render file item
  const renderFileItem = ({ item }) => {
    // Get file extension
    const extension = item.name.split('.').pop().toLowerCase();
    
    // Get file icon based on type
    const getFileIcon = () => {
      if (item.type?.startsWith('image/')) return '📷';
      if (item.type?.startsWith('video/')) return '🎥';
      if (item.type?.startsWith('audio/')) return '🎵';
      if (item.type === 'application/pdf') return '📄';
      if (extension === 'doc' || extension === 'docx') return '📝';
      if (extension === 'xls' || extension === 'xlsx') return '📊';
      if (extension === 'txt') return '📃';
      return '📁';
    };
    
    return (
      <TouchableOpacity
        style={[styles.fileItem, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}
        onPress={() => handleOpenFile(item)}
      >
        <View style={styles.fileIcon}>
          <Text style={styles.fileIconText}>{getFileIcon()}</Text>
        </View>
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: theme.colors.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.fileMeta, { color: theme.colors.textSecondary }]}>
            {formatFileSize(item.size)} • {item.type || 'Unknown'}
          </Text>
        </View>
        <View style={styles.fileActions}>
          <Text style={[styles.fileDate, { color: theme.colors.textSecondary }]}>
            {formatDate(item.uploadedAt)}
          </Text>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.colors.error + '20' }]}
            onPress={() => handleDeleteFile(item)}
          >
            <Text style={[styles.deleteButtonText, { color: theme.colors.error }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
          <Text style={[styles.backButtonText, { color: theme.colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {patient?.name || `Patient ${patient?.uniqueId?.substring(0, 8)}`}
        </Text>
        <View style={styles.headerSpace} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadFiles}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Description */}
        <View style={styles.description}>
          <Text style={[styles.descriptionText, { color: theme.colors.textSecondary }]}>
            Files uploaded for this patient are only visible to you and stored locally on your device.
          </Text>
        </View>

        {/* Statistics */}
        <View style={[styles.stats, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border
        }]}>
          <Text style={[styles.statsText, { color: theme.colors.textSecondary }]}>
            {files.length} files uploaded
          </Text>
        </View>

        {/* File List */}
        {files.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
              No files uploaded yet
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: theme.colors.textSecondary }]}>
              Tap the + button to add files to this patient's record
            </Text>
          </View>
        ) : (
          <FlatList
            data={files}
            renderItem={renderFileItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.fileList}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      {/* Add File Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.colors.primary }]}
        onPress={handleAddFile}
        disabled={isLoading}
      >
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#00000020'
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
  scrollContainer: {
    padding: 16
  },
  description: {
    marginBottom: 16
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20
  },
  stats: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16
  },
  statsText: {
    fontSize: 14
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyStateText: {
    fontSize: 16,
    marginBottom: 8
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center'
  },
  fileList: {
    gap: 12
  },
  fileItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.1)'
  },
  fileIconText: {
    fontSize: 24
  },
  fileInfo: {
    flex: 1
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4
  },
  fileMeta: {
    fontSize: 12
  },
  fileActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  fileDate: {
    fontSize: 12
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    minWidth: 80
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600'
  },
  addButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8
  },
  addButtonText: {
    fontSize: 24,
    color: '#FFFFFF'
  }
});

export default PatientFilesScreen;
