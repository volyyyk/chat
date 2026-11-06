/**
 * Chat Model
 * Represents a chat between doctor and patient
 */

module.exports = (sequelize, DataTypes) => {
  const Chat = sequelize.define(
    'Chat',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Unique chat identifier (for QR code and deep links)
      chatId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        field: 'chat_id',
      },
      // Chat title (auto-generated from doctor/patient names)
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'title',
      },
      // Chat status
      status: {
        type: DataTypes.ENUM(
          'active',
          'archived',
          'closed',
          'blocked',
          'deleted'
        ),
        defaultValue: 'active',
      },
      // Chat type
      type: {
        type: DataTypes.ENUM(
          'individual',
          'group',
          'consultation',
          'followup'
        ),
        defaultValue: 'individual',
      },
      // Priority
      priority: {
        type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
        defaultValue: 'normal',
      },
      // Chat settings
      settings: {
        type: DataTypes.JSONB,
        defaultValue: {
          notificationsEnabled: true,
          soundEnabled: true,
          autoArchive: false,
          archiveAfterDays: 30,
          fileUploadEnabled: true,
          maxFileSize: 50, // MB
        },
      },
      // Last message info (denormalized for performance)
      lastMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'last_message_id',
      },
      lastMessageText: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'last_message_text',
      },
      lastMessageSenderId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'last_message_sender_id',
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_message_at',
      },
      // Unread message counts
      unreadCountDoctor: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'unread_count_doctor',
      },
      unreadCountPatient: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'unread_count_patient',
      },
      // Chat statistics
      totalMessages: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        field: 'total_messages',
      },
      totalFiles: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_files',
      },
      // First and last message dates
      firstMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'first_message_at',
      },
      // Chat creation info
      createdBy: {
        type: DataTypes.ENUM('doctor', 'patient', 'clinic', 'system'),
        allowNull: true,
        field: 'created_by',
      },
      // Encryption keys for end-to-end encryption
      encryptionKey: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'encryption_key',
        comment: 'Shared encryption key for this chat',
      },
      // Access control
      isEncrypted: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_encrypted',
      },
      // File retention settings
      fileRetentionDays: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        field: 'file_retention_days',
        comment: 'Days to keep files before auto-deletion',
      },
      // Micropayment tracking
      lastPaidMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_paid_message_at',
      },
      totalPaidMessages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_paid_messages',
      },
      totalFreeMessages: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_free_messages',
      },
      // Chat metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
    },
    {
      tableName: 'chats',
      indexes: [
        {
          unique: true,
          fields: ['chatId'],
        },
        {
          fields: ['doctorId'],
        },
        {
          fields: ['patientId'],
        },
        {
          fields: ['clinicId'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['type'],
        },
        {
          fields: ['priority'],
        },
        {
          fields: ['lastMessageAt'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  Chat.associate = (models) => {
    // Chat belongs to Doctor
    Chat.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'CASCADE',
    });

    // Chat belongs to Patient
    Chat.belongsTo(models.Patient, {
      foreignKey: 'patientId',
      as: 'patient',
      onDelete: 'CASCADE',
    });

    // Chat belongs to Clinic
    Chat.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'SET NULL',
    });

    // Chat has many Messages
    Chat.hasMany(models.Message, {
      foreignKey: 'chatId',
      as: 'messages',
      onDelete: 'CASCADE',
    });

    // Chat has many Participants (through ChatParticipant)
    Chat.belongsToMany(models.User, {
      through: models.ChatParticipant,
      foreignKey: 'chatId',
      as: 'participants',
    });

    // Chat has many Files
    Chat.hasMany(models.File, {
      foreignKey: 'chatId',
      as: 'files',
      onDelete: 'CASCADE',
    });

    // Chat has many ChatReadReceipts
    Chat.hasMany(models.ChatReadReceipt, {
      foreignKey: 'chatId',
      as: 'readReceipts',
      onDelete: 'CASCADE',
    });

    // Chat has many ChatTypingIndicators
    Chat.hasMany(models.ChatTypingIndicator, {
      foreignKey: 'chatId',
      as: 'typingIndicators',
      onDelete: 'CASCADE',
    });

    // Chat has many AuditLogs
    Chat.hasMany(models.AuditLog, {
      foreignKey: 'chatId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Chat;
};
