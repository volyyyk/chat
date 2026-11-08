// MedchatCoreSmoke.swift — Swift-зеркало napi-smoke.js для UniFFI-обвязки
// medchat-core (src/uniffi_iface.rs), этап 3 ROADMAP_NATIVE.md.
//
// Джоба CI ios-smoke (macos-latest) генерирует Swift-обвязку uniffi-bindgen
// 0.28.3 (library mode, тот же git-тег v0.28.3, что и крейт ядра), собирает
// host-cdylib и компилирует этот файл вместе с обвязкой против неё:
// runtime-проверки в настоящем Swift-процессе — аналог napi-smoke.js,
// который гоняет Node против .node-артефакта (джоба napi-build).
//
// Юнит-тесты обёрток (uniffi-bindings, cargo test) гоняют Rust напрямую;
// здесь проверяется СГЕНЕРИРОВАННАЯ обвязка в реальном использовании:
// конверт roundtrip, бокс отправителя, битые длины, Double Ratchet
// (in-order/wire/skip-store/replay), save/restore, bcrypt KAT.

import Foundation

var passed = 0

func ok(_ name: String) {
    passed += 1
    print("[swift-smoke] " + name + " — ok")
}

func check(_ cond: Bool, _ what: String) {
    if !cond {
        print("[swift-smoke] FAIL: " + what)
        exit(1)
    }
}

func expectMedError<T>(_ name: String, match: (MedCryptoError) -> Bool, _ body: () throws -> T) {
    do {
        _ = try body()
        print("[swift-smoke] FAIL: ожидалась ошибка, вызов прошёл: " + name)
        exit(1)
    } catch let e as MedCryptoError {
        if match(e) {
            ok(name)
        } else {
            print("[swift-smoke] FAIL: не тот вариант MedCryptoError: " + name)
            exit(1)
        }
    } catch {
        print("[swift-smoke] FAIL: неожиданная ошибка: " + name)
        exit(1)
    }
}

let noBoxCase: (MedCryptoError) -> Bool = { e in
    if case .NoBoxForRecipient = e { return true }
    return false
}
let invalidArgCase: (MedCryptoError) -> Bool = { e in
    if case .InvalidArgument = e { return true }
    return false
}
let outOfOrderCase: (MedCryptoError) -> Bool = { e in
    if case .OutOfOrder = e { return true }
    return false
}
let badHeaderCase: (MedCryptoError) -> Bool = { e in
    if case .BadHeader = e { return true }
    return false
}
let notInitializedCase: (MedCryptoError) -> Bool = { e in
    if case .NotInitialized = e { return true }
    return false
}
let aeadCase: (MedCryptoError) -> Bool = { e in
    if case .Aead = e { return true }
    return false
}
let badHashCase: (MedCryptoError) -> Bool = { e in
    if case .BadHash = e { return true }
    return false
}

// ---------- размеры и keypair ----------
check(keySize() == 32, "keySize() == 32")
check(nonceSize() == 24, "nonceSize() == 24")
check(ratchetHeaderSize() == 40, "ratchetHeaderSize() == 40")
check(ratchetNonceSize() == 12, "ratchetNonceSize() == 12")
let alice = generateKeypair()
let bob = generateKeypair()
let carol = generateKeypair()
check(alice.publicKey.count == 32, "publicKey 32 байта")
check(alice.secretKey.count == 32, "secretKey 32 байта")
ok("keySize/nonceSize/ratchetSizes/generateKeypair")

// ---------- конверт seal/open (x25519-box) ----------
let msg = Data("roundtrip via uniffi wrappers".utf8)
let sealed = try! sealForRecipients(plaintext: msg, recipientPublicKeys: [alice.publicKey, bob.publicKey])
check(sealed.boxes.count == 2, "boxes по числу получателей")
check(sealed.epk.count == 32, "epk 32 байта")
check(sealed.nonce.count == 24, "nonce 24 байта")
let opened = try! openSealed(sealed: sealed, myPublic: bob.publicKey, mySecret: bob.secretKey)
check(opened == msg, "получатель расшифровал")
let openedSender = try! openSealed(sealed: sealed, myPublic: alice.publicKey, mySecret: alice.secretKey)
check(openedSender == msg, "бокс отправителя читается ключом отправителя")
ok("sealForRecipients/openSealed roundtrip (получатель + бокс отправителя)")

