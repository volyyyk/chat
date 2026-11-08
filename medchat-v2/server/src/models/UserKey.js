/**
 * UserKey Model
 * E2E encryption key registry: PUBLIC keys only.
 *
 * The private half of every key pair NEVER leaves the client device.
 * The server acts purely as a key directory: senders look up the public keys
 * of chat participants and encrypt message content directly to each recipient
 * (sealed-box style, ephemeral X25519 + XSalsa20-Poly1305 via tweetnacl 'box').
 * As a result the server stores only ciphertext for encrypted messages and
 * cannot read their content.
 */

module.exports = (sequelize, DataTypes) => {
  const UserKey = sequelize.define(
    'UserKey',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Owner of the key pair
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      // Client-generated stable label (device/installation id). One user may
      // have several active devices, each with its own key pair.
      keyId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'key_id',
      },
      // Base64-encoded X25519 public key (32 bytes -> 44 chars)
      publicKey: {
        type: DataTypes.TEXT,
        allowNull: false,
        field: 'public_key',
      },
      algorithm: {
        type: DataTypes.STRING(32),
        defaultValue: 'x25519-box',
        field: 'algorithm',
      },
      deviceName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'device_name',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_seen_at',
      },
    },
    {
      tableName: 'user_keys',
      indexes: [
        { fields: ['user_id'] },
        // One logical device key per user; re-registering the same keyId
        // rotates the public key instead of duplicating the row.
        { unique: true, fields: ['user_id', 'key_id'] },
        { fields: ['is_active'] },
      ],
    }
  );

  UserKey.associate = (models) => {
    UserKey.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });
  };

  return UserKey;
};
