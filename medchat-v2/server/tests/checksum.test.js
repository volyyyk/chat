/**
 * Hot-path checksum (этап 6): KAT + parity native/fallback.
 * В CI server-tests .node-артефакта нет — тест гоняет fallback-путь;
 * native-путь дополнительно сверяется, только если аддон доступен
 * (локально после сборки .node или с MEDCHAT_CORE_NODE). Нативный путь
 * в CI гейтит джоба napi-build (napi-smoke.js: parity с node:crypto).
 */
'use strict';

const nodeCrypto = require('node:crypto');
const { sha256Hex, sha256Verify, backend } = require('../src/utils/checksum');

describe('checksum hot-path (этап 6)', () => {
  test('backend экспортируется: native | fallback', () => {
    expect(['native', 'fallback']).toContain(backend);
  });

  test('KAT FIPS 180-4: SHA-256("abc") и пустой буфер', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('parity с node:crypto на произвольном буфере', () => {
    const data = Buffer.from('MedChat hot path: server wrapper', 'utf8');
    expect(sha256Hex(data)).toBe(
      nodeCrypto.createHash('sha256').update(data).digest('hex')
    );
  });

  test('sha256Verify: совпадение (в т.ч. uppercase/пробелы), несовпадение', () => {
    const data = Buffer.from('integrity check', 'utf8');
    const hex = sha256Hex(data);
    expect(sha256Verify(data, hex)).toBe(true);
    expect(sha256Verify(data, hex.toUpperCase())).toBe(true);
    expect(sha256Verify(data, '  ' + hex + '  ')).toBe(true);
    expect(sha256Verify(data, 'deadbeef')).toBe(false);
  });

  test('честно: если native-аддон доступен — parity с node:crypto и на нём', () => {
    if (backend === 'fallback') {
      // .node-артефакта нет (типично для CI server-tests) — пропуск без
      // ошибки: нативный путь гейтится napi-build (napi-smoke.js).
      return;
    }
    const data = Buffer.alloc(1024, 7);
    expect(sha256Hex(data)).toBe(
      nodeCrypto.createHash('sha256').update(data).digest('hex')
    );
  });
});
