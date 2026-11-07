/**
 * Message Reaction Model
 * Emoji reactions on messages
 */

module.exports = (sequelize, DataTypes) => {
  const MessageReaction = sequelize.define('MessageReaction', {
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
    reaction: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  }, {
    tableName: 'message_reactions',
    indexes: [
      { unique: true, fields: ['message_id', 'user_id'] },
      { fields: ['user_id'] },
      { fields: ['reaction'] },
    ],
  });

  MessageReaction.associate = (models) => {
    MessageReaction.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message',
      onDelete: 'CASCADE',
    });

    MessageReaction.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return MessageReaction;
};
