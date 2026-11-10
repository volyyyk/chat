/**
 * Верификация данных внешних провайдеров входа.
 *
 * Telegram Login Widget (https://core.telegram.org/widgets/login):
 * сервер получает поля id/first_name/username/auth_date/... и hash.
 * hash = HMAC-SHA256(data-check-string, SHA256(bot_token)).
 * Данные без валидной подписи считать доверенными НЕЛЬЗЯ (их можно подделать).
 */

const crypto = require('crypto');

// Окно свежести auth_data: сутки (после этого просим войти заново).
const MAX_AGE_SECONDS = 86400;

function verifyTelegramAuth(data, botToken) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'No auth data' };
  }
  const { hash, ...rest } = data;
  if (!hash || !data.id) {
    return { ok: false, reason: 'Missing hash or id' };
  }
  if (!botToken) {
    return { ok: false, reason: 'Telegram auth is not configured' };
  }

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => key + '=' + rest[key])
    .join('\n');

  const secret = crypto.createHash('sha256').update(String(botToken).trim()).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (expected !== String(hash)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  const authDate = parseInt(data.auth_date, 10);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'Auth data expired' };
  }

  return { ok: true };
}

module.exports = { verifyTelegramAuth, MAX_AGE_SECONDS };
