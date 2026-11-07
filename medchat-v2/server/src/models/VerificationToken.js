/**
 * Verification Token Model
 * Tokens for email/phone/clinic verification flows
 */

module.exports = (sequelize, DataTypes) => {
  const VerificationToken = sequelize.define('VerificationToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('email', 'email_verification', 'phone', 'clinic', 'other'),
      defaultValue: 'email',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'verification_tokens',
    indexes: [
      { unique: true, fields: ['token'] },
      { fields: ['userId'] },
      { fields: ['expiresAt'] },
    ],
  });

  VerificationToken.associate = (models) => {
    VerificationToken.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return VerificationToken;
};
