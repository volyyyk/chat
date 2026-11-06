/**
 * Clinic Model
 * Represents a medical clinic/organization
 */

module.exports = (sequelize, DataTypes) => {
  const Clinic = sequelize.define(
    'Clinic',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Unique clinic code for doctor registration
      code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        validate: {
          notNull: true,
          notEmpty: true,
          len: [4, 20],
        },
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notNull: true,
          notEmpty: true,
        },
      },
      shortName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'short_name',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      postalCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: 'postal_code',
      },
      country: {
        type: DataTypes.STRING(100),
        defaultValue: 'Россия',
        allowNull: true,
      },
      // Contact information
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          is: /^\+?[0-9\s-()]{10,20}$/,
        },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      website: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: {
          isUrl: true,
        },
      },
      // Legal information (for 152-FZ compliance)
      legalEntityName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'legal_entity_name',
      },
      inn: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          len: [10, 12],
        },
      },
      kpp: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      ogrn: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
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
      // Clinic settings
      workingHours: {
        type: DataTypes.JSONB,
        defaultValue: [],
        field: 'working_hours',
        comment: 'Array of {day: number, start: string, end: string}',
      },
      logo: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      banner: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      // Status
      status: {
        type: DataTypes.ENUM(
          'active',
          'inactive',
          'pending',
          'suspended',
          'deleted'
        ),
        allowNull: false,
        defaultValue: 'pending',
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
      // Subscription and payment
      subscriptionPlan: {
        type: DataTypes.ENUM('free', 'basic', 'pro', 'enterprise'),
        defaultValue: 'free',
        field: 'subscription_plan',
      },
      subscriptionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'subscription_expires_at',
      },
      // Micropayment settings
      doctorSharePercent: {
        type: DataTypes.INTEGER,
        defaultValue: 80,
        validate: {
          min: 0,
          max: 100,
        },
        field: 'doctor_share_percent',
      },
      clinicSharePercent: {
        type: DataTypes.INTEGER,
        defaultValue: 20,
        validate: {
          min: 0,
          max: 100,
        },
        field: 'clinic_share_percent',
      },
      // Statistics
      totalDoctors: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'total_doctors',
      },
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
      totalRevenue: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'total_revenue',
      },
      // Integration settings
      yooMoneyEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'yoo_money_enabled',
      },
      tinkoffEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'tinkoff_enabled',
      },
      stripeEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'stripe_enabled',
      },
      // API keys for payment systems
      yooMoneyShopId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'yoo_money_shop_id',
      },
      yooMoneySecretKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'yoo_money_secret_key',
      },
      tinkoffTerminalKey: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'tinkoff_terminal_key',
      },
      tinkoffPassword: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'tinkoff_password',
      },
      stripeSecretKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'stripe_secret_key',
      },
      stripePublishableKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'stripe_publishable_key',
      },
    },
    {
      tableName: 'clinics',
      indexes: [
        {
          unique: true,
          fields: ['code'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['verified'],
        },
        {
          fields: ['city'],
        },
        {
          fields: ['region'],
        },
      ],
    }
  );

  Clinic.associate = (models) => {
    // Clinic belongs to Admin User
    Clinic.belongsTo(models.User, {
      foreignKey: 'adminId',
      as: 'admin',
      onDelete: 'SET NULL',
    });

    // Clinic has many Doctors
    Clinic.hasMany(models.Doctor, {
      foreignKey: 'clinicId',
      as: 'doctors',
      onDelete: 'CASCADE',
    });

    // Clinic has many Specialties
    Clinic.hasMany(models.ClinicSpecialty, {
      foreignKey: 'clinicId',
      as: 'specialties',
      onDelete: 'CASCADE',
    });

    // Clinic has many Appointments
    Clinic.hasMany(models.Appointment, {
      foreignKey: 'clinicId',
      as: 'appointments',
      onDelete: 'SET NULL',
    });

    // Clinic has many Chats
    Clinic.hasMany(models.Chat, {
      foreignKey: 'clinicId',
      as: 'chats',
      onDelete: 'SET NULL',
    });

    // Clinic has many Transactions
    Clinic.hasMany(models.Transaction, {
      foreignKey: 'clinicId',
      as: 'transactions',
      onDelete: 'SET NULL',
    });

    // Clinic has many Reviews
    Clinic.hasMany(models.Review, {
      foreignKey: 'clinicId',
      as: 'reviews',
      onDelete: 'SET NULL',
    });

    // Clinic has many AuditLogs
    Clinic.hasMany(models.AuditLog, {
      foreignKey: 'clinicId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Clinic;
};
