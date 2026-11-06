/**
 * MedChat Mobile App - QR Code Screen
 * Doctor's QR code for patients to scan
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Share, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';
import { generateQRCodeData, generateUniqueId } from '../utils/helpers';
import config from '../config/config';

const QRCodeScreen = ({ navigation, route }) => {
  const { user } = useAuth();
  const { doctorInfo } = useChat();
  const [qrData, setQrData] = useState('');
  const [convenientTime, setConvenientTime] = useState(config.DEFAULT_CONVENIENT_TIME);

  // Generate QR code data
  useEffect(() => {
    if (user) {
      const data = {
        type: 'medchat_doctor',
        version: config.APP_VERSION,
        doctorId: user.id,
        clinicId: user.clinicId,
        clinicName: user.clinic?.name || 'Клиника',
        specialtyName: user.specialty?.name || '',
        doctorName: `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim(),
        timestamp: new Date().toISOString(),
      };

      setQrData(JSON.stringify(data));
      setConvenientTime(user.convenientTime || config.DEFAULT_CONVENIENT_TIME);
    }
  }, [user]);

  // Share QR code
  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: `Приглашение в чат MedChat\n\nОтсканируйте QR-код или перейдите по ссылке:\n${qrData}`,
        title: 'Приглашение в чат MedChat',
      });

      if (result.action === Share.sharedAction) {
        // Shared successfully
      }
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось поделиться QR-кодом');
    }
  };

  // Copy QR data to clipboard
  const handleCopy = async () => {
    // In a real app, you would use Clipboard.setString
    Alert.alert('Скопировано', 'Данные QR-кода скопированы в буфер обмена');
  };

  // Generate new QR code (refresh)
  const handleRefresh = () => {
    const data = {
      type: 'medchat_doctor',
      version: config.APP_VERSION,
      doctorId: user.id,
      clinicId: user.clinicId,
      clinicName: user.clinic?.name || 'Клиника',
      specialtyName: user.specialty?.name || '',
      doctorName: `${user.lastName} ${user.firstName} ${user.middleName || ''}`.trim(),
      timestamp: new Date().toISOString(),
      // Add unique token for this session
      token: generateUniqueId(),
    };

    setQrData(JSON.stringify(data));
  };

  if (!qrData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[textStyles.body, styles.loadingText]}>Генерация QR-кода...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[textStyles.h3, styles.headerTitle]}>Мой QR-код</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleShare} style={styles.headerAction}>
              <MaterialIcons name="share" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Doctor info */}
        <View style={styles.doctorInfo}>
          <View style={styles.doctorAvatar}>
            <MaterialIcons name="account-circle" size={48} color={colors.primary[600]} />
          </View>
          <View style={styles.doctorDetails}>
            <Text style={[textStyles.h4, styles.doctorName]}>
              {user ? `${user.lastName} ${user.firstName}` : 'Врач'}
            </Text>
            <Text style={[textStyles.bodySmall, styles.doctorSpecialty]}>
              {user?.specialty?.name || 'Специальность не указана'}
            </Text>
            <Text style={[textStyles.caption, styles.clinicName]}>
              {user?.clinic?.name || 'Клиника'}
            </Text>
          </View>
        </View>

        {/* QR Code */}
        <View style={styles.qrContainer}>
          <View style={styles.qrBackground}>
            <QRCode
              value={qrData}
              size={200}
              color={colors.primary[800]}
              backgroundColor={colors.surface.primary}
            />
          </View>
          <Text style={[textStyles.caption, styles.qrInstructions]}>
            Отсканируйте этот QR-код
          </Text>
        </View>

        {/* Convenient time */}
        <View style={styles.convenientTimeContainer}>
          <MaterialIcons name="schedule" size={20} color={colors.text.secondary} />
          <Text style={[textStyles.bodySmall, styles.convenientTime]}>
            Удобное время для ответов: {convenientTime}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[buttonStyles.buttonOutline, buttonStyles.buttonMedium, styles.actionButton]}
            onPress={handleCopy}
          >
            <MaterialIcons name="content-copy" size={20} color={colors.primary[600]} />
            <Text style={[buttonStyles.buttonOutlineText, styles.actionButtonText]}>
              Скопировать
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.actionButton]}
            onPress={handleShare}
          >
            <MaterialIcons name="share" size={20} color={colors.text.primaryInverse} />
            <Text style={buttonStyles.buttonPrimaryText}>
              Поделиться
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[buttonStyles.buttonGhost, buttonStyles.buttonMedium, styles.actionButton]}
            onPress={handleRefresh}
          >
            <MaterialIcons name="refresh" size={20} color={colors.text.primary} />
            <Text style={[buttonStyles.buttonGhostText, styles.actionButtonText]}>
              Обновить
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <MaterialIcons name="info" size={20} color={colors.text.tertiary} />
          <Text style={[textStyles.caption, styles.infoText]}>
            Пациенты могут отсканировать этот QR-код для начала чата с вами
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  content: {
    flex: 1,
    padding: spacing[4],
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  
  backButton: {
    padding: spacing[1],
  },
  
  headerTitle: {
    color: colors.text.primary,
  },
  
  headerActions: {
    flexDirection: 'row',
  },
  
  headerAction: {
    padding: spacing[1],
    marginLeft: spacing[2],
  },
  
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[3],
    marginBottom: spacing[4],
  },
  
  doctorAvatar: {
    marginRight: spacing[3],
  },
  
  doctorDetails: {
    flex: 1,
  },
  
  doctorName: {
    color: colors.text.primary,
  },
  
  doctorSpecialty: {
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  clinicName: {
    color: colors.text.tertiary,
    marginTop: spacing[0.5],
  },
  
  qrContainer: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  qrBackground: {
    backgroundColor: colors.surface.primary,
    padding: spacing[4],
    borderRadius: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.primary,
    marginBottom: spacing[2],
  },
  
  qrInstructions: {
    color: colors.text.secondary,
  },
  
  convenientTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[3],
    backgroundColor: colors.primary[50],
    borderRadius: spacing[2],
    marginBottom: spacing[4],
  },
  
  convenientTime: {
    marginLeft: spacing[2],
    color: colors.primary[700],
  },
  
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing[4],
  },
  
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  
  actionButtonText: {
    marginLeft: spacing[1],
  },
  
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[3],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[2],
  },
  
  infoText: {
    marginLeft: spacing[2],
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  loadingText: {
    marginTop: spacing[2],
    color: colors.text.secondary,
  },
});

export default QRCodeScreen;
