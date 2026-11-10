/**
 * Data Transfer Service (mobile)
 * Перенос чатов и E2E-ключей на новое устройство через одноразовый QR.
 *
 * Модель доверия (E2E):
 *  - старое устройство создаёт токен на сервере (POST /api/guest/transfer/init);
 *  - приватные E2E-ключи шифруются НА УСТРОЙСТВЕ случайным 32-байт ключом
 *    (nacl.secretbox) и загружаются на сервер только в виде шифротекста;
 *  - ключ шифрования blob'а попадает ТОЛЬКО в QR-код, серверу он не известен;
 *  - новое устройство сканирует QR, потребляет токен (POST .../consume),
 *    получает сессию и blob, расшифровывает его и восстанавливает ключи;
 *  - токен одноразовый, живёт 10 минут, blob стирается после потребления.
 *
 * РИСК: любой, кто увидит QR (фото/скриншот), пока он активен, сможет
 * забрать сессию и ключи. Показывать QR только лично, второму устройству.
 */

import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/config';
import {
  bytesToBase64,
  base64ToBytes,
  utf8Encode,
  utf8Decode,
  getLocalKeyPair,
  importKeyPair,
} from './e2eCryptoService';

const API_URL = API_BASE_URL + '/api';
export const TRANSFER_QR_PREFIX = 'medchat-transfer://t/';

async function apiJson(path, options) {
  try {
    const response = await fetch(API_URL + path, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err.message } };
  }
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + token,
  };
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Старое устройство: создать перенос и вернуть данные для QR-кода.
 * token - обычный accessToken пользователя, userId - его id.
 */
export async function createTransfer(token, userId) {
  const init = await apiJson('/guest/transfer/init', {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!init.ok) {
    throw new Error((init.data && init.data.message) || 'Не удалось создать перенос');
  }
  const transferToken = init.data.token;

  const pair = await getLocalKeyPair(userId);
  if (!pair) {
    throw new Error('На этом устройстве нет ключей шифрования');
  }

  // Шифруем ключи НА УСТРОЙСТВЕ: сервер получит только шифротекст.
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const payload = utf8Encode(JSON.stringify({
    keyPair: pair,
    exportedAt: new Date().toISOString(),
  }));
  const box = nacl.secretbox(payload, nonce, key);
  const payloadEncrypted = bytesToBase64(concatBytes(nonce, box));

  const up = await apiJson('/guest/transfer/' + transferToken + '/blob', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ payload: payloadEncrypted }),
  });
  if (!up.ok) {
    throw new Error((up.data && up.data.message) || 'Не удалось загрузить данные переноса');
  }

  return {
    transferToken,
    expiresAt: init.data.expiresAt,
    // Ключ шифрования blob'а едет ТОЛЬКО в QR между устройствами.
    qrValue: TRANSFER_QR_PREFIX + transferToken + '#k=' + bytesToBase64(key),
  };
}

/**
 * Разбор QR переноса. Возвращает { token, keyB64 } или null.
 */
export function parseTransferQr(data) {
  if (!data || data.indexOf(TRANSFER_QR_PREFIX) !== 0) return null;
  const rest = data.slice(TRANSFER_QR_PREFIX.length);
  const idx = rest.indexOf('#k=');
  if (idx === -1) return null;
  const token = rest.slice(0, idx);
  const keyB64 = rest.slice(idx + 3);
  if (!/^[a-f0-9]{64}$/.test(token) || !keyB64) return null;
  return { token, keyB64 };
}

function decryptBlob(payloadB64, keyB64) {
  const wire = base64ToBytes(payloadB64);
  if (wire.length <= nacl.secretbox.nonceLength) {
    throw new Error('Повреждённые данные переноса');
  }
  const nonce = wire.slice(0, nacl.secretbox.nonceLength);
  const box = wire.slice(nacl.secretbox.nonceLength);
  const key = base64ToBytes(keyB64);
  const plain = nacl.secretbox.open(box, nonce, key);
  if (!plain) {
    throw new Error('Не удалось расшифровать данные переноса (не тот QR?)');
  }
  return JSON.parse(utf8Decode(plain));
}

/**
 * Новое устройство: потребить токен, восстановить сессию и E2E-ключи.
 * applySession(token, user) - функция из AuthContext: переключает
 * приложение на перенесённый профиль без перезапуска.
 */
export async function receiveTransfer(transferToken, keyB64, applySession) {
  const res = await apiJson('/guest/transfer/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: transferToken }),
  });
  if (!res.ok) {
    const code = res.data && res.data.error && res.data.error.code;
    if (code === 'TRANSFER_USED') {
      throw new Error('QR уже использован. Создайте перенос заново на старом устройстве.');
    }
    if (code === 'TRANSFER_EXPIRED') {
      throw new Error('Срок действия QR истёк (10 минут). Создайте перенос заново.');
    }
    if (code === 'TRANSFER_NOT_READY') {
      throw new Error('Данные переноса ещё не готовы. Подождите пару секунд и отсканируйте снова.');
    }
    throw new Error((res.data && res.data.message) || 'Перенос не удался');
  }

  const parsed = decryptBlob(res.data.payload, keyB64);
  if (!parsed || !parsed.keyPair) {
    throw new Error('В данных переноса нет ключей шифрования');
  }

  // Восстанавливаем E2E-ключи и входим в перенесённый профиль.
  await importKeyPair(res.data.user.id, parsed.keyPair);
  if (applySession) {
    await applySession(res.data.token, res.data.user);
  } else {
    await AsyncStorage.setItem('authToken', res.data.token);
    await AsyncStorage.setItem('userData', JSON.stringify(res.data.user));
  }
  if (res.data.refreshToken) {
    await AsyncStorage.setItem('refreshToken', res.data.refreshToken);
  }
  return res.data;
}
