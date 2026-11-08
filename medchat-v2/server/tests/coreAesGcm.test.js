/**
 * Кросс-платформенный контрактный тест: known-answer векторы AES-256-GCM.
 *
 * Node.js crypto (AES-256-GCM) — реализация at-rest-шифрования сервера
 * (cryptoService) — обязана воспроизводить эталонные ct и tag
 * байт-в-байт. Первая сторона контракта (Rust medchat-core, крейт
 * aes-gcm 0.10 — AEAD каждого сообщения Double Ratchet) проверяется
 * на той же фикстуре в core/tests/aes_gcm_vector.rs (джоба CI
 * core-tests). Закрывает пункт DoD Этапа 2 docs/ROADMAP_NATIVE.md:
 * тест-векторы совпадают между реализациями.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function readFixture() {
  const file = path.join(__dirname, '..', '..', 'core', 'tests', 'aes_gcm_vector.hex');
  const raw = fs.readFileSync(file, 'utf8');
  const fields = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // split по '=' (а не ' = '): в фикстуре есть пустые значения
    // ("v1_pt =" — пустой plaintext/AAD первого вектора).
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    fields[trimmed.slice(0, eq).trim()] = Buffer.from(
      trimmed.slice(eq + 1).trim(),
      'hex'
    );
  }
  return fields;
}

function encryptAesGcm(key, nonce, plaintext, aad) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ct, tag: cipher.getAuthTag() };
}

function decryptAesGcm(key, nonce, ct, tag, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: 16,
  });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

describe('E2E cross-platform contract (AES-256-GCM known-answer vectors)', () => {
  const v = readFixture();
  const prefixes = ['v1', 'v2', 'v3'];

  test('фикстура — векторы ожидаемой формы (размеры полей)', () => {
    for (const p of prefixes) {
      expect(v[p + '_key']).toHaveLength(32);
      expect(v[p + '_nonce']).toHaveLength(12);
      expect(v[p + '_tag']).toHaveLength(16);
      expect(v[p + '_ct']).toHaveLength(v[p + '_pt'].length);
    }
  });

  test.each(prefixes)('Node crypto воспроизводит ct и tag вектора %s', (p) => {
    const { ct, tag } = encryptAesGcm(
      v[p + '_key'],
      v[p + '_nonce'],
      v[p + '_pt'],
      v[p + '_aad']
    );
    expect(ct.equals(v[p + '_ct'])).toBe(true);
    expect(tag.equals(v[p + '_tag'])).toBe(true);
  });

  test.each(prefixes)('Node crypto расшифровывает эталонный вектор %s', (p) => {
    const pt = decryptAesGcm(
      v[p + '_key'],
      v[p + '_nonce'],
      v[p + '_ct'],
      v[p + '_tag'],
      v[p + '_aad']
    );
    expect(pt.equals(v[p + '_pt'])).toBe(true);
  });

  test('подделанный тег отклоняется AEAD', () => {
    const badTag = Buffer.from(v.v2_tag);
    badTag[15] ^= 0x01;
    expect(() =>
      decryptAesGcm(v.v2_key, v.v2_nonce, v.v2_ct, badTag, v.v2_aad)
    ).toThrow();
  });
});
