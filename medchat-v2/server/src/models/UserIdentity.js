/**
 * User Identity Model
 * Привязка внешних провайдеров входа (Telegram Login Widget, VK ID и др.)
 * к пользователю MedChat. Один пользователь может иметь несколько
 * идентичностей; (provider, providerId) уникальны.
 */

module.exports = (sequelize, DataTypes) => {
  const UserIdentity = sequelize.define(
    'UserIdentity',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      provider: {
        type: DataTypes.ENUM('telegram', 'vk', 'max', 'whatsapp'),
        allowNull: false,
      },
      providerId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        field: 'provider_id',
      },
      providerUsername: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'provider_username',
      },
      profile: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: 'user_identities',
      indexes: [
        { unique: true, fields: ['provider', 'provider_id'] },
        { fields: ['user_id'] },
      ],
    }
  );

  UserIdentity.associate = (models) => {
    UserIdentity.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return UserIdentity;
};
