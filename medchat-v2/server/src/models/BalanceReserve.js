/**
 * BalanceReserve Model
 * Represents reserved balance for pending transactions
 */

module.exports = (sequelize, DataTypes) => {
  const BalanceReserve = sequelize.define(
    'BalanceReserve',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      balanceId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'balance_id',
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'RUB',
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      reference: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Reference to the transaction or operation',
      },
      type: {
        type: DataTypes.ENUM('reservation', 'hold', 'pending', 'other'),
        defaultValue: 'reservation',
      },
      status: {
        type: DataTypes.ENUM('active', 'committed', 'released', 'expired', 'cancelled'),
        defaultValue: 'active',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
      // Metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
    },
    {
      tableName: 'balance_reserves',
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['balanceId'],
        },
        {
          fields: ['reference'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  BalanceReserve.associate = (models) => {
    BalanceReserve.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });

    BalanceReserve.belongsTo(models.Balance, {
      foreignKey: 'balanceId',
      as: 'balance',
      onDelete: 'CASCADE',
    });

    BalanceReserve.hasOne(models.Transaction, {
      foreignKey: 'reserveId',
      as: 'transaction',
      onDelete: 'SET NULL',
    });
  };

  return BalanceReserve;
};
