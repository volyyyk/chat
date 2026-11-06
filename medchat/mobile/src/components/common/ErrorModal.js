/**
 * Error Modal Component
 */

import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../utils/ThemeContext';

const ErrorModal = ({ 
  visible = false, 
  title = 'Error', 
  message = 'An error occurred',
  onDismiss = () => {},
  buttonText = 'OK'
}) => {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.centeredView}>
        <View style={[styles.modalView, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.error }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
          
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={onDismiss}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalView: {
    margin: 20,
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center'
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24
  },
  button: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    minWidth: 120
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  }
});

export default ErrorModal;
