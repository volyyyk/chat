/**
 * E2E Crypto Service (mobile)
 * End-to-end encryption for message content using X25519 + XSalsa20-Poly1305
 * (tweetnacl 'box', same primitives as libsodium sealed boxes).
 *
 * SECURITY MODEL
 * - The X25519 key pair is generated ON THIS DEVICE. The private key is
 *   stored locally (AsyncStorage, base64) and NEVER leaves the device.
 * - Only the PUBLIC key is registered on the server (/api/keys).
 * - When sending, the message plaintext is encrypted on-device to every
 *   recipient's public key (including our own other devices) using a fresh
 *   ephemeral key pair per message. The server receives and stores only the
 *   ciphertext envelope, never the plaintext.
 * - When receiving, the envelope is opened with the local private key.
 *
 * NOTE ON STORAGE: AsyncStorage is not a hardware-backed keystore. For
 * production builds migrate the private key to expo-secure-store / Keychain /
 * Keystore (see docs/ROADMAP_NATIVE.md, stage 3-4 native clients).
 */

import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/config';

const API_URL = API_BASE_URL + '/api';
const KEYPAIR_STORAGE_PREFIX = 'e2e.keypair.';

// ---------------------------------------------------------------------------
// Pure-JS base64 (no extra npm dependency; global btoa/atob are not
// guaranteed in React Native runtimes).
// ---------------------------------------------------------------------------

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(str) {
  const clean = str.replace(/=+$/, '');
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

// ---------------------------------------------------------------------------
// Minimal UTF-8 encode/decode for Uint8Array <-> JS string
// ---------------------------------------------------------------------------

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
  let out = '';
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

// ---------------------------------------------------------------------------
// Local key pair management
// ---------------------------------------------------------------------------

function storageKey(userId) {
  return KEYPAIR_STORAGE_PREFIX + userId;
}

function randomKeyId() {
  const raw = nacl.randomBytes(12);
  return 'device-' + bytesToBase64(raw).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Read this device's key pair for the given user (or null).
 * NOTE: returns the PRIVATE key - must never be logged or sent anywhere.
 */
async function getLocalKeyPair(userId) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.keyId || !parsed.publicKey || !parsed.secretKey) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

/**
 * Get (or lazily create and persist) this device's X25519 key pair.
 * Returns { keyId, publicKey, secretKey } - all base64 strings.
 */
async function getOrCreateKeyPair(userId) {
  const existing = await getLocalKeyPair(userId);
  if (existing) return existing;

  const pair = nacl.box.keyPair();
  const record = {
    keyId: randomKeyId(),
    publicKey: bytesToBase64(pair.publicKey),
    secretKey: bytesToBase64(pair.secretKey),
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(record));
  return record;
}

/**
 * Forget the local key pair (e.g. after logout on this device).
 */
async function removeLocalKeyPair(userId) {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch (e) {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Server API for the PUBLIC key registry
// ---------------------------------------------------------------------------

async function apiJson(path, options) {
  try {
    const response = await fetch(API_URL + path, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err.message } };
  }
}

/**
 * Make sure this device has a key pair and the server knows its PUBLIC key.
 * Safe to call on every app start / login (upsert by (userId, keyId)).
 */
async function ensureRegisteredKey(token, userId, deviceName) {
  const pair = await getOrCreateKeyPair(userId);
  const result = await apiJson('/keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      keyId: pair.keyId,
      publicKey: pair.publicKey,
      algorithm: 'x25519-box',
      deviceName: deviceName || 'mobile',
    }),
  });
  return { pair, result };
}

/**
 * Public keys of all participants of a chat (active devices only).
 * Returns an array of { userId, keyId, publicKey, algorithm, deviceName }.
 */
async function getChatKeys(token, chatId) {
  const result = await apiJson('/chats/' + chatId + '/keys', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  });
  if (!result.ok || !result.data || !Array.isArray(result.data.data)) {
    return [];
  }
  return result.data.data;
}

/**
 * Deactivate a device key on the server (device lost/replaced).
 */
async function deactivateKey(token, keyId) {
  return apiJson('/keys/' + encodeURIComponent(keyId), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  });
}

// ---------------------------------------------------------------------------
// Envelope encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext to every recipient (list of { userId, publicKey }).
 * The list MUST include the sender's own key so their own devices can read
 * the message history back.
 *
 * Returns the envelope:
 *   { v: 1, alg: 'x25519-box', epk, nonce, boxes: { [userId]: base64 } }
 * or null when encryption is not possible (bad input).
 */
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

  // At least one usable recipient key is required
  if (Object.keys(boxes).length === 0) {
    return null;
  }

  return {
    v: 1,
    alg: 'x25519-box',
    epk: bytesToBase64(ephemeral.publicKey),
    nonce: bytesToBase64(nonce),
    boxes,
  };
}

/**
 * Decrypt an E2E envelope with this device's private key.
 * Returns the plaintext string, or null when this device cannot decrypt
 * (no local key pair, no box addressed to us, or corrupted envelope).
 */
async function decryptEnvelope(envelope, myUserId) {
  if (!envelope || envelope.v !== 1 || envelope.alg !== 'x25519-box') return null;
  if (!envelope.epk || !envelope.nonce || !envelope.boxes) return null;

  const pair = await getLocalKeyPair(myUserId);
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

/**
 * Does this server message carry an E2E envelope?
 */
function getEnvelope(message) {
  if (!message || !message.metadata) return null;
  const e2e = message.metadata.e2e;
  return e2e && e2e.boxes ? e2e : null;
}

/**
 * Every recipient of a chat must have at least one active public key for
 * E2E to be usable (otherwise they would never read the message).
 * participants: array of userId strings (WITHOUT the sender).
 * keys: result of getChatKeys().
 */
function allParticipantsHaveKeys(participantUserIds, keys) {
  if (!Array.isArray(participantUserIds) || participantUserIds.length === 0) return false;
  const covered = new Set((keys || []).map((k) => String(k.userId)));
  return participantUserIds.every((uid) => covered.has(String(uid)));
}

export {
  bytesToBase64,
  base64ToBytes,
  utf8Encode,
  utf8Decode,
  getLocalKeyPair,
  getOrCreateKeyPair,
  removeLocalKeyPair,
  ensureRegisteredKey,
  getChatKeys,
  deactivateKey,
  encryptForRecipients,
  decryptEnvelope,
  getEnvelope,
  allParticipantsHaveKeys,
};
