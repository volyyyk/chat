/**
 * Chat Read Receipt Model
 * Per-user read position in a chat
 */

module.exports = (sequelize, DataTypes) => {
  const ChatReadReceipt = sequelize.define('ChatReadReceipt', {
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
    lastReadMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    lastReadAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'chat_read_receipts',
    indexes: [
      { unique: true, fields: ['chatId', 'userId'] },
      { fields: ['chatId'] },
      { fields: ['userId'] },
    ],
  });

  ChatReadReceipt.associate = (models) => {
    ChatReadReceipt.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    ChatReadReceipt.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return ChatReadReceipt;
};
