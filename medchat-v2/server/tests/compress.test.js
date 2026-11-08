/**
 * Hot-path сжатие бэкапов (этап 6): gzipCompress/gzipDecompress —
 * нативный .node-аддон с честным fallback на node:zlib. В CI
 * server-tests аддона нет (fallback-путь); native-ветка честно
 * гейтится по backend.
 */
'use strict';

const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { gzipCompress, gzipDecompress, backend } = require('../src/utils/compress');

describe('compress hot-path (этап 6: gzip бэкапов)', () => {
  test('backend экспортируется: native | fallback', () => {
    expect(['native', 'fallback']).toContain(backend);
  });

  test('roundtrip: типичный JSON бэкапа сжимается и восстанавливается', () => {
    const src = Buffer.from(JSON.stringify({ version: '1.0', dataTypes: ['chats'] }).repeat(100), 'utf8');
    const packed = gzipCompress(src);
    expect(packed.length).toBeGreaterThan(3);
    expect(packed.length).toBeLessThan(src.length);
    expect(gzipDecompress(packed).equals(src)).toBe(true);
  });

  test('gzip-заголовок RFC 1952 (1f 8b 08); пустой буфер тоже валиден', () => {
    const packed = gzipCompress(Buffer.alloc(0));
    expect([...packed.slice(0, 3)]).toEqual([0x1f, 0x8b, 0x08]);
    expect(gzipDecompress(packed).equals(Buffer.alloc(0))).toBe(true);
  });

  test('parity с node:zlib в обе стороны', () => {
    const src = Buffer.from('MedChat compress parity 1234567890 '.repeat(20), 'utf8');
    expect(zlib.gunzipSync(gzipCompress(src)).equals(src)).toBe(true);
    expect(gzipDecompress(zlib.gzipSync(src)).equals(src)).toBe(true);
  });

  test('битый/обрезанный поток — исключение, не паника', () => {
    expect(() => gzipDecompress(Buffer.from('not gzip at all', 'utf8'))).toThrow();
    const packed = gzipCompress(crypto.randomBytes(4096));
    const truncated = packed.slice(0, Math.floor(packed.length / 2));
    expect(() => gzipDecompress(truncated)).toThrow();
  });

  test('честно: если native-аддон доступен — cross-parity и на нём', () => {
    if (backend !== 'native') return; // в CI server-tests аддона нет
    const src = Buffer.from('native cross parity xyz '.repeat(30), 'utf8');
    expect(zlib.gunzipSync(gzipCompress(src)).equals(src)).toBe(true);
  });
});
