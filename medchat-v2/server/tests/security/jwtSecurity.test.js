/**
 * Security tests: JWT forgery resistance (middleware/auth.js).
 * Covers algorithm pinning (alg:none), wrong-secret tokens, expired tokens,
 * tampered payloads and malformed headers.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'security-test-secret';

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../src/models', () => ({
  User: { findByPk: jest.fn() },
  Doctor: {},
  Patient: {},
  Clinic: {},
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const models = require('../../src/models');
const { authenticate } = require('../../src/middleware/auth');

const app = express();
app.use(express.json());
app.get('/api/secure', authenticate(), (req, res) => {
  res.json({ success: true, userId: req.user.id, role: req.user.role });
});

const activeUser = {
  id: 'u-patient-1',
  email: 'patient1@medchat.test',
  role: 'patient',
  status: 'active',
  firstName: 'Пациент',
  lastName: 'Один',
  lastActivityAt: new Date(),
  update: jest.fn(),
};

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

beforeEach(() => {
  jest.clearAllMocks();
  models.User.findByPk.mockResolvedValue(activeUser);
});

describe('JWT security (middleware/auth.js)', () => {
  test('accepts a valid HS256 token', async () => {
    const token = jwt.sign({ id: 'u-patient-1', role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const res = await request(app).get('/api/secure').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u-patient-1');
  });

  test('rejects a forged alg:none token', async () => {
    const token = b64url({ alg: 'none', typ: 'JWT' }) + '.' + b64url({ id: 'u-patient-1', role: 'clinic_admin' }) + '.';
    const res = await request(app).get('/api/secure').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(401);
  });

  test('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ id: 'u-patient-1' }, 'attacker-secret', { expiresIn: '5m' });
    const res = await request(app).get('/api/secure').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(401);
  });

  test('rejects an expired token', async () => {
    const token = jwt.sign({ id: 'u-patient-1' }, process.env.JWT_SECRET, { expiresIn: '-1h' });
    const res = await request(app).get('/api/secure').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(401);
  });

  test('rejects a tampered payload (signature mismatch)', async () => {
    const token = jwt.sign({ id: 'u-patient-1', role: 'patient' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const parts = token.split('.');
    const forged = parts[0] + '.' + b64url({ id: 'u-patient-1', role: 'clinic_admin' }) + '.' + parts[2];
    const res = await request(app).get('/api/secure').set('Authorization', 'Bearer ' + forged);
    expect(res.status).toBe(401);
  });

  test('rejects a missing or malformed Authorization header', async () => {
    const noHeader = await request(app).get('/api/secure');
    expect(noHeader.status).toBe(401);

    const garbage = await request(app).get('/api/secure').set('Authorization', 'Bearer not.a.jwt');
    expect(garbage.status).toBe(401);
  });
});
