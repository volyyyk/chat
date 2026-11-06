/**
 * MedChat Mobile App - Input Bar Component
 * Reusable message input component
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, chatStyles } from '../styles/commonStyles';

const InputBar = ({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Введите сообщение...',
  showEmojiButton = true,
  showFileButton = true,
  disabled = false,
  isSending = false,
  maxLength = 5000,
  autoFocus = false,
  onFilePress,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef(null);

  // Auto-focus input
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle emoji picker toggle
  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  // Handle submit
  const handleSubmit = () => {
    if (value.trim().length > 0 && !disabled && !isSending) {
      onSubmit();
    }
  };

  // Handle file press
  const handleFilePress = () => {
    if (onFilePress) {
      onFilePress();
    }
  };

  // Check if send button should be enabled
  const canSend = value.trim().length > 0 && !disabled && !isSending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      style={styles.container}
    >
      <View style={chatStyles.inputBarContainer}>
        {showEmojiPicker && (
          <View style={styles.emojiPicker}>
            <Text>Emoji picker placeholder</Text>
            <TouchableOpacity
              style={styles.emojiClose}
              onPress={toggleEmojiPicker}
            >
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={chatStyles.inputBar}>
          {showEmojiButton && (
            <TouchableOpacity
              style={chatStyles.emojiButton}
              onPress={toggleEmojiPicker}
            >
              <MaterialCommunityIcons
                name={showEmojiPicker ? 'emoticon-happy' : 'emoticon-happy-outline'}
                size={24}
                color={disabled ? colors.text.tertiary : colors.text.tertiary}
              />
            </TouchableOpacity>
          )}

          <TextInput
            ref={inputRef}
            style={[
              chatStyles.inputBarText,
              textStyles.inputText,
              disabled && styles.disabledInput,
            ]}
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            onSubmitEditing={handleSubmit}
            placeholderTextColor={colors.chat.inputPlaceholder}
            multiline
            blurOnSubmit={false}
            autoCapitalize="sentences"
            autoCorrect
            editable={!disabled}
            maxLength={maxLength}
          />

          {isSending ? (
            <View style={styles.sendButton}>
              <ActivityIndicator size="small" color={colors.primary[600]} />
            </View>
          ) : (
            <TouchableOpacity
              style={[
                chatStyles.sendButton,
                !canSend && chatStyles.sendButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!canSend}
            >
              <MaterialIcons
                name="send"
                size={24}
                color={canSend ? colors.text.primaryInverse : colors.primary[300]}
              />
            </TouchableOpacity>
          )}
        </View>

        {showFileButton && (
          <TouchableOpacity
            style={styles.fileButton}
            onPress={handleFilePress}
            disabled={disabled || isSending}
          >
            <MaterialIcons
              name="attach-file"
              size={24}
              color={disabled || isSending ? colors.text.tertiary : colors.text.primary}
            />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  
  emojiPicker: {
    position: 'absolute',
    bottom: spacing[12],
    left: 0,
    right: 0,
    backgroundColor: colors.surface.primary,
    padding: spacing[2],
    borderRadius: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.primary,
    zIndex: 100,
  },
  
  emojiClose: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
    padding: spacing[1],
  },
  
  sendButton: {
    padding: spacing[2],
  },
  
  fileButton: {
    position: 'absolute',
    right: spacing[2],
    bottom: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.surface.secondary,
    borderRadius: spacing[2],
  },
  
  disabledInput: {
    opacity: 0.5,
  },
});

export default InputBar;
