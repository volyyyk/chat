/**
 * Payment Screen
 * Pay for a message when the free period is over (test balance).
 * If a pendingMessage was passed from ChatScreen, it is sent after payment
 * with the paymentTransactionId, so the server does not charge twice.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { paymentService } from '../services/paymentService';
import { API_BASE_URL } from '../config/config';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles, cardStyles } from '../styles/commonStyles';

const PACKAGES = [
  { id: 'basic', name: 'Базовый', messages: 10, price: 800 },
  { id: 'standard', name: 'Стандартный', messages: 50, price: 3500 },
  { id: 'pro', name: 'Профессиональный', messages: 100, price: 6000 },
  { id: 'premium', name: 'Премиум', messages: null, price: 1500 },
];

const PaymentScreen = ({ navigation, route }) => {
  const { chatId, messagePrice, pendingMessage } = route.params || {};
  const { token } = useAuth();
  const [pricing, setPricing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  useEffect(() => {
    (async () => {
      const storedToken = token || (await AsyncStorage.getItem('authToken'));
      const result = await paymentService.getPricing(storedToken);
      if (result.success && result.pricing) {
        setPricing(result.pricing);
      }
      setIsLoading(false);
    })();
  }, [token]);

  const price = messagePrice || (pricing && (pricing.messagePrice || pricing.message_price)) || 50;

  // Send the pending message after successful payment, linking the
  // payment transaction so the server marks the message paid without
  // charging the balance a second time.
  const sendPendingMessage = async (transactionId) => {
    if (!pendingMessage || !chatId) return true;
    try {
      const storedToken = token || (await AsyncStorage.getItem('authToken'));
      const body = { content: pendingMessage, type: 'text' };
      if (transactionId) {
        body.paymentTransactionId = transactionId;
      }
      const response = await fetch(API_BASE_URL + '/api/chats/' + chatId + '/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + storedToken,
        },
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  };

  const handlePayMessage = async () => {
    setIsPaying(true);
    const result = await paymentService.process(token, {
      type: 'message',
      chatId,
      amount: price,
      description: 'Оплата сообщения',
    });
    setIsPaying(false);

    if (result.success) {
      const transactionId = result.transaction && result.transaction.id;
      const sent = await sendPendingMessage(transactionId);
      Alert.alert(
        'Оплачено',
        sent
          ? 'Сообщение отправлено (тестовый баланс)'
          : 'Оплата прошла, но сообщение не удалось отправить',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Ошибка', result.message || 'Не удалось выполнить оплату');
    }
  };

  const handleBuyPackage = async () => {
    if (!selectedPackage) {
      Alert.alert('Пакет', 'Выберите пакет сообщений');
      return;
    }
    setIsPaying(true);
    const result = await paymentService.process(token, {
      type: 'package',
      chatId,
      amount: selectedPackage.price,
      description: 'Покупка пакета: ' + selectedPackage.name,
    });
    setIsPaying(false);

    if (result.success) {
      Alert.alert(
        'Готово',
        selectedPackage.messages
          ? 'Пакет куплен, средства зачислены на тестовый баланс'
          : 'Безлимит на месяц активирован',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Ошибка', result.message || 'Не удалось купить пакет');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[textStyles.h4, styles.headerTitle]}>Оплата сообщения</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {pendingMessage ? (
          <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.pendingCard]}>
            <MaterialIcons name="chat" size={22} color={colors.primary[600]} />
            <Text style={[textStyles.bodySmall, styles.pendingText]} numberOfLines={2}>
              {pendingMessage}
            </Text>
          </View>
        ) : null}

        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.warnCard]}>
          <MaterialIcons name="hourglass-bottom" size={28} color={colors.warning[600]} />
          <Text style={[textStyles.bodySmall, styles.warnText]}>
            Бесплатный период закончился (прошло больше 30 дней с последнего приема). Отправка сообщения платная.
          </Text>
        </View>

        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.priceCard]}>
          <Text style={[textStyles.h5, styles.priceLabel]}>Стоимость сообщения</Text>
          <Text style={[textStyles.h2, styles.priceValue]}>{price} ₽</Text>
          <Text style={[textStyles.caption, styles.priceSplit]}>
            {Math.round(price * 0.8)} ₽ врачу · {Math.round(price * 0.2)} ₽ клинике
          </Text>
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.payButton]}
            onPress={handlePayMessage}
            disabled={isPaying}
          >
            {isPaying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={buttonStyles.buttonPrimaryText}>Оплатить {price} ₽</Text>
            )}
          </TouchableOpacity>
          <Text style={[textStyles.caption, styles.testNote]}>
            В тестовом режиме оплата списывается с тестового баланса
          </Text>
        </View>

        <Text style={[textStyles.h5, styles.packagesTitle]}>Или пополните тестовый баланс</Text>
        {PACKAGES.map((pkg) => (
          <TouchableOpacity
            key={pkg.id}
            style={[
              cardStyles.cardBase,
              cardStyles.cardElevated,
              styles.packageItem,
              selectedPackage && selectedPackage.id === pkg.id && styles.packageItemSelected,
            ]}
            onPress={() => setSelectedPackage(pkg)}
          >
            <View style={styles.packageInfo}>
              <Text style={[textStyles.body, styles.packageName]}>{pkg.name}</Text>
              <Text style={[textStyles.caption, styles.packageMessages]}>
                {pkg.messages ? pkg.messages + ' сообщений' : 'Без ограничений, 1 месяц'}
              </Text>
            </View>
            <Text style={[textStyles.h5, styles.packagePrice]}>{pkg.price} ₽</Text>
          </TouchableOpacity>
        ))}

        {selectedPackage && (
          <TouchableOpacity
            style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.payButton]}
            onPress={handleBuyPackage}
            disabled={isPaying}
          >
            <Text style={buttonStyles.buttonPrimaryText}>
              Купить пакет «{selectedPackage.name}»
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.primary },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[2],
  },
  backButton: { padding: spacing[1], marginRight: spacing[2] },
  headerTitle: { color: colors.text.primary },
  scrollContent: { padding: spacing[4], paddingBottom: spacing[8] },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[3],
  },
  pendingText: { marginLeft: spacing[2], flex: 1, color: colors.text.secondary },
  warnCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing[3], marginBottom: spacing[4],
    backgroundColor: colors.warning[50], borderColor: colors.warning[200],
  },
  warnText: { marginLeft: spacing[2], flex: 1, color: colors.warning[800] },
  priceCard: { padding: spacing[5], alignItems: 'center' },
  priceLabel: { color: colors.text.secondary },
  priceValue: { color: colors.primary[600], marginTop: spacing[1] },
  priceSplit: { color: colors.text.tertiary, marginTop: spacing[1] },
  payButton: { alignItems: 'center', marginTop: spacing[4], alignSelf: 'stretch' },
  testNote: { color: colors.text.tertiary, marginTop: spacing[2], textAlign: 'center' },
  packagesTitle: { color: colors.text.primary, marginBottom: spacing[2] },
  packageItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing[4], marginBottom: spacing[2],
  },
  packageItemSelected: { borderColor: colors.primary[600], borderWidth: 2 },
  packageInfo: { flex: 1 },
  packageName: { color: colors.text.primary },
  packageMessages: { color: colors.text.tertiary, marginTop: spacing[0.5] },
  packagePrice: { color: colors.primary[600] },
});

export default PaymentScreen;
