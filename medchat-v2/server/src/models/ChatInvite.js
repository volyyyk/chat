/**
 * Chat Invite Model
 * Одноразовые QR-приглашения врача пациенту для гостевого входа в чат
 * без регистрации (сценарий: врач показывает QR, пациент сканирует,
 * на /connect даёт согласие на обработку ПД и попадает в диалог).
 *
 * Жизненный цикл: врач создаёт инвайт (POST /api/chats/invites), старые
 * неиспользованные инвайты врача автоматически отзываются; первый join
 * привязывает инвайт к созданному гостевому пользователю (guestUserId,
 * usedAt), повторные сканы того же QR тем же гостем дают повторный вход
 * (новые JWT, без дублей пациента/чата), третьи лица уже не войдут.
 */

module.exports = (sequelize, DataTypes) => {
  const ChatInvite = sequelize.define('ChatInvite', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    // 256-бит одноразовый токен (crypto.randomBytes(32).hex): перебор невозможен
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'doctor_id',
    },
    // Заполняется после первого join: чат, в который попал гость
    chatId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'chat_id',
    },
    // Гостевой пользователь, созданный по этому инвайту
    guestUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'guest_user_id',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'used_at',
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at',
    },
  }, {
    tableName: 'chat_invites',
    indexes: [
      { unique: true, fields: ['token'] },
      { fields: ['doctor_id'] },
      { fields: ['expires_at'] },
    ],
  });

  ChatInvite.associate = (models) => {
    ChatInvite.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'CASCADE',
    });
    ChatInvite.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'SET NULL',
    });
    ChatInvite.belongsTo(models.User, {
      foreignKey: 'guestUserId',
      as: 'guestUser',
      onDelete: 'SET NULL',
    });
  };

  return ChatInvite;
};
