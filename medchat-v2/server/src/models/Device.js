/**
 * Device Model
 * Stores user device information for push notifications
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Device = sequelize.define('Device', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    deviceType: {
      type: DataTypes.ENUM('ios', 'android', 'web', 'other'),
      allowNull: false,
    },
    pushToken: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    deviceName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    osVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    appVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lastActiveAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
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
    tableName: 'Devices',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['pushToken'] },
      { fields: ['deviceId'] },
      { fields: ['deviceType'] },
      { fields: ['isActive'] },
      { fields: ['userId', 'deviceId'], unique: true },
    ],
  });

  Device.associate = (models) => {
    Device.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return Device;
};
