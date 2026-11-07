/**
 * Message Read Receipt Model
 * Per-user delivery/read timestamps for each message
 */

module.exports = (sequelize, DataTypes) => {
  const MessageReadReceipt = sequelize.define('MessageReadReceipt', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'message_read_receipts',
    indexes: [
      { unique: true, fields: ['message_id', 'user_id'] },
      { fields: ['user_id'] },
    ],
  });

  MessageReadReceipt.associate = (models) => {
    MessageReadReceipt.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message',
      onDelete: 'CASCADE',
    });

    MessageReadReceipt.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return MessageReadReceipt;
};
