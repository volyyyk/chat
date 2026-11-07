/**
 * Security tests: server-side price pinning for payments.
 * A client must never be able to choose how much a message/file/subscription
 * costs, nor pass arbitrary amounts through the validators.
 *
 * NOTE: the jest.mock factories here MUST be registered with { virtual: true }.
 * In this project a plain (non-virtual) factory registered from this file does
 * not intercept require('../models') inside paymentService (the suite then hits
 * a real Postgres). The exact pattern of tests/paymentService.test.js (virtual
 * mocks + clearAllMocks + direct mockResolvedValue) is CI-proven green.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'payments-security-secret';

jest.mock('../../src/models', () => ({
  Chat: { findByPk: jest.fn(), findOne: jest.fn() },
  Message: { count: jest.fn(), findOne: jest.fn() },
  Appointment: { findOne: jest.fn() },
  Transaction: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
  sequelize: { transaction: jest.fn() },
  Sequelize: { Op: { or: Symbol('or'), gte: Symbol('gte'), lt: Symbol('lt'), gt: Symbol('gt') } },
}), { virtual: true });

jest.mock('../../src/services/balanceService', () => ({
  charge: jest.fn(),
  deposit: jest.fn(),
  getBalance: jest.fn(),
}), { virtual: true });

const request = require('supertest');
const express = require('express');
const models = require('../../src/models');
const BalanceService = require('../../src/services/balanceService');
const PaymentService = require('../../src/services/paymentService');
const { processPaymentSchema } = require('../../src/validators/payment');
const { depositSchema } = require('../../src/validators/transaction');

const CHAT_ID = '123e4567-e89b-42d3-a456-426614174000';

const chat = {
  id: CHAT_ID,
  doctorId: 'doc-1',
  patientId: 'pat-1',
  clinicId: 'clinic-1',
  doctor: { userId: 'doctor-user' },
  clinic: { adminId: 'admin-user', doctorSharePercent: 80 },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MESSAGE_PRICE_RUB;
  delete process.env.FILE_PRICE_RUB;

  models.sequelize.transaction.mockImplementation(async (fn) => fn({}));
  models.Chat.findByPk.mockResolvedValue(chat);
  models.Transaction.create.mockResolvedValue({ id: 'tx-1' });
  BalanceService.charge.mockResolvedValue({ success: true, balanceBefore: 100, balanceAfter: 50 });
  BalanceService.deposit.mockResolvedValue({ success: true });
});

describe('Server-side price pinning (services/paymentService.js)', () => {
  test('a message payment cannot be made cheaper by the client', async () => {
    const r = await PaymentService.processMessagePayment('patient-user', 1, 'RUB', CHAT_ID, null, null);
    expect(r.success).toBe(true);
    expect(BalanceService.charge).toHaveBeenCalledWith('patient-user', 50, 'RUB', 'Оплата сообщения', expect.anything());
  });

  test('a file payment cannot be made cheaper by the client', async () => {
    const r = await PaymentService.processFilePayment('patient-user', 1, 'RUB', 'file-1', null);
    expect(r.success).toBe(true);
    expect(BalanceService.charge).toHaveBeenCalledWith('patient-user', 100, 'RUB', 'Оплата файла', expect.anything());
  });

  test('subscription prices are fixed (monthly=500, yearly=5000)', async () => {
    await PaymentService.processSubscriptionPayment('u1', 1, 'RUB', 'monthly', null);
    expect(BalanceService.charge).toHaveBeenLastCalledWith('u1', 500, 'RUB', 'Оплата подписки', expect.anything());
    await PaymentService.processSubscriptionPayment('u1', 1, 'RUB', 'yearly', null);
    expect(BalanceService.charge).toHaveBeenLastCalledWith('u1', 5000, 'RUB', 'Оплата подписки', expect.anything());
  });

  test('chargeMessagePayment ignores the amount option', async () => {
    await PaymentService.chargeMessagePayment('patient-user', chat, { amount: 1 });
    expect(BalanceService.charge).toHaveBeenCalledWith('patient-user', 50, 'RUB', 'Оплата сообщения', expect.anything());
  });
});

describe('Payment schema validation', () => {
  test('rejects zero, negative, string amounts and invalid types', () => {
    expect(processPaymentSchema.validate({ type: 'message', amount: 0 }).error).toBeTruthy();
    expect(processPaymentSchema.validate({ type: 'message', amount: -5 }).error).toBeTruthy();
    expect(processPaymentSchema.validate({ type: 'message', amount: '50abc' }).error).toBeTruthy();
    expect(processPaymentSchema.validate({ type: 'evil' }).error).toBeTruthy();
    expect(processPaymentSchema.validate({ type: 'deposit', amount: 500 }).error).toBeFalsy();
  });

  test('test-balance deposit is capped at 100000', () => {
    expect(depositSchema.validate({ amount: 100001 }).error).toBeTruthy();
    expect(depositSchema.validate({ amount: 500 }).error).toBeFalsy();
  });
});

describe('HTTP hardening', () => {
  const bigApp = express();
  bigApp.use(express.json());
  bigApp.post('/api/echo', (req, res) => res.json({ ok: true }));

  test('oversized JSON bodies are rejected with 413 (default 100kb limit)', async () => {
    const big = { blob: 'A'.repeat(200 * 1024) };
    const res = await request(bigApp).post('/api/echo').send(big);
    expect(res.status).toBe(413);
  });
});
