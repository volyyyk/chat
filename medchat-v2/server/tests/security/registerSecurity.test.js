/**
 * Security tests: registration hardening.
 * Privilege escalation via role, mass assignment of unknown fields,
 * and prototype pollution attempts.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'security-test-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../src/models', () => ({
  User: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  Clinic: { findOne: jest.fn(), create: jest.fn() },
  Doctor: { create: jest.fn(), findOne: jest.fn() },
  Patient: { create: jest.fn(), findOne: jest.fn() },
  RefreshToken: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
  Session: { create: jest.fn(), destroy: jest.fn() },
  PasswordResetToken: { create: jest.fn(), findOne: jest.fn() },
  VerificationToken: { findOne: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const models = require('../../src/models');
const authRoutes = require('../../src/routes/auth');
const { notFound, errorHandler } = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(notFound);
app.use(errorHandler);

const buildUser = (overrides = {}) => ({
  id: 'u-new',
  email: 'newpatient@medchat.test',
  passwordHash: 'hashed-not-plaintext',
  role: 'patient',
  status: 'active',
  update: jest.fn(),
  toJSON() {
    return { id: this.id, email: this.email, role: this.role, status: this.status };
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  models.User.findOne.mockResolvedValue(null);
  models.User.create.mockResolvedValue(buildUser());
  models.Patient.create.mockResolvedValue({ id: 'p-new' });
  models.Doctor.create.mockResolvedValue({ id: 'd-new' });
  models.Clinic.findOne.mockResolvedValue({ id: 'c-1', code: 'TESTCLINIC' });
  models.RefreshToken.create.mockResolvedValue({});
  models.Session.create.mockResolvedValue({});
});

describe('Privilege escalation via role (validators/auth.js)', () => {
  test('rejects self-registration as clinic_admin', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'evil-admin@medchat.test',
      password: 'NewPass1234!',
      role: 'clinic_admin',
      firstName: 'Зло',
      lastName: 'Админов',
    });
    expect(res.status).toBe(400);
    expect(models.User.create).not.toHaveBeenCalled();
  });

  test('rejects self-registration as system_admin', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'evil-sys@medchat.test',
      password: 'NewPass1234!',
      role: 'system_admin',
      firstName: 'Зло',
      lastName: 'Систем',
    });
    expect(res.status).toBe(400);
    expect(models.User.create).not.toHaveBeenCalled();
  });

  test('a normal patient registration still works (201)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'good@medchat.test',
      password: 'NewPass1234!',
      role: 'patient',
      firstName: 'Добрый',
      lastName: 'Пациент',
    });
    expect(res.status).toBe(201);
  });
});

describe('Mass assignment / unknown fields', () => {
  test('unknown fields (isAdmin, status) never reach User.create', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'hacker@medchat.test',
      password: 'NewPass1234!',
      role: 'patient',
      firstName: 'Хакер',
      lastName: 'Взломов',
      isAdmin: true,
      status: 'clinic_admin',
    });
    if (res.status === 201 || res.status === 200) {
      expect(models.User.create).toHaveBeenCalled();
      const args = models.User.create.mock.calls[0][0];
      expect(args.isAdmin).toBeUndefined();
      expect(args.status).toBe('active');
      expect(args.role).toBe('patient');
    } else {
      // Unknown fields were rejected outright - equally safe.
      expect(res.status).toBe(400);
      expect(models.User.create).not.toHaveBeenCalled();
    }
  });
});

describe('Prototype pollution via __proto__', () => {
  test('a __proto__ payload neither poisons Object.prototype nor crashes (no 500)', async () => {
    const body = '{"email":"proto@medchat.test","password":"NewPass1234!","role":"patient","firstName":"Прото","lastName":"Тип","__proto__":{"polluted":"yes"}}';
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).not.toBe(500);
    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });
});
