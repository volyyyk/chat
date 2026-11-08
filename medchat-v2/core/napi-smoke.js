#!/usr/bin/env node
/**
 * Node-интеграция napi-обёрток medchat-core (src/node.rs) — JS-зеркало
 * #[cfg(test)]-тестов node.rs, выполняемое в настоящем Node-процессе.
 *
 * В core-tests эти проверки существуют только как компиляция (cargo check
 * --tests): cargo test линкует тестовый бинарник, а napi_*-символы в
 * рантайме даёт лишь процесс Node (napi-rs issue #1099). Джоба napi-build
 * собирает cdylib (rename в medchat-core.linux-x64-gnu.node) и гоняет
 * этот скрипт против артефакта.
 *
 * Запуск: node napi-smoke.js (из medchat-v2/core, после сборки .node).
 */
'use strict';

const assert = require('node:assert');
const core = require('./medchat-core.linux-x64-gnu.node');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log('[napi-smoke] ' + name + ' — ok');
}

// ---------- размеры и keypair ----------
assert.strictEqual(core.keySize(), 32);
assert.strictEqual(core.nonceSize(), 24);
const alice = core.generateKeypair();
const bob = core.generateKeypair();
const carol = core.generateKeypair();
assert.strictEqual(alice.publicKey.length, 32);
assert.strictEqual(alice.secretKey.length, 32);
assert.ok(Buffer.isBuffer(alice.publicKey));
ok('keySize/nonceSize/generateKeypair');

// ---------- конверт seal/open (x25519-box) ----------
const MSG = Buffer.from('roundtrip via napi wrappers', 'utf8');
const sealed = core.sealForRecipients(MSG, [alice.publicKey, bob.publicKey]);
assert.strictEqual(sealed.boxes.length, 2);
assert.strictEqual(sealed.epk.length, 32);
assert.strictEqual(sealed.nonce.length, 24);
const opened = core.openSealed(sealed.epk, sealed.nonce, sealed.boxes, bob.publicKey, bob.secretKey);
assert.ok(opened.equals(MSG));
ok('sealForRecipients/openSealed roundtrip (получатель)');

// бокс отправителя: свои другие устройства читают тот же plaintext
const openedSender = core.openSealed(sealed.epk, sealed.nonce, sealed.boxes, alice.publicKey, alice.secretKey);
assert.ok(openedSender.equals(MSG));
ok('бокс отправителя открывается ключом отправителя');

// пустой список получателей — пустой конверт (seal не падает)
const emptySealed = core.sealForRecipients(MSG, []);
assert.strictEqual(emptySealed.boxes.length, 0);
assert.throws(
  () => core.openSealed(emptySealed.epk, emptySealed.nonce, emptySealed.boxes, alice.publicKey, alice.secretKey),
  /no box in envelope/
);
ok('пустой конверт — NoBoxForRecipient');

// чужой ключ: ни один бокс не расшифровывается
assert.throws(
  () => core.openSealed(sealed.epk, sealed.nonce, sealed.boxes, carol.publicKey, carol.secretKey),
  /no box in envelope/
);
ok('чужой ключ — NoBoxForRecipient');

// битые длины аргументов — InvalidArg до криптографии
assert.throws(
  () => core.openSealed(Buffer.alloc(31), sealed.nonce, sealed.boxes, alice.publicKey, alice.secretKey),
  /epk must be 32 bytes, got 31/
);
assert.throws(
  () => core.openSealed(sealed.epk, Buffer.alloc(23), sealed.boxes, alice.publicKey, alice.secretKey),
  /nonce must be 24 bytes, got 23/
);
ok('битые длины epk/nonce — InvalidArg');

// ---------- Double Ratchet ----------
assert.strictEqual(core.ratchetHeaderSize(), 40);
assert.strictEqual(core.ratchetNonceSize(), 12);

function b32(v) { return Buffer.alloc(32, v); }
function ratchetPair(seed) {
  const bobRatchet = core.generateKeypair();
  const aliceState = core.JsRatchetState.initInitiator(b32(seed), bobRatchet.publicKey);
  const bobState = core.JsRatchetState.initResponder(b32(seed), bobRatchet.publicKey, bobRatchet.secretKey);
  return [aliceState, bobState];
}

// in-order roundtrip; ответ Боба (DH-шаг у Алисы) читается через wire
const [aliceR, bobR] = ratchetPair(7);
const m1 = aliceR.encrypt(Buffer.from('napi ratchet one', 'utf8'));
assert.strictEqual(m1.header.length, 40);
assert.strictEqual(m1.nonce.length, 12);
const pt1 = bobR.decrypt(m1.header, m1.nonce, m1.ciphertext);
assert.ok(pt1.equals(Buffer.from('napi ratchet one', 'utf8')));
ok('ratchet: encrypt/decrypt in-order');

const m2 = bobR.encrypt(Buffer.from('napi ratchet two', 'utf8'));
const wire = core.ratchetMessageToWire(m2.header, m2.nonce, m2.ciphertext);
assert.strictEqual(wire.length, 40 + 12 + 'napi ratchet two'.length + 16);
const pt2 = aliceR.decryptWire(wire);
assert.ok(pt2.equals(Buffer.from('napi ratchet two', 'utf8')));
ok('ratchet: ответ по wire (DH-шаг) + decryptWire');

const restored = core.ratchetMessageFromWire(wire);
assert.ok(restored.header.equals(m2.header));
assert.ok(restored.nonce.equals(m2.nonce));
assert.ok(restored.ciphertext.equals(m2.ciphertext));
ok('ratchetMessageTo/FromWire — байт-в-байт');

assert.throws(() => core.ratchetMessageFromWire(Buffer.alloc(10)), Error);
ok('короткий wire — BadHeader');

// внеочередная доставка через skip-store + replay-отклонение
const [aliceS, bobS] = ratchetPair(9);
const s1 = aliceS.encrypt(Buffer.from('first', 'utf8'));
const s2 = aliceS.encrypt(Buffer.from('second', 'utf8'));
const ptS2 = bobS.decrypt(s2.header, s2.nonce, s2.ciphertext);
assert.ok(ptS2.equals(Buffer.from('second', 'utf8')));
const ptS1 = bobS.decrypt(s1.header, s1.nonce, s1.ciphertext);
assert.ok(ptS1.equals(Buffer.from('first', 'utf8')));
ok('skip-store: m2 раньше m1, оба читаются');

assert.throws(() => bobS.decrypt(s2.header, s2.nonce, s2.ciphertext), Error);
ok('replay отклоняется');

// битый nonce — InvalidArg; tampered ciphertext — AEAD-отказ
const [, bobN] = ratchetPair(3);
assert.throws(
  () => bobN.decrypt(Buffer.alloc(40), Buffer.alloc(11), Buffer.alloc(0)),
  /nonce must be 12 bytes, got 11/
);
ok('ratchet: битый nonce — InvalidArg');

const [aliceT, bobT] = ratchetPair(5);
const t1 = aliceT.encrypt(Buffer.from('tamper me', 'utf8'));
t1.ciphertext[0] = t1.ciphertext[0] ^ 0xff;
assert.throws(() => bobT.decrypt(t1.header, t1.nonce, t1.ciphertext), Error);
ok('tampered ciphertext отклоняется AEAD');

console.log('[napi-smoke] все проверки пройдены: ' + passed);
