/**
 * Chat Typing Indicator Model
 * Shows which user is currently typing in a chat
 */

module.exports = (sequelize, DataTypes) => {
  const ChatTypingIndicator = sequelize.define('ChatTypingIndicator', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isTyping: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'chat_typing_indicators',
    indexes: [
      { unique: true, fields: ['chat_id', 'user_id'] },
      { fields: ['chat_id'] },
    ],
  });

  ChatTypingIndicator.associate = (models) => {
    ChatTypingIndicator.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    ChatTypingIndicator.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return ChatTypingIndicator;
};
