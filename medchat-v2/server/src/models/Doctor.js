/**
 * Doctor Model
 * Represents a medical doctor
 */

module.exports = (sequelize, DataTypes) => {
  const Doctor = sequelize.define(
    'Doctor',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Professional information
      licenseNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'license_number',
      },
      licenseIssuer: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'license_issuer',
      },
      licenseDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'license_date',
      },
      licenseExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'license_expiry',
      },
      // Specialties
      specialties: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
        field: 'specialties',
      },
      primarySpecialtyId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'primary_specialty_id',
      },
      // Professional title/degree
      degree: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      // Work experience
      experienceYears: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'experience_years',
      },
      // Professional statement
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Consultation settings
      consultationPrice: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        field: 'consultation_price',
      },
      consultationDuration: {
        type: DataTypes.INTEGER,
        defaultValue: 30,
        comment: 'Duration in minutes',
        field: 'consultation_duration',
      },
      // Availability
      isAvailable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_available',
      },
      workingHours: {
        type: DataTypes.JSONB,
        defaultValue: [],
        field: 'working_hours',
        comment: 'Array of {day: number, start: string, end: string}',
      },
      // Convenient response time for patients
      convenientResponseTime: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'e.g., "Отвечаю в течение 2 часов с 9:00 до 18:00"',
        field: 'convenient_response_time',
      },
      // Online status
      isOnline: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_online',
      },
      lastOnlineAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_online_at',
      },
      // Ratings and reviews
      averageRating: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 0,
        field: 'average_rating',
      },
      totalReviews: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_reviews',
      },
      // Verification status
      verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      verificationDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'verification_date',
      },
      verifiedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'verified_by',
      },
      verificationNotes: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'verification_notes',
      },
      // Clinic code used for registration
      clinicCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'clinic_code',
      },
      // Invitation status
      invitationStatus: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'revoked'),
        defaultValue: 'pending',
        field: 'invitation_status',
      },
      invitedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'invited_at',
      },
      // Statistics
      totalPatients: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_patients',
      },
      totalMessages: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        field: 'total_messages',
      },
      totalConsultations: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_consultations',
      },
      totalRevenue: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'total_revenue',
      },
      // Settings
      notificationSettings: {
        type: DataTypes.JSONB,
        defaultValue: {
          newMessages: true,
          appointmentReminders: true,
          paymentNotifications: true,
          reviewNotifications: true,
          systemNotifications: true,
        },
        field: 'notification_settings',
      },
      // File upload settings
      fileRetentionDays: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        comment: 'Days to keep doctor-uploaded files before auto-deletion',
        field: 'file_retention_days',
      },
      // Professional categories
      category: {
        type: DataTypes.ENUM(
          'therapist',
          'surgeon',
          'cardiologist',
          'neurologist',
          'pediatrician',
          'gynecologist',
          'urologist',
          'dermatologist',
          'ophthalmologist',
          'otolaryngologist',
          'psychiatrist',
          'endocrinologist',
          'gastroenterologist',
          'oncologist',
          'other'
        ),
        allowNull: true,
      },
      // Unique doctor identifier within clinic
      doctorNumber: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'doctor_number',
      },
    },
    {
      tableName: 'doctors',
      indexes: [
        {
          unique: true,
          fields: ['user_id'],
        },
        {
          fields: ['clinic_id'],
        },
        {
          fields: ['primary_specialty_id'],
        },
        {
          fields: ['verified'],
        },
        {
          fields: ['invitation_status'],
        },
        {
          fields: ['average_rating'],
        },
        {
          fields: ['category'],
        },
      ],
    }
  );

  Doctor.associate = (models) => {
    // Doctor belongs to User
    Doctor.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });

    // Doctor belongs to Clinic
    Doctor.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'CASCADE',
    });

    // Doctor m2m Specialties (through DoctorSpecialty).
    // NOTE: the alias must NOT be 'specialties' — that name is already a real
    // column on Doctor (ARRAY of specialty UUIDs). Sequelize throws
    // "Naming collision between attribute and association" at model-load time,
    // which crashed seed, jest and any real model usage.
    // Bare includes like [{ model: models.Specialty }] still auto-resolve here.
    Doctor.belongsToMany(models.Specialty, {
      through: models.DoctorSpecialty,
      foreignKey: 'doctorId',
      as: 'specialtyDetails',
    });

    // Doctor has many Patients
    Doctor.hasMany(models.Patient, {
      foreignKey: 'doctorId',
      as: 'patients',
      onDelete: 'SET NULL',
    });

    // Doctor has many Chats
    Doctor.hasMany(models.Chat, {
      foreignKey: 'doctorId',
      as: 'chats',
      onDelete: 'SET NULL',
    });

    // Doctor has many Messages
    Doctor.hasMany(models.Message, {
      foreignKey: 'senderId',
      as: 'messages',
      onDelete: 'SET NULL',
    });

    // Doctor has many Appointments
    Doctor.hasMany(models.Appointment, {
      foreignKey: 'doctorId',
      as: 'appointments',
      onDelete: 'SET NULL',
    });

    // Doctor has many Files
    Doctor.hasMany(models.File, {
      foreignKey: 'doctorId',
      as: 'files',
      onDelete: 'SET NULL',
    });

    // Doctor has many Reviews
    Doctor.hasMany(models.Review, {
      foreignKey: 'doctorId',
      as: 'reviews',
      onDelete: 'SET NULL',
    });

    // Doctor has many EPrescriptions
    Doctor.hasMany(models.EPrescription, {
      foreignKey: 'doctorId',
      as: 'prescriptions',
      onDelete: 'SET NULL',
    });

    // Doctor has many Reminders
    Doctor.hasMany(models.Reminder, {
      foreignKey: 'doctorId',
      as: 'reminders',
      onDelete: 'SET NULL',
    });

    // Doctor has many Transactions
    Doctor.hasMany(models.Transaction, {
      foreignKey: 'doctorId',
      as: 'transactions',
      onDelete: 'SET NULL',
    });

    // Doctor has many DoctorSpecialties
    Doctor.hasMany(models.DoctorSpecialty, {
      foreignKey: 'doctorId',
      as: 'doctorSpecialties',
      onDelete: 'CASCADE',
    });

    // Doctor has many AuditLogs
    Doctor.hasMany(models.AuditLog, {
      foreignKey: 'doctorId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Doctor;
};
