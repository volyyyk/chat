import Foundation

// Double Ratchet (forward secrecy, этап 7 ROADMAP_NATIVE — подготовка):
// сессия одной стороны диалога живёт в ядре (MedRatchetState, Mutex внутри),
// wire-формат сообщения header (40) || nonce (12) || ciphertext (+16 тег GCM).
// blob от save() содержит СЕКРЕТЫ (root key, цепочки, приватный ratchet-ключ):
// только Keychain (сервис medchat.ratchet, AfterFirstUnlockThisDeviceOnly),
// никогда UserDefaults / файлы / сервер (INTEGRATION_BINDINGS §1).
// Склейка с UI-путём отправки — этап 7: пока сообщения идут E2E-конвертами
// x25519-box, этот сервис предоставляет персистентность и шифрование/расшифровку
// wire-формата для будущей интеграции (зеркало ratchet_save/ratchet_load
// в desktop main.rs и secure storage мобилки).
final class RatchetService {
    private let service = KeychainStore.ratchetService
    private var cache: [String: MedRatchetState] = [:]
    
    func load(chatId: String) -> MedRatchetState? {
        if let cached = cache[chatId] { return cached }
        guard let b64 = KeychainStore.get("ratchet." + chatId, service: service),
              let blob = Data(base64Encoded: b64),
              let state = try? MedRatchetState.restore(saved: blob) else { return nil }
        cache[chatId] = state
        return state
    }
    
    func persist(chatId: String, state: MedRatchetState) {
        guard let blob = try? state.save() else { return }
        cache[chatId] = state
        KeychainStore.set(blob.base64EncodedString(), key: "ratchet." + chatId, service: service)
    }
    
    func remove(chatId: String) {
        cache[chatId] = nil
        KeychainStore.delete("ratchet." + chatId, service: service)
    }
    
    // Исходящее: шифруем текущим состоянием, персистим, отдаём wire.
    func encrypt(chatId: String, plaintext: Data, state: MedRatchetState) throws -> Data {
        let wire = try ratchetMessageToWire(message: state.encrypt(plaintext: plaintext))
        persist(chatId: chatId, state: state)
        return wire
    }
    
    // Входящее: расшифровка wire текущим состоянием, персистим после успеха.
    func decrypt(chatId: String, wire: Data, state: MedRatchetState) throws -> Data {
        let plain = try state.decryptWire(wire: wire)
        persist(chatId: chatId, state: state)
        return plain
    }
}
