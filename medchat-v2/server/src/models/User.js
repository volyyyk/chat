/**
 * User Model
 * Base model for all user types (Clinic Admin, Doctor, Patient)
 */

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
          notNull: true,
          notEmpty: true,
        },
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
        validate: {
          is: /^\+?[0-9\s-()]{10,20}$/,
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'password_hash',
      },
      firstName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'first_name',
      },
      lastName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'last_name',
      },
      middleName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'middle_name',
      },
      fullName: {
        type: DataTypes.VIRTUAL,
        get() {
          return [this.lastName, this.firstName, this.middleName]
            .filter(Boolean)
            .join(' ');
        },
        set(value) {
          // For setting full name
        },
      },
      avatar: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM(
          'clinic_admin',
          'doctor',
          'patient',
          'system_admin'
        ),
        allowNull: false,
        defaultValue: 'patient',
      },
      status: {
        type: DataTypes.ENUM(
          'active',
          'inactive',
          'pending',
          'banned',
          'deleted'
        ),
        allowNull: false,
        defaultValue: 'pending',
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'email_verified',
      },
      phoneVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'phone_verified',
      },
      twoFactorEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'two_factor_enabled',
      },
      twoFactorSecret: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'two_factor_secret',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_login_at',
      },
      lastActivityAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_activity_at',
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'user_agent',
      },
      // For legal compliance (152-FZ)
      consentGiven: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'consent_given',
      },
      consentDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'consent_date',
      },
      consentVersion: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'consent_version',
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
      // Settings
      notificationSettings: {
        type: DataTypes.JSONB,
        defaultValue: {
          email: true,
          push: true,
          sms: false,
          messageNotifications: true,
          appointmentReminders: true,
          paymentNotifications: true,
        },
        field: 'notification_settings',
      },
      language: {
        type: DataTypes.STRING(10),
        defaultValue: 'ru',
        allowNull: true,
      },
      timezone: {
        type: DataTypes.STRING(50),
        defaultValue: 'Europe/Moscow',
        allowNull: true,
      },
    },
    {
      tableName: 'users',
      indexes: [
        {
          unique: true,
          fields: ['email'],
        },
        {
          unique: true,
          fields: ['phone'],
          where: { phone: { [Sequelize.Op.ne]: null } },
        },
        {
          fields: ['role'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['lastActivityAt'],
        },
      ],
    }
  );

  User.associate = (models) => {
    // User belongs to Clinic (for doctors and clinic admins)
    User.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // User has many Sessions
    User.hasMany(models.Session, {
      foreignKey: 'userId',
      as: 'sessions',
      onDelete: 'CASCADE',
    });

    // User has many RefreshTokens
    User.hasMany(models.RefreshToken, {
      foreignKey: 'userId',
      as: 'refreshTokens',
      onDelete: 'CASCADE',
    });

    // User has many VerificationTokens
    User.hasMany(models.VerificationToken, {
      foreignKey: 'userId',
      as: 'verificationTokens',
      onDelete: 'CASCADE',
    });

    // User has many PasswordResetTokens
    User.hasMany(models.PasswordResetToken, {
      foreignKey: 'userId',
      as: 'passwordResetTokens',
      onDelete: 'CASCADE',
    });

    // For Clinic Admin: manages Clinic
    User.hasOne(models.Clinic, {
      foreignKey: 'adminId',
      as: 'administeredClinic',
      onDelete: 'SET NULL',
    });

    // For Doctor: has Doctor profile
    User.hasOne(models.Doctor, {
      foreignKey: 'userId',
      as: 'doctorProfile',
      onDelete: 'CASCADE',
    });

    // For Patient: has Patient profile
    User.hasOne(models.Patient, {
      foreignKey: 'userId',
      as: 'patientProfile',
      onDelete: 'CASCADE',
    });

    // User has many Chats (as participant)
    User.hasMany(models.ChatParticipant, {
      foreignKey: 'userId',
      as: 'chatParticipants',
      onDelete: 'CASCADE',
    });

    // User has many Messages
    User.hasMany(models.Message, {
      foreignKey: 'senderId',
      as: 'sentMessages',
      onDelete: 'SET NULL',
    });

    // User has many Files
    User.hasMany(models.File, {
      foreignKey: 'uploaderId',
      as: 'uploadedFiles',
      onDelete: 'SET NULL',
    });

    // User has many Transactions
    User.hasMany(models.Transaction, {
      foreignKey: 'userId',
      as: 'transactions',
      onDelete: 'SET NULL',
    });

    // User has many Reviews
    User.hasMany(models.Review, {
      foreignKey: 'authorId',
      as: 'reviews',
      onDelete: 'SET NULL',
    });

    // User has many Reminders
    User.hasMany(models.Reminder, {
      foreignKey: 'userId',
      as: 'reminders',
      onDelete: 'CASCADE',
    });

    // User has many EPrescriptions
    User.hasMany(models.EPrescription, {
      foreignKey: 'doctorId',
      as: 'prescriptions',
      onDelete: 'SET NULL',
    });

    // User has many AuditLogs
    User.hasMany(models.AuditLog, {
      foreignKey: 'userId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return User;
};
