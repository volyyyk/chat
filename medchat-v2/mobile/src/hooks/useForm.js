/**
 * MedChat Mobile App - useForm Hook
 * Form state and validation management
 */

import { useState, useCallback, useEffect } from 'react';
import { validateEmail, validatePhone, validatePassword, validateClinicCode, validateDoctorCode, validatePatientLogin, validateMessage, validateFile, validateTime, validateDate, validateAppointment, validateEPrescription, validateReview, validateTimeRange, validateSearchQuery, validateBackupPassword } from '../utils/validators';
import { debounce } from '../utils/helpers';

/**
 * Custom hook for form management
 * @param {Object} initialValues - Initial form values
 * @param {Object} validationSchema - Validation rules
 * @param {Function} onSubmit - Submit handler
 * @returns {Object} - Form state and actions
 */
export const useForm = (initialValues = {}, validationSchema = {}, onSubmit = null) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  // Initialize touched state
  useEffect(() => {
    const initialTouched = {};
    Object.keys(initialValues).forEach(key => {
      initialTouched[key] = false;
    });
    setTouched(initialTouched);
  }, [initialValues]);

  // Validate form
  const validate = useCallback((valuesToValidate = values) => {
    const newErrors = {};
    let valid = true;

    Object.keys(validationSchema).forEach(fieldName => {
      const validator = validationSchema[fieldName];
      const value = valuesToValidate[fieldName];

      if (validator.required && !value) {
        newErrors[fieldName] = validator.requiredMessage || 'Это поле обязательно';
        valid = false;
      } else if (value) {
        // Run custom validators
        if (validator.validate) {
          const result = validator.validate(value, valuesToValidate);
          if (result !== true) {
            newErrors[fieldName] = result || 'Неверное значение';
            valid = false;
          }
        }

        // Run type-specific validators
        switch (validator.type) {
          case 'email':
            if (!validateEmail(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат email';
              valid = false;
            }
            break;
          case 'phone':
            if (!validatePhone(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат телефона';
              valid = false;
            }
            break;
          case 'password':
            const passwordValidation = validatePassword(value);
            if (!passwordValidation.valid) {
              newErrors[fieldName] = passwordValidation.message;
              valid = false;
            }
            break;
          case 'clinicCode':
            if (!validateClinicCode(value)) {
              newErrors[fieldName] = validator.message || 'Неверный код клиники';
              valid = false;
            }
            break;
          case 'doctorCode':
            if (!validateDoctorCode(value)) {
              newErrors[fieldName] = validator.message || 'Неверный код врача';
              valid = false;
            }
            break;
          case 'patientLogin':
            if (!validatePatientLogin(value)) {
              newErrors[fieldName] = validator.message || 'Неверный логин пациента';
              valid = false;
            }
            break;
          case 'message':
            const messageValidation = validateMessage(value);
            if (!messageValidation.valid) {
              newErrors[fieldName] = messageValidation.message;
              valid = false;
            }
            break;
          case 'time':
            if (!validateTime(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат времени (HH:MM)';
              valid = false;
            }
            break;
          case 'date':
            if (!validateDate(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат даты (YYYY-MM-DD)';
              valid = false;
            }
            break;
          case 'timeRange':
            if (!validateTimeRange(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат времени (HH:MM-HH:MM)';
              valid = false;
            }
            break;
          case 'search':
            if (!validateSearchQuery(value)) {
              newErrors[fieldName] = validator.message || 'Запрос должен содержать от 1 до 100 символов';
              valid = false;
            }
            break;
          case 'backupPassword':
            const passwordValidation = validateBackupPassword(value);
            if (!passwordValidation.valid) {
              newErrors[fieldName] = passwordValidation.message;
              valid = false;
            }
            break;
          case 'appointment':
            const appointmentValidation = validateAppointment(valuesToValidate);
            if (!appointmentValidation.valid) {
              newErrors[fieldName] = appointmentValidation.message;
              valid = false;
            }
            break;
          case 'ePrescription':
            const prescriptionValidation = validateEPrescription(valuesToValidate);
            if (!prescriptionValidation.valid) {
              newErrors[fieldName] = prescriptionValidation.message;
              valid = false;
            }
            break;
          case 'review':
            const reviewValidation = validateReview(valuesToValidate);
            if (!reviewValidation.valid) {
              newErrors[fieldName] = reviewValidation.message;
              valid = false;
            }
            break;
          default:
            if (validator.pattern && !new RegExp(validator.pattern).test(value)) {
              newErrors[fieldName] = validator.message || 'Неверный формат';
              valid = false;
            }
            if (validator.minLength && value.length < validator.minLength) {
              newErrors[fieldName] = validator.message || `Минимум ${validator.minLength} символов`;
              valid = false;
            }
            if (validator.maxLength && value.length > validator.maxLength) {
              newErrors[fieldName] = validator.message || `Максимум ${validator.maxLength} символов`;
              valid = false;
            }
        }
      }
    });

    setErrors(newErrors);
    setIsValid(valid && Object.keys(newErrors).length === 0);
    return valid;
  }, [validationSchema, values]);

  // Handle change
  const handleChange = useCallback((fieldName, value) => {
    setValues(prev => ({
      ...prev,
      [fieldName]: value,
    }));

    // Validate field if touched
    if (touched[fieldName]) {
      const newErrors = { ...errors };
      const validator = validationSchema[fieldName];

      if (validator) {
        if (validator.required && !value) {
          newErrors[fieldName] = validator.requiredMessage || 'Это поле обязательно';
        } else if (value) {
          // Run validation for this field
          const fieldErrors = validate({ [fieldName]: value });
          if (fieldErrors[fieldName]) {
            newErrors[fieldName] = fieldErrors[fieldName];
          } else {
            delete newErrors[fieldName];
          }
        } else {
          delete newErrors[fieldName];
        }
      }

      setErrors(newErrors);
      setIsValid(Object.keys(newErrors).length === 0);
    }
  }, [touched, errors, validationSchema, validate]);

  // Handle blur
  const handleBlur = useCallback((fieldName) => {
    setTouched(prev => ({
      ...prev,
      [fieldName]: true,
    }));

    // Validate field
    const newErrors = { ...errors };
    const validator = validationSchema[fieldName];

    if (validator) {
      const value = values[fieldName];
      if (validator.required && !value) {
        newErrors[fieldName] = validator.requiredMessage || 'Это поле обязательно';
      } else if (value) {
        const fieldErrors = validate({ [fieldName]: value });
        if (fieldErrors[fieldName]) {
          newErrors[fieldName] = fieldErrors[fieldName];
        } else {
          delete newErrors[fieldName];
        }
      } else {
        delete newErrors[fieldName];
      }
    }

    setErrors(newErrors);
    setIsValid(Object.keys(newErrors).length === 0);
  }, [touched, errors, validationSchema, values, validate]);

  // Handle submit
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();

    setSubmitCount(prev => prev + 1);

    // Validate all fields
    const isValid = validate();

    if (!isValid) {
      // Mark all fields as touched
      const allTouched = {};
      Object.keys(values).forEach(key => {
        allTouched[key] = true;
      });
      setTouched(allTouched);
      return;
    }

    setIsSubmitting(true);

    try {
      if (onSubmit) {
        await onSubmit(values);
      }
    } catch (error) {
      // Handle error
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit]);

  // Set field value
  const setFieldValue = useCallback((fieldName, value) => {
    handleChange(fieldName, value);
  }, [handleChange]);

  // Set field error
  const setFieldError = useCallback((fieldName, error) => {
    setErrors(prev => ({
      ...prev,
      [fieldName]: error,
    }));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
    setSubmitCount(0);
    setIsValid(false);
  }, [initialValues]);

  // Set values
  const setValuesState = useCallback((newValues) => {
    setValues(prev => ({
      ...prev,
      ...newValues,
    }));
  }, []);

  // Get field props
  const getFieldProps = useCallback((fieldName) => {
    const value = values[fieldName];
    const error = errors[fieldName];
    const isTouched = touched[fieldName];
    const validator = validationSchema[fieldName];

    return {
      value,
      error,
      isTouched,
      isValid: !error,
      onChangeText: (text) => handleChange(fieldName, text),
      onBlur: () => handleBlur(fieldName),
      onChange: (e) => handleChange(fieldName, e.target ? e.target.value : e),
    };
  }, [values, errors, touched, validationSchema, handleChange, handleBlur]);

  // Check if field has error
  const hasError = useCallback((fieldName) => {
    return touched[fieldName] && errors[fieldName];
  }, [touched, errors]);

  // Get error message for field
  const getError = useCallback((fieldName) => {
    return touched[fieldName] ? errors[fieldName] : '';
  }, [touched, errors]);

  return {
    // State
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    submitCount,

    // Actions
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    resetForm,
    setValues: setValuesState,

    // Helpers
    getFieldProps,
    hasError,
    getError,
    validate,
  };
};

/**
 * Create validation schema helper
 * @param {Object} rules - Validation rules
 * @returns {Object} - Validation schema
 */
export const createValidationSchema = (rules) => {
  return rules;
};

/**
 * Common validation schemas
 */
export const validationSchemas = {
  // Login form
  login: {
    identifier: {
      required: true,
      requiredMessage: 'Введите email или телефон',
      type: 'email',
      message: 'Неверный формат email',
    },
    password: {
      required: true,
      requiredMessage: 'Введите пароль',
    },
  },

  // Doctor registration form
  doctorRegistration: {
    email: {
      required: true,
      requiredMessage: 'Email обязателен',
      type: 'email',
    },
    password: {
      required: true,
      requiredMessage: 'Пароль обязателен',
      type: 'password',
    },
    confirmPassword: {
      required: true,
      requiredMessage: 'Подтвердите пароль',
      validate: (value, values) => {
        if (value !== values.password) {
          return 'Пароли не совпадают';
        }
        return true;
      },
    },
    firstName: {
      required: true,
      requiredMessage: 'Имя обязательно',
      minLength: 2,
      message: 'Имя должно содержать не менее 2 символов',
    },
    lastName: {
      required: true,
      requiredMessage: 'Фамилия обязательна',
      minLength: 2,
      message: 'Фамилия должна содержать не менее 2 символов',
    },
    middleName: {
      minLength: 2,
      message: 'Отчество должно содержать не менее 2 символов',
    },
    clinicCode: {
      required: true,
      requiredMessage: 'Код клиники обязателен',
      type: 'clinicCode',
    },
    specialtyId: {
      required: true,
      requiredMessage: 'Специальность обязательна',
    },
    phone: {
      type: 'phone',
    },
  },

  // Patient setup form
  patientSetup: {
    login: {
      required: true,
      requiredMessage: 'Логин обязателен',
      type: 'patientLogin',
    },
  },

  // Message form
  message: {
    content: {
      required: true,
      requiredMessage: 'Введите сообщение',
      type: 'message',
    },
  },

  // Appointment form
  appointment: {
    date: {
      required: true,
      requiredMessage: 'Дата обязательна',
      type: 'date',
    },
    time: {
      required: true,
      requiredMessage: 'Время обязательно',
      type: 'time',
    },
    patientLogin: {
      required: true,
      requiredMessage: 'Логин пациента обязателен',
      type: 'patientLogin',
    },
    notes: {
      maxLength: 500,
      message: 'Примечания не должны превышать 500 символов',
    },
  },

  // E-prescription form
  ePrescription: {
    patientLogin: {
      required: true,
      requiredMessage: 'Логин пациента обязателен',
      type: 'patientLogin',
    },
    medication: {
      required: true,
      requiredMessage: 'Название препарата обязательно',
      minLength: 2,
    },
    dosage: {
      required: true,
      requiredMessage: 'Дозировка обязательна',
    },
    instructions: {
      required: true,
      requiredMessage: 'Инструкции обязательны',
    },
    duration: {
      required: true,
      requiredMessage: 'Длительность обязательна',
    },
  },

  // Review form
  review: {
    rating: {
      required: true,
      requiredMessage: 'Оценка обязательна',
      type: 'review',
    },
    comment: {
      required: true,
      requiredMessage: 'Комментарий обязателен',
      maxLength: 1000,
    },
  },

  // Settings form
  settings: {
    convenientTime: {
      type: 'timeRange',
    },
    notifications: {
      // Boolean field
    },
  },

  // Backup form
  backup: {
    password: {
      required: true,
      requiredMessage: 'Пароль обязателен',
      type: 'backupPassword',
    },
    confirmPassword: {
      required: true,
      requiredMessage: 'Подтвердите пароль',
      validate: (value, values) => {
        if (value !== values.password) {
          return 'Пароли не совпадают';
        }
        return true;
      },
    },
  },

  // Search form
  search: {
    query: {
      type: 'search',
    },
  },

  // File upload form
  fileUpload: {
    file: {
      required: true,
      requiredMessage: 'Выберите файл',
      type: 'file',
    },
  },
};

export default useForm;
