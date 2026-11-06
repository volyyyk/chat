/**
 * ClinicSpecialty Model
 * Many-to-many relationship between Clinic and Specialty
 */

module.exports = (sequelize, DataTypes) => {
  const ClinicSpecialty = sequelize.define(
    'ClinicSpecialty',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      clinicId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'clinic_id',
      },
      specialtyId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'specialty_id',
      },
      // Number of doctors in this specialty at the clinic
      doctorCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'doctor_count',
      },
      // Whether this specialty is actively offered
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
      // Priority/sort order
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    {
      tableName: 'clinic_specialties',
      indexes: [
        {
          unique: true,
          fields: ['clinicId', 'specialtyId'],
        },
        {
          fields: ['clinicId'],
        },
        {
          fields: ['specialtyId'],
        },
        {
          fields: ['isActive'],
        },
        {
          fields: ['sortOrder'],
        },
      ],
    }
  );

  ClinicSpecialty.associate = (models) => {
    ClinicSpecialty.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'CASCADE',
    });

    ClinicSpecialty.belongsTo(models.Specialty, {
      foreignKey: 'specialtyId',
      as: 'specialty',
      onDelete: 'CASCADE',
    });
  };

  return ClinicSpecialty;
};
