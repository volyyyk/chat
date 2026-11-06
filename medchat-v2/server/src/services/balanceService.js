/**
 * Balance Service
 * Handles user balance management for test payments
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');

class BalanceService {
  /**
   * Get user balance
   * @param {string} userId - User ID
   * @param {string} currency - Currency (default: RUB)
   * @returns {Promise<Object>} Balance information
   */
  static async getBalance(userId, currency = 'RUB') {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    // For test balance, we use a separate model or store in user metadata
    // In this implementation, we'll use a Balance model
    const balance = await models.Balance.findOne({ where: { userId, currency } });

    return {
      userId,
      currency,
      amount: balance ? balance.amount : 0,
      available: balance ? balance.available : 0,
      reserved: balance ? balance.reserved : 0,
      updatedAt: balance ? balance.updatedAt : new Date(),
    };
  }

  /**
   * Deposit to user balance (test balance only)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to deposit
   * @param {string} currency - Currency
   * @param {string} description - Description
   * @returns {Promise<Object>} Transaction result
   */
  static async deposit(userId, amount, currency = 'RUB', description = 'Test deposit') {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    if (amount <= 0) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    // Get or create balance
    let balance = await models.Balance.findOne({ where: { userId, currency } });
    if (!balance) {
      balance = await models.Balance.create({
        userId,
        currency,
        amount: 0,
        available: 0,
        reserved: 0,
      });
    }

    // Update balance
    const newAmount = balance.amount + amount;
    const newAvailable = balance.available + amount;

    await balance.update({
      amount: newAmount,
      available: newAvailable,
    });

    // Create transaction
    const transaction = await models.Transaction.create({
      userId,
      type: 'deposit',
      amount,
      currency,
      paymentMethod: 'test_balance',
      status: 'completed',
      description,
      metadata: {
        balanceBefore: balance.amount,
        balanceAfter: newAmount,
      },
    });

    return {
      success: true,
      balance: {
        userId,
        currency,
        amount: newAmount,
        available: newAvailable,
        reserved: balance.reserved,
      },
      transaction,
    };
  }

  /**
   * Withdraw from user balance
   * @param {string} userId - User ID
   * @param {number} amount - Amount to withdraw
   * @param {string} currency - Currency
   * @param {string} description - Description
   * @returns {Promise<Object>} Transaction result
   */
  static async withdraw(userId, amount, currency = 'RUB', description = 'Withdrawal') {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    if (amount <= 0) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    const balance = await models.Balance.findOne({ where: { userId, currency } });
    if (!balance || balance.available < amount) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    const newAvailable = balance.available - amount;
    const newAmount = balance.amount - amount;

    await balance.update({
      amount: newAmount,
      available: newAvailable,
    });

    const transaction = await models.Transaction.create({
      userId,
      type: 'withdrawal',
      amount,
      currency,
      paymentMethod: 'test_balance',
      status: 'completed',
      description,
      metadata: {
        balanceBefore: balance.amount,
        balanceAfter: newAmount,
      },
    });

    return {
      success: true,
      balance: {
        userId,
        currency,
        amount: newAmount,
        available: newAvailable,
        reserved: balance.reserved,
      },
      transaction,
    };
  }

  /**
   * Transfer balance between users
   * @param {string} fromUserId - Source user ID
   * @param {string} toUserId - Destination user ID
   * @param {number} amount - Amount to transfer
   * @param {string} currency - Currency
   * @param {string} description - Description
   * @returns {Promise<Object>} Transfer result
   */
  static async transfer(fromUserId, toUserId, amount, currency = 'RUB', description = 'Transfer') {
    const fromUser = await models.User.findByPk(fromUserId);
    const toUser = await models.User.findByPk(toUserId);

    if (!fromUser || !toUser) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    if (amount <= 0) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    const fromBalance = await models.Balance.findOne({ where: { userId: fromUserId, currency } });
    if (!fromBalance || fromBalance.available < amount) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    // Update source balance
    const fromNewAvailable = fromBalance.available - amount;
    const fromNewAmount = fromBalance.amount - amount;
    await fromBalance.update({
      amount: fromNewAmount,
      available: fromNewAvailable,
    });

    // Get or create destination balance
    let toBalance = await models.Balance.findOne({ where: { userId: toUserId, currency } });
    if (!toBalance) {
      toBalance = await models.Balance.create({
        userId: toUserId,
        currency,
        amount: 0,
        available: 0,
        reserved: 0,
      });
    }

    // Update destination balance
    const toNewAmount = toBalance.amount + amount;
    const toNewAvailable = toBalance.available + amount;
    await toBalance.update({
      amount: toNewAmount,
      available: toNewAvailable,
    });

    // Create transactions
    const fromTransaction = await models.Transaction.create({
      userId: fromUserId,
      type: 'withdrawal',
      amount,
      currency,
      paymentMethod: 'test_balance',
      status: 'completed',
      description: `Transfer to ${toUser.email}: ${description}`,
      metadata: {
        recipientId: toUserId,
        balanceBefore: fromBalance.amount,
        balanceAfter: fromNewAmount,
      },
    });

    const toTransaction = await models.Transaction.create({
      userId: toUserId,
      type: 'deposit',
      amount,
      currency,
      paymentMethod: 'test_balance',
      status: 'completed',
      description: `Transfer from ${fromUser.email}: ${description}`,
      metadata: {
        senderId: fromUserId,
        balanceBefore: toBalance.amount,
        balanceAfter: toNewAmount,
      },
    });

    return {
      success: true,
      fromBalance: {
        userId: fromUserId,
        currency,
        amount: fromNewAmount,
        available: fromNewAvailable,
        reserved: fromBalance.reserved,
      },
      toBalance: {
        userId: toUserId,
        currency,
        amount: toNewAmount,
        available: toNewAvailable,
        reserved: toBalance.reserved,
      },
      fromTransaction,
      toTransaction,
    };
  }

  /**
   * Reserve balance for a transaction
   * @param {string} userId - User ID
   * @param {number} amount - Amount to reserve
   * @param {string} currency - Currency
   * @param {string} reference - Reference ID
   * @returns {Promise<Object>} Reserve result
   */
  static async reserve(userId, amount, currency = 'RUB', reference) {
    const user = await models.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    if (amount <= 0) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    const balance = await models.Balance.findOne({ where: { userId, currency } });
    if (!balance || balance.available < amount) {
      throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
    }

    const newAvailable = balance.available - amount;
    const newReserved = balance.reserved + amount;

    await balance.update({
      available: newAvailable,
      reserved: newReserved,
    });

    // Create reserve record
    const reserve = await models.BalanceReserve.create({
      userId,
      currency,
      amount,
      reference,
      type: 'reservation',
      status: 'active',
      metadata: {
        balanceBefore: balance.amount,
        availableBefore: balance.available,
        reservedBefore: balance.reserved,
      },
    });

    return {
      success: true,
      balance: {
        userId,
        currency,
        amount: balance.amount,
        available: newAvailable,
        reserved: newReserved,
      },
      reserve,
    };
  }

  /**
   * Release reserved balance
   * @param {string} reference - Reference ID
   * @returns {Promise<Object>} Release result
   */
  static async release(reference) {
    const reserve = await models.BalanceReserve.findOne({ where: { reference, status: 'active' } });
    if (!reserve) {
      throw new AppError('Reserve not found', 404, 'NOT_FOUND');
    }

    const balance = await models.Balance.findOne({ where: { userId: reserve.userId, currency: reserve.currency } });
    if (!balance) {
      throw new AppError('Balance not found', 404, 'NOT_FOUND');
    }

    const newAvailable = balance.available + reserve.amount;
    const newReserved = balance.reserved - reserve.amount;

    await balance.update({
      available: newAvailable,
      reserved: newReserved,
    });

    await reserve.update({ status: 'released' });

    return {
      success: true,
      balance: {
        userId: reserve.userId,
        currency: reserve.currency,
        amount: balance.amount,
        available: newAvailable,
        reserved: newReserved,
      },
    };
  }

  /**
   * Commit reserved balance
   * @param {string} reference - Reference ID
   * @returns {Promise<Object>} Commit result
   */
  static async commit(reference) {
    const reserve = await models.BalanceReserve.findOne({ where: { reference, status: 'active' } });
    if (!reserve) {
      throw new AppError('Reserve not found', 404, 'NOT_FOUND');
    }

    const balance = await models.Balance.findOne({ where: { userId: reserve.userId, currency: reserve.currency } });
    if (!balance) {
      throw new AppError('Balance not found', 404, 'NOT_FOUND');
    }

    const newReserved = balance.reserved - reserve.amount;

    await balance.update({
      reserved: newReserved,
    });

    await reserve.update({ status: 'committed' });

    return {
      success: true,
      balance: {
        userId: reserve.userId,
        currency: reserve.currency,
        amount: balance.amount,
        available: balance.available,
        reserved: newReserved,
      },
    };
  }

  /**
   * Check if user has sufficient balance
   * @param {string} userId - User ID
   * @param {number} amount - Amount to check
   * @param {string} currency - Currency
   * @returns {Promise<boolean>} Has sufficient balance
   */
  static async hasSufficientBalance(userId, amount, currency = 'RUB') {
    const balance = await models.Balance.findOne({ where: { userId, currency } });
    return balance && balance.available >= amount;
  }

  /**
   * Get balance history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Balance history
   */
  static async getBalanceHistory(userId, options = {}) {
    const { page = 1, limit = 20, currency = 'RUB' } = options;

    const transactions = await models.Transaction.findAll({
      where: { userId, currency },
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * limit,
      limit,
    });

    const count = await models.Transaction.count({ where: { userId, currency } });

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }
}

module.exports = BalanceService;
