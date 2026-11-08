// E2E-конверты x25519-box (этап 7): модель та же, что в мобильном клиенте
// (e2eCryptoService.js), desktop (e2e_seal/e2e_open в main.rs) и iOS
// (CryptoService.swift). Криптография — ядро medchat-core через
// сгенерированную обвязку (generateKeypair / sealForRecipients /
// openSealed); wire-формат байт-в-байт совместим с tweetnacl мобильного
// клиента (контракт-вектор 1ce9516):
// { v: 1, alg: "x25519-box", epk, nonce, boxes: { [userId]: b64 } }.
// Приватный ключ живёт ТОЛЬКО в Android Keystore (SecureStore, сервис
// medchat.e2e) и никогда не покидает устройство; сервер получает один
// публичный ключ (POST /api/keys, upsert по (userId, keyId)).
// Этап 4 ч.3: файл в Gradle-проекте (package medchat.android);
// обвязка импортируется пакетом uniffi.medchat_core.

package medchat.android

import uniffi.medchat_core.*

import android.util.Base64
import org.json.JSONObject
import java.util.UUID

data class E2EKeyPair(
    val keyId: String,
    val publicKeyB64: String,
    val secretKeyB64: String)

data class E2EEnvelope(
    val v: Int,
    val alg: String,
    val epk: String,
    val nonce: String,
    val boxes: Map<String, String>) {

    fun json(): JSONObject = JSONObject()
        .put("v", v)
        .put("alg", alg)
        .put("epk", epk)
        .put("nonce", nonce)
        .put("boxes", JSONObject(boxes))
}

class CryptoService(private val userId: String) {

    // Пара ключей устройства: из Keystore или генерация в ядре Rust.
    // keyId вида android-<uuid> — как device-* у мобилки, ios-* у iOS и
    // desktop-* у desktop: уникален в реестре (userId, keyId).
    fun getOrCreateKeyPair(): E2EKeyPair? {
        val storageKey = "e2e." + userId
        SecureStore.get(storageKey, SecureStore.E2E_SERVICE)?.let { raw ->
            decodeRecord(raw)?.let { return it }
        }
        val generated = generateKeypair()
        val keyId = "android-" + UUID.randomUUID().toString()
        val pair = E2EKeyPair(
            keyId = keyId,
            publicKeyB64 = encode(generated.publicKey),
            secretKeyB64 = encode(generated.secretKey))
        val raw = encodeRecord(pair) ?: return null
        if (!SecureStore.set(raw, storageKey, SecureStore.E2E_SERVICE)) {
            return null
        }
        return pair
    }

    // Конверт для отправки: по одному боксу на участника; бокс отправителя
    // обязателен (сервер валидирует). Порядок боксов = порядок ключей.
    fun buildEnvelope(plaintext: String, recipients: List<Pair<String, String>>): E2EEnvelope? {
        if (recipients.isEmpty()) {
            return null
        }
        val keys = recipients.map { decode(it.second) ?: return null }
        val sealed = try {
            sealForRecipients(plaintext.toByteArray(Charsets.UTF_8), keys)
        } catch (e: MedCryptoException) {
            return null
        }
        val boxes = LinkedHashMap<String, String>()
        recipients.forEachIndexed { index, recipient ->
            boxes[recipient.first] = encode(sealed.boxes[index])
        }
        return E2EEnvelope(1, "x25519-box", encode(sealed.epk), encode(sealed.nonce), boxes)
    }

    // Расшифровка входящего конверта приватным ключом из Keystore.
    fun openEnvelope(envelope: E2EEnvelope): String? {
        val pair = getOrCreateKeyPair() ?: return null
        val box = decode(envelope.boxes[userId] ?: return null) ?: return null
        val epk = decode(envelope.epk) ?: return null
        val nonce = decode(envelope.nonce) ?: return null
        val mySecret = decode(pair.secretKeyB64) ?: return null
        val myPublic = decode(pair.publicKeyB64) ?: return null
        return try {
            String(openSealed(MedSealedMessage(epk, nonce, listOf(box)), myPublic, mySecret), Charsets.UTF_8)
        } catch (e: MedCryptoException) {
            null
        }
    }

    companion object {
        // Разбор metadata.e2e из сообщения сервера.
        fun envelopeFrom(raw: Any?): E2EEnvelope? {
            val row = raw as? JSONObject ?: return null
            if (row.optInt("v") != 1 || row.optString("alg") != "x25519-box") {
                return null
            }
            val epk = row.optString("epk")
            val nonce = row.optString("nonce")
            val rawBoxes = row.optJSONObject("boxes") ?: return null
            if (epk.isEmpty() || nonce.isEmpty()) {
                return null
            }
            val boxes = LinkedHashMap<String, String>()
            for (key in rawBoxes.keys()) {
                boxes[key] = rawBoxes.optString(key)
            }
            return E2EEnvelope(1, "x25519-box", epk, nonce, boxes)
        }

        private fun encode(bytes: ByteArray): String =
            Base64.encodeToString(bytes, Base64.NO_WRAP)

        private fun decode(value: String): ByteArray? {
            return try {
                Base64.decode(value, Base64.NO_WRAP)
            } catch (e: IllegalArgumentException) {
                null
            }
        }

        private fun encodeRecord(pair: E2EKeyPair): String? {
            return try {
                JSONObject()
                    .put("keyId", pair.keyId)
                    .put("publicKey", pair.publicKeyB64)
                    .put("secretKey", pair.secretKeyB64)
                    .toString()
            } catch (e: Exception) {
                null
            }
        }

        private fun decodeRecord(raw: String): E2EKeyPair? {
            return try {
                val row = JSONObject(raw)
                val keyId = row.optString("keyId")
                val publicKey = row.optString("publicKey")
                val secretKey = row.optString("secretKey")
                if (keyId.isEmpty() || publicKey.isEmpty() || secretKey.isEmpty()) {
                    null
                } else {
                    E2EKeyPair(keyId, publicKey, secretKey)
                }
            } catch (e: Exception) {
                null
            }
        }
    }
}
