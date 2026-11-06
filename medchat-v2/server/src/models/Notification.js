/**
 * Notification Model
 * Stores user notifications
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
      onDelete: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('message', 'appointment', 'payment', 'backup', 'system', 'custom'),
      defaultValue: 'system',
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'),
      defaultValue: 'pending',
    },
    read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'Notifications',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['read'] },
      { fields: ['createdAt'] },
      { fields: ['userId', 'read'] },
    ],
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Notification;
};
