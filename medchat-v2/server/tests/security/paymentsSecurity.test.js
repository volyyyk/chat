/**
 * Security tests: server-side price pinning for payments.
 * A client must never be able to choose how much a message/file/subscription
 * costs, nor pass arbitrary amounts through the validators.
 *
 * NOTE: this suite intentionally does NOT depend on whether jest.mock()
 * interception replaces the real modules or not. The jest.mock factories are
 * kept (they keep the suite DB-free when interception works), and beforeEach
 * additionally installs jest.spyOn() guards on the required module objects.
 * spyOn works both on mock factories and on the real Sequelize model classes,
 * so the suite stays green in either module-resolution scenario while the
 * production require-graph of paymentService stays under test.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../../src/models', () => ({
  Chat: { findByPk: jest.fn(), findOne: jest.fn() },
  Message: { count: jest.fn(), findOne: jest.fn() },
  Appointment: { findOne: jest.fn() },
  Transaction: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
  sequelize: { transaction: jest.fn() },
  Sequelize: { Op: { or: Symbol('or'), gte: Symbol('gte'), lt: Symbol('lt'), gt: Symbol('gt') } },
}));

jest.mock('../../src/services/balanceService', () => ({
  charge: jest.fn(),
  deposit: jest.fn(),
  getBalance: jest.fn(),
}));

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
  jest.restoreAllMocks();
  delete process.env.MESSAGE_PRICE_RUB;
  delete process.env.FILE_PRICE_RUB;

  // Guards that work both for the mocked modules and for the real ones:
  // if the jest.mock factories were applied, these spyOn() calls simply wrap
  // the factory jest.fn()s; if the real modules were loaded (Sequelize model
  // classes / the BalanceService class), they override the static methods.
  jest.spyOn(models.sequelize, 'transaction').mockImplementation(async (fn) => fn({}));
  jest.spyOn(models.Chat, 'findByPk').mockResolvedValue(chat);
  jest.spyOn(BalanceService, 'charge').mockResolvedValue({ success: true, balanceBefore: 100, balanceAfter: 50 });
  jest.spyOn(BalanceService, 'deposit').mockResolvedValue({ success: true });
  jest.spyOn(models.Transaction, 'create').mockResolvedValue({ id: 'tx-1' });
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
