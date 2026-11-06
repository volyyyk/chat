/**
 * MedChat Mobile App - Chat Item Component
 * Reusable chat list item component
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { spacing } from '../styles/spacing';
import { textStyles, chatStyles } from '../styles/commonStyles';
import { formatDateTime, truncateText } from '../utils/formatters';

const ChatItem = ({
  chat,
  onPress,
  showUnreadBadge = true,
  showTime = true,
  maxMessageLength = 50,
}) => {
  const title = chat.doctorName || chat.clinicName || chat.patientLogin || 'Неизвестный';
  const subtitle = chat.specialtyName ? `${chat.specialtyName}, ${chat.clinicName}` : chat.clinicName || '';
  const lastMessage = chat.lastMessage 
    ? truncateText(chat.lastMessage.content, maxMessageLength)
    : 'Нет сообщений';
  const unreadCount = chat.unreadCount || 0;
  const time = chat.updatedAt ? formatDateTime(chat.updatedAt) : '';

  return (
    <TouchableOpacity
      style={[
        chatStyles.chatListItem,
        unreadCount > 0 && showUnreadBadge && chatStyles.chatListItemActive,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={chatStyles.chatListItemAvatar}>
        <MaterialIcons
          name={chat.doctorName ? 'local-hospital' : 'person'}
          size={24}
          color={colors.primary[600]}
        />
      </View>

      <View style={chatStyles.chatListItemInfo}>
        <View style={styles.header}>
          <Text style={chatStyles.chatListItemTitle} numberOfLines={1}>
            {title}
          </Text>
          {showTime && time && (
            <Text style={chatStyles.chatListItemTime}>{time}</Text>
          )}
        </View>

        {subtitle ? (
          <Text style={[chatStyles.chatListItemSubtitle, styles.subtitle]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}

        <Text style={chatStyles.chatListItemSubtitle} numberOfLines={1}>
          {lastMessage}
        </Text>
      </View>

      {showUnreadBadge && unreadCount > 0 && (
        <View style={chatStyles.chatListItemUnread}>
          <Text style={chatStyles.chatListItemUnreadText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  
  subtitle: {
    marginTop: spacing[0.5],
  },
});

export default ChatItem;
