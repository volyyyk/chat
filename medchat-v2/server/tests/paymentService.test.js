/**
 * Unit tests for PaymentService (message free/paid resolution and charging).
 * All database models and BalanceService are mocked; no DB required.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/models', () => {
  const mockModels = {
    Chat: { findByPk: jest.fn(), findOne: jest.fn() },
    Message: { count: jest.fn(), findOne: jest.fn() },
    Appointment: { findOne: jest.fn() },
    Transaction: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn() },
    sequelize: { transaction: jest.fn() },
    Sequelize: { Op: { or: Symbol('or'), gte: Symbol('gte'), lt: Symbol('lt'), gt: Symbol('gt') } },
  };
  return mockModels;
}, { virtual: true });

jest.mock('../src/services/balanceService', () => ({
  charge: jest.fn(),
  deposit: jest.fn(),
  getBalance: jest.fn(),
}), { virtual: true });

const models = require('../src/models');
const BalanceService = require('../src/services/balanceService');
const PaymentService = require('../src/services/paymentService');

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MESSAGE_PRICE_RUB;
    delete process.env.FREE_MESSAGE_DAYS;
    delete process.env.DOCTOR_SHARE_PERCENT;
  });
    delete process.env.NEW_CHAT_FREE_HOURS;

  describe('findChat', () => {
    test('resolves a chat by UUID primary key', async () => {
      models.Chat.findByPk.mockResolvedValue({ id: UUID, chatId: 'CHAT_1' });
      const chat = await PaymentService.findChat(UUID);
      expect(models.Chat.findByPk).toHaveBeenCalledWith(UUID, expect.anything());
      expect(chat.chatId).toBe('CHAT_1');
    });

    test('resolves a chat by public chatId string without touching findByPk', async () => {
      models.Chat.findOne.mockResolvedValue({ id: UUID, chatId: 'test-chat-0001' });
      const chat = await PaymentService.findChat('test-chat-0001');
      expect(models.Chat.findByPk).not.toHaveBeenCalled();
      expect(chat.chatId).toBe('test-chat-0001');
    });
  });

  describe('resolveMessageFree', () => {
    const baseChat = {
      id: UUID,
      doctorId: 'doc-1',
      patientId: 'pat-1',
      doctor: { userId: 'doctor-user' },
      patient: { userId: 'patient-user', lastAppointmentDate: null },
      clinic: { doctorSharePercent: 80 },
    };

    test('doctor messages are always free (doctor_initiated)', async () => {
      const r = await PaymentService.resolveMessageFree('doctor-user', baseChat);
      expect(r).toEqual({ isFree: true, reason: 'doctor_initiated' });
    });

    test('first message in a chat is free', async () => {
      models.Message.count.mockResolvedValue(0);
      const r = await PaymentService.resolveMessageFree('patient-user', baseChat);
      expect(r).toEqual({ isFree: true, reason: 'first_message' });
    });

    test('completed appointment within the window makes messages free', async () => {
      models.Message.count.mockResolvedValue(5);
      models.Appointment.findOne.mockResolvedValue({ id: 'appt-1' });
      const r = await PaymentService.resolveMessageFree('patient-user', baseChat);
      expect(r).toEqual({ isFree: true, reason: 'within_30_days' });
    });

    test('without appointment in the window the message is paid', async () => {
      models.Message.count.mockResolvedValue(5);
      models.Appointment.findOne.mockResolvedValue(null);
      const r = await PaymentService.resolveMessageFree('patient-user', baseChat);
      expect(r).toEqual({ isFree: false, reason: null });
    });

    test('новый чат в окне бесплатных сообщений бесплатен (new_chat_window)', async () => {
      models.Message.count.mockResolvedValue(5);
      models.Appointment.findOne.mockResolvedValue(null);
      const freshChat = { ...baseChat, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };
      const r = await PaymentService.resolveMessageFree('patient-user', freshChat);
      expect(r).toEqual({ isFree: true, reason: 'new_chat_window' });
    });

    test('после окна новый чат платен без приёма', async () => {
      models.Message.count.mockResolvedValue(5);
      models.Appointment.findOne.mockResolvedValue(null);
      const oldChat = { ...baseChat, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) };
      const r = await PaymentService.resolveMessageFree('patient-user', oldChat);
      expect(r).toEqual({ isFree: false, reason: null });
    });

    test('окно можно отключить NEW_CHAT_FREE_HOURS=0', async () => {
      process.env.NEW_CHAT_FREE_HOURS = '0';
      models.Message.count.mockResolvedValue(5);
      models.Appointment.findOne.mockResolvedValue(null);
      const freshChat = { ...baseChat, createdAt: new Date() };
      const r = await PaymentService.resolveMessageFree('patient-user', freshChat);
      expect(r).toEqual({ isFree: false, reason: null });
    });

    test('врач пишет бесплатно и внутри окна нового чата', async () => {
      const freshChat = { ...baseChat, createdAt: new Date() };
      const r = await PaymentService.resolveMessageFree('doctor-user', freshChat);
      expect(r).toEqual({ isFree: true, reason: 'doctor_initiated' });
    });
  });

  describe('chargeMessagePayment', () => {
    const chat = {
      id: UUID,
      doctorId: 'doc-1',
      patientId: 'pat-1',
      clinicId: 'clinic-1',
      doctor: { userId: 'doctor-user' },
      clinic: { adminId: 'admin-user', doctorSharePercent: 80 },
    };

    test('returns failure when the patient has insufficient balance', async () => {
      models.sequelize.transaction.mockImplementation(async (fn) => fn({}));
      BalanceService.charge.mockResolvedValue({ success: false, error: 'INSUFFICIENT_FUNDS' });

      const r = await PaymentService.chargeMessagePayment('patient-user', chat, {});
      expect(r.success).toBe(false);
      expect(models.Transaction.create).not.toHaveBeenCalled();
    });

    test('charges the default price and creates a completed transaction', async () => {
      models.sequelize.transaction.mockImplementation(async (fn) => fn({}));
      BalanceService.charge.mockResolvedValue({
        success: true,
        balanceBefore: 200,
        balanceAfter: 150,
      });
      models.Transaction.create.mockResolvedValue({ id: 'tx-1', amount: 50, status: 'completed' });

      const r = await PaymentService.chargeMessagePayment('patient-user', chat, {});

      expect(r.success).toBe(true);
      expect(BalanceService.charge).toHaveBeenCalledWith(
        'patient-user',
        50,
        'RUB',
        'Оплата сообщения',
        expect.anything()
      );
      const txArgs = models.Transaction.create.mock.calls[0][0];
      expect(txArgs.type).toBe('message_payment');
      expect(txArgs.status).toBe('completed');
      expect(Number(txArgs.amount)).toBe(50);
      expect(Number(txArgs.doctorShare)).toBe(40);
      expect(Number(txArgs.clinicShare)).toBe(10);
      expect(r.revenueSplit).toEqual({ doctor: 40, clinic: 10 });
    });

    test('credits the doctor share after a successful charge', async () => {
      models.sequelize.transaction.mockImplementation(async (fn) => fn({}));
      BalanceService.charge.mockResolvedValue({ success: true, balanceBefore: 100, balanceAfter: 50 });
      models.Transaction.create.mockResolvedValue({ id: 'tx-2' });

      await PaymentService.chargeMessagePayment('patient-user', chat, {});
      expect(BalanceService.deposit).toHaveBeenCalledWith(
        'doctor-user',
        40,
        'RUB',
        expect.stringContaining('врача')
      );
      expect(BalanceService.deposit).toHaveBeenCalledWith(
        'admin-user',
        10,
        'RUB',
        expect.stringContaining('клиники')
      );
    });
  });

  describe('isMessageFree', () => {
    test('returns paid for an unknown chat without throwing', async () => {
      models.Chat.findByPk.mockResolvedValue(null);
      models.Chat.findOne.mockResolvedValue(null);
      const r = await PaymentService.isMessageFree('user', 'unknown-chat');
      expect(r).toEqual({ isFree: false, reason: null });
    });
  });
});
