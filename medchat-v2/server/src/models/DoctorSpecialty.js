/**
 * DoctorSpecialty Model
 * Many-to-many relationship between Doctor and Specialty
 */

module.exports = (sequelize, DataTypes) => {
  const DoctorSpecialty = sequelize.define(
    'DoctorSpecialty',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      doctorId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'doctor_id',
      },
      specialtyId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'specialty_id',
      },
      // Whether this is the doctor's primary specialty
      isPrimary: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_primary',
      },
      // Years of experience in this specialty
      experienceYears: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'experience_years',
      },
      // Certification status
      isCertified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_certified',
      },
      certificationNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'certification_number',
      },
      certificationDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'certification_date',
      },
      certificationExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'certification_expiry',
      },
      // Priority/sort order
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    {
      tableName: 'doctor_specialties',
      indexes: [
        {
          unique: true,
          fields: ['doctor_id', 'specialty_id'],
        },
        {
          fields: ['doctor_id'],
        },
        {
          fields: ['specialty_id'],
        },
        {
          fields: ['is_primary'],
        },
        {
          fields: ['sort_order'],
        },
      ],
    }
  );

  DoctorSpecialty.associate = (models) => {
    DoctorSpecialty.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'CASCADE',
    });

    DoctorSpecialty.belongsTo(models.Specialty, {
      foreignKey: 'specialtyId',
      as: 'specialty',
      onDelete: 'CASCADE',
    });
  };

  return DoctorSpecialty;
};
