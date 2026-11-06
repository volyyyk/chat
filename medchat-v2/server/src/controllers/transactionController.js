/**
 * Transaction Controller
 * Handles all transaction-related operations including test balance
 */

const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const BalanceService = require('../services/balanceService');
const CryptoService = require('../services/cryptoService');

class TransactionController {
  /**
   * Create a new transaction
   */
  static async create(req, res, next) {
    try {
      const {
        userId,
        doctorId,
        clinicId,
        patientId,
        chatId,
        type,
        amount,
        currency = 'RUB',
        paymentMethod = 'test_balance',
        description,
        referenceId,
        metadata,
      } = req.body;

      const currentUserId = req.user.id;

      // Validate user
      if (userId && userId !== currentUserId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot create transaction for another user', 403, 'FORBIDDEN');
      }

      const targetUserId = userId || currentUserId;

      // For test balance, use BalanceService
      if (paymentMethod === 'test_balance') {
        const result = await BalanceService.deposit(
          targetUserId,
          amount,
          currency,
          description || `Test deposit from ${currentUserId}`
        );

        return res.status(201).json({
          success: true,
          transaction: result.transaction,
          balance: result.balance,
        });
      }

      // For real payments (placeholder - not implemented per user request)
      const transaction = await models.Transaction.create({
        userId: targetUserId,
        doctorId,
        clinicId,
        patientId,
        chatId,
        type,
        amount,
        currency,
        paymentMethod,
        status: paymentMethod === 'test_balance' ? 'completed' : 'pending',
        description,
        referenceId,
        metadata,
        createdBy: currentUserId,
      });

      // If this is a message payment, reserve the amount
      if (type === 'message_payment' || type === 'file_payment') {
        await BalanceService.reserve(
          targetUserId,
          amount,
          currency,
          `transaction_${transaction.id}`
        );
      }

      res.status(201).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List transactions
   */
  static async list(req, res, next) {
    try {
      const {
        userId,
        doctorId,
        clinicId,
        patientId,
        chatId,
        type,
        status,
        paymentMethod,
        currency,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      // Access control
      if (userId && userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other user transactions', 403, 'FORBIDDEN');
      }

      const where = {};

      if (userId) where.userId = userId;
      else if (!req.user.roles?.includes('admin')) where.userId = req.user.id;

      if (doctorId) where.doctorId = doctorId;
      if (clinicId) where.clinicId = clinicId;
      if (patientId) where.patientId = patientId;
      if (chatId) where.chatId = chatId;
      if (type) where.type = type;
      if (status) where.status = status;
      if (paymentMethod) where.paymentMethod = paymentMethod;
      if (currency) where.currency = currency;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.$gte = new Date(startDate);
        if (endDate) where.createdAt.$lte = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Transaction.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username', 'email'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Chat, attributes: ['id', 'chatId'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction by ID
   */
  static async getById(req, res, next) {
    try {
      const { id } = req.params;

      const transaction = await models.Transaction.findOne({
        where: { id },
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username', 'email'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Clinic, attributes: ['id', 'name'] },
          { model: models.Chat, attributes: ['id', 'chatId'] },
        ],
      });

      if (!transaction) {
        throw new AppError('Transaction not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (transaction.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other user transaction', 403, 'FORBIDDEN');
      }

      res.json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel transaction
   */
  static async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const transaction = await models.Transaction.findOne({ where: { id } });

      if (!transaction) {
        throw new AppError('Transaction not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (transaction.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot cancel other user transaction', 403, 'FORBIDDEN');
      }

      // Only pending transactions can be cancelled
      if (transaction.status !== 'pending') {
        throw new AppError('Only pending transactions can be cancelled', 400, 'VALIDATION_ERROR');
      }

      // Release reserved amount if any
      if (transaction.type === 'message_payment' || transaction.type === 'file_payment') {
        await BalanceService.release(`transaction_${transaction.id}`);
      }

      await transaction.update({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: req.user.id,
        cancellationReason: reason,
      });

      res.json({
        success: true,
        data: transaction,
        message: 'Transaction cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refund transaction
   */
  static async refund(req, res, next) {
    try {
      const {
        transactionId,
        amount,
        reason,
        currency = 'RUB',
      } = req.body;

      const transaction = await models.Transaction.findOne({ where: { id: transactionId } });

      if (!transaction) {
        throw new AppError('Transaction not found', 404, 'NOT_FOUND');
      }

      // Access control
      if (transaction.userId !== req.user.id && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot refund other user transaction', 403, 'FORBIDDEN');
      }

      // Only completed transactions can be refunded
      if (transaction.status !== 'completed') {
        throw new AppError('Only completed transactions can be refunded', 400, 'VALIDATION_ERROR');
      }

      // Create refund transaction
      const refund = await models.Transaction.create({
        userId: transaction.userId,
        doctorId: transaction.doctorId,
        clinicId: transaction.clinicId,
        patientId: transaction.patientId,
        chatId: transaction.chatId,
        type: 'refund',
        amount: amount || transaction.amount,
        currency,
        paymentMethod: transaction.paymentMethod,
        status: 'completed',
        description: `Refund for transaction ${transactionId}: ${reason}`,
        referenceId: transaction.id,
        createdBy: req.user.id,
      });

      // Update original transaction
      await transaction.update({ status: 'refunded', refundedAt: new Date() });

      // Return money to balance
      await BalanceService.deposit(
        transaction.userId,
        amount || transaction.amount,
        currency,
        `Refund for transaction ${transactionId}`
      );

      res.json({
        success: true,
        data: refund,
        message: 'Transaction refunded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user balance
   */
  static async getBalance(req, res, next) {
    try {
      const { currency = 'RUB' } = req.query;
      const userId = req.user.id;

      const balance = await models.Balance.findOne({
        where: { userId, currency },
        include: [
          {
            model: models.BalanceReserve,
            where: { released: false },
            required: false,
          },
        ],
      });

      const reserved = balance?.BalanceReserves?.reduce(
        (sum, reserve) => sum + reserve.amount,
        0
      ) || 0;

      res.json({
        success: true,
        data: {
          available: balance?.available || 0,
          reserved,
          total: (balance?.available || 0) + reserved,
          currency,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deposit to balance (test balance)
   */
  static async deposit(req, res, next) {
    try {
      const {
        amount,
        currency = 'RUB',
        description,
      } = req.body;

      if (!amount || amount <= 0) {
        throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
      }

      const result = await BalanceService.deposit(
        req.user.id,
        amount,
        currency,
        description || 'Test balance deposit'
      );

      res.status(201).json({
        success: true,
        data: result.transaction,
        balance: result.balance,
        message: 'Deposit successful',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Withdraw from balance
   */
  static async withdraw(req, res, next) {
    try {
      const {
        amount,
        currency = 'RUB',
        description,
      } = req.body;

      if (!amount || amount <= 0) {
        throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
      }

      const hasBalance = await BalanceService.hasSufficientBalance(
        req.user.id,
        amount,
        currency
      );

      if (!hasBalance) {
        throw new AppError('Insufficient balance', 402, 'PAYMENT_REQUIRED');
      }

      const result = await BalanceService.withdraw(
        req.user.id,
        amount,
        currency,
        description || 'Withdrawal'
      );

      res.status(201).json({
        success: true,
        data: result.transaction,
        balance: result.balance,
        message: 'Withdrawal successful',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create payout (doctor withdrawal)
   */
  static async createPayout(req, res, next) {
    try {
      const {
        amount,
        currency = 'RUB',
        payoutMethod,
        payoutDetails,
        description,
      } = req.body;

      const doctorId = req.user.doctorId || req.user.id;

      if (!amount || amount <= 0) {
        throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
      }

      // Check if doctor has sufficient balance
      const hasBalance = await BalanceService.hasSufficientBalance(
        req.user.id,
        amount,
        currency
      );

      if (!hasBalance) {
        throw new AppError('Insufficient balance', 402, 'PAYMENT_REQUIRED');
      }

      // Create payout transaction
      const payout = await models.Transaction.create({
        userId: req.user.id,
        doctorId,
        type: 'payout',
        amount,
        currency,
        paymentMethod: payoutMethod || 'test_balance',
        status: 'pending',
        description: description || `Payout to ${payoutMethod}`,
        metadata: {
          payoutMethod,
          payoutDetails,
        },
        createdBy: req.user.id,
      });

      // Reserve the amount
      await BalanceService.reserve(
        req.user.id,
        amount,
        currency,
        `payout_${payout.id}`
      );

      res.status(201).json({
        success: true,
        data: payout,
        message: 'Payout created successfully. It will be processed shortly.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List payouts
   */
  static async listPayouts(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {
        type: 'payout',
      };

      if (doctorId) where.doctorId = doctorId;
      else if (req.user.doctorId) where.doctorId = req.user.doctorId;
      else where.userId = req.user.id;

      if (clinicId) where.clinicId = clinicId;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.$gte = new Date(startDate);
        if (endDate) where.createdAt.$lte = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Transaction.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List transactions by doctor
   */
  static async listByDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const {
        type,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      // Access control
      if (doctorId !== req.user.doctorId && !req.user.roles?.includes('admin')) {
        throw new AppError('Cannot access other doctor transactions', 403, 'FORBIDDEN');
      }

      const where = { doctorId };

      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.$gte = new Date(startDate);
        if (endDate) where.createdAt.$lte = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Transaction.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
          { model: models.Chat, attributes: ['id', 'chatId'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List transactions by clinic
   */
  static async listByClinic(req, res, next) {
    try {
      const { clinicId } = req.params;
      const {
        type,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = req.query;

      const where = { clinicId };

      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.$gte = new Date(startDate);
        if (endDate) where.createdAt.$lte = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await models.Transaction.findAndCountAll({
        where,
        include: [
          { model: models.User, as: 'user', attributes: ['id', 'username'] },
          { model: models.Doctor, attributes: ['id', 'fullName'] },
          { model: models.Patient, attributes: ['id', 'fullName'] },
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const {
        doctorId,
        clinicId,
        startDate,
        endDate,
      } = req.query;

      const where = {};

      if (doctorId) where.doctorId = doctorId;
      else if (req.user.doctorId) where.doctorId = req.user.doctorId;

      if (clinicId) where.clinicId = clinicId;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.$gte = new Date(startDate);
        if (endDate) where.createdAt.$lte = new Date(endDate);
      }

      // Get counts by type
      const byType = await models.Transaction.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count'], [models.Sequelize.fn('SUM', models.Sequelize.col('amount')), 'totalAmount']],
        group: ['type'],
        raw: true,
      });

      // Get counts by status
      const byStatus = await models.Transaction.findAll({
        where,
        attributes: ['status', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      });

      // Get total
      const total = await models.Transaction.count({ where });
      const totalAmount = await models.Transaction.sum('amount', { where });

      res.json({
        success: true,
        data: {
          totalTransactions: total,
          totalAmount: totalAmount || 0,
          byType: byType.reduce((acc, item) => {
            acc[item.type] = { count: item.count, totalAmount: item.totalAmount || 0 };
            return acc;
          }, {}),
          byStatus: byStatus.reduce((acc, item) => {
            acc[item.status] = item.count;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = TransactionController;
