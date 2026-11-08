/**
 * Hot-path checksum (этап 6 ROADMAP_NATIVE.md): SHA-256 через нативный
 * .node-аддон medchat-core (napi: sha256Checksum/sha256Verify), с честным
 * fallback на node:crypto. Аддон ищется:
 *   1) по MEDCHAT_CORE_NODE (путь к .node-артефакту);
 *   2) medchat-core.linux-x64-gnu.node в medchat-v2/core (артефакт napi-build).
 * Если не найден — работаем на node:crypto (корректность та же, скорость
 * ниже: event-loop занят хэшированием). backend = 'native' | 'fallback'
 * экспортируется для диагностики и тестов.
 */
'use strict';

const nodeCrypto = require('node:crypto');
const path = require('node:path');

let native = null;
const candidates = [];
if (process.env.MEDCHAT_CORE_NODE) candidates.push(process.env.MEDCHAT_CORE_NODE);
candidates.push(
  path.join(__dirname, '..', '..', '..', 'core', 'medchat-core.linux-x64-gnu.node')
);
for (const candidate of candidates) {
  try {
    const mod = require(candidate);
    if (mod && typeof mod.sha256Checksum === 'function') {
      native = mod;
      break;
    }
  } catch (_e) {
    // следующий кандидат или fallback
  }
}

const backend = native ? 'native' : 'fallback';

function sha256Hex(data) {
  if (native) return native.sha256Checksum(data);
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

function sha256Verify(data, expectedHex) {
  if (native) return native.sha256Verify(data, expectedHex);
  const expected = String(expectedHex || '').trim().toLowerCase();
  return sha256Hex(data) === expected;
}

module.exports = { sha256Hex, sha256Verify, backend };
