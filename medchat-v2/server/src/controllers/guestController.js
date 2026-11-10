/**
 * Guest Controller
 * Вход пациента по QR-инвайту БЕЗ регистрации.
 *
 * Сценарий: врач показывает QR (POST /api/chats/invites), пациент сканирует,
 * браузер открывает /connect?token=..., страница показывает врача и клинику
 * (GET /api/guest/invites/:token), пациент даёт согласие на обработку ПД и
 * отправляет POST /api/guest/join. Сервер создаёт гостевого пользователя и
 * пациента, находит или создаёт чат с врачом и выдаёт обычные JWT-токены.
 *
 * Юридическая рамка: согласие на обработку персональных данных обязательно
 * (152-ФЗ); идентификация - владение 256-битным одноразовым токеном. Для
 * промышленной эксплуатации с SMS-гейтом (149-ФЗ ст. 10.1) см. LEGAL.md §5:
 * перед продом гостевой вход либо дополняется верификацией телефона
 * (эндпоинты /api/auth/phone/* уже есть), либо отключается оператором.
 */

const crypto = require('crypto');
const models = require('../models');
const { AppError } = require('../middleware/errorHandler');
const AuthService = require('../services/authService');
const CryptoService = require('../services/cryptoService');

const TOKEN_RE = /^[a-f0-9]{64}$/;

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
  };
}

