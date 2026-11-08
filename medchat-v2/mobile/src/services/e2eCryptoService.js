/**
 * E2E Crypto Service (mobile)
 * End-to-end encryption for message content using X25519 + XSalsa20-Poly1305
 * (tweetnacl 'box', same primitives as libsodium sealed boxes).
 *
 * SECURITY MODEL
 * - The X25519 key pair is generated ON THIS DEVICE. The private key is
 *   stored LOCALLY and NEVER leaves the device.
 * - Only the PUBLIC key is registered on the server (/api/keys).
 * - When sending, the message plaintext is encrypted on-device to every
 *   recipient's public key (including our own other devices) using a fresh
 *   ephemeral key pair per message. The server receives and stores only the
 *   ciphertext envelope, never the plaintext.
 * - When receiving, the envelope is opened with the local private key.
 *
 * NOTE ON STORAGE: the private key is kept in hardware-backed secure storage
 * (expo-secure-store: iOS Keychain / Android Keystore) whenever the platform
 * provides it. On platforms without secure storage (e.g. expo web) it falls
 * back to AsyncStorage, and legacy AsyncStorage key pairs are migrated to
 * the secure store transparently on first read.
 */

import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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
// Local key pair storage
//
// Backend: hardware-backed expo-secure-store (iOS Keychain / Android
// Keystore) whenever available; AsyncStorage only as a fallback (e.g. expo
// web). Legacy AsyncStorage records are migrated to the secure store
// transparently on first read, then removed from AsyncStorage.
// ---------------------------------------------------------------------------

function storageKey(userId) {
  return KEYPAIR_STORAGE_PREFIX + userId;
}

function randomKeyId() {
  const raw = nacl.randomBytes(12);
  return 'device-' + bytesToBase64(raw).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// Memoized per app session: true = use Keychain/Keystore, false = AsyncStorage.
let secureStoreAvailable = null;

async function isSecureStoreAvailable() {
  if (secureStoreAvailable !== null) return secureStoreAvailable;
  try {
    secureStoreAvailable =
      typeof SecureStore.isAvailableAsync === 'function' &&
      (await SecureStore.isAvailableAsync()) === true;
  } catch (e) {
    secureStoreAvailable = false;
  }
  return secureStoreAvailable;
}

/**
 * Read the stored key pair record from secure storage first, then from the
 * legacy AsyncStorage location. Returns { raw, backend } or null.
 */
async function readRecord(userId) {
  if (await isSecureStoreAvailable()) {
    try {
      const raw = await SecureStore.getItemAsync(storageKey(userId));
      if (raw) return { raw, backend: 'secure' };
    } catch (e) {
      // fall through to the legacy location
    }
  }
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) return { raw, backend: 'async' };
  } catch (e) {
    // ignore - treat as no key pair
  }
  return null;
}

/**
 * Persist the key pair record. Prefers the secure store; falls back to
 * AsyncStorage when secure storage is unavailable or fails.
 * Returns 'secure' | 'async'.
 */
