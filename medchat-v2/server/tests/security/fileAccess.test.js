/**
 * Security tests: изоляция файлов между пользователями (гостями) и
 * одноразовость токенов переноса данных. Никакой гость не должен получить
 * доступ к файлам и данным предшественника или другого гостя.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'file-test-secret';

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../../src/config/minio', () => ({
  minioClient: { putObject: jest.fn(), getObject: jest.fn(), removeObject: jest.fn() },
  bucketName: 'test-bucket',
  FILE_TYPES: {},
  getFileUrl: jest.fn(() => 'http://files.test/object'),
}));

jest.mock('../../src/models', () => ({
  Chat: { findByPk: jest.fn(), findAll: jest.fn() },
  ChatParticipant: { findOne: jest.fn(), findAll: jest.fn() },
  File: { findByPk: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn(), update: jest.fn(), destroy: jest.fn() },
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  Patient: { findOne: jest.fn() },
  DataTransfer: { create: jest.fn(), findOne: jest.fn(), update: jest.fn() },
  RefreshToken: { create: jest.fn(), findOne: jest.fn(), destroy: jest.fn() },
  Session: { create: jest.fn(), destroy: jest.fn() },
  Sequelize: { Op: { or: 'or', and: 'and', in: 'in', iLike: 'iLike', gt: 'gt', lt: 'lt' } },
}));

const request = require('supertest');
const express = require('express');
const models = require('../../src/models');
const FileController = require('../../src/controllers/fileController');
const GuestController = require('../../src/controllers/guestController');
const { notFound, errorHandler } = require('../../src/middleware/errorHandler');

let currentUser = null;

const fileApp = express();
fileApp.use(express.json());
fileApp.use((req, res, next) => { req.user = currentUser; next(); });
fileApp.get('/api/files', (req, res, next) => FileController.list(req, res, next));
fileApp.get('/api/files/:id', (req, res, next) => FileController.getById(req, res, next));
fileApp.get('/api/files/:id/download', (req, res, next) => FileController.download(req, res, next));
fileApp.use(notFound);
fileApp.use(errorHandler);

const guestApp = express();
guestApp.use(express.json());
guestApp.use((req, res, next) => { req.user = currentUser; next(); });
guestApp.post('/api/guest/transfer/init', (req, res, next) => GuestController.transferInit(req, res, next));
guestApp.post('/api/guest/transfer/:token/blob', (req, res, next) => GuestController.transferBlob(req, res, next));
guestApp.post('/api/guest/transfer/consume', (req, res, next) => GuestController.transferConsume(req, res, next));
guestApp.use(notFound);
guestApp.use(errorHandler);

// Файл гостя A в его чате (дефолтная видимость shared)
const guestAFile = {
  id: 'f-1',
  ownerId: 'pat-A',
  uploaderId: 'user-A',
  visibility: 'shared',
  chatId: 'chat-1',
  downloadCount: 0,
  update: jest.fn(),
};

const chatA = { id: 'chat-1', doctorId: 'doc-1', patientId: 'pat-A', clinicId: null };

const guestA = { id: 'user-A', role: 'patient', patientId: 'pat-A', doctorId: null };
const guestB = { id: 'user-B', role: 'patient', patientId: 'pat-B', doctorId: null };

beforeEach(() => {
  jest.clearAllMocks();
  models.Chat.findByPk.mockResolvedValue(chatA);
  models.ChatParticipant.findOne.mockResolvedValue(null);
});

describe('File isolation (controllers/fileController.js)', () => {
  test('чужой гость не может скачать shared-файл из чужого чата (403)', async () => {
    currentUser = guestB;
    models.File.findByPk.mockResolvedValue(guestAFile);
    const res = await request(fileApp).get('/api/files/f-1/download');
    expect(res.status).toBe(403);
  });

  test('чужой гость не может прочитать метаданные файла (403)', async () => {
    currentUser = guestB;
    models.File.findByPk.mockResolvedValue(guestAFile);
    const res = await request(fileApp).get('/api/files/f-1');
    expect(res.status).toBe(403);
  });

  test('владелец файла из своего чата получает доступ (200)', async () => {
    currentUser = guestA;
    models.File.findByPk.mockResolvedValue(guestAFile);
    const res = await request(fileApp).get('/api/files/f-1');
    expect(res.status).toBe(200);
  });

  test('shared-файл без чата недоступен постороннему (403)', async () => {
    currentUser = guestB;
    models.File.findByPk.mockResolvedValue({ ...guestAFile, chatId: null });
    const res = await request(fileApp).get('/api/files/f-1/download');
    expect(res.status).toBe(403);
  });

  test('public-файл доступен любому авторизованному (200)', async () => {
    currentUser = guestB;
    models.File.findByPk.mockResolvedValue({ ...guestAFile, chatId: null, visibility: 'public' });
    const res = await request(fileApp).get('/api/files/f-1');
    expect(res.status).toBe(200);
  });

  test('список файлов не отдаёт чужие shared-файлы', async () => {
    currentUser = guestB;
    models.ChatParticipant.findAll.mockResolvedValue([{ chatId: 'chat-own-1' }]);
    models.Chat.findAll.mockResolvedValue([]);
    models.File.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(fileApp).get('/api/files');
    expect(res.status).toBe(200);
    const where = JSON.stringify(models.File.findAndCountAll.mock.calls[0][0].where);
    expect(where).not.toContain('"shared"');
    expect(where).toContain('chat-own-1');
  });
});

describe('Data transfer (controllers/guestController.js)', () => {
  const ME = 'user-A';
  const transfer = () => ({
    id: 'dt-1',
    token: 'a'.repeat(64),
    userId: ME,
    payload: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    update: jest.fn(),
  });

  test('init создаёт 256-бит токен и гасит предыдущие (201)', async () => {
    currentUser = { id: ME };
    models.User.findByPk.mockResolvedValue({ id: ME, status: 'active' });
    const res = await request(guestApp).post('/api/guest/transfer/init');
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(models.DataTransfer.update).toHaveBeenCalled();
    expect(models.DataTransfer.create).toHaveBeenCalled();
  });

  test('blob чужого токена недоступен (404)', async () => {
    currentUser = { id: 'user-B' };
    models.DataTransfer.findOne.mockResolvedValue(transfer());
    const res = await request(guestApp)
      .post('/api/guest/transfer/' + 'a'.repeat(64) + '/blob')
      .send({ payload: 'AAAA' });
    expect(res.status).toBe(404);
  });

  test('повторное потребление токена запрещено (410)', async () => {
    models.DataTransfer.findOne.mockResolvedValue({ ...transfer(), consumedAt: new Date() });
    const res = await request(guestApp)
      .post('/api/guest/transfer/consume')
      .send({ token: 'a'.repeat(64) });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('TRANSFER_USED');
  });

  test('потребление отдаёт сессию и шифрованный blob, гасит токен', async () => {
    const t = transfer();
    t.payload = 'NONCE+CIPHERTEXT';
    models.DataTransfer.findOne.mockResolvedValue(t);
    models.User.findByPk.mockResolvedValue({
      id: ME, email: 'guest-x@guest.medchat.local', role: 'patient', status: 'active',
    });
    models.Patient.findOne.mockResolvedValue({ id: 'pat-A' });
    const res = await request(guestApp)
      .post('/api/guest/transfer/consume')
      .send({ token: 'a'.repeat(64) });
    expect(res.status).toBe(200);
    expect(res.body.payload).toBe('NONCE+CIPHERTEXT');
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(t.update).toHaveBeenCalledWith(expect.objectContaining({ consumedAt: expect.any(Date), payload: null }));
  });

  test('потребление без загруженного blob отклоняется (409)', async () => {
    models.DataTransfer.findOne.mockResolvedValue(transfer());
    const res = await request(guestApp)
      .post('/api/guest/transfer/consume')
      .send({ token: 'a'.repeat(64) });
    expect(res.status).toBe(409);
  });
});