class GuestController {
  /**
   * GET /api/guest/invites/:token
   * Публичное превью приглашения: врач, клиника, специальности, валидность.
   * Никаких персональных данных пациента не отдаёт.
   */
  static async preview(req, res, next) {
    try {
      const token = String(req.params.token || '').toLowerCase().trim();
      if (!TOKEN_RE.test(token)) {
        throw new AppError('Некорректный токен приглашения', 400, 'VALIDATION_ERROR');
      }

      const invite = await models.ChatInvite.findOne({
        where: { token },
        include: [{
          model: models.Doctor,
          as: 'doctor',
          include: [
            { model: models.User, as: 'user' },
            { model: models.Clinic, as: 'clinic' },
            { model: models.Specialty, as: 'specialtyDetails' },
          ],
        }],
      });

      if (!invite || !invite.doctor) {
        throw new AppError('Приглашение не найдено', 404, 'NOT_FOUND');
      }

      const now = new Date();
      const doctorActive = invite.doctor.user && invite.doctor.user.status === 'active';
      const expired = !!invite.revokedAt || invite.expiresAt <= now;

      res.json({
        valid: !expired && doctorActive,
        expired,
        alreadyUsed: !!invite.guestUserId,
        doctor: {
          fullName: invite.doctor.user ? invite.doctor.user.fullName : 'Врач',
          clinic: invite.doctor.clinic ? { name: invite.doctor.clinic.name } : null,
          specialties: (invite.doctor.specialtyDetails || []).map((s) => s.name).filter(Boolean),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/guest/join { token, consent, firstName?, lastName? }
   * Публичный эндпоинт гостевого входа. Повторный скан того же QR тем же
   * гостем - повторный вход (новые токены, без дублей), новый гость по
   * использованному инвайту не пройдёт.
   */
  static async join(req, res, next) {
    try {
      const token = String((req.body && req.body.token) || '').toLowerCase().trim();
      if (!TOKEN_RE.test(token)) {
        throw new AppError('Некорректный токен приглашения', 400, 'VALIDATION_ERROR');
      }
      if ((req.body && req.body.consent) !== true) {
        throw new AppError('Требуется согласие на обработку персональных данных', 403, 'CONSENT_REQUIRED');
      }

      const invite = await models.ChatInvite.findOne({
        where: { token },
        include: [{
          model: models.Doctor,
          as: 'doctor',
          include: [{ model: models.User, as: 'user' }],
        }],
      });
      if (!invite || !invite.doctor || !invite.doctor.user) {
        throw new AppError('Приглашение не найдено', 404, 'NOT_FOUND');
      }
      if (invite.revokedAt) {
        throw new AppError('Приглашение отозвано', 410, 'INVITE_REVOKED');
      }
      if (invite.expiresAt <= new Date()) {
        throw new AppError('Срок действия приглашения истёк, попросите врача показать QR заново', 410, 'INVITE_EXPIRED');
      }
      if (invite.doctor.user.status !== 'active') {
        throw new AppError('Врач временно недоступен', 410, 'DOCTOR_INACTIVE');
      }

      let user;
      let patient;

      if (invite.guestUserId) {
        // Повторный вход уже созданного гостя по тому же QR.
        user = await models.User.findByPk(invite.guestUserId);
        if (!user || user.status !== 'active') {
          throw new AppError('Гостевой аккаунт недоступен', 410, 'GUEST_INACTIVE');
        }
        patient = await models.Patient.findOne({ where: { userId: user.id } });
        if (!patient) {
          throw new AppError('Профиль пациента не найден', 500, 'INTERNAL_ERROR');
        }
      } else {
        const firstName = String((req.body && req.body.firstName) || '').trim().slice(0, 100) || 'Гость';
        const lastName = String((req.body && req.body.lastName) || '').trim().slice(0, 100) || null;

        // Гостевой аккаунт: email-заглушка, случайный пароль (парольный вход
        // невозможен, только токены из этого ответа), статус active сразу.
        const guestEmail = 'guest-' + crypto.randomBytes(8).toString('hex') + '@guest.medchat.local';
        const passwordHash = await AuthService.hashPassword(crypto.randomBytes(32).toString('hex'));
        user = await models.User.create({
          email: guestEmail,
          passwordHash,
          firstName,
          lastName,
          role: 'patient',
          status: 'active',
          emailVerified: false,
          phoneVerified: false,
          consentGiven: true,
          consentDate: new Date(),
          consentVersion: '1.0',
        });

        patient = await models.Patient.create({
          userId: user.id,
          doctorId: invite.doctorId,
          clinicId: invite.doctor.clinicId || null,
          addedBy: 'system',
        });
      }

      // Чат: ищем существующий, иначе создаём (зеркало ChatController.create).
      let chat = await models.Chat.findOne({
        where: { doctorId: invite.doctorId, patientId: patient.id },
      });
      if (!chat) {
        const chatId = 'CHAT_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const keyPair = CryptoService.generateX25519KeyPair();
        chat = await models.Chat.create({
          chatId,
          doctorId: invite.doctorId,
          patientId: patient.id,
          clinicId: invite.doctor.clinicId || null,
          type: 'individual',
          priority: 'normal',
          title: (invite.doctor.user.fullName || 'Врач') + ' - ' + ((user.firstName || '') + ' ' + (user.lastName || '')).trim(),
          createdBy: 'doctor',
          encryptionKey: keyPair.publicKey,
          isEncrypted: true,
        });
        await models.ChatParticipant.bulkCreate([
          { chatId: chat.id, userId: invite.doctor.userId, role: 'doctor' },
          { chatId: chat.id, userId: user.id, role: 'patient' },
        ]);
        await patient.update({ chatCreatedAt: new Date() });
      }

      // Привязываем инвайт к гостю: повторные сканы дают повторный вход,
      // новый гость по использованному инвайту уже не войдёт.
      if (!invite.guestUserId) {
        await invite.update({ guestUserId: user.id, usedAt: new Date(), chatId: chat.id });
      }

      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId || null,
        patientId: patient.id,
      };
      const accessToken = AuthService.generateToken(tokenPayload);
      const refreshToken = await AuthService.generateRefreshToken({
        id: user.id,
        email: user.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      const fullChat = await models.Chat.findByPk(chat.id, {
        include: [
          { model: models.Doctor, as: 'doctor', include: [{ model: models.User, as: 'user' }] },
          { model: models.Patient, as: 'patient', include: [{ model: models.User, as: 'user' }] },
          { model: models.Clinic, as: 'clinic' },
        ],
      });

      res.status(200).json({
        token: accessToken,
        refreshToken,
        user: sanitizeUser(user),
        patient: { id: patient.id },
        chat: fullChat,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/guest/upgrade { email, password }
   * Превращение анонимного гостевого аккаунта в полноценный: пациент задаёт
   * email и пароль, история чатов остаётся за ним и доступна с любого
   * устройства после входа. Доступно только гостю (@guest.medchat.local).
   */
  static async upgrade(req, res, next) {
    try {
      const user = await models.User.findByPk(req.user.id);
      if (!user || user.status !== 'active') {
        throw new AppError('Пользователь не найден', 404, 'NOT_FOUND');
      }
      if (!/@guest\.medchat\.local$/.test(user.email)) {
        throw new AppError('Аккаунт уже не гостевой', 409, 'DUPLICATE_ERROR');
      }

      const email = String((req.body && req.body.email) || '').trim().toLowerCase();
      const password = String((req.body && req.body.password) || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError('Некорректный email', 400, 'VALIDATION_ERROR');
      }
      if (password.length < 8) {
        throw new AppError('Пароль должен быть не короче 8 символов', 400, 'VALIDATION_ERROR');
      }

      const existing = await models.User.findOne({ where: { email } });
      if (existing && existing.id !== user.id) {
        throw new AppError('Пользователь с таким email уже зарегистрирован', 409, 'DUPLICATE_ERROR');
      }

      const passwordHash = await AuthService.hashPassword(password);
      await user.update({ email, passwordHash, emailVerified: false });

      const patient = await models.Patient.findOne({ where: { userId: user.id } });
      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId || null,
        patientId: patient ? patient.id : null,
      };
      const accessToken = AuthService.generateToken(tokenPayload);
      const refreshToken = await AuthService.generateRefreshToken({
        id: user.id,
        email: user.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({ token: accessToken, refreshToken, user: sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/guest/transfer/init
   * Старое устройство: создать одноразовый токен переноса данных (10 минут).
   * Секретные ключи через сервер НЕ передаются: сервер получит только
   * шифротекст blob'а, ключ шифрования едет в QR между устройствами.
   */
  static async transferInit(req, res, next) {
    try {
      const user = await models.User.findByPk(req.user.id);
      if (!user || user.status !== 'active') {
        throw new AppError('Пользователь не найден', 404, 'NOT_FOUND');
      }
      // Новый init гасит предыдущие незавершённые токены: активный один.
      await models.DataTransfer.update(
        { consumedAt: new Date() },
        { where: { userId: user.id, consumedAt: null } }
      );
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await models.DataTransfer.create({ token, userId: user.id, expiresAt });
      res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/guest/transfer/:token/blob { payload }
   * Старое устройство загружает ЗАШИФРОВАННЫЙ на устройстве blob
   * (base64: nonce || secretbox-шифротекст). Ключа у сервера нет:
   * приватные E2E-ключи для сервера недоступны.
   */
  static async transferBlob(req, res, next) {
    try {
      const token = String(req.params.token || '').toLowerCase().trim();
      if (!TOKEN_RE.test(token)) {
        throw new AppError('Некорректный токен переноса', 400, 'VALIDATION_ERROR');
      }
      const payload = String((req.body && req.body.payload) || '');
      if (!payload || payload.length > 200 * 1024) {
        throw new AppError('Некорректный payload переноса', 400, 'VALIDATION_ERROR');
      }
      const record = await models.DataTransfer.findOne({ where: { token } });
      if (!record || record.userId !== req.user.id) {
        throw new AppError('Перенос не найден', 404, 'NOT_FOUND');
      }
      if (record.consumedAt || record.expiresAt <= new Date()) {
        throw new AppError('Срок действия переноса истёк', 410, 'TRANSFER_EXPIRED');
      }
      await record.update({ payload });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/guest/transfer/consume { token }
   * Новое устройство: одноразовое потребление токена переноса. Вход не
   * требуется: 256-битный токен сам является секретом. Возвращает новую
   * сессию (token/refreshToken/user) и шифрованный blob. Токен гасится,
   * blob уничтожается: второй раз перенос не сработает.
   */
  static async transferConsume(req, res, next) {
    try {
      const token = String((req.body && req.body.token) || '').toLowerCase().trim();
      if (!TOKEN_RE.test(token)) {
        throw new AppError('Некорректный токен переноса', 400, 'VALIDATION_ERROR');
      }
      const record = await models.DataTransfer.findOne({ where: { token } });
      if (!record) {
        throw new AppError('Перенос не найден', 404, 'NOT_FOUND');
      }
      if (record.consumedAt) {
        throw new AppError('Токен переноса уже использован', 410, 'TRANSFER_USED');
      }
      if (record.expiresAt <= new Date()) {
        throw new AppError('Срок действия переноса истёк', 410, 'TRANSFER_EXPIRED');
      }
      if (!record.payload) {
        throw new AppError('Данные переноса ещё не загружены со старого устройства', 409, 'TRANSFER_NOT_READY');
      }
      const user = await models.User.findByPk(record.userId);
      if (!user || user.status !== 'active') {
        throw new AppError('Пользователь недоступен', 410, 'GUEST_INACTIVE');
      }
      const patient = await models.Patient.findOne({ where: { userId: user.id } });
      const payload = record.payload;
      await record.update({ consumedAt: new Date(), payload: null });

      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId || null,
        patientId: patient ? patient.id : null,
      };
      const accessToken = AuthService.generateToken(tokenPayload);
      const refreshToken = await AuthService.generateRefreshToken({
        id: user.id,
        email: user.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        token: accessToken,
        refreshToken,
        user: sanitizeUser(user),
        payload,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = GuestController;