#!/usr/bin/env node
/**
 * Node-бенчмарки крипто-пути — зеркальная сторона benches/crypto.rs
 * (medchat-core, этап 2 ROADMAP_NATIVE.md; DoD этапа 2: «бенчмарк ≥ x10
 * к Node на крипто-пути»).
 *
 * Те же примитивы, payload (30 байт) и cost, что в Rust-бенчмарках:
 *  - tweetnacl box (X25519 + XSalsa20-Poly1305) — реализация мобильного
 *    клиента (см. server/tests/coreInterop.test.js): эфемерная пара +
 *    боксы по числу получателей, открытие своим ключом;
 *  - Node crypto AES-256-GCM (encrypt+decrypt, 12-байтный IV) — референс
 *    message-key-шага Double Ratchet (самого ratchet в Node нет — в DoD
 *    сравнивается конвертный x25519-box-путь);
 *  - нативный bcrypt compareSync: cost 5 (KAT-вектор OpenBSD) и cost 12
 *    (production-режим authService).
 *
 * Числа печатаются в ops/s и сводятся с Rust-стороной в логе джобы
 * core-bench (ci-logs/ci-bench.log) — обе стороны на одном раннере.
 *
 * Запуск: npm run bench:core (из medchat-v2/server).
 */
'use strict';

const crypto = require('crypto');
const nacl = require('tweetnacl');
const bcrypt = require('bcrypt');

// Типовое сообщение чата (30 байт) — тот же payload в benches/crypto.rs.
const MSG = Buffer.from('Patient: good evening, doctor!', 'utf8');
const BENCH_BUDGET_MS = 2000; // длительность замера быстрых операций
const SLOW_MIN_ITERS = 4;     // минимум итераций для медленных (cost 12)

function hrns() {
  return process.hrtime.bigint();
}

function measure(name, fn, opts) {
  const slow = Boolean(opts && opts.slow);
  if (slow) {
    fn(); // прогрев: одна операция
  } else {
    const warmUntil = hrns() + 300000000n; // 300 мс прогрева
    while (hrns() < warmUntil) fn();
  }

  let iters = 0;
  const started = hrns();
  if (slow) {
    while (iters < SLOW_MIN_ITERS) {
      fn();
      iters += 1;
    }
  } else {
    const budget = started + BigInt(BENCH_BUDGET_MS) * 1000000n;
    while (hrns() < budget) {
      fn();
      iters += 1;
    }
  }
  const elapsedNs = Number(hrns() - started);
  const opsPerSec = (iters * 1e9) / elapsedNs;
  const msPerOp = elapsedNs / 1e6 / iters;
  const opsStr = opsPerSec < 10 ? opsPerSec.toFixed(2) : Math.round(opsPerSec).toString();
  const msStr = msPerOp < 1 ? msPerOp.toFixed(3) : msPerOp.toFixed(2);
  console.log('[bench] ' + name + ': ' + opsStr + ' ops/s (' + msStr + ' ms/op)');
  return opsPerSec;
}

console.log('node ' + process.version + ', platform: ' + process.platform + ', payload: ' + MSG.length + ' bytes');

// ---------- tweetnacl box (x25519-box конверт, как в мобильном клиенте) --------
const alice = nacl.box.keyPair();
const bob = nacl.box.keyPair();
const carol = nacl.box.keyPair();
const nonce = nacl.randomBytes(nacl.box.nonceLength);

// seal+open, 1 получатель: эфемерная пара + бокс + открытие (личный чат).
function boxSealOpen1() {
  const eph = nacl.box.keyPair();
  const boxed = nacl.box(MSG, nonce, bob.publicKey, eph.secretKey);
  const opened = nacl.box.open(boxed, nonce, eph.publicKey, bob.secretKey);
  if (opened === null) throw new Error('nacl.box.open вернул null');
}
boxSealOpen1();
measure('tweetnacl box seal+open / 1 recipient / 30B', boxSealOpen1);

// seal+open, 3 получателя: групповой чат (3 бокса под одной эфемерной парой).
function boxSealOpen3() {
  const eph = nacl.box.keyPair();
  nacl.box(MSG, nonce, alice.publicKey, eph.secretKey);
  const forBob = nacl.box(MSG, nonce, bob.publicKey, eph.secretKey);
  nacl.box(MSG, nonce, carol.publicKey, eph.secretKey);
  const opened = nacl.box.open(forBob, nonce, eph.publicKey, bob.secretKey);
  if (opened === null) throw new Error('nacl.box.open вернул null');
}
boxSealOpen3();
measure('tweetnacl box seal+open / 3 recipients / 30B', boxSealOpen3);

// seal, 1 получатель: путь отправителя без расшифровки.
function boxSeal1() {
  const eph = nacl.box.keyPair();
  nacl.box(MSG, nonce, bob.publicKey, eph.secretKey);
}
boxSeal1();
measure('tweetnacl box seal / 1 recipient / 30B', boxSeal1);

// ---------- Node crypto AES-256-GCM (message-key-шаг Double Ratchet) -----------
const gcmKey = crypto.randomBytes(32);
const gcmIv = crypto.randomBytes(12);

function aesGcmRoundtrip() {
  const cipher = crypto.createCipheriv('aes-256-gcm', gcmKey, gcmIv);
  const ct = Buffer.concat([cipher.update(MSG), cipher.final()]);
  const tag = cipher.getAuthTag();
  const decipher = crypto.createDecipheriv('aes-256-gcm', gcmKey, gcmIv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  if (!pt.equals(MSG)) throw new Error('AES-GCM roundtrip не совпал с plaintext');
}
aesGcmRoundtrip();
measure('node crypto AES-256-GCM encrypt+decrypt / 30B', aesGcmRoundtrip);

// ---------- нативный bcrypt (cost 5 KAT + production cost 12) -------------------
const KAT_HASH5 = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW';
const HASH12 = bcrypt.hashSync('Test1234!', 12);

if (!bcrypt.compareSync('U*U', KAT_HASH5)) {
  throw new Error('KAT cost 5 не верифицируется — бенчмарк некорректен');
}
if (!bcrypt.compareSync('Test1234!', HASH12)) {
  throw new Error('cost 12 хэш не верифицируется');
}

function bcryptVerify5() {
  bcrypt.compareSync('U*U', KAT_HASH5);
}
measure('bcrypt compareSync / cost 5 (KAT)', bcryptVerify5);

function bcryptVerify12() {
  bcrypt.compareSync('Test1234!', HASH12);
}
measure('bcrypt compareSync / cost 12 (production)', bcryptVerify12, { slow: true });

console.log('done.');