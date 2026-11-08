package medchat.android

import uniffi.medchat_core.*

import android.util.Base64

// Double Ratchet (forward secrecy, этап 7 ROADMAP_NATIVE): сессия одной
// стороны диалога живёт в ядре (MedRatchetState, Mutex внутри),
// wire-формат сообщения header (40) || nonce (12) || ciphertext
// (+16 тег GCM). Склейка с MedchatApp — зеркало desktop
// ratchet_encrypt/ratchet_decrypt и iOS RatchetService: сессия на
// каждый ключ собеседника, аккаунт ratchet.<chatId>.<remoteKeyId>;
// ss = x25519Dh(мой identity-секрет, их identity-публичный) — ключи
// реестра UserKey (X3DH-lite без prekeys), роль детерминирована
// сравнением keyId: лексикографически меньший keyId — инициатор
// (обе стороны сходятся к ролям без рукопожатия). Отвечающая сторона
// не пишет первой (NotInitialized) — MedchatApp честно фолбэчит на
// обычный E2E-конверт. blob от save() содержит СЕКРЕТЫ (root key,
// цепочки, приватный ratchet-ключ): только Android Keystore
// (SecureStore, сервис medchat.ratchet — шифротекст под мастер-ключом
// AndroidKeyStore), никогда shared_prefs-plaintext / файлы / сервер
// (INTEGRATION_BINDINGS §1).
class RatchetService {
    private val cache = HashMap<String, MedRatchetState>()

    // Аккаунт сессии: отдельная сессия на каждый ключ собеседника —
    // смена устройства/ключа не ломает прежние состояния (зеркало desktop).
    private fun account(chatId: String, remoteKeyId: String): String =
        "ratchet." + chatId + "." + remoteKeyId

    fun load(chatId: String, remoteKeyId: String): MedRatchetState? {
        val key = account(chatId, remoteKeyId)
        cache[key]?.let { return it }
        val b64 = SecureStore.get(key, SecureStore.RATCHET_SERVICE) ?: return null
        val blob = try {
            Base64.decode(b64, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            return null
        }
        val state = try {
            MedRatchetState.restore(blob)
        } catch (e: MedCryptoException) {
            null
        } ?: return null
        cache[key] = state
        return state
    }

    fun persist(chatId: String, remoteKeyId: String, state: MedRatchetState) {
        val blob = try {
            state.save()
        } catch (e: MedCryptoException) {
            return
        }
        val key = account(chatId, remoteKeyId)
        cache[key] = state
        SecureStore.set(
            Base64.encodeToString(blob, Base64.NO_WRAP),
            key,
            SecureStore.RATCHET_SERVICE)
    }

    fun remove(chatId: String, remoteKeyId: String) {
        val key = account(chatId, remoteKeyId)
        cache.remove(key)
        SecureStore.delete(key, SecureStore.RATCHET_SERVICE)
    }

    // Сессия с собеседником: существующая из Keystore или ленивая
    // инициализация (роль по keyId; ss одинаковый у обеих сторон).
    @Throws(MedCryptoException::class, IllegalArgumentException::class)
    fun ensureSession(chatId: String, myPair: E2EKeyPair, remoteKey: ChatKey): MedRatchetState {
        load(chatId, remoteKey.keyId)?.let { return it }
        val mySecret = decode(myPair.secretKeyB64)
            ?: throw IllegalArgumentException("bad e2e secret key")
        val myPublic = decode(myPair.publicKeyB64)
            ?: throw IllegalArgumentException("bad e2e public key")
        val theirPublic = decode(remoteKey.publicKey)
            ?: throw IllegalArgumentException("bad remote public key")
        val ss = x25519Dh(mySecret, theirPublic)
        val state = if (myPair.keyId < remoteKey.keyId) {
            MedRatchetState.initInitiator(ss, theirPublic)
        } else {
            MedRatchetState.initResponder(ss, myPublic, mySecret)
        }
        persist(chatId, remoteKey.keyId, state)
        return state
    }

    // Исходящее: шифруем текущим состоянием, персистим, отдаём wire.
    @Throws(MedCryptoException::class)
    fun encrypt(chatId: String, remoteKeyId: String, plaintext: ByteArray, state: MedRatchetState): ByteArray {
        val wire = ratchetMessageToWire(state.encrypt(plaintext))
        persist(chatId, remoteKeyId, state)
        return wire
    }

    // Входящее: расшифровка wire текущим состоянием, персистим после успеха.
    @Throws(MedCryptoException::class)
    fun decrypt(chatId: String, remoteKeyId: String, wire: ByteArray, state: MedRatchetState): ByteArray {
        val plain = state.decryptWire(wire)
        persist(chatId, remoteKeyId, state)
        return plain
    }

    private fun decode(value: String): ByteArray? {
        return try {
            Base64.decode(value, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            null
        }
    }
}