/**
 * MedChat Mobile App - Settings Screen
 * Application settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Switch, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { database } from '../services/database';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';
import config from '../config/config';

const SettingsScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const { settings, configureSettings, getSettings } = useNotifications();
  const [notificationSettings, setNotificationSettings] = useState({
    newMessage: true,
    appointmentReminder: true,
    fileUpload: true,
    system: true,
    sound: true,
    vibration: true,
  });
  const [convenientTime, setConvenientTime] = useState(config.DEFAULT_CONVENIENT_TIME);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        
        // Load notification settings
        const savedSettings = await getSettings();
        if (savedSettings) {
          setNotificationSettings({
            newMessage: savedSettings.newMessage !== false,
            appointmentReminder: savedSettings.appointmentReminder !== false,
            fileUpload: savedSettings.fileUpload !== false,
            system: savedSettings.system !== false,
            sound: savedSettings.sound !== false,
            vibration: savedSettings.vibration !== false,
          });
        }

        // Load convenient time (for doctors)
        if (user?.role === 'doctor') {
          const userData = await database.getUserData();
          setConvenientTime(userData?.convenientTime || config.DEFAULT_CONVENIENT_TIME);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [getSettings, user]);

  // Save notification settings
  const handleNotificationToggle = useCallback(async (key, value) => {
    const newSettings = { ...notificationSettings, [key]: value };
    setNotificationSettings(newSettings);

    try {
      await configureSettings(newSettings);
    } catch (err) {
      console.error('Error saving notification settings:', err);
      // Revert if error
      setNotificationSettings({ ...notificationSettings, [key]: !value });
    }
  }, [notificationSettings, configureSettings]);

  // Navigate to profile
  const handleProfilePress = useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);

  // Navigate to backup
  const handleBackupPress = useCallback(() => {
    navigation.navigate('Backup');
  }, [navigation]);

  // Navigate to balance
  const handleBalancePress = useCallback(() => {
    navigation.navigate('Balance');
  }, [navigation]);

  // Navigate to notifications settings
  const handleNotificationsPress = useCallback(() => {
    navigation.navigate('NotificationsSettings');
  }, [navigation]);

  // Navigate to legal
  const handleLegalPress = useCallback((type) => {
    navigation.navigate('Legal', { type });
  }, [navigation]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('ModeSelection');
          },
        },
      ]
    );
  }, [logout, navigation]);

  // Render section
  const renderSection = useCallback((title, children) => {
    return (
      <View style={styles.section}>
        <Text style={[textStyles.h5, styles.sectionTitle]}>{title}</Text>
        {children}
      </View>
    );
  }, []);

  // Render setting item
  const renderSettingItem = useCallback((icon, title, subtitle, onPress, disabled = false) => {
    return (
      <TouchableOpacity
        style={[cardStyles.cardBase, styles.settingItem, disabled && styles.settingItemDisabled]}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.settingIcon}>
          <MaterialIcons name={icon} size={24} color={colors.text.secondary} />
        </View>
        <View style={styles.settingInfo}>
          <Text style={[textStyles.body, styles.settingTitle]}>{title}</Text>
          {subtitle && (
            <Text style={[textStyles.caption, styles.settingSubtitle]}>{subtitle}</Text>
          )}
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.text.tertiary} />
      </TouchableOpacity>
    );
  }, []);

  // Render toggle setting
  const renderToggleSetting = useCallback((icon, title, subtitle, value, onToggle, disabled = false) => {
    return (
      <View style={[cardStyles.cardBase, styles.settingItem, disabled && styles.settingItemDisabled]}>
        <View style={styles.settingIcon}>
          <MaterialIcons name={icon} size={24} color={colors.text.secondary} />
        </View>
        <View style={styles.settingInfo}>
          <Text style={[textStyles.body, styles.settingTitle]}>{title}</Text>
          {subtitle && (
            <Text style={[textStyles.caption, styles.settingSubtitle]}>{subtitle}</Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: colors.border.tertiary, true: colors.primary[600] }}
          thumbColor={value ? colors.primary[600] : colors.border.tertiary}
        />
      </View>
    );
  }, []);

  // Render doctor-specific settings
  const renderDoctorSettings = useCallback(() => {
    if (user?.role !== 'doctor') return null;

    return (
      <>
        {renderSection('Рабочее время', (
          <View style={styles.convenientTimeContainer}>
            <View style={styles.convenientTimeInfo}>
              <MaterialIcons name="schedule" size={24} color={colors.text.secondary} />
              <View style={styles.convenientTimeText}>
                <Text style={[textStyles.body, styles.convenientTimeTitle]}>
                  Удобное время для ответов
                </Text>
                <Text style={[textStyles.caption, styles.convenientTimeValue]}>
                  {convenientTime}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.convenientTimeEdit}
              onPress={() => navigation.navigate('EditConvenientTime')}
            >
              <Text style={[textStyles.link, styles.editLink]}>Изменить</Text>
            </TouchableOpacity>
          </View>
        ))}

        {renderSection('Финансы', (
          <>
            {renderSettingItem('account-balance-wallet', 'Баланс', 'Управление балансом', handleBalancePress)}
            {renderSettingItem('receipt', 'Транзакции', 'История транзакций', () => navigation.navigate('Transactions'))}
          </>
        ))}

        {renderSection('Управление', (
          <>
            {renderSettingItem('qr-code', 'Мой QR-код', 'Сгенерировать QR-код для пациентов', () => navigation.navigate('QRCode'))}
            {renderSettingItem('group', 'Пациенты', 'Список всех пациентов', () => navigation.navigate('Patients'))}
            {renderSettingItem('backup', 'Экспорт/Импорт', 'Экспорт и импорт данных', handleBackupPress)}
          </>
        ))}
      </>
    );
  }, [user, convenientTime, navigation, handleBalancePress, handleBackupPress]);

  // Render patient-specific settings
  const renderPatientSettings = useCallback(() => {
    if (user?.role !== 'patient') return null;

    return (
      <>
        {renderSection('Чаты', (
          <>
            {renderSettingItem('qr-code-scanner', 'Отсканировать QR', 'Добавить новый чат', () => navigation.navigate('PatientSetup'))}
            {renderSettingItem('chat', 'Все чаты', 'Список всех чатов', () => navigation.navigate('Chats'))}
          </>
        ))}
      </>
    );
  }, [user, navigation]);

  // Main render
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[textStyles.h3, styles.headerTitle]}>Настройки</Text>
        </View>

        {/* User info */}
        <View style={styles.userInfoContainer}>
          <View style={styles.userInfo}>
            <View style={styles.userInfoAvatar}>
              <MaterialIcons name="account-circle" size={48} color={colors.primary[600]} />
            </View>
            <View style={styles.userInfoText}>
              <Text style={[textStyles.h4, styles.userInfoName]}>
                {user ? `${user.lastName} ${user.firstName}` : 'Пользователь'}
              </Text>
              <Text style={[textStyles.bodySmall, styles.userInfoRole]}>
                {user?.role === 'doctor' ? 'Врач' : 'Пациент'}
              </Text>
            </View>
          </View>
        </View>

        {renderSettingItem('person', 'Профиль', 'Управление профилем', handleProfilePress)}

        {/* Notifications section */}
        {renderSection('Уведомления', (
          <>
            {renderToggleSetting(
              'notifications',
              'Новые сообщения',
              'Получать уведомления о новых сообщениях',
              notificationSettings.newMessage,
              (value) => handleNotificationToggle('newMessage', value)
            )}
            {renderToggleSetting(
              'event',
              'Напоминания о записях',
              'Получать напоминания о предстоящих записях',
              notificationSettings.appointmentReminder,
              (value) => handleNotificationToggle('appointmentReminder', value)
            )}
            {renderToggleSetting(
              'attach-file',
              'Новые файлы',
              'Получать уведомления о новых файлах',
              notificationSettings.fileUpload,
              (value) => handleNotificationToggle('fileUpload', value)
            )}
            {renderToggleSetting(
              'system-update',
              'Системные уведомления',
              'Получать системные уведомления',
              notificationSettings.system,
              (value) => handleNotificationToggle('system', value)
            )}
            
            <TouchableOpacity
              style={[cardStyles.cardBase, styles.settingItem]}
              onPress={handleNotificationsPress}
            >
              <View style={styles.settingIcon}>
                <MaterialIcons name="notifications" size={24} color={colors.text.secondary} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={[textStyles.body, styles.settingTitle]}>Настройки уведомлений</Text>
                <Text style={[textStyles.caption, styles.settingSubtitle]}>
                  Звук, вибрация и другие параметры
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.text.tertiary} />
            </TouchableOpacity>
          </>
        ))}

        {renderDoctorSettings()}
        {renderPatientSettings()}

        {/* Legal section */}
        {renderSection('Правовая информация', (
          <>
            {renderSettingItem(
              'description',
              'Пользовательское соглашение',
              'Условия использования приложения',
              () => handleLegalPress('terms')
            )}
            {renderSettingItem(
              'privacy-tip',
              'Политика конфиденциальности',
              'Как мы обрабатываем ваши данные',
              () => handleLegalPress('privacy')
            )}
            {renderSettingItem(
              'gavel',
              'Оферта',
              'Договор оферты',
              () => handleLegalPress('offer')
            )}
          </>
        ))}

        {/* About section */}
        {renderSection('О приложении', (
          <>
            {renderSettingItem(
              'info',
              'О MedChat',
              `Версия ${config.APP_VERSION}`,
              () => navigation.navigate('About')
            )}
            {renderSettingItem(
              'help',
              'Справка',
              'Часто задаваемые вопросы',
              () => navigation.navigate('Help')
            )}
            {renderSettingItem(
              'feedback',
              'Обратная связь',
              'Сообщить о проблеме или предложить идею',
              () => navigation.navigate('Feedback')
            )}
          </>
        ))}

        {/* Logout */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={[cardStyles.cardBase, styles.logoutButton]}
            onPress={handleLogout}
          >
            <View style={styles.settingIcon}>
              <MaterialIcons name="logout" size={24} color={colors.error[500]} />
            </View>
            <Text style={[textStyles.body, styles.logoutText]}>Выйти</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  scrollContent: {
    padding: spacing[4],
    paddingTop: spacing[6],
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  
  backButton: {
    padding: spacing[1],
    marginRight: spacing[2],
  },
  
  headerTitle: {
    color: colors.text.primary,
  },
  
  userInfoContainer: {
    marginBottom: spacing[4],
  },
  
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.surface.primary,
    borderRadius: spacing[3],
    borderWidth: 1,
    borderColor: colors.border.primary,
  },
  
  userInfoAvatar: {
    marginRight: spacing[3],
  },
  
  userInfoText: {
    flex: 1,
  },
  
  userInfoName: {
    color: colors.text.primary,
  },
  
  userInfoRole: {
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  section: {
    marginBottom: spacing[4],
  },
  
  sectionTitle: {
    marginBottom: spacing[2],
    color: colors.text.secondary,
  },
  
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    marginBottom: spacing[1],
  },
  
  settingItemDisabled: {
    opacity: 0.5,
  },
  
  settingIcon: {
    marginRight: spacing[2],
  },
  
  settingInfo: {
    flex: 1,
  },
  
  settingTitle: {
    color: colors.text.primary,
  },
  
  settingSubtitle: {
    color: colors.text.tertiary,
    marginTop: spacing[0.5],
  },
  
  convenientTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[2],
  },
  
  convenientTimeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  
  convenientTimeText: {
    marginLeft: spacing[2],
  },
  
  convenientTimeTitle: {
    color: colors.text.primary,
  },
  
  convenientTimeValue: {
    color: colors.text.secondary,
    marginTop: spacing[0.5],
  },
  
  convenientTimeEdit: {
    padding: spacing[1],
  },
  
  editLink: {
    color: colors.primary[600],
  },
  
  logoutContainer: {
    marginBottom: spacing[4],
  },
  
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: spacing[2],
  },
  
  logoutText: {
    color: colors.error[600],
  },
});

export default SettingsScreen;
