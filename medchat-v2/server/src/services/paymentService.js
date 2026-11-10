/**
 * Payment Service
 * Handles test balance payments and real payment integrations
 * Note: Real payment integrations (YooMoney, Tinkoff) are not implemented per user request.
 * All message payments share the split defined by the clinic (default 80/20).
 */

const { Op } = require('sequelize');
const models = require('../models');
const BalanceService = require('./balanceService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGE_PRICE = () => parseFloat(process.env.MESSAGE_PRICE_RUB || '50');
const FILE_PRICE = () => parseFloat(process.env.FILE_PRICE_RUB || '100');
const SUBSCRIPTION_PRICES = { monthly: 500, yearly: 5000 };
const FREE_MESSAGE_DAYS = () => parseInt(process.env.FREE_MESSAGE_DAYS || '30', 10);
// Окно бесплатных сообщений для НОВОГО чата (от createdAt чата), часов.
// 0 = выключить. Новому пациенту даём время пообщаться бесплатно.
const NEW_CHAT_FREE_HOURS = () => parseInt(process.env.NEW_CHAT_FREE_HOURS || '24', 10);
const DOCTOR_SHARE_PERCENT = () => parseInt(process.env.DOCTOR_SHARE_PERCENT || '80', 10);

class PaymentService {
  /**
   * Find a chat by primary UUID id or by public chatId string (CHAT_xxx / test-chat-xxx)
   * Includes doctor(+user), patient(+user) and clinic for access and revenue checks.
   */
  static async findChat(idOrChatId) {
    if (!idOrChatId) return null;

    const include = [
      { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user', attributes: ['id', 'email'] }] },
      { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user', attributes: ['id', 'email'] }] },
      { model: models.Clinic, as: 'clinic' },
    ];

    if (UUID_RE.test(idOrChatId)) {
      return models.Chat.findByPk(idOrChatId, { include });
    }
    return models.Chat.findOne({ where: { chatId: idOrChatId }, include });
  }

  /**
   * Resolve whether a message in this chat is free for the given user.
   * Free cases:
   *  - the doctor of the chat sends it (doctor_initiated)
   *  - it is the first message in the chat (first_message)
   *  - the chat is younger than NEW_CHAT_FREE_HOURS (new_chat_window)
   *  - there was a completed appointment within the last N days (within_30_days)
   *  - patient's lastAppointmentDate is within N days (within_30_days)
   * @returns {Promise<{isFree: boolean, reason: string|null}>}
   */
  static async resolveMessageFree(userId, chat) {
    if (!chat) {
      return { isFree: false, reason: null };
    }

    // Doctor of the chat always sends for free
    if (chat.doctor && chat.doctor.userId === userId) {
      return { isFree: true, reason: 'doctor_initiated' };
    }

    // First message in the chat is free
    const messageCount = await models.Message.count({ where: { chatId: chat.id } });
    if (messageCount === 0) {
      return { isFree: true, reason: 'first_message' };
    }

    // Free window for a NEW chat: NEW_CHAT_FREE_HOURS from chat.createdAt
    // (по умолчанию 24 часа) - пациент осваивается бесплатно.
    const freeHours = NEW_CHAT_FREE_HOURS();
    if (freeHours > 0 && chat.createdAt) {
      const freeUntil = new Date(new Date(chat.createdAt).getTime() + freeHours * 60 * 60 * 1000);
      if (Date.now() < freeUntil.getTime()) {
        return { isFree: true, reason: 'new_chat_window' };
      }
    }

    // Completed appointment within the free window
    const freeSince = new Date(Date.now() - FREE_MESSAGE_DAYS() * 24 * 60 * 60 * 1000);

    if (chat.patientId && chat.doctorId) {
      const appointment = await models.Appointment.findOne({
        where: {
          doctorId: chat.doctorId,
          patientId: chat.patientId,
          status: 'completed',
          startTime: { [Op.gte]: freeSince },
        },
        order: [['startTime', 'DESC']],
      });

      if (appointment) {
        return { isFree: true, reason: 'within_30_days' };
      }
    }

    // Fall back to patient's stored lastAppointmentDate
    if (chat.patient && chat.patient.lastAppointmentDate && new Date(chat.patient.lastAppointmentDate) >= freeSince) {
      return { isFree: true, reason: 'within_30_days' };
    }

    return { isFree: false, reason: null };
  }

  /**
   * Charge the patient for a message and create the completed transaction.
   * Runs the charge + transaction inside a single SQL transaction.
   * Revenue split goes to the doctor (clinic.doctorSharePercent, default 80%)
   * and the clinic admin (the rest).
   * @returns {Promise<{success: boolean, error?: string, transaction?: Object}>}
   */
  static async chargeMessagePayment(userId, chat, { messageId = null, amount = null, description = null } = {}) {
    // SECURITY: the price is always server-defined; a client can never set it.
    const price = MESSAGE_PRICE();
    const currency = 'RUB';

    const doctorPct = chat && chat.clinic && Number.isFinite(Number(chat.clinic.doctorSharePercent))
      ? Number(chat.clinic.doctorSharePercent)
      : DOCTOR_SHARE_PERCENT();

    const doctorAmount = Math.round(price * doctorPct / 100);
    const clinicAmount = Math.round((price - doctorAmount) * 100) / 100;

    let result = await models.sequelize.transaction(async (t) => {
      const charge = await BalanceService.charge(userId, price, currency, description || 'Оплата сообщения', { transaction: t });
      if (!charge.success) {
        return charge;
      }

      const transaction = await models.Transaction.create(
        {
          userId,
          type: 'message_payment',
          amount: price,
          currency,
          paymentMethod: 'test_balance',
          status: 'completed',
          messageId: messageId || null,
          chatId: chat ? chat.id : null,
          doctorId: chat ? chat.doctorId : null,
          patientId: chat ? chat.patientId : null,
          clinicId: chat ? chat.clinicId : null,
          doctorShare: doctorAmount,
          clinicShare: clinicAmount,
          description: description || 'Оплата сообщения',
          metadata: { balanceBefore: charge.balanceBefore, balanceAfter: charge.balanceAfter },
        },
        { transaction: t }
      );

      return {
        success: true,
        transaction,
        balanceBefore: charge.balanceBefore,
        balanceAfter: charge.balanceAfter,
        revenueSplit: {
          doctor: doctorAmount,
          clinic: clinicAmount,
        },
      };
    });

    if (!result.success) {
      return result;
    }

    // Credit revenue shares (non-fatal: revenue must not block messaging)
    if (chat) {
      try {
        if (chat.doctor && chat.doctor.userId && doctorAmount > 0) {
          await BalanceService.deposit(chat.doctor.userId, doctorAmount, currency, 'Доход врача за платное сообщение');
        }
      } catch (e) {
        console.error('Failed to credit doctor share:', e.message);
      }
      try {
        if (chat.clinic && chat.clinic.adminId && clinicAmount > 0) {
          await BalanceService.deposit(chat.clinic.adminId, clinicAmount, currency, 'Доход клиники за платное сообщение');
        }
      } catch (e) {
        console.error('Failed to credit clinic share:', e.message);
      }
    }

    return result;
  }

  /**
   * Process message payment (entry point used by payment controller)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to charge (optional, falls back to MESSAGE_PRICE_RUB)
   * @param {string} currency - Currency
   * @param {string} chatId - Chat id or public chatId
   * @param {string} messageId - Message ID
   * @param {string} description - Description
   */
  static async processMessagePayment(userId, amount, currency = 'RUB', chatId, messageId, description) {
    try {
      const chat = await this.findChat(chatId);
      if (chatId && !chat) {
        return {
          success: false,
          error: 'CHAT_NOT_FOUND',
          message: 'Chat not found',
        };
      }

      // SECURITY: ignore the client-provided amount; the price is server-defined.
      const amt = MESSAGE_PRICE();

      const result = await this.chargeMessagePayment(userId, chat, {
        messageId,
        amount: amt,
        description,
      });

      return result;
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
   */
  static async processFilePayment(userId, amount, currency = 'RUB', fileId, description) {
    try {
      // SECURITY: fixed server-side file price; the client amount is ignored.
      const amt = FILE_PRICE();

      const result = await models.sequelize.transaction(async (t) => {
        const charge = await BalanceService.charge(userId, amt, currency, description || 'Оплата файла', { transaction: t });
        if (!charge.success) {
          return charge;
        }

        const transaction = await models.Transaction.create(
          {
            userId,
            type: 'file_payment',
            amount: amt,
            currency,
            paymentMethod: 'test_balance',
            status: 'completed',
            description: description || `Payment for file ${fileId || ''}`,
            metadata: {
              fileId: fileId || null,
              balanceBefore: charge.balanceBefore,
              balanceAfter: charge.balanceAfter,
            },
          },
          { transaction: t }
        );

        return {
          success: true,
          transaction,
          balanceBefore: charge.balanceBefore,
          balanceAfter: charge.balanceAfter,
        };
      });

      return result;
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
   */
  static async processSubscriptionPayment(userId, amount, currency = 'RUB', subscriptionType, description) {
    try {
      // SECURITY: fixed server-side subscription price; the client amount is ignored.
      const amt = SUBSCRIPTION_PRICES[subscriptionType] || SUBSCRIPTION_PRICES.monthly;

      const result = await models.sequelize.transaction(async (t) => {
        const charge = await BalanceService.charge(userId, amt, currency, description || 'Оплата подписки', { transaction: t });
        if (!charge.success) {
          return charge;
        }

        const transaction = await models.Transaction.create(
          {
            userId,
            type: 'subscription_payment',
            amount: amt,
            currency,
            paymentMethod: 'test_balance',
            status: 'completed',
            description: description || `Subscription payment for ${subscriptionType}`,
            metadata: {
              subscriptionType,
              balanceBefore: charge.balanceBefore,
              balanceAfter: charge.balanceAfter,
            },
          },
          { transaction: t }
        );

        return {
          success: true,
          transaction,
          balanceBefore: charge.balanceBefore,
          balanceAfter: charge.balanceAfter,
        };
      });

      return result;
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
   * Check if message is free for a user in a chat
   * @param {string} userId - User ID
   * @param {string} chatId - Chat id or public chatId
   * @returns {Promise<{isFree: boolean, reason: string|null}>}
   */
  static async isMessageFree(userId, chatId) {
    try {
      const chat = await this.findChat(chatId);
      if (!chat) {
        return { isFree: false, reason: null };
      }
      return await this.resolveMessageFree(userId, chat);
    } catch (error) {
      console.error('Error checking if message is free:', error);
      return { isFree: false, reason: null };
    }
  }

  /**
   * Get payment methods
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
   */
  static async getPricing() {
    return {
      messagePrice: MESSAGE_PRICE(), // RUB
      fileUploadPrice: 100, // RUB
      subscription: {
        monthly: 500, // RUB
        yearly: 5000, // RUB
      },
      revenueSplit: {
        doctor: DOCTOR_SHARE_PERCENT() / 100, // 80%
        clinic: (100 - DOCTOR_SHARE_PERCENT()) / 100, // 20%
      },
      freePeriodDays: FREE_MESSAGE_DAYS(), // Days after appointment when messages are free,
      newChatFreeHours: NEW_CHAT_FREE_HOURS(), // Free window for a new chat (hours)
    };
  }

  /**
   * Process payout to doctor.
   * @param {string} userId - User ID (balance owner)
   * @param {number} amount - Amount to payout
   * @param {string} currency - Currency
   * @param {string} payoutMethod - Payout method
   * @param {string} doctorId - Optional Doctor profile id for the transaction record
   */
  static async processPayout(userId, amount, currency = 'RUB', payoutMethod = 'test_balance', doctorId = null) {
    try {
      const result = await models.sequelize.transaction(async (t) => {
        const charge = await BalanceService.charge(userId, Number(amount), currency, 'Выплата врачу', { transaction: t });
        if (!charge.success) {
          return charge;
        }

        const transaction = await models.Transaction.create(
          {
            userId,
            doctorId: doctorId || null,
            type: 'payout',
            amount,
            currency,
            paymentMethod: payoutMethod,
            status: 'completed',
            description: `Payout via ${payoutMethod}`,
            metadata: {
              payoutMethod,
              balanceBefore: charge.balanceBefore,
              balanceAfter: charge.balanceAfter,
            },
          },
          { transaction: t }
        );

        return {
          success: true,
          transaction,
          balanceBefore: charge.balanceBefore,
          balanceAfter: charge.balanceAfter,
        };
      });

      return result;
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
        metadata: { originalTransactionId: transactionId },
      });

      // Return money to user's balance
      await BalanceService.deposit(
        transaction.userId,
        Number(transaction.amount),
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
