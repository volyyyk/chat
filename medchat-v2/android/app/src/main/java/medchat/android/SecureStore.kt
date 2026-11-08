// Секреты Android-клиента — Android Keystore (зеркало KeychainStore на iOS
// и secure_store на desktop; INTEGRATION_BINDINGS §1: секреты только
// в secure storage платформы). Значения хранятся ВИДОМ AES-256-GCM
// шифротекста: ключ шифрования генерируется и живёт ТОЛЬКО в
// AndroidKeyStore (KeyGenParameterSpec, API 23+; hardware-backed на
// устройствах с TEE/StrongBox), plaintext никогда не оказывается в
// покое. Сервисы (зеркально iOS):
//   medchat.app     — токен, адрес сервера, email последнего входа;
//   medchat.e2e     — пары ключей устройства (приватный ключ НИКОГДА
//                    не покидает устройство);
//   medchat.ratchet — блобы Double Ratchet (root key, цепочки,
//                    приватный ratchet-ключ — тоже только шифротекст).
// Этап 4 ч.3: файл живёт в Gradle-проекте (package medchat.android).

package medchat.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object SecureStore {
    const val APP_SERVICE = "medchat.app"
    const val E2E_SERVICE = "medchat.e2e"
    const val RATCHET_SERVICE = "medchat.ratchet"

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val MASTER_ALIAS = "medchat.master"
    private const val GCM_IV_BYTES = 12
    private const val GCM_TAG_BITS = 128
    private const val MIN_BLOB_BYTES = GCM_IV_BYTES + 16

    private var appContext: Context? = null

    // Вызывается один раз при старте приложения (Application.onCreate
    // Gradle-проекта оператора).
    fun configure(context: Context) {
        appContext = context.applicationContext
    }

    fun set(value: String, key: String, service: String = APP_SERVICE): Boolean {
        val context = appContext ?: return false
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, masterKey())
            val blob = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            val encoded = Base64.encodeToString(blob, Base64.NO_WRAP)
            context.getSharedPreferences("medchat." + service, Context.MODE_PRIVATE)
                .edit().putString(key, encoded).commit()
        } catch (e: Exception) {
            false
        }
    }

    fun get(key: String, service: String = APP_SERVICE): String? {
        val context = appContext ?: return null
        val raw = context.getSharedPreferences("medchat." + service, Context.MODE_PRIVATE)
            .getString(key, null) ?: return null
        val blob = try {
            Base64.decode(raw, Base64.NO_WRAP)
        } catch (e: IllegalArgumentException) {
            return null
        }
        if (blob.size < MIN_BLOB_BYTES) {
            return null
        }
        val iv = blob.copyOfRange(0, GCM_IV_BYTES)
        val ciphertext = blob.copyOfRange(GCM_IV_BYTES, blob.size)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    fun delete(key: String, service: String = APP_SERVICE): Boolean {
        val context = appContext ?: return false
        return context.getSharedPreferences("medchat." + service, Context.MODE_PRIVATE)
            .edit().remove(key).commit()
    }

    // Мастер-ключ: существует только в AndroidKeyStore; при первом
    // обращении генерируется (256-bit AES, GCM, без паддинга).
    private fun masterKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        (keyStore.getEntry(MASTER_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                MASTER_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
        return generator.generateKey()
    }
}