let emptySealed = try! sealForRecipients(plaintext: msg, recipientPublicKeys: [])
check(emptySealed.boxes.count == 0, "пустой список получателей — пустой конверт")
expectMedError("пустой конверт — NoBoxForRecipient", match: noBoxCase) {
    _ = try openSealed(sealed: emptySealed, myPublic: alice.publicKey, mySecret: alice.secretKey)
}
expectMedError("чужой ключ — NoBoxForRecipient", match: noBoxCase) {
    _ = try openSealed(sealed: sealed, myPublic: carol.publicKey, mySecret: carol.secretKey)
}
let badEpkEnvelope = MedSealedMessage(epk: Data(repeating: 0, count: 31), nonce: sealed.nonce, boxes: sealed.boxes)
expectMedError("битая длина epk — InvalidArgument", match: invalidArgCase) {
    _ = try openSealed(sealed: badEpkEnvelope, myPublic: alice.publicKey, mySecret: alice.secretKey)
}
let badNonceEnvelope = MedSealedMessage(epk: sealed.epk, nonce: Data(repeating: 0, count: 23), boxes: sealed.boxes)
expectMedError("битая длина nonce — InvalidArgument", match: invalidArgCase) {
    _ = try openSealed(sealed: badNonceEnvelope, myPublic: alice.publicKey, mySecret: alice.secretKey)
}

// ---------- Double Ratchet ----------
func b32(_ v: UInt8) -> Data {
    Data(repeating: v, count: 32)
}

func ratchetPair(_ seed: UInt8) -> (MedRatchetState, MedRatchetState) {
    let bobKp = generateKeypair()
    let aliceState = try! MedRatchetState.initInitiator(sharedSecret: b32(seed), remoteRatchetPublic: bobKp.publicKey)
    let bobState = try! MedRatchetState.initResponder(sharedSecret: b32(seed), myRatchetPublic: bobKp.publicKey, myRatchetSecret: bobKp.secretKey)
    return (aliceState, bobState)
}

let (aliceR, bobR) = ratchetPair(7)
let m1 = try! aliceR.encrypt(plaintext: Data("swift ratchet one".utf8))
check(m1.header.count == 40, "header 40")
check(m1.nonce.count == 12, "nonce 12")
let pt1 = try! bobR.decrypt(message: m1)
check(pt1 == Data("swift ratchet one".utf8), "in-order plaintext")
ok("ratchet: encrypt/decrypt in-order")

let m2 = try! bobR.encrypt(plaintext: Data("swift ratchet two".utf8))
let wire = try! ratchetMessageToWire(message: m2)
check(wire.count == 40 + 12 + "swift ratchet two".utf8.count + 16, "wire = header+nonce+ct+tag")
let pt2 = try! aliceR.decryptWire(wire: wire)
check(pt2 == Data("swift ratchet two".utf8), "DH-шаг читается через wire")
ok("ratchet: ответ по wire (DH-шаг) + decryptWire")

let restoredMsg = try! ratchetMessageFromWire(wire: wire)
check(restoredMsg.header == m2.header, "fromWire header")
check(restoredMsg.nonce == m2.nonce, "fromWire nonce")
check(restoredMsg.ciphertext == m2.ciphertext, "fromWire ciphertext")
ok("ratchetMessageTo/FromWire — байт-в-байт")

expectMedError("короткий wire — BadHeader", match: badHeaderCase) {
    _ = try ratchetMessageFromWire(wire: Data(repeating: 0, count: 10))
}

let (aliceS, bobS) = ratchetPair(9)
let s1 = try! aliceS.encrypt(plaintext: Data("first".utf8))
let s2 = try! aliceS.encrypt(plaintext: Data("second".utf8))
let ptS2 = try! bobS.decrypt(message: s2)
let ptS1 = try! bobS.decrypt(message: s1)
check(ptS2 == Data("second".utf8), "внеочередное s2")
check(ptS1 == Data("first".utf8), "внеочередное s1 через skip-store")
ok("skip-store: m2 раньше m1, оба читаются")

expectMedError("replay отклоняется (OutOfOrder)", match: outOfOrderCase) {
    _ = try bobS.decrypt(message: s2)
}

