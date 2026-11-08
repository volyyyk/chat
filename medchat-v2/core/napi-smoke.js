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

// ---------- raw X25519-DH (RFC 7748 §6.1): shared secret этапа 7 ----------
function hexBytes(hex) {
  const out = Buffer.alloc(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
const RFC_A_PRIV = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const RFC_A_PUB = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const RFC_B_PRIV = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const RFC_B_PUB = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const RFC_K = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
assert.ok(core.x25519Dh(hexBytes(RFC_A_PRIV), hexBytes(RFC_B_PUB)).equals(hexBytes(RFC_K)));
assert.ok(core.x25519Dh(hexBytes(RFC_B_PRIV), hexBytes(RFC_A_PUB)).equals(hexBytes(RFC_K)));
assert.ok(core.x25519Dh(alice.secretKey, bob.publicKey).equals(core.x25519Dh(bob.secretKey, alice.publicKey)));
assert.throws(
  () => core.x25519Dh(Buffer.alloc(31), bob.publicKey),
  /mySecret must be 32 bytes, got 31/
);
ok('x25519Dh — KAT RFC 7748 §6.1 + симметрия + InvalidArg');

// ---------- горячие пути (этап 6): SHA-256 checksum ----------
const nodeCrypto = require('node:crypto');
const HOT = Buffer.from('MedChat hot path: checksum via napi', 'utf8');
assert.strictEqual(core.sha256Checksum(HOT), nodeCrypto.createHash('sha256').update(HOT).digest('hex'));
assert.strictEqual(
  core.sha256Checksum(Buffer.alloc(0)),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
);
assert.strictEqual(core.sha256Verify(HOT, core.sha256Checksum(HOT).toUpperCase()), true);
assert.strictEqual(core.sha256Verify(HOT, 'deadbeef'), false);
ok('sha256Checksum/sha256Verify — KAT + parity с node:crypto');

// ---------- горячие пути (этап 6): gzip-сжатие бэкапов ----------
const nodeZlib = require('node:zlib');
const SRC = Buffer.from(JSON.stringify({ kind: 'MedChat backup', users: [] }).repeat(50), 'utf8');
const packed = core.backupCompress(SRC);
assert.ok(packed.length > 3 && packed.length < SRC.length);
assert.deepStrictEqual([...packed.slice(0, 3)], [0x1f, 0x8b, 0x08]);
assert.ok(core.backupDecompress(packed).equals(SRC));
// cross-parity: Rust сжимает — Node разжимает, и наоборот
assert.ok(nodeZlib.gunzipSync(packed).equals(SRC));
assert.ok(core.backupDecompress(nodeZlib.gzipSync(SRC)).equals(SRC));
assert.throws(() => core.backupDecompress(Buffer.from('not gzip at all', 'utf8')), Error);
assert.ok(core.backupDecompress(core.backupCompress(Buffer.alloc(0))).equals(Buffer.alloc(0)));
ok('backupCompress/backupDecompress — gzip RFC 1952, cross-parity с node:zlib');

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

// ---------- save/restore персистентности (feature serde) ----------
const [aliceP, bobP] = ratchetPair(6);
const pm1 = aliceP.encrypt(Buffer.from('persist me', 'utf8'));
const ptP1 = bobP.decrypt(pm1.header, pm1.nonce, pm1.ciphertext);
assert.ok(ptP1.equals(Buffer.from('persist me', 'utf8')));

const savedState = bobP.save();
assert.ok(Buffer.isBuffer(savedState));
assert.ok(savedState.length > 0);
const bobRestored = core.JsRatchetState.restore(savedState);
const pm2 = aliceP.encrypt(Buffer.from('after restore', 'utf8'));
const ptP2 = bobRestored.decrypt(pm2.header, pm2.nonce, pm2.ciphertext);
assert.ok(ptP2.equals(Buffer.from('after restore', 'utf8')));
ok('ratchet save/restore: диалог продолжается после рестарта');

assert.throws(() => bobRestored.decrypt(pm1.header, pm1.nonce, pm1.ciphertext), Error);
ok('replay после restore отклоняется');

assert.throws(() => core.JsRatchetState.restore(Buffer.alloc(0)), Error);
ok('restore битого буфера — ошибка, не паника');

console.log('[napi-smoke] все проверки пройдены: ' + passed);
