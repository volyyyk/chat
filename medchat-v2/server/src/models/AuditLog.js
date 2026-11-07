/**
 * Audit Log Model
 * Security and action audit trail (152-FZ / PP 1119 compliance)
 */

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    clinicId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    messageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    backupId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    entityId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'audit_logs',
    indexes: [
      { fields: ['userId'] },
      { fields: ['doctorId'] },
      { fields: ['patientId'] },
      { fields: ['clinicId'] },
      { fields: ['chatId'] },
      { fields: ['messageId'] },
      { fields: ['transactionId'] },
      { fields: ['fileId'] },
      { fields: ['backupId'] },
      { fields: ['action'] },
      { fields: ['entityType'] },
      { fields: ['createdAt'] },
    ],
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { foreignKey: 'userId', as: 'user', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'patient', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Clinic, { foreignKey: 'clinicId', as: 'clinic', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Chat, { foreignKey: 'chatId', as: 'chat', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Message, { foreignKey: 'messageId', as: 'message', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.File, { foreignKey: 'fileId', as: 'file', onDelete: 'SET NULL' });
    AuditLog.belongsTo(models.Backup, { foreignKey: 'backupId', as: 'backup', onDelete: 'SET NULL' });
  };

  return AuditLog;
};
