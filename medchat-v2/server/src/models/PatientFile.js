/**
 * Patient File Model
 * Links files (from storage) to patients with retention control
 */

module.exports = (sequelize, DataTypes) => {
  const PatientFile = sequelize.define('PatientFile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: 0,
    },
    storagePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    uploadedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'patient_files',
    indexes: [
      { fields: ['patientId'] },
      { fields: ['fileId'] },
      { fields: ['uploadedBy'] },
      { fields: ['expiresAt'] },
    ],
  });

  PatientFile.associate = (models) => {
    PatientFile.belongsTo(models.Patient, {
      foreignKey: 'patientId',
      as: 'patient',
      onDelete: 'CASCADE',
    });

    PatientFile.belongsTo(models.File, {
      foreignKey: 'fileId',
      as: 'file',
      onDelete: 'SET NULL',
    });

    PatientFile.belongsTo(models.User, {
      foreignKey: 'uploadedBy',
      as: 'uploader',
      onDelete: 'SET NULL',
    });
  };

  return PatientFile;
};
