/**
 * Security tests: IDOR protection for transactions and chat access.
 * An authenticated user must never be able to read, refund or cancel
 * transactions belonging to somebody else, nor access foreign chats.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'idor-test-secret';

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../src/services/balanceService', () => ({
  deposit: jest.fn().mockResolvedValue({ success: true, transaction: {} }),
  withdraw: jest.fn(),
  reserve: jest.fn(),
  release: jest.fn(),
  commit: jest.fn(),
  charge: jest.fn(),
  hasSufficientBalance: jest.fn(),
  getBalance: jest.fn(),
}));

jest.mock('../../src/models', () => ({
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  Doctor: { create: jest.fn(), findOne: jest.fn() },
  Patient: { create: jest.fn(), findOne: jest.fn() },
  Clinic: { findOne: jest.fn(), create: jest.fn() },
  Chat: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  ChatParticipant: { findOne: jest.fn(), findAll: jest.fn() },
  Transaction: {
    findOne: jest.fn(),
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    sum: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn(),
  },
  Balance: { findOne: jest.fn() },
  BalanceReserve: { findOne: jest.fn(), create: jest.fn() },
  Session: { create: jest.fn(), destroy: jest.fn() },
  RefreshToken: { create: jest.fn(), findOne: jest.fn(), destroy: jest.fn() },
  sequelize: { transaction: jest.fn() },
  Sequelize: { Op: {}, fn: jest.fn(), col: jest.fn() },
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const models = require('../../src/models');
const txRoutes = require('../../src/routes/transactions');
const { notFound, errorHandler } = require('../../src/middleware/errorHandler');
const { canAccessChat } = require('../../src/utils/chatAccess');

const app = express();
app.use(express.json());
app.use('/api/transactions', txRoutes);
app.use(notFound);
app.use(errorHandler);

const ME = 'a1b2c3d4-e89b-42d3-a456-426614174001';
const token = () => jwt.sign({ id: ME }, process.env.JWT_SECRET, { expiresIn: '5m' });

const me = {
  id: ME,
  email: 'patient1@medchat.test',
  role: 'patient',
  status: 'active',
  patientProfile: { id: 'pat-1' },
  lastActivityAt: new Date(),
  update: jest.fn(),
};

const foreignTx = {
  id: 'b1b2c3d4-e89b-42d3-a456-426614174002',
  userId: 'someone-else',
  status: 'completed',
  amount: 50,
  currency: 'RUB',
  paymentMethod: 'test_balance',
  doctorId: null,
  clinicId: null,
  patientId: null,
  chatId: null,
  update: jest.fn(),
};

const ownTx = { ...foreignTx, id: 'c1b2c3d4-e89b-42d3-a456-426614174003', userId: ME };

beforeEach(() => {
  jest.clearAllMocks();
  models.User.findByPk.mockResolvedValue(me);
});

describe('Transaction IDOR (controllers/transactionController.js)', () => {
  test('refund of a foreign transaction is forbidden (403)', async () => {
    models.Transaction.findOne.mockResolvedValue(foreignTx);
    const res = await request(app)
      .post('/api/transactions/refund')
      .set('Authorization', 'Bearer ' + token())
      .send({ transactionId: foreignTx.id, reason: 'attack' });
    expect(res.status).toBe(403);
    expect(models.Transaction.create).not.toHaveBeenCalled();
  });

  test('cancel of a foreign transaction is forbidden (403)', async () => {
    models.Transaction.findOne.mockResolvedValue({ ...foreignTx, status: 'pending' });
    const res = await request(app)
      .post('/api/transactions/' + foreignTx.id + '/cancel')
      .set('Authorization', 'Bearer ' + token())
      .send({ reason: 'attack' });
    expect(res.status).toBe(403);
  });

  test('reading a foreign transaction is forbidden (403)', async () => {
    models.Transaction.findOne.mockResolvedValue(foreignTx);
    const res = await request(app)
      .get('/api/transactions/' + foreignTx.id)
      .set('Authorization', 'Bearer ' + token());
    expect(res.status).toBe(403);
  });

  test('refund of your own completed transaction succeeds (200)', async () => {
    models.Transaction.findOne.mockResolvedValue(ownTx);
    models.Transaction.create.mockResolvedValue({ id: 'refund-1' });
    const res = await request(app)
      .post('/api/transactions/refund')
      .set('Authorization', 'Bearer ' + token())
      .send({ transactionId: ownTx.id, reason: 'my mistake' });
    expect(res.status).toBe(200);
  });

  test('test-balance deposit rejects a negative amount (400)', async () => {
    const res = await request(app)
      .post('/api/transactions/balance/deposit')
      .set('Authorization', 'Bearer ' + token())
      .send({ amount: -100 });
    expect(res.status).toBe(400);
  });
});

describe('canAccessChat (utils/chatAccess.js)', () => {
  const chat = { id: 'chat-1', doctorId: 'doc-1', patientId: 'pat-1', clinicId: 'c-1' };

  test('a stranger gets false', async () => {
    models.ChatParticipant.findOne.mockResolvedValue(null);
    const ok = await canAccessChat({ id: 'u-2', role: 'patient', patientId: 'pat-999' }, chat);
    expect(ok).toBe(false);
  });

  test('an explicit participant gets true', async () => {
    models.ChatParticipant.findOne.mockResolvedValue({ id: 'cp-1' });
    const ok = await canAccessChat({ id: 'u-2', role: 'patient', patientId: 'pat-999' }, chat);
    expect(ok).toBe(true);
  });

  test('the doctor of the chat gets true', async () => {
    models.ChatParticipant.findOne.mockResolvedValue(null);
    const ok = await canAccessChat({ id: 'u-doc', role: 'doctor', doctorId: 'doc-1' }, chat);
    expect(ok).toBe(true);
  });

  test('the clinic admin of the chat clinic gets true', async () => {
    models.ChatParticipant.findOne.mockResolvedValue(null);
    const ok = await canAccessChat({ id: 'u-admin', role: 'clinic_admin', clinicId: 'c-1' }, chat);
    expect(ok).toBe(true);
  });

  test('a clinic admin of another clinic gets false', async () => {
    models.ChatParticipant.findOne.mockResolvedValue(null);
    const ok = await canAccessChat({ id: 'u-admin2', role: 'clinic_admin', clinicId: 'c-other' }, chat);
    expect(ok).toBe(false);
  });

  test('a system admin gets true without any DB checks', async () => {
    const ok = await canAccessChat({ id: 'u-sys', role: 'system_admin' }, chat);
    expect(ok).toBe(true);
  });
});
