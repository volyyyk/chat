/**
 * Webhook Controller
 * Handles incoming webhooks from external services
 */

const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');

class WebhookController {
  /**
   * Handle payment webhook
   */
  static async handlePaymentWebhook(req, res, next) {
    try {
      const payload = req.body;
      const signature = req.headers['x-signature'] || req.headers['x-yookassa-signature'];

      // Verify signature (placeholder - implement based on payment provider)
      // const isValid = this.verifySignature(payload, signature, process.env.PAYMENT_WEBHOOK_SECRET);
      // if (!isValid) {
      //   throw new AppError('Invalid signature', 401, 'UNAUTHORIZED');
      // }

      console.log('Payment webhook received:', payload);

      // Process payment based on provider
      const provider = req.headers['x-provider'] || 'unknown';

      switch (provider) {
        case 'yoomoney':
          await this.handleYooMoneyWebhook(payload);
          break;
        case 'tinkoff':
          await this.handleTinkoffWebhook(payload);
          break;
        default:
          console.log('Unknown payment provider:', provider);
      }

      res.status(200).json({
        success: true,
        message: 'Payment webhook processed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle YooMoney webhook
   */
  static async handleYooMoneyWebhook(payload) {
    try {
      // Extract event type
      const event = payload.event;

      switch (event) {
        case 'payment.succeeded':
          // Handle successful payment
          const payment = payload.object;
          console.log('YooMoney payment succeeded:', payment.id);
          // Update transaction status
          // const transaction = await models.Transaction.findOne({ where: { referenceId: payment.id } });
          // if (transaction) {
          //   await transaction.update({ status: 'completed' });
          // }
          break;

        case 'payment.waiting_for_capture':
          console.log('YooMoney payment waiting for capture:', payload.object.id);
          break;

        case 'payment.cancelled':
          console.log('YooMoney payment cancelled:', payload.object.id);
          break;

        case 'refund.succeeded':
          console.log('YooMoney refund succeeded:', payload.object.id);
          break;

        default:
          console.log('Unknown YooMoney event:', event);
      }
    } catch (error) {
      console.error('Error handling YooMoney webhook:', error);
    }
  }

  /**
   * Handle Tinkoff webhook
   */
  static async handleTinkoffWebhook(payload) {
    try {
      // Extract event type
      const event = payload.Event;

      switch (event) {
        case 'OrderStatus':
          const order = payload.Order;
          console.log('Tinkoff order status:', order.Status);
          // Update transaction based on order status
          break;

        case 'Payment':
          const payment = payload.Payment;
          console.log('Tinkoff payment:', payment.Status);
          break;

        default:
          console.log('Unknown Tinkoff event:', event);
      }
    } catch (error) {
      console.error('Error handling Tinkoff webhook:', error);
    }
  }

  /**
   * Handle SMS webhook
   */
  static async handleSMSWebhook(req, res, next) {
    try {
      const payload = req.body;

      console.log('SMS webhook received:', payload);

      // Extract message ID and status
      const messageId = payload.message_id || payload.id;
      const status = payload.status || payload.state;

      // Update notification status
      // const notification = await models.Notification.findOne({ where: { id: messageId } });
      // if (notification) {
      //   await notification.update({ status: status === 'delivered' ? 'delivered' : 'failed' });
      // }

      res.status(200).json({
        success: true,
        message: 'SMS webhook processed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle email webhook
   */
  static async handleEmailWebhook(req, res, next) {
    try {
      const payload = req.body;

      console.log('Email webhook received:', payload);

      // Extract message ID and status
      const messageId = payload.message_id || payload.id;
      const status = payload.status || payload.event;

      // Update notification status
      // const notification = await models.Notification.findOne({ where: { id: messageId } });
      // if (notification) {
      //   await notification.update({ status: status === 'delivered' ? 'delivered' : 'failed' });
      // }

      res.status(200).json({
        success: true,
        message: 'Email webhook processed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle backup webhook
   */
  static async handleBackupWebhook(req, res, next) {
    try {
      const payload = req.body;

      console.log('Backup webhook received:', payload);

      // Extract backup ID and status
      const backupId = payload.backupId || payload.id;
      const status = payload.status;

      // Update backup status
      // const backup = await models.Backup.findOne({ where: { id: backupId } });
      // if (backup) {
      //   await backup.update({ status });
      // }

      res.status(200).json({
        success: true,
        message: 'Backup webhook processed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle test webhook
   */
  static async handleTestWebhook(req, res, next) {
    try {
      const payload = req.body;

      console.log('Test webhook received:', payload);

      res.status(200).json({
        success: true,
        message: 'Test webhook processed',
        received: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify webhook signature
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Signature from header
   * @param {string} secret - Webhook secret
   * @returns {boolean} - Is valid
   */
  static verifySignature(payload, signature, secret) {
    try {
      // For YooMoney
      if (signature && secret) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        return expectedSignature === signature;
      }
      return false;
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }
}

module.exports = WebhookController;
