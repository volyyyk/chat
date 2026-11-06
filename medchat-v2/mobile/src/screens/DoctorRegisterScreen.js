/**
 * MedChat Mobile App - Doctor Register Screen
 * Doctor registration
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useForm } from '../hooks/useForm';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';
import { validationSchemas } from '../hooks/useForm';

const DoctorRegisterScreen = ({ navigation }) => {
  const { register, isLoading, error, clearError, verifyClinicCode } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isClinicCodeValid, setIsClinicCodeValid] = useState(null);
  const [clinicName, setClinicName] = useState('');
  const [specialties, setSpecialties] = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');

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
    {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      middleName: '',
      clinicCode: '',
      specialtyId: '',
      phone: '',
    },
    validationSchemas.doctorRegistration,
    async (values) => {
      // Prepare data for registration
      const data = {
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        middleName: values.middleName,
        clinicCode: values.clinicCode,
        specialtyId: selectedSpecialty,
        phone: values.phone,
      };

      const result = await register(data);

      if (result.success) {
        // Registration successful
        Alert.alert(
          'Успех',
          'Регистрация успешна! Пожалуйста, дождитесь подтверждения от клиники.',
          [
            {
              text: 'OK',
              onPress: () => navigation.replace('DoctorLogin'),
            },
          ]
        );
      }
    }
  );

  // Clear error when screen mounts
  useEffect(() => {
    clearError();
    return () => clearError();
  }, [clearError]);

  // Show error if present
  useEffect(() => {
    if (error) {
      Alert.alert('Ошибка', error);
      clearError();
    }
  }, [error, clearError]);

  // Verify clinic code when it changes
  useEffect(() => {
    const debounceTimer = setTimeout(async () => {
      if (values.clinicCode && values.clinicCode.length >= 4) {
        const result = await verifyClinicCode(values.clinicCode);
        setIsClinicCodeValid(result.success);
        if (result.success && result.clinic) {
          setClinicName(result.clinic.name);
          // Load specialties for this clinic
          // In real app, this would be an API call
        } else {
          setClinicName('');
        }
      } else {
        setIsClinicCodeValid(null);
        setClinicName('');
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [values.clinicCode, verifyClinicCode]);

  // Mock specialties (in real app, these would come from API)
  useEffect(() => {
    setSpecialties([
      { id: '1', name: 'Терапевт' },
      { id: '2', name: 'Хирург' },
      { id: '3', name: 'Кардиолог' },
      { id: '4', name: 'Невролог' },
      { id: '5', name: 'Педиатр' },
    ]);
  }, []);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  const handleSpecialtySelect = (specialtyId) => {
    setSelectedSpecialty(specialtyId);
    setFieldValue('specialtyId', specialtyId);
  };

  const handleLogin = () => {
    navigation.navigate('DoctorLogin');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[textStyles.h3, styles.title]}>Регистрация врача</Text>
          </View>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <MaterialIcons name="local-hospital" size={48} color={colors.primary[600]} />
            <Text style={[textStyles.h4, styles.logoTitle]}>Создайте аккаунт</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Email *</Text>
              <View style={[styles.inputContainer, touched.email && errors.email && styles.inputError]}>
                <MaterialIcons
                  name="email"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите email"
                  value={values.email}
                  onChangeText={(text) => handleChange('email', text)}
                  onBlur={() => handleBlur('email')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
              {touched.email && errors.email && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.email}</Text>
              )}
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Пароль *</Text>
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

            {/* Confirm Password */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Подтвердите пароль *</Text>
              <View style={[styles.inputContainer, touched.confirmPassword && errors.confirmPassword && styles.inputError]}>
                <MaterialIcons
                  name="lock"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Подтвердите пароль"
                  value={values.confirmPassword}
                  onChangeText={(text) => handleChange('confirmPassword', text)}
                  onBlur={() => handleBlur('confirmPassword')}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={toggleConfirmPasswordVisibility}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={colors.text.tertiary}
                  />
                </TouchableOpacity>
              </View>
              {touched.confirmPassword && errors.confirmPassword && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.confirmPassword}</Text>
              )}
            </View>

            {/* First Name */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Имя *</Text>
              <View style={[styles.inputContainer, touched.firstName && errors.firstName && styles.inputError]}>
                <MaterialIcons
                  name="person"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите имя"
                  value={values.firstName}
                  onChangeText={(text) => handleChange('firstName', text)}
                  onBlur={() => handleBlur('firstName')}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              {touched.firstName && errors.firstName && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.firstName}</Text>
              )}
            </View>

            {/* Last Name */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Фамилия *</Text>
              <View style={[styles.inputContainer, touched.lastName && errors.lastName && styles.inputError]}>
                <MaterialIcons
                  name="person"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите фамилию"
                  value={values.lastName}
                  onChangeText={(text) => handleChange('lastName', text)}
                  onBlur={() => handleBlur('lastName')}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              {touched.lastName && errors.lastName && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.lastName}</Text>
              )}
            </View>

            {/* Middle Name */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Отчество</Text>
              <View style={styles.inputContainer}>
                <MaterialIcons
                  name="person"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите отчество"
                  value={values.middleName}
                  onChangeText={(text) => handleChange('middleName', text)}
                  onBlur={() => handleBlur('middleName')}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Clinic Code */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Код клиники *</Text>
              <View style={[
                styles.inputContainer,
                touched.clinicCode && errors.clinicCode && styles.inputError,
                isClinicCodeValid === true && styles.inputSuccess,
                isClinicCodeValid === false && styles.inputError,
              ]}>
                <MaterialIcons
                  name="business"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите код клиники"
                  value={values.clinicCode}
                  onChangeText={(text) => handleChange('clinicCode', text.toUpperCase())}
                  onBlur={() => handleBlur('clinicCode')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
                {isClinicCodeValid === true && (
                  <MaterialIcons
                    name="check-circle"
                    size={20}
                    color={colors.success[500]}
                    style={styles.inputSuccessIcon}
                  />
                )}
                {isClinicCodeValid === false && (
                  <MaterialIcons
                    name="error"
                    size={20}
                    color={colors.error[500]}
                    style={styles.inputErrorIcon}
                  />
                )}
              </View>
              {touched.clinicCode && errors.clinicCode && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.clinicCode}</Text>
              )}
              {clinicName ? (
                <Text style={[textStyles.caption, styles.successText]}>
                  Клиника: {clinicName}
                </Text>
              ) : null}
            </View>

            {/* Specialty */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Специальность *</Text>
              <TouchableOpacity
                style={[
                  styles.inputContainer,
                  styles.selectContainer,
                  touched.specialtyId && errors.specialtyId && styles.inputError,
                ]}
                onPress={() => setSelectedSpecialty('')}
              >
                <MaterialIcons
                  name="work"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <Text style={[styles.input, selectedSpecialty ? textStyles.inputText : styles.placeholderText]}>
                  {selectedSpecialty 
                    ? specialties.find(s => s.id === selectedSpecialty)?.name || 'Выберите специальность'
                    : 'Выберите специальность'}
                </Text>
                <MaterialIcons
                  name="arrow-drop-down"
                  size={20}
                  color={colors.text.tertiary}
                />
              </TouchableOpacity>
              {touched.specialtyId && errors.specialtyId && (
                <Text style={[textStyles.caption, styles.errorText]}>{errors.specialtyId}</Text>
              )}

              {/* Specialty options */}
              <View style={styles.optionsContainer}>
                {specialties.map((specialty) => (
                  <TouchableOpacity
                    key={specialty.id}
                    style={[
                      styles.option,
                      selectedSpecialty === specialty.id && styles.optionSelected,
                    ]}
                    onPress={() => handleSpecialtySelect(specialty.id)}
                  >
                    <Text style={[
                      textStyles.bodySmall,
                      selectedSpecialty === specialty.id ? styles.optionTextSelected : styles.optionText,
                    ]}>
                      {specialty.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Phone */}
            <View style={styles.field}>
              <Text style={[textStyles.label, styles.label]}>Телефон</Text>
              <View style={styles.inputContainer}>
                <MaterialIcons
                  name="phone"
                  size={20}
                  color={colors.text.tertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, textStyles.inputText]}
                  placeholder="Введите телефон"
                  value={values.phone}
                  onChangeText={(text) => handleChange('phone', text)}
                  onBlur={() => handleBlur('phone')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[buttonStyles.buttonPrimary, buttonStyles.buttonMedium, styles.submitButton]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.text.primaryInverse} />
              ) : (
                <Text style={buttonStyles.buttonPrimaryText}>Зарегистрироваться</Text>
              )}
            </TouchableOpacity>

            {/* Login link */}
            <View style={styles.loginContainer}>
              <Text style={[textStyles.bodySmall, styles.loginText]}>
                Уже есть аккаунт?
              </Text>
              <TouchableOpacity onPress={handleLogin}>
                <Text style={[textStyles.link, styles.loginLink]}>Войти</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Info */}
          <View style={styles.infoContainer}>
            <MaterialIcons name="info" size={16} color={colors.text.tertiary} />
            <Text style={[textStyles.caption, styles.infoText]}>
              После регистрации дождитесь подтверждения от клиники
            </Text>
          </View>
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
  },
  
  content: {
    flex: 1,
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
    marginBottom: spacing[4],
  },
  
  logoTitle: {
    marginTop: spacing[2],
    color: colors.primary[600],
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
  
  inputSuccess: {
    borderColor: colors.success[500],
  },
  
  inputErrorIcon: {
    marginLeft: spacing[1],
  },
  
  inputSuccessIcon: {
    marginLeft: spacing[1],
  },
  
  selectContainer: {
    justifyContent: 'space-between',
  },
  
  placeholderText: {
    color: colors.text.tertiary,
  },
  
  passwordToggle: {
    padding: spacing[1],
  },
  
  errorText: {
    marginTop: spacing[1],
    color: colors.error[500],
  },
  
  successText: {
    marginTop: spacing[1],
    color: colors.success[500],
  },
  
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing[1],
    gap: spacing[1],
  },
  
  option: {
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.primary,
    borderRadius: spacing[2],
  },
  
  optionSelected: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  
  optionText: {
    color: colors.text.secondary,
  },
  
  optionTextSelected: {
    color: colors.primary[600],
  },
  
  submitButton: {
    marginBottom: spacing[3],
  },
  
  loginContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  
  loginText: {
    color: colors.text.secondary,
  },
  
  loginLink: {
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
});

export default DoctorRegisterScreen;
