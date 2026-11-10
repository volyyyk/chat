/**
 * Data Transfer Model
 * Одноразовые токены переноса данных пациента на другое устройство.
 *
 * Сценарий: старое устройство создаёт токен (POST /api/guest/transfer/init),
 * шифрует НА УСТРОЙСТВЕ приватные E2E-ключи случайным симметричным ключом
 * (nacl.secretbox) и загружает шифротекст blob'ом (POST .../blob). QR-код
 * показывает только токен и ключ шифрования blob'а; сервер ключом blob'а
 * НЕ владеет и расшифровать приватные ключи не может (E2E-модель доверия).
 *
 * Безопасность: токен 256 бит (crypto.randomBytes(32).hex), срок жизни
 * 10 минут, одноразовый (consumedAt), blob уничтожается при потреблении,
 * новый init гасит предыдущие незавершённые токены пользователя.
 */

module.exports = (sequelize, DataTypes) => {
  const DataTransfer = sequelize.define('DataTransfer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    // 256-бит одноразовый токен переноса
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    // Шифротекст (base64): nonce || secretbox(ключи и настройки)
    payload: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'consumed_at',
    },
  }, {
    tableName: 'data_transfers',
    indexes: [
      { unique: true, fields: ['token'] },
      { fields: ['user_id'] },
      { fields: ['expires_at'] },
    ],
  });

  DataTransfer.associate = (models) => {
    DataTransfer.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return DataTransfer;
};
