/**
 * RefreshToken Model
 * Represents a refresh token for JWT authentication
 */

module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
        field: 'token',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'expires_at',
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
      isRevoked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_revoked',
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'revoked_at',
      },
      revokedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'revoked_by',
      },
      revocationReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'revocation_reason',
      },
    },
    {
      tableName: 'refresh_tokens',
      indexes: [
        {
          unique: true,
          fields: ['token'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['isRevoked'],
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return RefreshToken;
};
