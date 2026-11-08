/**
 * MedChat Mobile App - Message Bubble Component
 * Reusable message bubble component for chat
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, chatStyles } from '../styles/commonStyles';
import { formatMessageTime, formatFileSize } from '../utils/formatters';

const MessageBubble = ({
  message,
  isMyMessage,
  showTime = true,
  showStatus = true,
  onFilePress,
  onDownloadPress,
}) => {
  const isSystem = message.sender === 'system';
  const isFile = message.file !== undefined;

  // Determine message style based on sender
  const bubbleStyle = isSystem
    ? [chatStyles.messageBubble, chatStyles.messageBubbleSystem]
    : isMyMessage
      ? [chatStyles.messageBubble, chatStyles.messageBubblePatient]
      : [chatStyles.messageBubble, chatStyles.messageBubbleDoctor];

  const textStyle = isSystem
    ? [chatStyles.messageText, chatStyles.messageTextSystem]
    : isMyMessage
      ? [chatStyles.messageText, chatStyles.messageTextPatient]
      : [chatStyles.messageText, chatStyles.messageTextDoctor];

  const timeStyle = isMyMessage
    ? [chatStyles.messageTime, styles.myMessageTime]
    : chatStyles.messageTime;

  // Render file message
  if (isFile) {
    return (
      <View style={bubbleStyle}>
        <TouchableOpacity
          style={styles.fileMessage}
          onPress={onFilePress}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name="insert-drive-file"
            size={24}
            color={isMyMessage ? colors.text.primaryInverse : colors.primary[600]}
          />
          <View style={styles.fileInfo}>
            <Text style={textStyle} numberOfLines={1}>
              {message.file.name || 'Файл'}
            </Text>
            <Text style={[textStyle, styles.fileSize]}>
              {formatFileSize(message.file.size || 0)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={onDownloadPress}
          >
            <MaterialIcons
              name="download"
              size={20}
              color={isMyMessage ? colors.text.primaryInverse : colors.primary[600]}
            />
          </TouchableOpacity>
        </TouchableOpacity>
        {showTime && (
          <Text style={timeStyle}>
            {formatMessageTime(message.createdAt)}
          </Text>
        )}
      </View>
    );
  }

  // Render system message
  if (isSystem) {
    return (
      <View style={bubbleStyle}>
        <Text style={textStyle}>{message.content}</Text>
        {showTime && (
          <Text style={[timeStyle, styles.systemMessageTime]}>
            {formatMessageTime(message.createdAt)}
          </Text>
        )}
      </View>
    );
  }

  // Render regular text message
  return (
    <View style={bubbleStyle}>
      <Text style={textStyle}>{message.content}</Text>
      <View style={styles.messageFooter}>
        {message.isEncrypted && (
          <View style={styles.encryptionBadge}>
            <MaterialIcons
              name="lock"
              size={12}
              color={isMyMessage ? colors.text.primaryInverse : colors.text.tertiary}
            />
          </View>
        )}
        {showTime && (
          <Text style={timeStyle}>
            {formatMessageTime(message.createdAt)}
          </Text>
        )}
        {showStatus && message.status && (
          <View style={styles.messageStatus}>
            {message.status === 'delivered' && (
              <MaterialIcons
                name="done-all"
                size={16}
                color={isMyMessage ? colors.text.primaryInverse : colors.text.tertiary}
              />
            )}
            {message.status === 'read' && (
              <MaterialCommunityIcons
                name="check-all"
                size={16}
                color={colors.primary[500]}
              />
            )}
            {message.status === 'sending' && (
              <MaterialIcons
                name="access-time"
                size={16}
                color={colors.text.tertiary}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fileMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  
  fileInfo: {
    flex: 1,
  },
  
  fileSize: {
    fontSize: 12,
    opacity: 0.7,
  },
  
  downloadButton: {
    padding: spacing[1],
  },
  
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[1],
  },
  
  encryptionBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  
  myMessageTime: {
    color: colors.text.primaryInverse,
  },
  
  systemMessageTime: {
    color: colors.text.tertiary,
  },
  
  messageStatus: {
    marginLeft: spacing[2],
  },
});

export default MessageBubble;
