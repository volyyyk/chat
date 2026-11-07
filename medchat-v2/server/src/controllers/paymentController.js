/**
 * Payment Controller
 * Handles payment-related operations with test balance
 */

const { Op } = require('sequelize');
const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const PaymentService = require('../services/paymentService');
const BalanceService = require('../services/balanceService');

class PaymentController {
  /**
   * Get available payment methods
   */
  static async getPaymentMethods(req, res, next) {
    try {
      const methods = await PaymentService.getPaymentMethods();
      res.json({
        success: true,
        data: methods,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get pricing information
   */
  static async getPricing(req, res, next) {
    try {
      const pricing = await PaymentService.getPricing();
      res.json({
        success: true,
        data: pricing,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create payment
   */
  static async create(req, res, next) {
    try {
      const {
        type,
        amount,
        currency = 'RUB',
        description,
      } = req.body;

      const userId = req.user.id;

      if (!type || !amount) {
        throw new AppError('Type and amount are required', 400, 'VALIDATION_ERROR');
      }

      const result = await PaymentService.processMessagePayment(
        userId,
        amount,
        currency,
        null,
        null,
        description
      );

      if (!result.success) {
        throw new AppError(result.message || 'Payment failed', 402, result.error);
      }

      res.status(201).json({
        success: true,
        data: result.transaction,
        message: 'Payment created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process payment
   */
  static async process(req, res, next) {
    try {
      const {
        type,
        amount,
        currency = 'RUB',
        chatId,
        messageId,
        fileId,
        description,
      } = req.body;

      const userId = req.user.id;

      if (!type) {
        throw new AppError('Type is required', 400, 'VALIDATION_ERROR');
      }

      let result;

      switch (type) {
        case 'message': {
          if (!chatId) {
            throw new AppError('Chat ID is required for message payment', 400, 'VALIDATION_ERROR');
          }
          result = await PaymentService.processMessagePayment(
            userId,
            null, // SECURITY: the price is always server-defined (MESSAGE_PRICE_RUB)
            currency,
            chatId,
            messageId || null,
            description
          );
          break;
        }

        case 'file': {
          if (!fileId) {
            throw new AppError('File ID is required for file payment', 400, 'VALIDATION_ERROR');
          }
          result = await PaymentService.processFilePayment(
            userId,
            null, // SECURITY: the price is always server-defined (FILE_PRICE_RUB)
            currency,
            fileId,
            description
          );
          break;
        }

        case 'package':
        case 'deposit': {
          // Buying a package / depositing funds: add money to the test balance
          const depositAmount = Number(amount);
          if (!(depositAmount > 0)) {
            throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
          }
          result = await BalanceService.deposit(
            userId,
            depositAmount,
            currency,
            description || (type === 'package' ? 'Пополнение пакета (тестовый баланс)' : 'Пополнение баланса (тест)')
          );
          result.revenueSplit = undefined;
          break;
        }

        default:
          throw new AppError('Invalid payment type', 400, 'VALIDATION_ERROR');
      }

      if (!result.success) {
        throw new AppError(result.message || 'Payment failed', 402, result.error);
      }

      res.json({
        success: true,
        data: result.transaction,
        revenueSplit: result.revenueSplit,
        message: 'Payment processed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if message is free
   */
  static async checkFree(req, res, next) {
    try {
      const { chatId } = req.body;
      const userId = req.user.id;

      if (!chatId) {
        throw new AppError('Chat ID is required', 400, 'VALIDATION_ERROR');
      }

      const { isFree, reason } = await PaymentService.isMessageFree(userId, chatId);

      res.json({
        success: true,
        data: {
          isFree,
          reason,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create payout (doctor withdraws earnings)
   */
  static async createPayout(req, res, next) {
    try {
      const {
        amount,
        currency = 'RUB',
        payoutMethod = 'test_balance',
        description,
      } = req.body;

      const userId = req.user.id;

      if (!amount || amount <= 0) {
        throw new AppError('Amount must be positive', 400, 'VALIDATION_ERROR');
      }

      const result = await PaymentService.processPayout(
        userId,
        amount,
        currency,
        payoutMethod,
        req.user.doctorId || null
      );

      if (!result.success) {
        throw new AppError(result.message || 'Payout failed', 402, result.error);
      }

      res.status(201).json({
        success: true,
        data: result.transaction,
        message: 'Payout created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor balance (balance is stored per user account)
   */
  static async getDoctorBalance(req, res, next) {
    try {
      const { currency = 'RUB' } = req.query;

      const balance = await BalanceService.getBalance(req.user.id, currency);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get doctor transactions
   */
  static async getDoctorTransactions(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate,
      } = req.query;

      // Doctor history includes: his deposits (userId) and payments to him (doctorId)
      const where = {
        [Op.or]: [
          { userId: req.user.id },
          ...(req.user.doctorId ? [{ doctorId: req.user.doctorId }] : []),
        ],
      };

      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
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
   * Get clinic balance (revenue goes to the clinic admin's user balance)
   */
  static async getClinicBalance(req, res, next) {
    try {
      const { currency = 'RUB' } = req.query;

      const balance = await BalanceService.getBalance(req.user.id, currency);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get payment statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const {
        startDate,
        endDate,
      } = req.query;

      const where = {};

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      // Get counts by type
      const byType = await models.Transaction.findAll({
        where,
        attributes: ['type', [models.Sequelize.fn('COUNT', models.Sequelize.col('id')), 'count'], [models.Sequelize.fn('SUM', models.Sequelize.col('amount')), 'totalAmount']],
        group: ['type'],
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
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentController;
