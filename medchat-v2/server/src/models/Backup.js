/**
 * Backup Model
 * Represents a user backup
 */

module.exports = (sequelize, DataTypes) => {
  const Backup = sequelize.define(
    'Backup',
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: 'Size in bytes',
      },
      dataTypes: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
        field: 'data_types',
      },
      format: {
        type: DataTypes.ENUM('json', 'zip', 'enc'),
        defaultValue: 'enc',
      },
      encrypted: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      checksum: {
        type: DataTypes.STRING(128),
        allowNull: true,
        comment: 'SHA-256 checksum',
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed', 'deleted'),
        defaultValue: 'completed',
      },
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      restoredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'restored_at',
      },
      restoreCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'restore_count',
      },
      // For legal compliance (152-FZ)
      consentGiven: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'consent_given',
      },
      consentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'consent_date',
      },
    },
    {
      tableName: 'backups',
      indexes: [
        {
          fields: ['user_id'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['created_at'],
        },
        {
          fields: ['restored_at'],
        },
      ],
    }
  );

  Backup.associate = (models) => {
    Backup.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });

    Backup.hasMany(models.AuditLog, {
      foreignKey: 'backupId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Backup;
};
