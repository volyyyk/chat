import Foundation

// Double Ratchet (forward secrecy, этап 7 ROADMAP_NATIVE): сессия одной
// стороны диалога живёт в ядре (MedRatchetState, Mutex внутри), wire-формат
// сообщения header (40) || nonce (12) || ciphertext (+16 тег GCM).
// Склейка с ChatView — зеркало desktop ratchet_encrypt/ratchet_decrypt:
// сессия на каждый ключ собеседника, аккаунт ratchet.<chatId>.<remoteKeyId>;
// ss = x25519Dh(мой identity-секрет, их identity-публичный) — ключи реестра
// UserKey (X3DH-lite без prekeys), роль детерминирована сравнением keyId:
// лексикографически меньший keyId — инициатор (обе стороны сходятся к ролям
// без рукопожатия). Отвечающая сторона не пишет первой (NotInitialized) —
// ChatView честно фолбэчит на обычный E2E-конверт. blob от save() содержит
// СЕКРЕТЫ (root key, цепочки, приватный ratchet-ключ): только Keychain
// (сервис medchat.ratchet, AfterFirstUnlockThisDeviceOnly), никогда
// UserDefaults / файлы / сервер (INTEGRATION_BINDINGS §1).
final class RatchetService {
    private let service = KeychainStore.ratchetService
    private var cache: [String: MedRatchetState] = [:]
    
    static let shared = RatchetService()
    
    // Аккаунт сессии: отдельная сессия на каждый ключ собеседника —
    // смена устройства/ключа не ломает прежние состояния (зеркало desktop).
    private func account(chatId: String, remoteKeyId: String) -> String {
        return "ratchet." + chatId + "." + remoteKeyId
    }
    
    func load(chatId: String, remoteKeyId: String) -> MedRatchetState? {
        let key = account(chatId: chatId, remoteKeyId: remoteKeyId)
        if let cached = cache[key] { return cached }
        guard let b64 = KeychainStore.get(key, service: service),
              let blob = Data(base64Encoded: b64),
              let state = try? MedRatchetState.restore(saved: blob) else { return nil }
        cache[key] = state
        return state
    }
    
    func persist(chatId: String, remoteKeyId: String, state: MedRatchetState) {
        guard let blob = try? state.save() else { return }
        let key = account(chatId: chatId, remoteKeyId: remoteKeyId)
        cache[key] = state
        KeychainStore.set(blob.base64EncodedString(), key: key, service: service)
    }
    
    func remove(chatId: String, remoteKeyId: String) {
        let key = account(chatId: chatId, remoteKeyId: remoteKeyId)
        cache[key] = nil
        KeychainStore.delete(key, service: service)
    }
    
    // Сессия с собеседником: существующая из Keychain или ленивая
    // инициализация (роль по keyId; ss одинаковый у обеих сторон).
    func ensureSession(chatId: String, myPair: E2EKeyPair, remoteKey: ApiService.ChatKey) throws -> MedRatchetState {
        if let existing = load(chatId: chatId, remoteKeyId: remoteKey.keyId) { return existing }
        guard let mySecret = Data(base64Encoded: myPair.secretKeyB64),
              let myPublic = Data(base64Encoded: myPair.publicKeyB64),
              let theirPublic = Data(base64Encoded: remoteKey.publicKey) else {
            throw RatchetGlueError.badKey
        }
        let ss = try x25519Dh(mySecret: mySecret, theirPublic: theirPublic)
        let state: MedRatchetState
        if myPair.keyId < remoteKey.keyId {
            state = try MedRatchetState.initInitiator(sharedSecret: ss, remoteRatchetPublic: theirPublic)
        } else {
            state = try MedRatchetState.initResponder(sharedSecret: ss, myRatchetPublic: myPublic, myRatchetSecret: mySecret)
        }
        persist(chatId: chatId, remoteKeyId: remoteKey.keyId, state: state)
        return state
    }
    
    // Исходящее: шифруем текущим состоянием, персистим, отдаём wire.
    func encrypt(chatId: String, remoteKeyId: String, plaintext: Data, state: MedRatchetState) throws -> Data {
        let wire = try ratchetMessageToWire(message: state.encrypt(plaintext: plaintext))
        persist(chatId: chatId, remoteKeyId: remoteKeyId, state: state)
        return wire
    }
    
    // Входящее: расшифровка wire текущим состоянием, персистим после успеха.
    func decrypt(chatId: String, remoteKeyId: String, wire: Data, state: MedRatchetState) throws -> Data {
        let plain = try state.decryptWire(wire: wire)
        persist(chatId: chatId, remoteKeyId: remoteKeyId, state: state)
        return plain
    }
}

enum RatchetGlueError: Error {
    case badKey
}
