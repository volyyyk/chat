/**
 * Balance Service
 * Handles user balance management for test payments.
 * All balance mutations run inside SQL transactions with row locks (SELECT ... FOR UPDATE)
 * so concurrent sends/deposits can never race or produce negative balances.
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');

class BalanceService {
  /**
   * Get or create a balance row, locked for the current transaction.
   * @private
   */
  static async getOrCreateBalance(userId, currency, t) {
    if (!userId) {
      throw new AppError('User not found', 404, 'NOT_FOUND');
    }

    let balance = await models.Balance.findOne({
      where: { userId, currency },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!balance) {
      try {
        balance = await models.Balance.create(
          { userId, currency, amount: 0, available: 0, reserved: 0 },
          { transaction: t }
        );
      } catch (e) {
        // Unique constraint on concurrent create: re-read with lock
        balance = await models.Balance.findOne({
          where: { userId, currency },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!balance) throw e;
      }
    }

    return balance;
  }

  /**
   * Get user balance
   * @param {string} userId - User ID
   * @param {string} currency - Currency (default: RUB)
   * @returns {Promise<Object>} Balance information
   */
  static async getBalance(userId, currency = 'RUB') {
    const balance = await models.Balance.findOne({ where: { userId, currency } });

    return {
      userId,
      currency,
      amount: balance ? Number(balance.amount) : 0,
      available: balance ? Number(balance.available) : 0,
      reserved: balance ? Number(balance.reserved) : 0,
      updatedAt: balance ? balance.updatedAt : new Date(),
    };
  }

  /**
   * Deposit to user balance (test balance only)
   */
  static async deposit(userId, amount, currency = 'RUB', description = 'Test deposit') {
    if (!(Number(amount) > 0)) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    return models.sequelize.transaction(async (t) => {
      const balance = await this.getOrCreateBalance(userId, currency, t);

      const balanceBefore = Number(balance.amount);
      const newAmount = balanceBefore + Number(amount);
      const newAvailable = Number(balance.available) + Number(amount);

      await balance.update(
        { amount: newAmount, available: newAvailable },
        { transaction: t }
      );

      const transaction = await models.Transaction.create(
        {
          userId,
          type: 'deposit',
          amount,
          currency,
          paymentMethod: 'test_balance',
          status: 'completed',
          description,
          metadata: {
            balanceBefore,
            balanceAfter: newAmount,
          },
        },
        { transaction: t }
      );

      return {
        success: true,
        balanceBefore,
        balanceAfter: newAmount,
        balance: {
          userId,
          currency,
          amount: newAmount,
          available: newAvailable,
          reserved: Number(balance.reserved),
        },
        transaction,
      };
    });
  }

  /**
   * Withdraw from user balance
   */
  static async withdraw(userId, amount, currency = 'RUB', description = 'Withdrawal') {
    if (!(Number(amount) > 0)) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    return models.sequelize.transaction(async (t) => {
      const balance = await this.getOrCreateBalance(userId, currency, t);

      const availableBefore = Number(balance.available);
      if (availableBefore < Number(amount)) {
        throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
      }

      const balanceBefore = Number(balance.amount);
      const newAvailable = availableBefore - Number(amount);
      const newAmount = balanceBefore - Number(amount);

      await balance.update(
        { amount: newAmount, available: newAvailable },
        { transaction: t }
      );

      const transaction = await models.Transaction.create(
        {
          userId,
          type: 'withdrawal',
          amount,
          currency,
          paymentMethod: 'test_balance',
          status: 'completed',
          description,
          metadata: {
            balanceBefore,
            balanceAfter: newAmount,
          },
        },
        { transaction: t }
      );

      return {
        success: true,
        balanceBefore,
        balanceAfter: newAmount,
        balance: {
          userId,
          currency,
          amount: newAmount,
          available: newAvailable,
          reserved: Number(balance.reserved),
        },
        transaction,
      };
    });
  }

  /**
   * Atomically charge a balance. Does NOT create a Transaction record;
   * the caller creates the Transaction inside the same SQL transaction
   * via options.transaction.
   * @returns {Promise<{success: boolean, error?: string, balanceBefore?: number, balanceAfter?: number}>}
   */
  static async charge(userId, amount, currency = 'RUB', description = '', options = {}) {
    const t = options.transaction || null;
    const amt = Number(amount);

    if (!(amt > 0)) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    const run = async (tx) => {
      const balance = await this.getOrCreateBalance(userId, currency, tx);

      const availableBefore = Number(balance.available);
      if (availableBefore < amt) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance',
        };
      }

      const balanceBefore = Number(balance.amount);
      const newAvailable = availableBefore - amt;
      const newAmount = balanceBefore - amt;

      await balance.update(
        { amount: newAmount, available: newAvailable },
        { transaction: tx }
      );

      return {
        success: true,
        balanceBefore,
        balanceAfter: newAmount,
        balance: {
          userId,
          currency,
          amount: newAmount,
          available: newAvailable,
          reserved: Number(balance.reserved),
        },
      };
    };

    if (t) {
      return run(t);
    }
    return models.sequelize.transaction(run);
  }

  /**
   * Transfer balance between users (atomic)
   */
  static async transfer(fromUserId, toUserId, amount, currency = 'RUB', description = 'Transfer') {
    if (!(Number(amount) > 0)) {
      throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
    }

    return models.sequelize.transaction(async (t) => {
      const fromBalance = await this.getOrCreateBalance(fromUserId, currency, t);

      const fromAvailableBefore = Number(fromBalance.available);
      if (fromAvailableBefore < Number(amount)) {
        throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
      }

      const fromBefore = Number(fromBalance.amount);
      const fromNewAvailable = fromAvailableBefore - Number(amount);
      const fromNewAmount = fromBefore - Number(amount);
      await fromBalance.update(
        { amount: fromNewAmount, available: fromNewAvailable },
        { transaction: t }
      );

      const toBalance = await this.getOrCreateBalance(toUserId, currency, t);
      const toBefore = Number(toBalance.amount);
      const toNewAmount = toBefore + Number(amount);
      const toNewAvailable = Number(toBalance.available) + Number(amount);
      await toBalance.update(
        { amount: toNewAmount, available: toNewAvailable },
        { transaction: t }
      );

      return {
        success: true,
        fromBalance: {
          userId: fromUserId,
          currency,
          amount: fromNewAmount,
          available: fromNewAvailable,
          reserved: Number(fromBalance.reserved),
        },
        toBalance: {
          userId: toUserId,
          currency,
          amount: toNewAmount,
          available: toNewAvailable,
          reserved: Number(toBalance.reserved),
        },
      };
    });
  }

  /**
   * Reserve balance for a transaction
   */
  static async reserve(userId, amount, currency = 'RUB', reference) {
    return models.sequelize.transaction(async (t) => {
      const balance = await this.getOrCreateBalance(userId, currency, t);

      const availableBefore = Number(balance.available);
      if (availableBefore < Number(amount)) {
        throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
      }

      const newAvailable = availableBefore - Number(amount);
      const newReserved = Number(balance.reserved) + Number(amount);

      await balance.update(
        { available: newAvailable, reserved: newReserved },
        { transaction: t }
      );

      // Create reserve record (balanceId is NOT NULL)
      const reserve = await models.BalanceReserve.create(
        {
          balanceId: balance.id,
          userId,
          currency,
          amount,
          reference,
          type: 'reservation',
          status: 'active',
          metadata: {
            balanceBefore: Number(balance.amount),
            availableBefore,
            reservedBefore: Number(balance.reserved),
          },
        },
        { transaction: t }
      );

      return {
        success: true,
        balance: {
          userId,
          currency,
          amount: Number(balance.amount),
          available: newAvailable,
          reserved: newReserved,
        },
        reserve,
      };
    });
  }

  /**
   * Release reserved balance
   */
  static async release(reference) {
    return models.sequelize.transaction(async (t) => {
      const reserve = await models.BalanceReserve.findOne({
        where: { reference, status: 'active' },
        transaction: t,
      });
      if (!reserve) {
        throw new AppError('Reserve not found', 404, 'NOT_FOUND');
      }

      const balance = await this.getOrCreateBalance(reserve.userId, reserve.currency, t);

      const newAvailable = Number(balance.available) + Number(reserve.amount);
      const newReserved = Number(balance.reserved) - Number(reserve.amount);

      await balance.update(
        { available: newAvailable, reserved: newReserved },
        { transaction: t }
      );

      await reserve.update({ status: 'released' }, { transaction: t });

      return {
        success: true,
        balance: {
          userId: reserve.userId,
          currency: reserve.currency,
          amount: Number(balance.amount),
          available: newAvailable,
          reserved: newReserved,
        },
      };
    });
  }

  /**
   * Commit reserved balance (reserved money is finally spent)
   */
  static async commit(reference) {
    return models.sequelize.transaction(async (t) => {
      const reserve = await models.BalanceReserve.findOne({
        where: { reference, status: 'active' },
        transaction: t,
      });
      if (!reserve) {
        throw new AppError('Reserve not found', 404, 'NOT_FOUND');
      }

      const balance = await this.getOrCreateBalance(reserve.userId, reserve.currency, t);

      const newReserved = Number(balance.reserved) - Number(reserve.amount);
      const newAmount = Number(balance.amount) - Number(reserve.amount);

      await balance.update(
        { amount: newAmount, reserved: newReserved },
        { transaction: t }
      );

      await reserve.update({ status: 'committed' }, { transaction: t });

      return {
        success: true,
        balance: {
          userId: reserve.userId,
          currency: reserve.currency,
          amount: newAmount,
          available: Number(balance.available),
          reserved: newReserved,
        },
      };
    });
  }

  /**
   * Check if user has sufficient balance
   */
  static async hasSufficientBalance(userId, amount, currency = 'RUB') {
    const balance = await models.Balance.findOne({ where: { userId, currency } });
    return Boolean(balance) && Number(balance.available) >= Number(amount);
  }

  /**
   * Get balance history
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
