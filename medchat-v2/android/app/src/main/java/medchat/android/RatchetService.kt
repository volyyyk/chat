// Double Ratchet (forward secrecy, этап 7 ROADMAP_NATIVE — подготовка):
// сессия одной стороны диалога живёт в ядре (MedRatchetState, Mutex
// внутри), wire-формат сообщения header (40) || nonce (12) || ciphertext
// (+16 тег GCM). blob от save() содержит СЕКРЕТЫ (root key, цепочки,
// приватный ratchet-ключ): только Android Keystore (SecureStore, сервис
// medchat.ratchet — шифротекст под мастер-ключом AndroidKeyStore),
// никогда shared_prefs-plaintext / файлы / сервер (INTEGRATION_BINDINGS
// §1). Склейка с UI-путём отправки — этап 7: пока сообщения идут
// E2E-конвертами x25519-box, сервис даёт персистентность и шифрование/
// расшифровку wire-формата (зеркало RatchetService.swift на iOS и
// ratchet_save/ratchet_load в desktop main.rs).
// Этап 4 ч.3: файл в Gradle-проекте (package medchat.android);
// обвязка импортируется пакетом uniffi.medchat_core.

package medchat.android

import uniffi.medchat_core.*

import android.util.Base64

class RatchetService {
    private val cache = HashMap<String, MedRatchetState>()

    fun load(chatId: String): MedRatchetState? {
        cache[chatId]?.let { return it }
        val b64 = SecureStore.get("ratchet." + chatId, SecureStore.RATCHET_SERVICE) ?: return null
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
        cache[chatId] = state
        return state
    }

    fun persist(chatId: String, state: MedRatchetState) {
        val blob = try {
            state.save()
        } catch (e: MedCryptoException) {
            return
        }
        cache[chatId] = state
        SecureStore.set(
            Base64.encodeToString(blob, Base64.NO_WRAP),
            "ratchet." + chatId,
            SecureStore.RATCHET_SERVICE)
    }

    fun remove(chatId: String) {
        cache.remove(chatId)
        SecureStore.delete("ratchet." + chatId, SecureStore.RATCHET_SERVICE)
    }

    // Исходящее: шифруем текущим состоянием, персистим, отдаём wire.
    @Throws(MedCryptoException::class)
    fun encrypt(chatId: String, plaintext: ByteArray, state: MedRatchetState): ByteArray {
        val wire = ratchetMessageToWire(state.encrypt(plaintext))
        persist(chatId, state)
        return wire
    }

    // Входящее: расшифровка wire текущим состоянием, персистим после успеха.
    @Throws(MedCryptoException::class)
    fun decrypt(chatId: String, wire: ByteArray, state: MedRatchetState): ByteArray {
        val plain = state.decryptWire(wire)
        persist(chatId, state)
        return plain
    }
}
