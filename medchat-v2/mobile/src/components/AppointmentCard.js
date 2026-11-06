/**
 * MedChat Mobile App - Appointment Card Component
 * Reusable appointment card component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, cardStyles } from '../styles/commonStyles';
import { formatDateTime, formatTime } from '../utils/formatters';

const AppointmentCard = ({
  appointment,
  onPress,
  showDoctor = true,
  showStatus = true,
  showActions = false,
  onCancel,
  onReschedule,
}) => {
  // Get appointment status color
  const getStatusColor = () => {
    switch (appointment.status) {
      case 'confirmed':
        return colors.success[500];
      case 'pending':
        return colors.warning[500];
      case 'cancelled':
        return colors.error[500];
      case 'completed':
        return colors.text.tertiary;
      default:
        return colors.text.secondary;
    }
  };

  // Get appointment status text
  const getStatusText = () => {
    switch (appointment.status) {
      case 'confirmed':
        return 'Подтверждено';
      case 'pending':
        return 'Ожидает подтверждения';
      case 'cancelled':
        return 'Отменено';
      case 'completed':
        return 'Завершено';
      default:
        return '';
    }
  };

  // Format date and time
  const formattedDate = formatDateTime(appointment.date);
  const formattedTime = formatTime(appointment.time);

  return (
    <View style={[cardStyles.cardBase, cardStyles.cardElevated, styles.container]}>
      <TouchableOpacity
        style={styles.infoContainer}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <View style={styles.dateTime}>
            <MaterialIcons name="event" size={16} color={colors.text.secondary} />
            <Text style={[textStyles.bodySmall, styles.dateText]}>
              {formattedDate}
            </Text>
          </View>
          <Text style={[textStyles.h5, styles.timeText]}>{formattedTime}</Text>
        </View>

        {showDoctor && appointment.doctor && (
          <View style={styles.doctorInfo}>
            <MaterialIcons name="local-hospital" size={16} color={colors.primary[600]} />
            <Text style={[textStyles.bodySmall, styles.doctorText]}>
              {appointment.doctor.name}
            </Text>
            <Text style={[textStyles.caption, styles.specialtyText]}>
              {appointment.doctor.specialty}
            </Text>
          </View>
        )}

        {appointment.notes && (
          <Text style={[textStyles.caption, styles.notesText]} numberOfLines={2}>
            {appointment.notes}
          </Text>
        )}

        {showStatus && appointment.status && (
          <View style={[styles.statusContainer, { borderColor: getStatusColor() + '40' }]}>
            <Text style={[textStyles.caption, styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {showActions && (
        <View style={styles.actionsContainer}>
          {onReschedule && (
            <TouchableOpacity
              style={[styles.actionButton, styles.rescheduleButton]}
              onPress={onReschedule}
            >
              <MaterialIcons name="event" size={16} color={colors.primary[600]} />
              <Text style={[textStyles.caption, styles.actionText]}>Перенести</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={onCancel}
            >
              <MaterialIcons name="close" size={16} color={colors.error[500]} />
              <Text style={[textStyles.caption, styles.actionText]}>Отменить</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[2],
  },
  
  infoContainer: {
    flex: 1,
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  
  dateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  
  dateText: {
    color: colors.text.secondary,
  },
  
  timeText: {
    color: colors.text.primary,
  },
  
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginBottom: spacing[1],
  },
  
  doctorText: {
    color: colors.text.primary,
  },
  
  specialtyText: {
    color: colors.text.tertiary,
  },
  
  notesText: {
    color: colors.text.tertiary,
    marginBottom: spacing[1],
  },
  
  statusContainer: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[0.5],
    paddingHorizontal: spacing[1.5],
    borderRadius: spacing[1],
    borderWidth: 1,
    marginTop: spacing[1],
  },
  
  statusText: {
    fontSize: 11,
  },
  
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    gap: spacing[2],
  },
  
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: spacing[1],
    gap: spacing[0.5],
  },
  
  rescheduleButton: {
    backgroundColor: colors.primary[50],
  },
  
  cancelButton: {
    backgroundColor: colors.error[50],
  },
  
  actionText: {
    color: colors.text.secondary,
  },
});

export default AppointmentCard;
