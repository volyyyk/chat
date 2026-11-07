/**
 * Payment Screen
 * Pay for a message when the free period is over (test balance)
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { paymentService } from '../services/paymentService';
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
  const { chatId, messageId, messagePrice } = route.params || {};
  const { token } = useAuth();
  const [pricing, setPricing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  useEffect(() => {
    (async () => {
      const result = await paymentService.getPricing(token);
      if (result.success && result.pricing) {
        setPricing(result.pricing);
      }
      setIsLoading(false);
    })();
  }, [token]);

  const price = messagePrice || (pricing && pricing.messagePrice) || 50;

  const handlePayMessage = async () => {
    setIsPaying(true);
    const result = await paymentService.process(token, {
      chatId,
      messageId,
      amount: price,
      paymentMethod: 'test_balance',
      description: 'Оплата сообщения',
    });
    setIsPaying(false);

    if (result.success) {
      Alert.alert('Оплачено', 'Сообщение отправлено (тестовый баланс)', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
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
      chatId,
      packageId: selectedPackage.id,
      amount: selectedPackage.price,
      paymentMethod: 'test_balance',
      description: 'Покупка пакета: ' + selectedPackage.name,
    });
    setIsPaying(false);

    if (result.success) {
      Alert.alert('Готово', 'Пакет куплен (тестовый баланс)', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
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
        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.warnCard]}>
          <MaterialIcons name="hourglass-bottom" size={28} color={colors.warning[600]} />
          <Text style={[textStyles.bodySmall, styles.warnText]}>
            Бесплатный период закончился (прошло больше 30 дней с последнего приема).
            Отправка сообщения платная.
          </Text>
        </View>

        <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.priceCard]}>
          <Text style={[textStyles.h5, styles.priceLabel]}>Стоимость сообщения</Text>
          <Text style={[textStyles.h2, styles.priceValue]}>{price} ₽</Text>
          <Text style={[textStyles.caption, styles.priceSplit]}>
            {Math.round(price * 0.8)} ₽ врачу, {Math.round(price * 0.2)} ₽ клинике
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

        <Text style={[textStyles.h5, styles.packagesTitle]}>Или купите пакет</Text>
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
