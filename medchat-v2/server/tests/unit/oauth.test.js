/**
 * Юнит-тесты верификации Telegram Login Widget (utils/oauthVerify).
 * Подпись считается по алгоритму документации: HMAC-SHA256 от
 * data-check-string ключом SHA256(bot_token).
 */

const crypto = require('crypto');
const { verifyTelegramAuth } = require('../../src/utils/oauthVerify');

describe('verifyTelegramAuth (Telegram Login Widget)', () => {
  const botToken = '123456:TEST-BOT-TOKEN';

  const make = (overrides = {}) => {
    const data = {
      id: 123456789,
      first_name: 'Иван',
      username: 'ivan_test',
      auth_date: Math.floor(Date.now() / 1000),
      ...overrides,
    };
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const checkString = Object.keys(data)
      .sort()
      .map((k) => k + '=' + data[k])
      .join('\n');
    data.hash = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
    return data;
  };

  test('валидная подпись проходит', () => {
    const r = verifyTelegramAuth(make(), botToken);
    expect(r.ok).toBe(true);
  });

  test('подделанные поля отклоняются (Invalid signature)', () => {
    const data = make();
    data.id = 999;
    const r = verifyTelegramAuth(data, botToken);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/signature/i);
  });

  test('чужой bot token отклоняется', () => {
    const r = verifyTelegramAuth(make(), '1:wrong-token');
    expect(r.ok).toBe(false);
  });

  test('устаревший auth_date отклоняется', () => {
    const data = make({ auth_date: Math.floor(Date.now() / 1000) - 3 * 86400 });
    const r = verifyTelegramAuth(data, botToken);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/i);
  });

  test('данные без hash отклоняются', () => {
    expect(verifyTelegramAuth({ id: 1, first_name: 'X' }, botToken).ok).toBe(false);
  });

  test('без настроенного bot token отклоняется', () => {
    const r = verifyTelegramAuth(make(), null);
    expect(r.ok).toBe(false);
  });
});
