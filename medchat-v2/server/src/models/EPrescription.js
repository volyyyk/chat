/**
 * EPrescription Model
 * Represents an electronic prescription
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EPrescription = sequelize.define('EPrescription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    prescriptionNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'doctors', key: 'id' },
      onDelete: 'CASCADE',
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'patients', key: 'id' },
      onDelete: 'CASCADE',
    },
    appointmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Appointments', key: 'id' },
      onDelete: 'SET NULL',
    },
    type: {
      type: DataTypes.ENUM('medication', 'procedure', 'test', 'referral', 'certificate', 'other'),
      defaultValue: 'medication',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    medications: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      get() {
        const rawValue = this.getDataValue('medications');
        return rawValue ? (Array.isArray(rawValue) ? rawValue : JSON.parse(rawValue)) : [];
      },
      set(value) {
        this.setDataValue('medications', Array.isArray(value) ? value : JSON.stringify(value));
      },
    },
    dosage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    duration: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    diagnosis: {
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
    status: {
      type: DataTypes.ENUM('draft', 'active', 'cancelled', 'fulfilled', 'expired'),
      defaultValue: 'active',
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sentBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    sentVia: {
      type: DataTypes.ENUM('chat', 'email', 'sms'),
      allowNull: true,
    },
    sentMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fulfilledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    fulfilledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    fulfillmentNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pharmacyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    pharmacyName: {
      type: DataTypes.STRING(200),
      allowNull: true,
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
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
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
      references: { model: 'users', key: 'id' },
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
    tableName: 'EPrescriptions',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['prescription_number'], unique: true },
      { fields: ['doctor_id'] },
      { fields: ['patient_id'] },
      { fields: ['appointment_id'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['valid_until'] },
      { fields: ['deleted'] },
      { fields: ['doctor_id', 'patient_id'] },
    ],
  });

  EPrescription.associate = (models) => {
    EPrescription.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
    EPrescription.belongsTo(models.Patient, { foreignKey: 'patientId', as: 'patient' });
    EPrescription.belongsTo(models.Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
    EPrescription.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    EPrescription.belongsTo(models.User, { foreignKey: 'sentBy', as: 'sender' });
    EPrescription.belongsTo(models.User, { foreignKey: 'fulfilledBy', as: 'fulfiller' });
    EPrescription.belongsTo(models.User, { foreignKey: 'cancelledBy', as: 'canceller' });
    EPrescription.belongsTo(models.User, { foreignKey: 'deletedBy', as: 'deleter' });
    EPrescription.hasMany(models.File, { foreignKey: 'eprescriptionId', as: 'files' });
  };

  return EPrescription;
};
