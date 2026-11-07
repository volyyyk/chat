/**
 * Payment Service
 * Test balance payments only (real gateways intentionally not connected)
 */

import { API_BASE_URL } from '../config/config';

class PaymentService {
  /**
   * Get available payment methods
   */
  static async getMethods(token) {
    try {
      const response = await fetch(API_BASE_URL + '/api/payments/methods', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load methods');
      return { success: true, methods: data.data || [] };
    } catch (err) {
      return { success: false, message: err.message, methods: [] };
    }
  }

  /**
   * Get pricing info
   */
  static async getPricing(token) {
    try {
      const response = await fetch(API_BASE_URL + '/api/payments/pricing', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load pricing');
      return { success: true, pricing: data.data || data };
    } catch (err) {
      return { success: false, message: err.message, pricing: null };
    }
  }

  /**
   * Check whether a message in the chat is free
   */
  static async checkFree(token, chatId) {
    try {
      const response = await fetch(API_BASE_URL + '/api/payments/check-free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ chatId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to check');
      return { success: true, isFree: data.data ? data.data.isFree : data.isFree, reason: data.reason || '' };
    } catch (err) {
      return { success: false, message: err.message, isFree: true };
    }
  }

  /**
   * Process payment (test balance)
   */
  static async process(token, paymentData) {
    try {
      const response = await fetch(API_BASE_URL + '/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify(paymentData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Payment failed');
      return {
        success: true,
        transaction: data.data ? data.data.transaction || data.data : data.transaction,
        revenueSplit: data.revenueSplit || (data.data ? data.data.revenueSplit : null),
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Get doctor balance
   */
  static async getDoctorBalance(token) {
    try {
      const response = await fetch(API_BASE_URL + '/api/payments/doctor/balance', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load balance');
      return { success: true, balance: data.data || data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Get doctor transaction history
   */
  static async getDoctorTransactions(token, page = 1, limit = 20) {
    try {
      const response = await fetch(
        API_BASE_URL + '/api/payments/doctor/transactions?page=' + page + '&limit=' + limit,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load transactions');
      return { success: true, transactions: data.data || [], pagination: data.pagination };
    } catch (err) {
      return { success: false, message: err.message, transactions: [] };
    }
  }
}

export const paymentService = PaymentService;
