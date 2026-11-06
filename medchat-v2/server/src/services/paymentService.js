/**
 * Payment Service
 * Handles test balance payments and real payment integrations
 * Note: Real payment integrations (YooMoney, Tinkoff) are not implemented per user request
 */

const models = require('../models');
const BalanceService = require('./balanceService');
const TransactionService = require('./transactionService');

class PaymentService {
  /**
   * Process message payment
   * @param {string} userId - User ID
   * @param {number} amount - Amount to charge
   * @param {string} currency - Currency (default: RUB)
   * @param {string} chatId - Chat ID
   * @param {string} messageId - Message ID
   * @param {string} description - Description
   * @returns {Promise<Object>} - Payment result
   */
  static async processMessagePayment(userId, amount, currency = 'RUB', chatId, messageId, description) {
    try {
      // Check if user has sufficient balance
      const hasBalance = await BalanceService.hasSufficientBalance(userId, amount, currency);

      if (!hasBalance) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance for this payment',
        };
      }

      // Reserve the amount
      const reserveRef = `message_${messageId}_${Date.now()}`;
      await BalanceService.reserve(userId, amount, currency, reserveRef);

      // Create transaction
      const transaction = await models.Transaction.create({
        userId,
        chatId,
        type: 'message_payment',
        amount,
        currency,
        paymentMethod: 'test_balance',
        status: 'completed',
        description: description || `Payment for message ${messageId}`,
        referenceId: messageId,
        metadata: { reserveRef },
      });

      // Commit the reservation
      await BalanceService.commit(reserveRef);

      // Calculate revenue split (70% to doctor, 30% to clinic)
      const doctorAmount = Math.round(amount * 0.7);
      const clinicAmount = amount - doctorAmount;

      // Get doctor and clinic IDs from chat
      const chat = await models.Chat.findOne({
        where: { id: chatId },
        include: [
          { model: models.Doctor, attributes: ['id'] },
          { model: models.Clinic, attributes: ['id'] },
        ],
      });

      if (chat?.Doctor?.id) {
        // Credit doctor
        await BalanceService.deposit(
          chat.Doctor.id,
          doctorAmount,
          currency,
          `Revenue from message payment ${messageId}`
        );

        // Credit clinic if exists
        if (chat.Clinic?.id) {
          await BalanceService.deposit(
            chat.Clinic.id,
            clinicAmount,
            currency,
            `Revenue from message payment ${messageId}`
          );
        }
      }

