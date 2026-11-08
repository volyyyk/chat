// Runtime-smoke Kotlin-обвязки medchat-core (UniFFI, src/uniffi_iface.rs) —
// Kotlin-зеркало napi-smoke.js и #[cfg(test)]-тестов uniffi_iface.rs.
//
// Джоба CI android-smoke генерирует обвязку тем же uniffi-bindgen v0.28.3,
// подставляет package-строку обвязки первой строкой, компилирует kotlinc
// вместе с обвязкой против host-cdylib (JNA, jna.library.path) и
// исполняет в JVM. Файл без package-строки намеренно: пакет обвязки CI
// подставляет сам (шаг Kotlin smoke в .github/workflows/ci.yml).
//
// NB: gen_kotlin переименовывает ошибки с суффиксом Error в Exception
// (convert_error_suffix, gen_kotlin/mod.rs): Rust MedCryptoError в
// Kotlin-обвязке называется MedCryptoException (Swift имя НЕ меняет).

import kotlin.system.exitProcess

private var passed = 0

private fun ok(name: String) {
    passed += 1
    println("[android-smoke] " + name + " — ok")
}

private fun check(cond: Boolean, name: String) {
    if (cond) {
        ok(name)
    } else {
        println("[android-smoke] FAIL: " + name)
        exitProcess(1)
    }
}

// Ожидаем MedCryptoException с предикатом варианта; успех тела — FAIL
private fun expectMedError(name: String, isError: (MedCryptoException) -> Boolean, body: () -> Unit) {
    try {
        body()
        println("[android-smoke] FAIL: " + name + " — исключения не было")
        exitProcess(1)
    } catch (e: MedCryptoException) {
        check(isError(e), name)
    } catch (t: Throwable) {
        println("[android-smoke] FAIL: " + name + " — не MedCryptoException: " + t)
        exitProcess(1)
    }
}

private fun b32(v: Byte): ByteArray = ByteArray(32) { v }

private class RatchetPair(val alice: MedRatchetState, val bob: MedRatchetState)

private fun ratchetPair(seed: Byte): RatchetPair {
    val bobKp = generateKeypair()
    val alice = MedRatchetState.initInitiator(b32(seed), bobKp.publicKey)
    val bob = MedRatchetState.initResponder(b32(seed), bobKp.publicKey, bobKp.secretKey)
    return RatchetPair(alice, bob)
}

