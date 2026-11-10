/**
 * Guest Routes: вход по QR-инвайту без регистрации.
 * Публичный роутер: монтируется в index.js БЕЗ authMiddleware.authenticate.
 * Глобальный rateLimiter уже применён на уровне приложения; токен 256-бит,
 * перебор невозможен, лимит держит спам.
 */

const router = require('express').Router();
const GuestController = require('../controllers/guestController');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * /api/guest/invites/{token}:
 *   get:
 *     summary: Превью приглашения (врач/клиника) до входа
 *     tags: [Guest]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Валидность приглашения и данные врача
 *       404:
 *         description: Приглашение не найдено
 */
router.get('/invites/:token', GuestController.preview);

/**
 * @swagger
 * /api/guest/join:
 *   post:
 *     summary: Гостевой вход пациента по QR-инвайту (без регистрации)
 *     tags: [Guest]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, consent]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 64 hex-символа из ссылки-приглашения
 *               consent:
 *                 type: boolean
 *                 description: Согласие на обработку персональных данных (152-ФЗ)
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Гостевая сессия создана (или повторный вход того же гостя)
 *       403:
 *         description: Нет согласия на обработку ПД
 *       410:
 *         description: Приглашение истекло, отозвано или врач недоступен
 */
router.post('/join', GuestController.join);


/**
 * @swagger
 * /api/guest/upgrade:
 *   post:
 *     summary: Создать аккаунт из гостевого (закрепить историю чатов за пациентом)
 *     tags: [Guest]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Аккаунт создан, новые токены
 *       409:
 *         description: Аккаунт уже не гостевой или email занят
 */
router.post('/upgrade', authenticate(), GuestController.upgrade);

/**
 * @swagger
 * /api/guest/transfer/init:
 *   post:
 *     summary: Создать одноразовый токен переноса данных на новое устройство (10 минут)
 *     tags: [Guest]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Токен переноса создан, предыдущие погашены
 *       404:
 *         description: Пользователь не найден
 */
router.post('/transfer/init', authenticate(), GuestController.transferInit);

/**
 * @swagger
 * /api/guest/transfer/{token}/blob:
 *   post:
 *     summary: Загрузить шифрованный blob переноса (только владелец токена)
 *     tags: [Guest]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payload]
 *             properties:
 *               payload:
 *                 type: string
 *                 description: base64 (nonce || secretbox), ключ только в QR
 *     responses:
 *       200:
 *         description: Blob сохранён
 *       404:
 *         description: Перенос не найден или чужой токен
 *       410:
 *         description: Срок действия истёк
 */
router.post('/transfer/:token/blob', authenticate(), GuestController.transferBlob);

/**
 * @swagger
 * /api/guest/transfer/consume:
 *   post:
 *     summary: Одноразовое потребление токена переноса новым устройством
 *     tags: [Guest]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Новая сессия (token/refreshToken/user) + шифрованный blob
 *       409:
 *         description: Blob ещё не загружен старым устройством
 *       410:
 *         description: Токен уже использован или истёк
 */
router.post('/transfer/consume', GuestController.transferConsume);

module.exports = router;