      return {
        success: true,
        transaction,
        reserveRef,
        revenueSplit: {
          doctor: doctorAmount,
          clinic: clinicAmount,
        },
      };
    } catch (error) {
      console.error('Error processing message payment:', error);
      return {
        success: false,
        error: 'PAYMENT_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Process file upload payment
   * @param {string} userId - User ID
   * @param {number} amount - Amount to charge
   * @param {string} currency - Currency (default: RUB)
   * @param {string} fileId - File ID
   * @param {string} description - Description
   * @returns {Promise<Object>} - Payment result
   */
  static async processFilePayment(userId, amount, currency = 'RUB', fileId, description) {
    try {
      // Check if user has sufficient balance
      const hasBalance = await BalanceService.hasSufficientBalance(userId, amount, currency);

      if (!hasBalance) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance for this payment',
        };
      }

      // Reserve the amount
      const reserveRef = `file_${fileId}_${Date.now()}`;
      await BalanceService.reserve(userId, amount, currency, reserveRef);

      // Create transaction
      const transaction = await models.Transaction.create({
        userId,
        type: 'file_payment',
        amount,
        currency,
        paymentMethod: 'test_balance',
        status: 'completed',
        description: description || `Payment for file ${fileId}`,
        referenceId: fileId,
        metadata: { reserveRef },
      });

      // Commit the reservation
      await BalanceService.commit(reserveRef);

      return {
        success: true,
        transaction,
        reserveRef,
      };
    } catch (error) {
      console.error('Error processing file payment:', error);
      return {
        success: false,
        error: 'PAYMENT_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Process subscription payment
   * @param {string} userId - User ID
   * @param {number} amount - Amount to charge
   * @param {string} currency - Currency (default: RUB)
   * @param {string} subscriptionType - Subscription type
   * @param {string} description - Description
   * @returns {Promise<Object>} - Payment result
   */
  static async processSubscriptionPayment(userId, amount, currency = 'RUB', subscriptionType, description) {
    try {
      // Check if user has sufficient balance
      const hasBalance = await BalanceService.hasSufficientBalance(userId, amount, currency);

      if (!hasBalance) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance for this payment',
        };
      }

      // Reserve the amount
      const reserveRef = `subscription_${subscriptionType}_${userId}_${Date.now()}`;
      await BalanceService.reserve(userId, amount, currency, reserveRef);

      // Create transaction
      const transaction = await models.Transaction.create({
        userId,
        type: 'subscription',
        amount,
        currency,
        paymentMethod: 'test_balance',
        status: 'completed',
        description: description || `Subscription payment for ${subscriptionType}`,
        referenceId: reserveRef,
        metadata: { subscriptionType },
      });

      // Commit the reservation
      await BalanceService.commit(reserveRef);

      return {
        success: true,
        transaction,
        reserveRef,
      };
    } catch (error) {
      console.error('Error processing subscription payment:', error);
      return {
        success: false,
        error: 'PAYMENT_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Check if message is free (within 30 days of appointment)
   * @param {string} userId - User ID
   * @param {string} chatId - Chat ID
   * @returns {Promise<boolean>} - Is free
   */
  static async isMessageFree(userId, chatId) {
    try {
      // Check if this is a doctor (doctors can send free messages)
      const user = await models.User.findOne({
        where: { id: userId },
        include: [models.Doctor],
      });

      if (user?.Doctor) {
        return true; // Doctors can send free messages
      }

      // Check if there's a recent appointment for this chat
      const appointment = await models.Appointment.findOne({
        where: {
          [Op.or]: [
            { doctorId: user.doctorId, patientId: user.patientId },
            { patientId: user.patientId, doctorId: user.doctorId },
          ],
          status: 'completed',
          startTime: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        },
        order: [['startTime', 'DESC']],
      });

      if (appointment) {
        return true; // Free within 30 days of appointment
      }

      // Check if this is the first message in the chat
      const messageCount = await models.Message.count({
        where: { chatId, senderId: userId },
      });

      if (messageCount === 0) {
        return true; // First message is free
      }

      return false;
    } catch (error) {
      console.error('Error checking if message is free:', error);
      return false; // Default to paid if error
    }
  }

  /**
   * Get payment methods
   * @returns {Promise<Array>} - Available payment methods
   */
  static async getPaymentMethods() {
    return [
      {
        id: 'test_balance',
        name: 'Test Balance',
        description: 'Use test balance for development',
        isAvailable: true,
        isTest: true,
      },
      {
        id: 'yoomoney',
        name: 'YooMoney',
        description: 'Pay with YooMoney wallet',
        isAvailable: false, // Not implemented per user request
        isTest: false,
      },
      {
        id: 'tinkoff',
        name: 'Tinkoff Bank',
        description: 'Pay with Tinkoff Bank card',
        isAvailable: false, // Not implemented per user request
        isTest: false,
      },
      {
        id: 'card',
        name: 'Credit Card',
        description: 'Pay with any credit card',
        isAvailable: false, // Not implemented per user request
        isTest: false,
      },
    ];
  }

  /**
   * Get pricing information
   * @returns {Promise<Object>} - Pricing information
   */
  static async getPricing() {
    return {
      messagePrice: 50, // RUB
      fileUploadPrice: 100, // RUB
      subscription: {
        monthly: 500, // RUB
        yearly: 5000, // RUB
      },
      revenueSplit: {
        doctor: 0.7, // 70%
        clinic: 0.3, // 30%
      },
      freePeriodDays: 30, // Days after appointment when messages are free
    };
  }

  /**
   * Process payout to doctor
   * @param {string} doctorId - Doctor ID
   * @param {number} amount - Amount to payout
   * @param {string} currency - Currency (default: RUB)
   * @param {string} payoutMethod - Payout method
   * @returns {Promise<Object>} - Payout result
   */
  static async processPayout(doctorId, amount, currency = 'RUB', payoutMethod = 'test_balance') {
    try {
      // Check if doctor has sufficient balance
      const hasBalance = await BalanceService.hasSufficientBalance(doctorId, amount, currency);

      if (!hasBalance) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance for payout',
        };
      }

      // Create payout transaction
      const transaction = await models.Transaction.create({
        userId: doctorId,
        doctorId,
        type: 'payout',
        amount,
        currency,
        paymentMethod: payoutMethod,
        status: 'completed',
        description: `Payout via ${payoutMethod}`,
        metadata: { payoutMethod },
      });

      // Withdraw from balance
      await BalanceService.withdraw(
        doctorId,
        amount,
        currency,
        `Payout via ${payoutMethod}`
      );

      return {
        success: true,
        transaction,
      };
    } catch (error) {
      console.error('Error processing payout:', error);
      return {
        success: false,
        error: 'PAYOUT_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Refund transaction
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} - Refund result
   */
  static async refundTransaction(transactionId, reason) {
    try {
      const transaction = await models.Transaction.findOne({
        where: { id: transactionId },
      });

      if (!transaction) {
        return {
          success: false,
          error: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found',
        };
      }

      // Only completed transactions can be refunded
      if (transaction.status !== 'completed') {
        return {
          success: false,
          error: 'INVALID_STATUS',
          message: 'Only completed transactions can be refunded',
        };
      }

      // Create refund transaction
      const refund = await models.Transaction.create({
        userId: transaction.userId,
        type: 'refund',
        amount: transaction.amount,
        currency: transaction.currency,
        paymentMethod: transaction.paymentMethod,
        status: 'completed',
        description: `Refund for transaction ${transactionId}: ${reason}`,
        referenceId: transactionId,
      });

      // Return money to user's balance
      await BalanceService.deposit(
        transaction.userId,
        transaction.amount,
        transaction.currency,
        `Refund for transaction ${transactionId}`
      );

      // Update original transaction
      await transaction.update({
        status: 'refunded',
        refundedAt: new Date(),
      });

      return {
        success: true,
        refund,
      };
    } catch (error) {
      console.error('Error processing refund:', error);
      return {
        success: false,
        error: 'REFUND_ERROR',
        message: error.message,
      };
    }
  }
}

module.exports = PaymentService;
