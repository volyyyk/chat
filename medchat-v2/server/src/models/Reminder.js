/**
 * Reminder Model
 * Represents a reminder for appointments, medications, etc.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Reminder = sequelize.define('Reminder', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'doctors', key: 'id' },
      onDelete: 'CASCADE',
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'patients', key: 'id' },
      onDelete: 'CASCADE',
    },
    appointmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Appointments', key: 'id' },
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('appointment', 'medication', 'test', 'followup', 'payment', 'custom'),
      defaultValue: 'custom',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    repeatInterval: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'yearly', 'none'),
      defaultValue: 'none',
    },
    repeatCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal',
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'completed', 'cancelled', 'failed'),
      defaultValue: 'pending',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'Reminders',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['recipient_id'] },
      { fields: ['doctor_id'] },
      { fields: ['patient_id'] },
      { fields: ['appointment_id'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['scheduled_for'] },
      { fields: ['priority'] },
      { fields: ['user_id', 'status'] },
    ],
  });

  Reminder.associate = (models) => {
    Reminder.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Reminder.belongsTo(models.User, { foreignKey: 'recipientId', as: 'recipient' });
    Reminder.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
    Reminder.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'patient' });
    Reminder.belongsTo(models.Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
    Reminder.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Reminder.belongsTo(models.User, { foreignKey: 'completedBy', as: 'completer' });
    Reminder.belongsTo(models.User, { foreignKey: 'cancelledBy', as: 'canceller' });
  };

  return Reminder;
};