fun main() {
    // ---------- размеры и keypair ----------
    check(keySize().toInt() == 32 && nonceSize().toInt() == 24, "keySize/nonceSize")
    check(ratchetHeaderSize().toInt() == 40 && ratchetNonceSize().toInt() == 12,
        "ratchetHeaderSize/ratchetNonceSize")
    val alice = generateKeypair()
    val bob = generateKeypair()
    val carol = generateKeypair()
    check(alice.publicKey.size == 32 && alice.secretKey.size == 32 &&
        bob.publicKey.size == 32, "generateKeypair: пары X25519 по 32+32 байта")

    // ---------- конверт seal/open (x25519-box) ----------
    val msg = "roundtrip via uniffi kotlin wrappers".toByteArray()
    val sealed = sealForRecipients(msg, listOf(alice.publicKey, bob.publicKey))
    check(sealed.boxes.size == 2 && sealed.epk.size == 32 && sealed.nonce.size == 24,
        "sealForRecipients: epk 32 + nonce 24 + бокс на каждого получателя")
    check(openSealed(sealed, bob.publicKey, bob.secretKey).contentEquals(msg),
        "openSealed roundtrip (получатель)")
    check(openSealed(sealed, alice.publicKey, alice.secretKey).contentEquals(msg),
        "бокс отправителя открывается ключом отправителя")

    val emptySealed = sealForRecipients(msg, emptyList())
    check(emptySealed.boxes.size == 0, "пустой список получателей — пустой конверт")
    expectMedError("пустой конверт — NoBoxForRecipient",
        { e -> e is MedCryptoException.NoBoxForRecipient }) {
        openSealed(emptySealed, alice.publicKey, alice.secretKey)
    }
    expectMedError("чужой ключ — NoBoxForRecipient",
        { e -> e is MedCryptoException.NoBoxForRecipient }) {
        openSealed(sealed, carol.publicKey, carol.secretKey)
    }
    expectMedError("битый epk (31 байт) — InvalidArgument",
        { e -> e is MedCryptoException.InvalidArgument }) {
        openSealed(MedSealedMessage(ByteArray(31), sealed.nonce, sealed.boxes),
            alice.publicKey, alice.secretKey)
    }
    expectMedError("битый nonce (23 байта) — InvalidArgument",
        { e -> e is MedCryptoException.InvalidArgument }) {
        openSealed(MedSealedMessage(sealed.epk, ByteArray(23), sealed.boxes),
            alice.publicKey, alice.secretKey)
    }

    // ---------- bcrypt KAT (вектор OpenBSD, тот же что в тестах ядра) ----------
    val katHash = "\u00242a\u002405\u0024CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW"
    check(bcryptVerify("U*U", katHash), "bcrypt KAT: верный пароль")
    check(!bcryptVerify("U*U*", katHash), "bcrypt KAT: неверный пароль — false, не ошибка")
    expectMedError("битый bcrypt-хэш — BadHash",
        { e -> e is MedCryptoException.BadHash }) {
        bcryptVerify("x", "not-a-hash")
    }

    // ---------- Double Ratchet: in-order + wire ----------
    val pairR = ratchetPair(7)
    val m1 = pairR.alice.encrypt("kotlin ratchet one".toByteArray())
    check(m1.header.size == 40 && m1.nonce.size == 12, "ratchet: header 40 + nonce 12")
    check(pairR.bob.decrypt(m1).contentEquals("kotlin ratchet one".toByteArray()),
        "ratchet: encrypt/decrypt in-order")

    val m2 = pairR.bob.encrypt("kotlin ratchet two".toByteArray())
    val wire = ratchetMessageToWire(m2)
    check(wire.size == 40 + 12 + "kotlin ratchet two".toByteArray().size + 16,
        "ratchetMessageToWire: 40 + 12 + len + 16")
    check(pairR.alice.decryptWire(wire).contentEquals("kotlin ratchet two".toByteArray()),
        "ratchet: ответ по wire (DH-шаг) + decryptWire")

    val restored = ratchetMessageFromWire(wire)
    check(restored.header.contentEquals(m2.header) && restored.nonce.contentEquals(m2.nonce) &&
        restored.ciphertext.contentEquals(m2.ciphertext),
        "ratchetMessageTo/FromWire — байт-в-байт")
    expectMedError("короткий wire — BadHeader",
        { e -> e is MedCryptoException.BadHeader }) {
        ratchetMessageFromWire(ByteArray(10))
    }

    // ---------- skip-store + replay ----------
    val pairS = ratchetPair(9)
    val s1 = pairS.alice.encrypt("first".toByteArray())
    val s2 = pairS.alice.encrypt("second".toByteArray())
    check(pairS.bob.decrypt(s2).contentEquals("second".toByteArray()),
        "skip-store: m2 раньше m1, оба читаются (m2)")
    check(pairS.bob.decrypt(s1).contentEquals("first".toByteArray()),
        "skip-store: m1 читается после m2")
    expectMedError("replay отклоняется (OutOfOrder)",
        { e -> e is MedCryptoException.OutOfOrder }) {
        pairS.bob.decrypt(s2)
    }

    // ---------- битые длины и tamper ----------
    expectMedError("ratchet: битый nonce (11 байт) — InvalidArgument",
        { e -> e is MedCryptoException.InvalidArgument }) {
        pairR.bob.decrypt(MedRatchetMessage(ByteArray(40), ByteArray(11), ByteArray(0)))
    }
    val pairT = ratchetPair(5)
    val t1 = pairT.alice.encrypt("tamper me".toByteArray())
    val tampered = t1.ciphertext.copyOf()
    tampered[0] = (tampered[0].toInt() xor 0xff).toByte()
    expectMedError("tampered ciphertext отклоняется AEAD",
        { e -> e is MedCryptoException.Aead }) {
        pairT.bob.decrypt(MedRatchetMessage(t1.header, t1.nonce, tampered))
    }
    expectMedError("responder до первого сообщения — NotInitialized",
        { e -> e is MedCryptoException.NotInitialized }) {
        ratchetPair(11).bob.encrypt("too early".toByteArray())
    }

    // ---------- save/restore персистентности (feature serde) ----------
    val pairP = ratchetPair(6)
    val pm1 = pairP.alice.encrypt("persist me".toByteArray())
    check(pairP.bob.decrypt(pm1).contentEquals("persist me".toByteArray()),
        "save/restore: m1 расшифрован до сохранения")
    val saved = pairP.bob.save()
    check(saved.size > 0, "save(): непустой bincode-буфер")
    val bobRestored = MedRatchetState.restore(saved)
    val pm2 = pairP.alice.encrypt("after restore".toByteArray())
    check(bobRestored.decrypt(pm2).contentEquals("after restore".toByteArray()),
        "ratchet save/restore: диалог продолжается после рестарта")
    expectMedError("replay после restore отклоняется (OutOfOrder)",
        { e -> e is MedCryptoException.OutOfOrder }) {
        bobRestored.decrypt(pm1)
    }
    expectMedError("restore пустого буфера — InvalidArgument, не паника",
        { e -> e is MedCryptoException.InvalidArgument }) {
        MedRatchetState.restore(ByteArray(0))
    }
    expectMedError("restore мусорного буфера — InvalidArgument",
        { e -> e is MedCryptoException.InvalidArgument }) {
        MedRatchetState.restore(ByteArray(4) { 0xff.toByte() })
    }

    println("[android-smoke] все проверки пройдены: " + passed)
}
