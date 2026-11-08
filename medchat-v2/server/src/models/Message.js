/**
 * Message Model
 * Represents a message in a chat
 */

module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    'Message',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Message content
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'content',
        comment: 'Plaintext for legacy/plain messages; EMPTY for E2E (ciphertext lives in metadata.e2e)',
      },
      // Message type
      type: {
        type: DataTypes.ENUM(
          'text',
          'image',
          'video',
          'audio',
          'file',
          'system',
          'payment',
          'prescription',
          'appointment',
          'reminder'
        ),
        defaultValue: 'text',
      },
      // Message status
      status: {
        type: DataTypes.ENUM(
          'sending',
          'sent',
          'delivered',
          'read',
          'failed',
          'deleted'
        ),
        defaultValue: 'sent',
      },
      // Encryption info: true ONLY when the server received an E2E envelope
      // (chatController.sendMessage sets it explicitly from isE2E). Legacy
      // default was true, which falsely marked plaintext messages (seed,
      // prescriptions) as encrypted - now plaintext is honestly false.
      isEncrypted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_encrypted',
      },
      encryptionKeyId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'encryption_key_id',
        comment: 'Reference to the encryption key used',
      },
      // File attachments
      attachments: {
        type: DataTypes.JSONB,
        defaultValue: [],
        field: 'attachments',
        comment: 'Array of file attachment IDs',
      },
      // Reply to message
      replyToId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'reply_to_id',
      },
      // Forwarded from
      forwardedFromId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'forwarded_from_id',
      },
      // Message metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
      // Read receipts
      readBy: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
        field: 'read_by',
        comment: 'Array of user IDs who have read this message',
      },
      // Delivery receipts
      deliveredTo: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
        field: 'delivered_to',
        comment: 'Array of user IDs who have received this message',
      },
      // Message priority
      priority: {
        type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
        defaultValue: 'normal',
      },
      // Payment info (for paid messages)
      isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_paid',
      },
      paymentAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        field: 'payment_amount',
      },
      paymentCurrency: {
        type: DataTypes.STRING(3),
        defaultValue: 'RUB',
        field: 'payment_currency',
      },
      paymentTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'payment_transaction_id',
      },
      // Free message tracking
      isFree: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_free',
      },
      freeMessageReason: {
        type: DataTypes.ENUM(
          'within_30_days',
          'first_message',
          'doctor_initiated',
          'promotional',
          'system'
        ),
        allowNull: true,
        field: 'free_message_reason',
      },
      // Message sentiment (for analysis)
      sentiment: {
        type: DataTypes.ENUM('positive', 'neutral', 'negative'),
        allowNull: true,
      },
      // Message flags
      isFlagged: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_flagged',
      },
      flagReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'flag_reason',
      },
      flaggedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'flagged_by',
      },
      flaggedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'flagged_at',
      },
      // Message size
      size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'size',
        comment: 'Size in bytes',
      },
      // Client info
      clientType: {
        type: DataTypes.ENUM('mobile', 'web', 'desktop'),
        allowNull: true,
        field: 'client_type',
      },
      clientVersion: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'client_version',
      },
    },
    {
      tableName: 'messages',
      indexes: [
        {
          fields: ['chat_id'],
        },
        {
          fields: ['sender_id'],
        },
        {
          fields: ['receiver_id'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['type'],
        },
        {
          fields: ['created_at'],
        },
        {
          fields: ['reply_to_id'],
        },
        {
          fields: ['is_paid'],
        },
        {
          fields: ['is_free'],
        },
        {
          // Composite index for the most frequent query pattern:
          // message pagination inside a chat (WHERE chat_id = ? ORDER BY created_at DESC).
          // Avoids a filesort on large chat histories.
          fields: ['chat_id', 'created_at'],
        },
      ],
    }
  );

  Message.associate = (models) => {
    // Message belongs to Chat
    Message.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    // Message belongs to Sender (User)
    Message.belongsTo(models.User, {
      foreignKey: 'senderId',
      as: 'sender',
      onDelete: 'SET NULL',
    });

    // Message belongs to Receiver (User)
    Message.belongsTo(models.User, {
      foreignKey: 'receiverId',
      as: 'receiver',
      onDelete: 'SET NULL',
    });

    // Message has many MessageReadReceipts
    Message.hasMany(models.MessageReadReceipt, {
      foreignKey: 'messageId',
      as: 'readReceipts',
      onDelete: 'CASCADE',
    });

    // Message belongs to ReplyTo Message
    Message.belongsTo(models.Message, {
      foreignKey: 'replyToId',
      as: 'replyTo',
      onDelete: 'SET NULL',
    });

    // Message has many Replies
    Message.hasMany(models.Message, {
      foreignKey: 'replyToId',
      as: 'replies',
      onDelete: 'SET NULL',
    });

    // Message has many Files
    Message.hasMany(models.File, {
      foreignKey: 'messageId',
      as: 'files',
      onDelete: 'CASCADE',
    });

    // Message has many MessageReactions
    Message.hasMany(models.MessageReaction, {
      foreignKey: 'messageId',
      as: 'reactions',
      onDelete: 'CASCADE',
    });

    // Message has many AuditLogs
    Message.hasMany(models.AuditLog, {
      foreignKey: 'messageId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Message;
};
