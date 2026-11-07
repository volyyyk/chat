/**
 * Session Model
 * Represents a user session
 */

module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define(
    'Session',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      sessionId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: 'session_id',
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'token',
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'user_agent',
      },
      deviceType: {
        type: DataTypes.ENUM('mobile', 'web', 'desktop', 'tablet'),
        allowNull: true,
        field: 'device_type',
      },
      deviceInfo: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'device_info',
      },
      location: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'location',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
    },
    {
      tableName: 'sessions',
      indexes: [
        {
          unique: true,
          fields: ['session_id'],
        },
        {
          fields: ['user_id'],
        },
        {
          fields: ['is_active'],
        },
        {
          fields: ['expires_at'],
        },
        {
          fields: ['created_at'],
        },
      ],
    }
  );

  Session.associate = (models) => {
    Session.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return Session;
};
