/**
 * MedChat Mobile App - Mode Selection Screen
 * Choose between patient and doctor mode
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, buttonStyles } from '../styles/commonStyles';

const ModeSelectionScreen = ({ navigation }) => {
  const handlePatientMode = () => {
    navigation.navigate('PatientSetup');
  };

  const handleDoctorMode = () => {
    navigation.navigate('DoctorLogin');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.header}>
          <MaterialIcons name="medical-services" size={48} color={colors.primary[600]} />
          <Text style={[textStyles.h2, styles.title]}>MedChat</Text>
          <Text style={[textStyles.bodySmall, styles.subtitle]}>
            Связь врача и пациента
          </Text>
        </View>

        {/* Mode selection */}
        <View style={styles.modeContainer}>
          {/* Patient mode */}
          <TouchableOpacity
            style={[styles.modeCard, styles.patientMode]}
            onPress={handlePatientMode}
          >
            <MaterialIcons name="person" size={32} color={colors.primary[600]} />
            <Text style={[textStyles.h4, styles.modeTitle]}>Я пациент</Text>
            <Text style={[textStyles.bodySmall, styles.modeDescription]}>
              Отсканируйте QR-код врача или
              перейдите по ссылке для чата
            </Text>
          </TouchableOpacity>

          {/* Doctor mode */}
          <TouchableOpacity
            style={[styles.modeCard, styles.doctorMode]}
            onPress={handleDoctorMode}
          >
            <MaterialIcons name="local-hospital" size={32} color={colors.secondary[600]} />
            <Text style={[textStyles.h4, styles.modeTitle]}>Я врач</Text>
            <Text style={[textStyles.bodySmall, styles.modeDescription]}>
              Войти в аккаунт или
              зарегистрироваться
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[textStyles.caption, styles.footerText]}>
            Защита данных гарантирована
          </Text>
          <Text style={[textStyles.caption, styles.footerText]}>
            Соответствует 152-ФЗ и 323-ФЗ
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
    padding: spacing[6],
    justifyContent: 'center',
  },
  
  header: {
    alignItems: 'center',
    marginBottom: spacing[10],
  },
  
  title: {
    marginTop: spacing[3],
    color: colors.text.primary,
  },
  
  subtitle: {
    marginTop: spacing[1],
    color: colors.text.secondary,
  },
  
  modeContainer: {
    gap: spacing[4],
  },
  
  modeCard: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: spacing[6],
    borderRadius: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.primary,
    backgroundColor: colors.surface.primary,
    shadowColor: colors.shadow.color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  
  patientMode: {
    borderColor: colors.primary[200],
  },
  
  doctorMode: {
    borderColor: colors.secondary[200],
  },
  
  modeTitle: {
    marginTop: spacing[3],
    color: colors.text.primary,
  },
  
  modeDescription: {
    marginTop: spacing[2],
    textAlign: 'center',
    color: colors.text.secondary,
  },
  
  footer: {
    marginTop: spacing[8],
    alignItems: 'center',
  },
  
  footerText: {
    color: colors.text.tertiary,
    marginVertical: spacing[1],
  },
});

export default ModeSelectionScreen;
