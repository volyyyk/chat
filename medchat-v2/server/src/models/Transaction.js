/**
 * Transaction Model
 * Represents a financial transaction
 */

module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define(
    'Transaction',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Transaction type
      type: {
        type: DataTypes.ENUM(
          'message_payment',
          'file_payment',
          'consultation_payment',
          'subscription_payment',
          'refund',
          'withdrawal',
          'deposit',
          'payout',
          'other'
        ),
        allowNull: false,
      },
      // Transaction status
      status: {
        type: DataTypes.ENUM(
          'pending',
          'completed',
          'failed',
          'cancelled',
          'refunded',
          'disputed'
        ),
        defaultValue: 'pending',
      },
      // Amount
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'RUB',
        allowNull: false,
      },
      // Payment method
      paymentMethod: {
        type: DataTypes.ENUM(
          'test_balance',
          'yoo_money',
          'tinkoff',
          'stripe',
          'bank_card',
          'bank_transfer',
          'mobile_balance',
          'cryptocurrency',
          'other'
        ),
        allowNull: true,
        field: 'payment_method',
      },
      // Payment provider transaction ID
      providerTransactionId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'provider_transaction_id',
      },
      // Payment provider
      provider: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      // Description
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Related entity IDs
      messageId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'message_id',
      },
      chatId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'chat_id',
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'appointment_id',
      },
      subscriptionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'subscription_id',
      },
      // Revenue split
      doctorShare: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'doctor_share',
      },
      clinicShare: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'clinic_share',
      },
      platformShare: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'platform_share',
      },
      // Fee information
      feeAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'fee_amount',
      },
      feePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        field: 'fee_percentage',
      },
      // Net amount (after fees)
      netAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'net_amount',
      },
      // Refund information
      isRefundable: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_refundable',
      },
      refundReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'refund_reason',
      },
      refundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'refunded_at',
      },
      refundedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'refunded_by',
      },
      // Payment details
      paymentDetails: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'payment_details',
        comment: 'Provider-specific payment details',
      },
      // Billing information
      billingAddress: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'billing_address',
      },
      // Invoice information
      invoiceNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'invoice_number',
      },
      invoiceDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'invoice_date',
      },
      // Receipt information
      receiptNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'receipt_number',
      },
      receiptDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'receipt_date',
      },
      // Tax information
      taxAmount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        field: 'tax_amount',
      },
      taxRate: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0,
        field: 'tax_rate',
      },
      // Metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
      // IP address
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      // User agent
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'user_agent',
      },
    },
    {
      tableName: 'transactions',
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['doctorId'],
        },
        {
          fields: ['patientId'],
        },
        {
          fields: ['clinicId'],
        },
        {
          fields: ['type'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['paymentMethod'],
        },
        {
          fields: ['providerTransactionId'],
        },
        {
          fields: ['messageId'],
        },
        {
          fields: ['chatId'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  Transaction.associate = (models) => {
    // Transaction belongs to User (who initiated)
    Transaction.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Doctor
    Transaction.belongsTo(models.Doctor, {
      foreignKey: 'doctorId',
      as: 'doctor',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Patient
    Transaction.belongsTo(models.Patient, {
      foreignKey: 'patientId',
      as: 'patient',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Clinic
    Transaction.belongsTo(models.Clinic, {
      foreignKey: 'clinicId',
      as: 'clinic',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Message
    Transaction.belongsTo(models.Message, {
      foreignKey: 'messageId',
      as: 'message',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Chat
    Transaction.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'SET NULL',
    });

    // Transaction belongs to Appointment
    Transaction.belongsTo(models.Appointment, {
      foreignKey: 'appointmentId',
      as: 'appointment',
      onDelete: 'SET NULL',
    });

    // Transaction has many TransactionLogs
    Transaction.hasMany(models.TransactionLog, {
      foreignKey: 'transactionId',
      as: 'logs',
      onDelete: 'CASCADE',
    });

    // Transaction has many AuditLogs
    Transaction.hasMany(models.AuditLog, {
      foreignKey: 'transactionId',
      as: 'auditLogs',
      onDelete: 'SET NULL',
    });
  };

  return Transaction;
};