async function writeRecord(userId, raw) {
  if (await isSecureStoreAvailable()) {
    try {
      await SecureStore.setItemAsync(storageKey(userId), raw, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return 'secure';
    } catch (e) {
      // fall back below
    }
  }
  await AsyncStorage.setItem(storageKey(userId), raw);
  return 'async';
}

/**
 * Read this device's key pair for the given user (or null).
 * NOTE: returns the PRIVATE key - must never be logged or sent anywhere.
 * Legacy AsyncStorage records are migrated to the secure store on read.
 */
async function getLocalKeyPair(userId) {
  try {
    const found = await readRecord(userId);
    if (!found) return null;
    const parsed = JSON.parse(found.raw);
    if (!parsed || !parsed.keyId || !parsed.publicKey || !parsed.secretKey) return null;

    // Opportunistic one-time migration: AsyncStorage -> Keychain/Keystore.
    if (found.backend === 'async' && (await isSecureStoreAvailable())) {
      const backend = await writeRecord(userId, found.raw);
      if (backend === 'secure') {
        try {
          await AsyncStorage.removeItem(storageKey(userId));
        } catch (e) {
          // best-effort cleanup
        }
      }
    }
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
  await writeRecord(userId, JSON.stringify(record));
  return record;
}

/**
 * Forget the local key pair (e.g. after logout / account deletion on this
 * device). Removes it from BOTH storage backends.
 */
async function removeLocalKeyPair(userId) {
  try {
    if (await isSecureStoreAvailable()) {
      await SecureStore.deleteItemAsync(storageKey(userId));
    }
  } catch (e) {
    // best-effort
  }
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

// ---------------------------------------------------------------------------
// E2E for files / voice messages (hybrid encryption)
//
// File wire format (exactly these bytes are uploaded to the server / MinIO;
// the server never sees the original file):
//   nonce (24 bytes, XSalsa20-Poly1305) || ciphertext
// The random 32-byte symmetric key never travels in the clear: it rides
// INSIDE the same x25519-box envelope as the message text. The box payload
// of a file message is a JSON string { mc: 2, t: <file name>, k: <key b64> }
// instead of plain text. This keeps the server-side envelope contract
// exactly as-is: ONE envelope per message (metadata.e2e), no new fields,
// no second envelope for the key.
// ---------------------------------------------------------------------------

/**
 * Encrypt a binary payload (file / voice recording bytes) with a fresh
 * random symmetric key. Returns { wire: Uint8Array, fileKey: Uint8Array }
 * where wire = nonce || ciphertext (what gets uploaded), or null.
 */
function encryptFilePayload(payloadBytes) {
  if (!payloadBytes || payloadBytes.length === 0) {
    return null;
  }
  const fileKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(payloadBytes, nonce, fileKey);
  if (!box) return null;
  const wire = new Uint8Array(nonce.length + box.length);
  wire.set(nonce, 0);
  wire.set(box, nonce.length);
  return { wire, fileKey };
}

/**
 * Build the message-box payload for an E2E file message: a JSON string
 * carrying the human-readable file name and the wrapped-in-envelope file
 * key. This string is passed through encryptForRecipients like plain text.
 */
function buildFileMessageContent(name, fileKey) {
  if (!fileKey) return null;
  return JSON.stringify({ mc: 2, t: String(name || 'Файл'), k: bytesToBase64(fileKey) });
}

/**
 * Parse a decrypted box payload. Returns { text, fileKey } when it is an
 * E2E file message (mc: 2), otherwise null (ordinary text message).
 */
function parseFileMessageContent(plain) {
  if (typeof plain !== 'string' || plain.indexOf('{') !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(plain);
  } catch (e) {
    return null;
  }
  if (!parsed || parsed.mc !== 2 || typeof parsed.t !== 'string') return null;
  let fileKey = null;
  if (typeof parsed.k === 'string') {
    try {
      const k = base64ToBytes(parsed.k);
      if (k.length === nacl.secretbox.keyLength) fileKey = k;
    } catch (e) {
      fileKey = null;
    }
  }
  return { text: parsed.t, fileKey };
}

/**
 * Decrypt downloaded file bytes (wire = nonce || ciphertext) with the file
 * key unwrapped from the message envelope. Returns the payload or null.
 */
function decryptFilePayload(wireBytes, fileKey) {
  if (!wireBytes || !fileKey) return null;
  if (wireBytes.length <= nacl.secretbox.nonceLength) return null;
  try {
    const nonce = wireBytes.slice(0, nacl.secretbox.nonceLength);
    const ciphertext = wireBytes.slice(nacl.secretbox.nonceLength);
    return nacl.secretbox.open(ciphertext, nonce, fileKey);
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
  encryptFilePayload,
  buildFileMessageContent,
  parseFileMessageContent,
  decryptFilePayload,
  getEnvelope,
  allParticipantsHaveKeys,
};
