/**
 * Balance Model
 * Represents user balance for test payments
 */

module.exports = (sequelize, DataTypes) => {
  const Balance = sequelize.define(
    'Balance',
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
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'RUB',
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Total balance (available + reserved)',
      },
      available: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Available balance for spending',
      },
      reserved: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
        allowNull: false,
        comment: 'Reserved balance for pending transactions',
      },
      // For legal compliance (152-FZ)
      isTest: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_test',
        comment: 'Whether this is test balance (not real money)',
      },
      // Metadata
      metadata: {
        type: DataTypes.JSONB,
        defaultValue: {},
        field: 'metadata',
      },
    },
    {
      tableName: 'balances',
      indexes: [
        {
          unique: true,
          fields: ['userId', 'currency'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['currency'],
        },
        {
          fields: ['updatedAt'],
        },
      ],
    }
  );

  Balance.associate = (models) => {
    Balance.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
    });

    Balance.hasMany(models.BalanceReserve, {
      foreignKey: 'balanceId',
      as: 'reserves',
      onDelete: 'CASCADE',
    });

    Balance.hasMany(models.Transaction, {
      foreignKey: 'balanceId',
      as: 'transactions',
      onDelete: 'SET NULL',
    });
  };

  return Balance;
};
