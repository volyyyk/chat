/**
 * Hot-path gzip-сжатие бэкапов (этап 6 ROADMAP_NATIVE.md): нативный
 * .node-аддон medchat-core (napi: backupCompress/backupDecompress), с
 * честным fallback на node:zlib. Формат стандартный gzip (RFC 1952) —
 * данные, сжатые любым путём, читаются любым gunzip. Аддон ищется так
 * же, как в checksum.js: MEDCHAT_CORE_NODE или артефакт napi-build в
 * medchat-v2/core. backend = 'native' | 'fallback' — для тестов.
 */
'use strict';

const zlib = require('node:zlib');
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
    if (mod && typeof mod.backupCompress === 'function') {
      native = mod;
      break;
    }
  } catch (_e) {
    // следующий кандидат или fallback
  }
}

const backend = native ? 'native' : 'fallback';

function gzipCompress(data) {
  if (native) return native.backupCompress(data);
  return zlib.gzipSync(data);
}

function gzipDecompress(data) {
  if (native) return native.backupDecompress(data);
  return zlib.gunzipSync(data);
}

module.exports = { gzipCompress, gzipDecompress, backend };
