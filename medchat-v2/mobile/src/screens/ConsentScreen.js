/**
 * Consent Screen
 * Public offer + consent to personal data processing (152-FZ)
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Linking, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const OFFER_URL = 'https://medchat.example.com/docs/OFFER.md';
const PRIVACY_URL = 'https://medchat.example.com/docs/PRIVACY_POLICY.md';

const ConsentScreen = ({ navigation, route }) => {
  const [accepted, setAccepted] = useState(false);
  const [fullName, setFullName] = useState('');

  const openDocument = async (url) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Не удалось открыть документ');
    }
  };

  const handleAccept = async () => {
    if (!fullName.trim()) {
      Alert.alert('ФИО', 'Введите ФИО для фиксации согласия');
      return;
    }
    await AsyncStorage.setItem('consentAccepted', 'true');
    await AsyncStorage.setItem('consentFullName', fullName.trim());
    await AsyncStorage.setItem('consentAcceptedAt', new Date().toISOString());
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.iconRow}>
          <MaterialIcons name="verified-user" size={48} color={colors.primary[600]} />
          <Text style={[textStyles.h4, styles.title]}>Согласие на обработку данных</Text>
        </View>

        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.card]}>
          <Text style={[textStyles.bodySmall, styles.paragraph]}>
            Для использования сервиса необходимо ваше согласие с условиями
            публичной оферты и политикой обработки персональных данных.
          </Text>
          <Text style={[textStyles.bodySmall, styles.paragraph]}>
            В соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ
            «О персональных данных» мы обрабатываем только те данные, которые
            необходимы для связи с врачом. Сообщения передаются в
            зашифрованном виде.
          </Text>
          <Text style={[textStyles.bodySmall, styles.paragraph]}>
            Обработка медицинской информации осуществляется в соответствии с
            Федеральным законом от 21.11.2011 № 323-ФЗ «Об основах охраны
            здоровья граждан в Российской Федерации» (врачебная тайна, ст. 13).
          </Text>

          <TouchableOpacity style={styles.docLink} onPress={() => openDocument(OFFER_URL)}>
            <MaterialIcons name="description" size={20} color={colors.primary[600]} />
            <Text style={[textStyles.link, styles.docLinkText]}>Публичная оферта</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.docLink} onPress={() => openDocument(PRIVACY_URL)}>
            <MaterialIcons name="privacy-tip" size={20} color={colors.primary[600]} />
            <Text style={[textStyles.link, styles.docLinkText]}>Политика конфиденциальности</Text>
          </TouchableOpacity>
        </View>

        <Text style={[textStyles.bodySmall, styles.label]}>ФИО для фиксации согласия</Text>
        <TextInput
          style={styles.input}
          placeholder="Иванов Иван Иванович"
          placeholderTextColor={colors.text.tertiary}
          value={fullName}
          onChangeText={setFullName}
        />

        <TouchableOpacity style={styles.checkboxRow} onPress={() => setAccepted(!accepted)}>
          <MaterialIcons
            name={accepted ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={accepted ? colors.primary[600] : colors.text.tertiary}
          />
          <Text style={[textStyles.bodySmall, styles.checkboxText]}>
            Я даю согласие на обработку моих персональных данных и принимаю
            условия оферты
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.acceptButton, !accepted && styles.acceptButtonDisabled]}
          onPress={handleAccept}
          disabled={!accepted}
        >
          <Text style={buttonStyles.buttonPrimaryText}>Принять и продолжить</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  scrollContent: { padding: spacing[4], paddingBottom: spacing[8] },
  iconRow: { alignItems: 'center', marginBottom: spacing[4] },
  title: { color: colors.text.primary, marginTop: spacing[2], textAlign: 'center' },
  card: { padding: spacing[4] },
  paragraph: { color: colors.text.secondary, marginBottom: spacing[3], lineHeight: 20 },
  docLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] },
  docLinkText: { marginLeft: spacing[2] },
  label: { color: colors.text.secondary, marginBottom: spacing[2] },
  input: {
    borderWidth: 1, borderColor: colors.border.primary,
    borderRadius: spacing[2], padding: spacing[3],
    color: colors.text.primary, backgroundColor: colors.surface.primary,
    marginBottom: spacing[4],
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[4] },
  checkboxText: { marginLeft: spacing[2], flex: 1, color: colors.text.primary },
  acceptButton: { alignItems: 'center' },
  acceptButtonDisabled: { opacity: 0.5 },
});

export default ConsentScreen;
