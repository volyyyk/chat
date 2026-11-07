/**
 * Specialty Model
 * Represents a medical specialty
 */

const { Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  const Specialty = sequelize.define(
    'Specialty',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          notNull: true,
          notEmpty: true,
        },
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        field: 'code',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      shortName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'short_name',
      },
      category: {
        type: DataTypes.ENUM(
          'primary_care',
          'specialty_care',
          'surgical',
          'diagnostic',
          'therapeutic',
          'pediatric',
          'mental_health',
          'other'
        ),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
      icon: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
    },
    {
      tableName: 'specialties',
      indexes: [
        {
          unique: true,
          fields: ['name'],
        },
        {
          unique: true,
          fields: ['code'],
          where: { code: { [Op.ne]: null } },
        },
        {
          fields: ['category'],
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

  Specialty.associate = (models) => {
    // Specialty has many ClinicSpecialties
    Specialty.hasMany(models.ClinicSpecialty, {
      foreignKey: 'specialtyId',
      as: 'clinicSpecialties',
      onDelete: 'CASCADE',
    });

    // Specialty has many DoctorSpecialties
    Specialty.hasMany(models.DoctorSpecialty, {
      foreignKey: 'specialtyId',
      as: 'doctorSpecialties',
      onDelete: 'CASCADE',
    });

    // Specialty belongs to many Clinics (through ClinicSpecialty)
    Specialty.belongsToMany(models.Clinic, {
      through: models.ClinicSpecialty,
      foreignKey: 'specialtyId',
      as: 'clinics',
    });

    // Specialty belongs to many Doctors (through DoctorSpecialty)
    Specialty.belongsToMany(models.Doctor, {
      through: models.DoctorSpecialty,
      foreignKey: 'specialtyId',
      as: 'doctors',
    });
  };

  return Specialty;
};
