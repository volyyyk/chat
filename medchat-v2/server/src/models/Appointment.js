/**
 * Appointment Model
 * Represents a scheduled appointment between a doctor and a patient
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Appointment = sequelize.define('Appointment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Doctors', key: 'id' },
      onDelete: 'CASCADE',
    },
    clinicId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Clinics', key: 'id' },
      onDelete: 'SET NULL',
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Patients', key: 'id' },
      onDelete: 'CASCADE',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('in_person', 'online', 'home_visit', 'consultation'),
      defaultValue: 'in_person',
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show', 'deleted'),
      defaultValue: 'pending',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    symptoms: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      defaultValue: 'normal',
    },
    diagnosis: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    treatment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    preparationInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    followupRecommended: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    followupDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reminderMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
    },
    // Timestamps for status changes
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    confirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    confirmationNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rescheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rescheduledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    rescheduleReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    // Soft delete
    deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deletedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Users', key: 'id' },
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
    tableName: 'Appointments',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['doctorId'] },
      { fields: ['patientId'] },
      { fields: ['clinicId'] },
      { fields: ['startTime'] },
      { fields: ['endTime'] },
      { fields: ['status'] },
      { fields: ['type'] },
      { fields: ['priority'] },
      { fields: ['deleted'] },
      { fields: ['doctorId', 'startTime'] },
      { fields: ['patientId', 'startTime'] },
    ],
  });

  Appointment.associate = (models) => {
    Appointment.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
    Appointment.belongsTo(models.Clinic, { foreignKey: 'clinicId', as: 'clinic' });
    Appointment.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'patient' });
    Appointment.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    Appointment.belongsTo(models.User, { foreignKey: 'confirmedBy', as: 'confirmer' });
    Appointment.belongsTo(models.User, { foreignKey: 'cancelledBy', as: 'canceller' });
    Appointment.belongsTo(models.User, { foreignKey: 'rescheduledBy', as: 'rescheduler' });
    Appointment.belongsTo(models.User, { foreignKey: 'completedBy', as: 'completer' });
    Appointment.belongsTo(models.User, { foreignKey: 'deletedBy', as: 'deleter' });
    Appointment.hasMany(models.Reminder, { foreignKey: 'appointmentId', as: 'reminders' });
    Appointment.hasMany(models.EPrescription, { foreignKey: 'appointmentId', as: 'eprescriptions' });
    Appointment.hasMany(models.Message, { foreignKey: 'appointmentId', as: 'messages' });
    Appointment.hasMany(models.File, { foreignKey: 'appointmentId', as: 'files' });
  };

  return Appointment;
};
