/**
 * Patient Model
 * Represents a patient
 */

module.exports = (sequelize, DataTypes) => {
  const Patient = sequelize.define(
    'Patient',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Patient unique identifier per doctor (not global)
      patientNumber: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'patient_number',
        comment: 'Unique identifier for this patient within a doctor\'s practice',
      },
      // Date of birth
      dateOfBirth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'date_of_birth',
      },
      // Gender
      gender: {
        type: DataTypes.ENUM('male', 'female', 'other'),
        allowNull: true,
      },
      // Age (calculated from dateOfBirth)
      age: {
        type: DataTypes.VIRTUAL,
        get() {
          if (!this.dateOfBirth) return null;
          const today = new Date();
          const birthDate = new Date(this.dateOfBirth);
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          return age;
        },
      },
      // Medical information (optional, encrypted)
      medicalHistory: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'medical_history',
        comment: 'Encrypted medical history',
      },
      allergies: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted allergies information',
      },
      chronicConditions: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'chronic_conditions',
        comment: 'Encrypted chronic conditions',
      },
      bloodType: {
        type: DataTypes.STRING(10),
        allowNull: true,
        field: 'blood_type',
        validate: {
          isIn: [['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']],
        },
      },
      // Emergency contact
      emergencyContactName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'emergency_contact_name',
      },
      emergencyContactPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'emergency_contact_phone',
        validate: {
          is: /^\+?[0-9\s-()]{10,20}$/,
        },
      },
      emergencyContactRelationship: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'emergency_contact_relationship',
      },
      // Insurance information
      insuranceCompany: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'insurance_company',
      },
      insurancePolicyNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'insurance_policy_number',
      },
      insuranceExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'insurance_expiry',
      },
      // Preferences
      preferredLanguage: {
        type: DataTypes.STRING(10),
        defaultValue: 'ru',
        field: 'preferred_language',
      },
      preferredCommunication: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ['chat'],
        field: 'preferred_communication',
        comment: 'Array of preferred communication methods: chat, email, sms',
      },
      // Notification settings
      notificationSettings: {
        type: DataTypes.JSONB,
        defaultValue: {
          newMessages: true,
          appointmentReminders: true,
          paymentRequests: true,
          prescriptionNotifications: true,
          systemNotifications: true,
        },
        field: 'notification_settings',
      },
      // Last appointment date with this doctor
      lastAppointmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_appointment_date',
      },
      // Next appointment date
      nextAppointmentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'next_appointment_date',
      },
      // Chat creation date
      chatCreatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'chat_created_at',
      },
      // Who added the patient to the system
      addedBy: {
        type: DataTypes.ENUM('clinic', 'doctor', 'patient', 'system'),
        allowNull: true,
        field: 'added_by',
      },
      // Patient status
      status: {
        type: DataTypes.ENUM(
          'active',
          'inactive',
          'archived',
          'blocked',
          'deleted'
        ),
        defaultValue: 'active',
      },
      // Statistics
      totalMessages: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        field: 'total_messages',
      },
      totalAppointments: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_appointments',
      },
      totalFiles: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_files',
      },
      // Payment information
      totalSpent: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'total_spent',
      },
      // Micropayment tracking
      lastFreeMessageDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_free_message_date',
      },
      freeMessagesRemaining: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'free_messages_remaining',
      },
      // Encryption keys for end-to-end encryption
      publicKey: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'public_key',
      },
      privateKey: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'private_key',
      },
    },
    {
      tableName: 'patients',
      indexes: [
        {
          unique: true,
          fields: ['userId'],
        },
        {
          fields: ['doctorId'],
        },
        {
          fields: ['clinicId'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['patientNumber', 'doctorId'],
          unique: true,
        },
      ],
    }
  );

  Patient.associate = (models) => {
    // Patient belongs to User
    Patient.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });

    // Patient belongs to Doctor
    Patient.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'CASCADE',
    });

    // Patient belongs to Clinic
    Patient.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'CASCADE',
    });

    // Patient has many Chats
    Patient.hasMany(models.Chat, {
      foreignKey: 'patientId',
      as: 'chats',
      onDelete: 'SET NULL',
    });

    // Patient has many Messages
    Patient.hasMany(models.Message, {
      foreignKey: 'senderId',
      as: 'messages',
      onDelete: 'SET NULL',
    });

    // Patient has many Appointments
    Patient.hasMany(models.Appointment, {
      foreignKey: 'patientId',
      as: 'appointments',
      onDelete: 'SET NULL',
    });

    // Patient has many Files
    Patient.hasMany(models.File, {
      foreignKey: 'patientId',
      as: 'files',
      onDelete: 'SET NULL',
    });

    // Patient has many Reviews
    Patient.hasMany(models.Review, {
      foreignKey: 'patientId',
      as: 'reviews',
      onDelete: 'SET NULL',
    });

    // Patient has many EPrescriptions
    Patient.hasMany(models.EPrescription, {
      foreignKey: 'patientId',
      as: 'prescriptions',
      onDelete: 'SET NULL',
    });

    // Patient has many Reminders
    Patient.hasMany(models.Reminder, {
      foreignKey: 'patientId',
      as: 'reminders',
      onDelete: 'CASCADE',
    });

    // Patient has many Transactions
    Patient.hasMany(models.Transaction, {
      foreignKey: 'patientId',
      as: 'transactions',
      onDelete: 'SET NULL',
    });

    // Patient has many PatientFiles
    Patient.hasMany(models.PatientFile, {
      foreignKey: 'patientId',
      as: 'patientFiles',
      onDelete: 'CASCADE',
    });

    // Patient has many AuditLogs
    Patient.hasMany(models.AuditLog, {
      foreignKey: 'patientId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Patient;
};
