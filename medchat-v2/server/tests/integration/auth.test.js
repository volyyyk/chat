/**
 * Integration tests for the authentication API.
 * The Express route -> validation -> service stack runs for real;
 * only the database layer (Sequelize models) is mocked.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ci-test-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../src/models', () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  },
  Clinic: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Doctor: { create: jest.fn(), findOne: jest.fn() },
  Patient: { create: jest.fn(), findOne: jest.fn() },
  RefreshToken: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
  Session: { create: jest.fn(), destroy: jest.fn() },
  PasswordResetToken: { create: jest.fn(), findOne: jest.fn() },
  VerificationToken: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

const bcrypt = require('bcrypt');
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

const PASSWORD = 'Test1234!';

const buildUser = (overrides = {}) => ({
  id: 'u-patient-1',
  email: 'patient1@medchat.test',
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
  role: 'patient',
  status: 'active',
  clinicId: 'c-1',
  update: jest.fn(),
  toJSON() {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      status: this.status,
      passwordHash: this.passwordHash,
      privateKey: 'should-be-removed',
      twoFactorSecret: 'should-be-removed',
    };
  },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  models.User.findOne.mockResolvedValue(null);
  models.User.create.mockResolvedValue(
    buildUser({ id: 'u-new', email: 'newpatient@medchat.test' })
  );
  models.RefreshToken.create.mockResolvedValue({});
  models.Session.create.mockResolvedValue({});
  models.Patient.create.mockResolvedValue({ id: 'p-new' });
  models.Doctor.create.mockResolvedValue({ id: 'd-new' });
  models.Clinic.findOne.mockResolvedValue({ id: 'c-1', code: 'TESTCLINIC' });
  models.VerificationToken.create.mockResolvedValue({});
  models.VerificationToken.update.mockResolvedValue([1]);
  models.VerificationToken.findOne.mockResolvedValue(null);
});

describe('POST /api/auth/login', () => {
  it('rejects an invalid body with 400 (validation layer)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('logs in an active patient and returns tokens', async () => {
    models.User.findOne.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@medchat.test', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('patient1@medchat.test');
    // sensitive fields must never leave the API
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.privateKey).toBeUndefined();
    expect(res.body.user.twoFactorSecret).toBeUndefined();
  });

  it('returns 401 for a wrong password', async () => {
    models.User.findOne.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@medchat.test', password: 'Wrong1234!' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown email (no user enumeration)', async () => {
    models.User.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@medchat.test', password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it('blocks a doctor whose clinic has not verified them yet', async () => {
    models.User.findOne.mockResolvedValue(
      buildUser({
        id: 'u-doctor-1',
        email: 'doctor@medchat.test',
        role: 'doctor',
        doctorProfile: { id: 'd-1', invitationStatus: 'pending' },
      })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor@medchat.test', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(String(res.body.error)).toContain('not verified');
  });

  it('blocks an inactive account', async () => {
    models.User.findOne.mockResolvedValue(buildUser({ status: 'banned' }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@medchat.test', password: PASSWORD });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/register', () => {
  it('registers a patient and returns tokens (201)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'newpatient@medchat.test',
      password: 'NewPass1234!',
      role: 'patient',
      firstName: 'Петр',
      lastName: 'Петров',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(models.Patient.create).toHaveBeenCalled();
    // E2E keys are generated during registration
    expect(models.User.create.mock.calls[0][0].passwordHash).not.toBe('NewPass1234!');
  });

  it('rejects a doctor registration without a clinic code (400)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'doctor2@medchat.test',
      password: 'NewPass1234!',
      role: 'doctor',
      firstName: 'Сидор',
      lastName: 'Сидоров',
    });

    expect(res.status).toBe(400);
    expect(models.Doctor.create).not.toHaveBeenCalled();
  });

  it('rejects a doctor registration with an unknown clinic code (400)', async () => {
    models.Clinic.findOne.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/register').send({
      email: 'doctor3@medchat.test',
      password: 'NewPass1234!',
      role: 'doctor',
      firstName: 'Николай',
      lastName: 'Николаев',
      clinicCode: 'NOPE',
    });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('clinic code');
  });

  it('rejects a weak password (400)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'weak@medchat.test',
      password: '123',
      role: 'patient',
      firstName: 'А',
      lastName: 'Б',
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/phone/* (идентификация 149-ФЗ ст. 10.1)', () => {
  let accessToken;

  beforeEach(async () => {
    models.User.findOne.mockResolvedValue(buildUser());
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'patient1@medchat.test', password: PASSWORD });
    accessToken = loginRes.body.accessToken;
  });

  it('rejects a request without an access token (401)', async () => {
    const res = await request(app).post('/api/auth/phone/request-code').send({});
    expect(res.status).toBe(401);
  });

  it('requests a code for a new phone number and returns devCode in test mode', async () => {
    const user = buildUser({ phone: null });
    models.User.findByPk.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/auth/phone/request-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ phone: '+79001234567' });

    expect(res.status).toBe(200);
    expect(res.body.devCode).toMatch(/^\d{6}$/);
    expect(user.update).toHaveBeenCalledWith({ phone: '+79001234567', phoneVerified: false });
    expect(models.VerificationToken.update).toHaveBeenCalled();
    expect(models.VerificationToken.create).toHaveBeenCalledTimes(1);
    const created = models.VerificationToken.create.mock.calls[0][0];
    expect(created.type).toBe('phone');
    expect(created.token.split(':').pop()).toBe(res.body.devCode);
  });

  it('rejects a request when no phone is provided and none is stored (400)', async () => {
    models.User.findByPk.mockResolvedValue(buildUser({ phone: null }));

    const res = await request(app)
      .post('/api/auth/phone/request-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});

    expect(res.status).toBe(400);
    expect(models.VerificationToken.create).not.toHaveBeenCalled();
  });

  it('verifies a valid code and marks the phone verified', async () => {
    const user = buildUser({ phone: '+79001234567' });
    models.User.findByPk.mockResolvedValue(user);
    models.VerificationToken.findOne.mockResolvedValue({
      token: 'salt:123456',
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
      update: jest.fn(),
    });

    const res = await request(app)
      .post('/api/auth/phone/verify')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.phoneVerified).toBe(true);
    expect(user.update).toHaveBeenCalledWith({ phoneVerified: true });
  });

  it('rejects a wrong code (400)', async () => {
    models.User.findByPk.mockResolvedValue(buildUser({ phone: '+79001234567' }));
    models.VerificationToken.findOne.mockResolvedValue({
      token: 'salt:123456',
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
      update: jest.fn(),
    });

    const res = await request(app)
      .post('/api/auth/phone/verify')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: '654321' });

    expect(res.status).toBe(400);
  });

  it('rejects an expired code (400)', async () => {
    models.User.findByPk.mockResolvedValue(buildUser({ phone: '+79001234567' }));
    models.VerificationToken.findOne.mockResolvedValue({
      token: 'salt:123456',
      expiresAt: new Date(Date.now() - 60000),
      usedAt: null,
      update: jest.fn(),
    });

    const res = await request(app)
      .post('/api/auth/phone/verify')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: '123456' });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('expired');
  });

  it('rejects a non-6-digit code body (400, validation layer)', async () => {
    models.User.findByPk.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/phone/verify')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: 'abc' });

    expect(res.status).toBe(400);
    expect(models.VerificationToken.findOne).not.toHaveBeenCalled();
  });
});
describe('unknown routes', () => {
  it('falls through to the 404 handler with structured JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