let (_, bobN) = ratchetPair(3)
expectMedError("битый nonce ratchet — InvalidArgument", match: invalidArgCase) {
    _ = try bobN.decrypt(message: MedRatchetMessage(header: Data(repeating: 0, count: 40), nonce: Data(repeating: 0, count: 11), ciphertext: Data()))
}

let (aliceT, bobT) = ratchetPair(5)
let t1 = try! aliceT.encrypt(plaintext: Data("tamper me".utf8))
var tamperedBytes = t1.ciphertext
tamperedBytes[tamperedBytes.startIndex] ^= 0xff
let tampered = MedRatchetMessage(header: t1.header, nonce: t1.nonce, ciphertext: tamperedBytes)
expectMedError("tampered ciphertext — Aead", match: aeadCase) {
    _ = try bobT.decrypt(message: tampered)
}

let (_, bobEarly) = ratchetPair(11)
expectMedError("responder до первого сообщения — NotInitialized", match: notInitializedCase) {
    _ = try bobEarly.encrypt(plaintext: Data("too early".utf8))
}

// ---------- save/restore персистентности (feature serde) ----------
let (aliceP, bobP) = ratchetPair(6)
let pm1 = try! aliceP.encrypt(plaintext: Data("persist me".utf8))
_ = try! bobP.decrypt(message: pm1)
let saved = try! bobP.save()
check(!saved.isEmpty, "save вернул непустой буфер")
let bobRestored = try! MedRatchetState.restore(saved: saved)
let pm2 = try! aliceP.encrypt(plaintext: Data("after restore".utf8))
let ptP2 = try! bobRestored.decrypt(message: pm2)
check(ptP2 == Data("after restore".utf8), "диалог продолжается после restore")
ok("ratchet save/restore: диалог продолжается после рестарта")

expectMedError("replay после restore отклоняется (OutOfOrder)", match: outOfOrderCase) {
    _ = try bobRestored.decrypt(message: pm1)
}
expectMedError("restore битого буфера — ошибка, не паника", match: invalidArgCase) {
    _ = try MedRatchetState.restore(saved: Data())
}

// ---------- raw X25519-DH (RFC 7748 §6.1): shared secret этапа 7 ----------
func hexBytes(_ hex: String) -> Data {
    var out = Data()
    var index = hex.startIndex
    while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        let byte = UInt8(hex[index..<next], radix: 16)!
        out.append(byte)
        index = next
    }
    return out
}
let rfcAPriv = "77076d0a7318a57d3c16c17251b26645df4c2e87ebc0992ab177fba51db92c2a"
let rfcAPub = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"
let rfcBPriv = "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb"
let rfcBPub = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f"
let rfcK = "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742"
let dhAB = try! x25519Dh(mySecret: hexBytes(rfcAPriv), theirPublic: hexBytes(rfcBPub))
check(dhAB == hexBytes(rfcK), "x25519Dh KAT (a, B) == K из RFC 7748 §6.1")
let dhBA = try! x25519Dh(mySecret: hexBytes(rfcBPriv), theirPublic: hexBytes(rfcAPub))
check(dhBA == hexBytes(rfcK), "x25519Dh KAT (b, A) == K")
check(try! x25519Dh(mySecret: alice.secretKey, theirPublic: bob.publicKey) ==
      try! x25519Dh(mySecret: bob.secretKey, theirPublic: alice.publicKey),
      "x25519Dh симметричен на сгенерированных парах")
expectMedError("битая длина mySecret — InvalidArgument", match: invalidArgCase) {
    _ = try x25519Dh(mySecret: Data(repeating: 0, count: 31), theirPublic: bob.publicKey)
}
ok("x25519Dh — KAT RFC 7748 §6.1 + симметрия")

// ---------- bcrypt KAT (OpenBSD/crypt_blowfish, вектор U*U) ----------
let katHash = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW"
check(try! bcryptVerify(password: "U*U", hash: katHash) == true, "bcrypt KAT верный пароль")
check(try! bcryptVerify(password: "U*U*", hash: katHash) == false, "bcrypt KAT неверный пароль")
expectMedError("битый bcrypt-хэш — BadHash", match: badHashCase) {
    _ = try bcryptVerify(password: "x", hash: "not-a-bcrypt-hash")
}
ok("bcryptVerify — KAT OpenBSD (U*U) + BadHash")

print("[swift-smoke] все проверки пройдены: " + String(passed))
