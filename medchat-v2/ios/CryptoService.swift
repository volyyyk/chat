import Foundation

// E2E-конверты x25519-box (этап 7): модель та же, что в мобильном клиенте
// (e2eCryptoService.js) и desktop (e2e_seal/e2e_open в main.rs).
// Криптография — ядро medchat-core через сгенерированную обвязку
// (generateKeypair / sealForRecipients / openSealed); wire-формат
// байт-в-байт совместим с tweetnacl мобильного клиента (контракт-вектор
// 1ce9516): { v: 1, alg: "x25519-box", epk, nonce, boxes: { [userId]: b64 } }.
// Приватный ключ живёт ТОЛЬКО в Keychain (сервис medchat.e2e,
// AfterFirstUnlockThisDeviceOnly) и никогда не покидает устройство;
// сервер получает один публичный ключ (POST /api/keys, upsert по
// (userId, keyId)).

struct E2EKeyPair {
    let keyId: String
    let publicKeyB64: String
    let secretKeyB64: String
}

struct E2EEnvelope {
    let v: Int
    let alg: String
    let epk: String
    let nonce: String
    let boxes: [String: String]
    
    var json: [String: Any] {
        ["v": v, "alg": alg, "epk": epk, "nonce": nonce, "boxes": boxes]
    }
}

final class CryptoService {
    private let userId: String
    
    init(userId: String) {
        self.userId = userId
    }
    
    // Пара ключей устройства: из Keychain или генерация в ядре Rust.
    // keyId вида ios-<uuid> — как device-* у мобилки и desktop-* у desktop:
    // уникален в реестре (userId, keyId), upsert при каждом старте.
    func getOrCreateKeyPair() -> E2EKeyPair? {
        let storageKey = "e2e." + userId
        if let raw = KeychainStore.get(storageKey, service: KeychainStore.e2eService) {
            if let pair = Self.decodeRecord(raw) { return pair }
        }
        let generated = generateKeypair()
        let keyId = "ios-" + UUID().uuidString.lowercased()
        let pair = E2EKeyPair(
            keyId: keyId,
            publicKeyB64: generated.publicKey.base64EncodedString(),
            secretKeyB64: generated.secretKey.base64EncodedString())
        guard let raw = Self.encodeRecord(pair) else { return nil }
        guard KeychainStore.set(raw, key: storageKey, service: KeychainStore.e2eService) else { return nil }
        return pair
    }
    
    private static func encodeRecord(_ pair: E2EKeyPair) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: [
            "keyId": pair.keyId,
            "publicKey": pair.publicKeyB64,
            "secretKey": pair.secretKeyB64]) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    private static func decodeRecord(_ raw: String) -> E2EKeyPair? {
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let keyId = object["keyId"],
              let publicKey = object["publicKey"],
              let secretKey = object["secretKey"] else { return nil }
        return E2EKeyPair(keyId: keyId, publicKeyB64: publicKey, secretKeyB64: secretKey)
    }
    
    // Конверт для отправки: по одному боксу на участника; бокс отправителя
    // обязателен (сервер валидирует). Порядок боксов = порядок ключей.
    func buildEnvelope(plaintext: String, recipients: [(userId: String, publicKeyB64: String)]) -> E2EEnvelope? {
        let keys = recipients.compactMap { Data(base64Encoded: $0.publicKeyB64) }
        guard keys.count == recipients.count, !recipients.isEmpty else { return nil }
        do {
            let sealed = try sealForRecipients(plaintext: Data(plaintext.utf8), recipientPublicKeys: keys)
            var boxes: [String: String] = [:]
            for (index, recipient) in recipients.enumerated() {
                boxes[recipient.userId] = sealed.boxes[index].base64EncodedString()
            }
            return E2EEnvelope(v: 1, alg: "x25519-box", epk: sealed.epk.base64EncodedString(), nonce: sealed.nonce.base64EncodedString(), boxes: boxes)
        } catch {
            return nil
        }
    }
    
    // Расшифровка входящего конверта приватным ключом из Keychain.
    func openEnvelope(_ envelope: E2EEnvelope) -> String? {
        guard let pair = getOrCreateKeyPair(),
              let box = Data(base64Encoded: envelope.boxes[userId] ?? ""),
              let epk = Data(base64Encoded: envelope.epk),
              let nonce = Data(base64Encoded: envelope.nonce),
              let mySecret = Data(base64Encoded: pair.secretKeyB64),
              let myPublic = Data(base64Encoded: pair.publicKeyB64) else { return nil }
        let sealed = MedSealedMessage(epk: epk, nonce: nonce, boxes: [box])
        guard let plain = try? openSealed(sealed: sealed, myPublic: myPublic, mySecret: mySecret) else { return nil }
        return String(data: plain, encoding: .utf8)
    }
    
    // Разбор metadata.e2e из сообщения сервера.
    static func envelopeFrom(_ raw: [String: Any]?) -> E2EEnvelope? {
        guard let raw, raw["v"] as? Int == 1, raw["alg"] as? String == "x25519-box",
              let epk = raw["epk"] as? String,
              let nonce = raw["nonce"] as? String,
              let boxes = raw["boxes"] as? [String: String] else { return nil }
        return E2EEnvelope(v: 1, alg: "x25519-box", epk: epk, nonce: nonce, boxes: boxes)
    }
}
