/**
 * Кросс-платформенный контрактный тест: канонический вектор NaCl crypto_box.
 *
 * Проверяет вторую сторону E2E-конверта x25519-box: tweetnacl — та же
 * библиотека, которой шифрует мобильный клиент, — обязана воспроизводить
 * эталонный вывод NaCl байт-в-байт. Первая сторона (Rust-ядро medchat-core,
 * SalsaBox) проверяется на той же фикстуре в core/tests/interop_vectors.rs
 * (джоба CI core-tests). Закрывает пункт DoD Этапа 2 docs/ROADMAP_NATIVE.md:
 * тест-векторы совпадают между реализациями.
 */

const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');

function readFixture() {
  const file = path.join(
    __dirname,
    '..',
    '..',
    'core',
    'tests',
    'nacl_box_vector.hex'
  );
  const raw = fs.readFileSync(file, 'utf8');
  const fields = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf(' = ');
    if (eq === -1) continue;
    fields[trimmed.slice(0, eq)] = Buffer.from(trimmed.slice(eq + 3).trim(), 'hex');
  }
  return fields;
}

function bytesEqual(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b);
}

describe('E2E cross-platform contract (canonical NaCl crypto_box vector)', () => {
  const v = readFixture();

  test('фикстура — канонический вектор NaCl (размеры полей)', () => {
    expect(v.alice_sk).toHaveLength(32);
    expect(v.alice_pk).toHaveLength(32);
    expect(v.bob_sk).toHaveLength(32);
    expect(v.bob_pk).toHaveLength(32);
    expect(v.nonce).toHaveLength(24);
    expect(v.m).toHaveLength(131);
    expect(v.c).toHaveLength(147);
  });

  test('tweetnacl воспроизводит эталонный шифртекст байт-в-байт', () => {
    // c = nacl.box(m, nonce, bob_pk, alice_sk) — отправитель Alice.
    const c = nacl.box(v.m, v.nonce, v.bob_pk, v.alice_sk);
    expect(bytesEqual(Buffer.from(c), v.c)).toBe(true);
  });

  test('tweetnacl открывает эталонный бокс ключом получателя Bob', () => {
    const m = nacl.box.open(v.c, v.nonce, v.alice_pk, v.bob_sk);
    expect(m).not.toBeNull();
    expect(bytesEqual(Buffer.from(m), v.m)).toBe(true);
  });
});
