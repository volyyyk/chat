/**
 * MedChat Mobile App - File Preview Component
 * Reusable file preview component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles } from '../styles/commonStyles';
import { formatFileSize, formatDateTime } from '../utils/formatters';
import { getFileExtension } from '../utils/helpers';

const FilePreview = ({
  file,
  onPress,
  onDownload,
  onDelete,
  showDate = true,
  showActions = true,
  isDoctorView = false,
}) => {
  // Get file extension and icon
  const extension = getFileExtension(file.name || file.uri || '');
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension.toLowerCase());
  const isPdf = extension.toLowerCase() === 'pdf';
  const isDoc = ['doc', 'docx', 'txt', 'rtf'].includes(extension.toLowerCase());
  const isExcel = ['xls', 'xlsx', 'csv'].includes(extension.toLowerCase());

  // Get file icon
  const getFileIcon = () => {
    if (isImage) return 'image';
    if (isPdf) return 'picture-as-pdf';
    if (isDoc) return 'description';
    if (isExcel) return 'insert-drive-file';
    return 'insert-drive-file';
  };

  // Get file color
  const getFileColor = () => {
    if (isImage) return colors.secondary[600];
    if (isPdf) return colors.error[600];
    if (isDoc) return colors.primary[600];
    if (isExcel) return colors.success[600];
    return colors.text.secondary;
  };

  return (
    <View style={[styles.container, isDoctorView && styles.doctorContainer]}>
      <TouchableOpacity
        style={styles.fileInfoContainer}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.fileIcon, { backgroundColor: getFileColor() + '20' }]}>
          {isImage && file.uri ? (
            <Image
              source={{ uri: file.uri }}
              style={styles.fileImage}
              resizeMode="cover"
            />
          ) : (
            <MaterialIcons
              name={getFileIcon()}
              size={24}
              color={getFileColor()}
            />
          )}
        </View>

        <View style={styles.fileDetails}>
          <Text style={[textStyles.body, styles.fileName]} numberOfLines={1}>
            {file.name || 'Неизвестный файл'}
          </Text>
          <View style={styles.fileMeta}>
            <Text style={[textStyles.caption, styles.fileSize]}>
              {formatFileSize(file.size || 0)}
            </Text>
            {showDate && file.createdAt && (
              <Text style={[textStyles.caption, styles.fileDate]}>
                {formatDateTime(file.createdAt)}
              </Text>
            )}
          </View>
          {file.extension && (
            <Text style={[textStyles.caption, styles.fileExtension]}>
              {file.extension.toUpperCase()}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {showActions && (
        <View style={styles.actionsContainer}>
          {onDownload && (
            <TouchableOpacity
              style={[styles.actionButton, styles.downloadButton]}
              onPress={onDownload}
            >
              <MaterialIcons name="download" size={20} color={colors.primary[600]} />
            </TouchableOpacity>
          )}
          {onDelete && isDoctorView && (
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={onDelete}
            >
              <MaterialIcons name="delete" size={20} color={colors.error[500]} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    backgroundColor: colors.surface.primary,
    borderRadius: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.primary,
    marginBottom: spacing[1],
  },
  
  doctorContainer: {
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  
  fileInfoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  fileIcon: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[2],
  },
  
  fileImage: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: spacing[1],
  },
  
  fileDetails: {
    flex: 1,
  },
  
  fileName: {
    color: colors.text.primary,
  },
  
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[0.5],
  },
  
  fileSize: {
    color: colors.text.tertiary,
  },
  
  fileDate: {
    color: colors.text.tertiary,
  },
  
  fileExtension: {
    marginTop: spacing[0.5],
    color: colors.text.tertiary,
    fontSize: 10,
  },
  
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  
  actionButton: {
    padding: spacing[1],
    borderRadius: spacing[1],
  },
  
  downloadButton: {
    backgroundColor: colors.primary[50],
  },
  
  deleteButton: {
    backgroundColor: colors.error[50],
  },
});

// Helper function to extract file extension
const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

export default FilePreview;
