/**
 * MedChat Mobile App - Doctor Login Screen
 * Doctor authentication
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import LoaderBall from '../components/LoaderBall';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useForm } from '../hooks/useForm';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';
import { validationSchemas } from '../hooks/useForm';

const DoctorLoginScreen = ({ navigation }) => {
  const { login, isLoading, error, clearError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [loaderRun, setLoaderRun] = useState(0);
  const [loaderComplete, setLoaderComplete] = useState(false);
  const [loaderFailed, setLoaderFailed] = useState(false);

  const { 
    values, 
    errors, 
    touched, 
    isSubmitting, 
    handleChange, 
    handleBlur, 
    handleSubmit,
    setFieldValue,
    resetForm,
  } = useForm(
    { identifier: '', password: '' },
    validationSchemas.login,
    async (values) => {
      const result = await login(values.identifier, values.password, true);
      
      if (result.success) {
        // Check if doctor is verified
        // Проверка данных: шарик-загрузчик играет минимум 5 секунд,
        // «Перейти дальше» открывает основной экран.
        setLoaderRun((v) => v + 1);
        setLoaderComplete(false);
        setTimeout(() => setLoaderComplete(true), 1000);
      } else {
        // ошибка: шарик на секунду краснеет и злится, потом экран входа с алертом
        setLoaderRun((v) => v + 1);
        setLoaderComplete(false);
        setLoaderFailed(true);
        setIsVerifying(true);
      }
    }
  );

  // Clear error when screen mounts
  useEffect(() => {
    clearError();
    return () => clearError();
  }, [clearError]);

  // Show error if present (пока злой красный шарик играет, алерт ждёт:
  // он появится после того, как оверлей скроется)
  useEffect(() => {
    if (error && !isVerifying) {
      Alert.alert('Ошибка', error);
      clearError();
    }
  }, [error, isVerifying, clearError]);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  const handleRegister = () => {
    navigation.navigate('DoctorRegister');
  };

  if (isVerifying) {
    return (
      <SafeAreaView style={styles.container}>
        <LoaderBall
          runId={loaderRun}
          complete={loaderComplete}
          failed={loaderFailed}
          onError={() => {
            setLoaderFailed(false);
            setIsVerifying(false);
          }}
          onProceed={() => {
            navigation.replace('DoctorMain');
            setIsVerifying(false);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[textStyles.h3, styles.title]}>Вход для врачей</Text>
          </View>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <MaterialIcons name="local-hospital" size={64} color={colors.primary[600]} />
            <Text style={[textStyles.h2, styles.logoTitle]}>MedChat</Text>
            <Text style={[textStyles.bodySmall, styles.logoSubtitle]}>
              Для медицинских работников
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Email или телефон</Text>
              <View style={[styles.inputContainer, touched.identifier && errors.identifier && styles.inputError]}>
                <MaterialIcons
                  name="person"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите email или телефон"
                  value={values.identifier}
                  onChangeText={(text) => handleChange('identifier', text)}
                  onBlur={() => handleBlur('identifier')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
              {touched.identifier && errors.identifier && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.identifier}</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Пароль</Text>
              <View style={[styles.inputContainer, touched.password && errors.password && styles.inputError]}>
                <MaterialIcons
                  name="lock"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите пароль"
                  value={values.password}
                  onChangeText={(text) => handleChange('password', text)}
                  onBlur={() => handleBlur('password')}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={togglePasswordVisibility}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={colors.text.tertiary}
                  />
                </TouchableOpacity>
              </View>
              {touched.password && errors.password && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.password}</Text>
              )}
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
            >
              <Text style={[textStyles.link, styles.forgotPasswordText]}>
                Забыли пароль?
              </Text>
            </TouchableOpacity>

            {/* Submit button */}
            <TouchableOpacity
              style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.submitButton]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.text.primaryInverse} />
              ) : (
                <Text style={buttonStyles.buttonPrimaryText}>Войти</Text>
              )}
            </TouchableOpacity>

            {/* Register link */}
            <View style={styles.registerContainer}>
              <Text style={[textStyles.bodySmall, styles.registerText]}>
                Нет аккаунта?
              </Text>
              <TouchableOpacity onPress={handleRegister}>
                <Text style={[textStyles.link, styles.registerLink]}>Зарегистрироваться</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Info */}
          <View style={styles.infoContainer}>
            <MaterialIcons name="info" size={16} color={colors.text.tertiary} />
            <Text style={[textStyles.caption, styles.infoText]}>
              Вход только для зарегистрированных врачей
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  
  keyboardAvoiding: {
    flex: 1,
  },
  
  content: {
    flex: 1,
    padding: spacing[4],
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
  
  title: {
    color: colors.text.primary,
  },
  
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  
  logoTitle: {
    marginTop: spacing[3],
    color: colors.primary[600],
  },
  
  logoSubtitle: {
    marginTop: spacing[1],
    color: colors.text.secondary,
  },
  
  form: {
    flex: 1,
  },
  
  field: {
    marginBottom: spacing[3],
  },
  
  label: {
    marginBottom: spacing[1],
    color: colors.text.primary,
  },
  
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
  },
  
  inputIcon: {
    marginRight: spacing[2],
  },
  
  input: {
    flex: 1,
    height: spacing[10],
    color: colors.text.primary,
  },
  
  inputError: {
    borderColor: colors.error[500],
  },
  
  passwordToggle: {
    padding: spacing[1],
  },
  
  errorText: {
    marginTop: spacing[1],
    color: colors.error[500],
  },
  
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing[3],
  },
  
  forgotPasswordText: {
    color: colors.text.secondary,
  },
  
  submitButton: {
    marginBottom: spacing[3],
  },
  
  registerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  
  registerText: {
    color: colors.text.secondary,
  },
  
  registerLink: {
    marginLeft: spacing[1],
    color: colors.primary[600],
  },
  
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  
  infoText: {
    marginLeft: spacing[1],
    color: colors.text.tertiary,
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

export default DoctorLoginScreen;

