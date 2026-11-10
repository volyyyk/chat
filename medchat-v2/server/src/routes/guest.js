/**
 * Guest Routes: вход по QR-инвайту без регистрации.
 * Публичный роутер: монтируется в index.js БЕЗ authMiddleware.authenticate.
 * Глобальный rateLimiter уже применён на уровне приложения; токен 256-бит,
 * перебор невозможен, лимит держит спам.
 */

const router = require('express').Router();
const GuestController = require('../controllers/guestController');

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

module.exports = router;
