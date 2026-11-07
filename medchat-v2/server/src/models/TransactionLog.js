/**
 * Transaction Log Model
 * Status change history for payment transactions
 */

module.exports = (sequelize, DataTypes) => {
  const TransactionLog = sequelize.define('TransactionLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'transaction_logs',
    indexes: [
      { fields: ['transaction_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  });

  TransactionLog.associate = (models) => {
    TransactionLog.belongsTo(models.Transaction, {
      foreignKey: 'transactionId',
      as: 'transaction',
      onDelete: 'CASCADE',
    });
  };

  return TransactionLog;
};
