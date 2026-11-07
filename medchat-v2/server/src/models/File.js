/**
 * File Model
 * Represents a file uploaded to the system
 */

module.exports = (sequelize, DataTypes) => {
  const File = sequelize.define(
    'File',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // File storage info
      filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'filename',
      },
      originalFilename: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'original_filename',
      },
      storagePath: {
        type: DataTypes.STRING(500),
        allowNull: false,
        field: 'storage_path',
      },
      storageBucket: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'storage_bucket',
      },
      // File type
      fileType: {
        type: DataTypes.ENUM(
          'image',
          'video',
          'audio',
          'document',
          'archive',
          'other'
        ),
        allowNull: true,
        field: 'file_type',
      },
      mimeType: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'mime_type',
      },
      // File extension
      extension: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'extension',
      },
      // File size
      size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        field: 'size',
        comment: 'Size in bytes',
      },
      // File dimensions (for images/videos)
      width: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'width',
      },
      height: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'height',
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'duration',
        comment: 'Duration in seconds (for audio/video)',
      },
      // File owner and uploader
      ownerType: {
        type: DataTypes.ENUM('doctor', 'patient', 'clinic', 'system'),
        allowNull: false,
        field: 'owner_type',
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'owner_id',
      },
      uploaderId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'uploader_id',
      },
      // File visibility
      visibility: {
        type: DataTypes.ENUM(
          'private',
          'doctor_only',
          'patient_only',
          'shared',
          'public'
        ),
        defaultValue: 'shared',
        field: 'visibility',
      },
      // File category
      category: {
        type: DataTypes.ENUM(
          'medical_record',
          'analysis',
          'prescription',
          'referral',
          'certificate',
          'photo',
          'video',
          'audio',
          'document',
          'other'
        ),
        allowNull: true,
        field: 'category',
      },
      // File status
      status: {
        type: DataTypes.ENUM(
          'uploading',
          'active',
          'processing',
          'failed',
          'deleted',
          'expired'
        ),
        defaultValue: 'active',
      },
      // Encryption
      isEncrypted: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_encrypted',
      },
      encryptionKey: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'encryption_key',
      },
      // File metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
      // File description
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'description',
      },
      // File tags
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
        field: 'tags',
      },
      // Download count
      downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'download_count',
      },
      // Last downloaded
      lastDownloadedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_downloaded_at',
      },
      // Auto-deletion settings
      autoDelete: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'auto_delete',
      },
      deleteAfterDays: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        field: 'delete_after_days',
        comment: 'Days after which the file should be automatically deleted',
      },
      deleteAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'delete_at',
        comment: 'Exact datetime when the file should be deleted',
      },
      // File checksum
      checksum: {
        type: DataTypes.STRING(128),
        allowNull: true,
        field: 'checksum',
        comment: 'SHA-256 or MD5 checksum',
      },
      // Virus scan status
      virusScanStatus: {
        type: DataTypes.ENUM('pending', 'clean', 'infected', 'error'),
        defaultValue: 'pending',
        field: 'virus_scan_status',
      },
      virusScanResult: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'virus_scan_result',
      },
      // File URL
      url: {
        type: DataTypes.VIRTUAL,
        get() {
          // Generate URL based on storage configuration
          return `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}/${this.storageBucket || 'medchat-files'}/${this.storagePath}`;
        },
      },
      // Thumbnail URL (for images/videos)
      thumbnailUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'thumbnail_url',
      },
      // Preview URL
      previewUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'preview_url',
      },
    },
    {
      tableName: 'files',
      indexes: [
        {
          fields: ['chat_id'],
        },
        {
          fields: ['message_id'],
        },
        {
          fields: ['uploader_id'],
        },
        {
          fields: ['owner_type', 'owner_id'],
        },
        {
          fields: ['visibility'],
        },
        {
          fields: ['category'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['delete_at'],
        },
        {
          fields: ['created_at'],
        },
      ],
    }
  );

  File.associate = (models) => {
    // File belongs to Chat
    File.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    // File belongs to Message
    File.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message',
      onDelete: 'CASCADE',
    });

    // File belongs to Uploader (User)
    File.belongsTo(models.User, {
      foreignKey: 'uploaderId',
      as: 'uploader',
      onDelete: 'SET NULL',
    });

    // File belongs to Doctor
    File.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'SET NULL',
    });

    // File belongs to Patient
    File.belongsTo(models.Patient, {
      foreignKey: 'patientId',
      as: 'patient',
      onDelete: 'SET NULL',
    });

    // File has many FileDownloads
    File.hasMany(models.FileDownload, {
      foreignKey: 'fileId',
      as: 'downloads',
      onDelete: 'CASCADE',
    });

    // File has many AuditLogs
    File.hasMany(models.AuditLog, {
      foreignKey: 'fileId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return File;
};
