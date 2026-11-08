/**
 * Контрактные векторы bcrypt (этап 2 ROADMAP_NATIVE.md).
 *
 * KAT-векторы из тестов OpenBSD/crypt_blowfish (Solar Designer, public
 * domain) на общей фикстуре core/tests/bcrypt_vector.txt: ту же фикстуру
 * верифицирует Rust-ядро (core/tests/bcrypt_vector.rs, крейт bcrypt,
 * джоба core-tests). Серверный bcrypt (нативный bcrypt-пакет, cost 12 в
 * authService) обязан соглашаться с ядром на всех векторах.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const FIXTURE = path.join(__dirname, '..', '..', 'core', 'tests', 'bcrypt_vector.txt');

// Формат «ключ = значение»: значение — всё после первого «= » без trim
// (пароль v4 содержит пробелы внутри).
function parseFixture() {
  const fields = {};
  const text = fs.readFileSync(FIXTURE, 'utf8');
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const eq = line.indexOf('= ');
    if (eq < 0) continue;
    fields[line.slice(0, eq).trim()] = line.slice(eq + 2);
  }
  return fields;
}

const fields = parseFixture();

const vectors = [1, 2, 3, 4].map((n) => ({
  id: `v${n}`,
  password: fields[`v${n}_password`],
  hash: fields[`v${n}_hash`],
}));

describe('Контрактные векторы bcrypt (OpenBSD KAT, фикстура core/tests)', () => {
  vectors.forEach(({ id, password, hash }) => {
    test(`вектор ${id}: серверный bcrypt верифицирует KAT`, () => {
      expect(bcrypt.compareSync(password, hash)).toBe(true);
    });
  });

  test('неверный пароль отклоняется', () => {
    expect(bcrypt.compareSync('wrong-password', fields.v1_hash)).toBe(false);
  });
});