/**
 * Chat Participant Model
 * Links users to chats they participate in
 */

module.exports = (sequelize, DataTypes) => {
  const ChatParticipant = sequelize.define('ChatParticipant', {
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
    role: {
      type: DataTypes.ENUM('doctor', 'patient', 'clinic', 'system'),
      defaultValue: 'patient',
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastReadMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    notificationsEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'chat_participants',
    indexes: [
      { unique: true, fields: ['chatId', 'userId'] },
      { fields: ['chatId'] },
      { fields: ['userId'] },
      { fields: ['role'] },
    ],
  });

  ChatParticipant.associate = (models) => {
    ChatParticipant.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    ChatParticipant.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return ChatParticipant;
};
