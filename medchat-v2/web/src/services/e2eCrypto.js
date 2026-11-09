/**
 * E2E Crypto Service (web-клиент)
 * X25519 + XSalsa20-Poly1305 (tweetnacl box). Wire-формат конвертов
 * байт-в-байт совместим с мобильным клиентом (tweetnacl), desktop и
 * нативными iOS/Android (medchat-core через napi/UniFFI):
 * { v:1, alg:"x25519-box", epk, nonce, boxes: { [userId]: base64 } }.
 *
 * ЧЕСТНЫЙ КОМПРОМИСС БРАУЗЕРА: у веб-клиента нет системного secure storage
 * (Keychain / Keystore / Credential Manager), приватный ключ хранится в
 * localStorage — тот же прецедент, что и fallback на AsyncStorage в мобильном
 * клиенте на платформах без secure storage (expo web, LEGAL.md §2). Ключ
 * никогда не покидает устройство (на сервер уезжает только publicKey).
 */

import nacl from "tweetnacl";
import { api } from "./api";

const KEYPAIR_PREFIX = "e2e.keypair.";

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : "=";
  }
  return out;
}

function base64ToBytes(str) {
  const clean = str.replace(/=+$/, "");
  const out = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_CHARS.indexOf(clean[i]);
    if (v === -1) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function utf8Encode(str) {
  const out = [];
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    }
  }
  return out;
}

function storageKey(userId) {
  return KEYPAIR_PREFIX + userId;
}

function randomKeyId() {
  const raw = nacl.randomBytes(12);
  return "web-" + bytesToBase64(raw).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getLocalKeyPair(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.keyId || !parsed.publicKey || !parsed.secretKey) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function getOrCreateKeyPair(userId) {
  const existing = getLocalKeyPair(userId);
  if (existing) return existing;
  const pair = nacl.box.keyPair();
  const record = {
    keyId: randomKeyId(),
    publicKey: bytesToBase64(pair.publicKey),
    secretKey: bytesToBase64(pair.secretKey),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(storageKey(userId), JSON.stringify(record));
  return record;
}

// Регистрация публичного ключа устройства (upsert по (userId, keyId));
// безопасно вызывать на каждом входе/монтировании чата. Best-effort:
// ошибка регистрации НЕ ломает чат (plaintext-fallback на отправке).
async function ensureRegisteredKey(userId) {
  const pair = getOrCreateKeyPair(userId);
  await api.post("/api/keys", {
    keyId: pair.keyId,
    publicKey: pair.publicKey,
    algorithm: "x25519-box",
    deviceName: "web",
  });
  return pair;
}

function encryptForRecipients(plaintext, recipientKeys) {
  if (!plaintext || !Array.isArray(recipientKeys) || recipientKeys.length === 0) {
    return null;
  }
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = utf8Encode(plaintext);
  const boxes = {};
  for (const entry of recipientKeys) {
    if (!entry || !entry.userId || !entry.publicKey) continue;
    let recipientPk;
    try {
      recipientPk = base64ToBytes(entry.publicKey);
    } catch (e) {
      continue;
    }
    if (recipientPk.length !== nacl.box.publicKeyLength) continue;
    const box = nacl.box(messageBytes, nonce, recipientPk, ephemeral.secretKey);
    boxes[String(entry.userId)] = bytesToBase64(box);
  }
  if (Object.keys(boxes).length === 0) {
    return null;
  }
  return {
    v: 1,
    alg: "x25519-box",
    epk: bytesToBase64(ephemeral.publicKey),
    nonce: bytesToBase64(nonce),
    boxes,
  };
}

async function decryptEnvelope(envelope, myUserId) {
  if (!envelope || envelope.v !== 1 || envelope.alg !== "x25519-box") return null;
  if (!envelope.epk || !envelope.nonce || !envelope.boxes) return null;
  const pair = getLocalKeyPair(myUserId);
  if (!pair) return null;
  const boxB64 = envelope.boxes[String(myUserId)];
  if (!boxB64) return null;
  try {
    const boxBytes = base64ToBytes(boxB64);
    const nonceBytes = base64ToBytes(envelope.nonce);
    const epkBytes = base64ToBytes(envelope.epk);
    const secretKey = base64ToBytes(pair.secretKey);
    const plainBytes = nacl.box.open(boxBytes, nonceBytes, epkBytes, secretKey);
    if (!plainBytes) return null;
    return utf8Decode(plainBytes);
  } catch (e) {
    return null;
  }
}

function getEnvelope(message) {
  if (!message || !message.metadata) return null;
  const e2e = message.metadata.e2e;
  return e2e && e2e.boxes ? e2e : null;
}

// Файловое E2E-сообщение: payload бокса — JSON { mc: 2, t: имя, k: ключ }.
function parseFileMessageContent(plain) {
  if (typeof plain !== "string" || plain.indexOf("{") !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(plain);
  } catch (e) {
    return null;
  }
  if (!parsed || parsed.mc !== 2 || typeof parsed.t !== "string") return null;
  return { text: parsed.t, hasFileKey: typeof parsed.k === "string" };
}

// Ratchet-payload (Double Ratchet desktop/iOS/Android внутри конверта):
// { "t": "r1", "k": <keyId отправителя>, "w": <wire> }. Веб ratchet-сессию
// не держит (как RN-мобилка) — показываем честную плашку.
function isRatchetPayload(plain) {
  if (typeof plain !== "string" || plain.indexOf("{") !== 0) return false;
  try {
    const parsed = JSON.parse(plain);
    return !!(parsed && parsed.t === "r1" && parsed.k && parsed.w);
  } catch (e) {
    return false;
  }
}

export {
  bytesToBase64,
  base64ToBytes,
  utf8Encode,
  utf8Decode,
  getLocalKeyPair,
  getOrCreateKeyPair,
  ensureRegisteredKey,
  encryptForRecipients,
  decryptEnvelope,
  getEnvelope,
  parseFileMessageContent,
  isRatchetPayload,
};