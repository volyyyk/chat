import Foundation
import Security

// Keychain — системное хранилище секретов iOS-клиента (зеркало
// secure_store desktop: Credential Manager / libsecret; INTEGRATION_BINDINGS
// §1: секреты только в secure storage платформы). Записи — generic password:
//   сервис medchat.app     — токен, адрес сервера, email последнего входа;
//   сервис medchat.e2e     — пары ключей устройства (приватный ключ НИКОГДА
//                            не покидает устройство);
//   сервис medchat.ratchet — блобы Double Ratchet (save(): root key, цепочки,
//                            приватный ratchet-ключ).
// Доступность AfterFirstUnlockThisDeviceOnly: после первой разблокировки,
// только это устройство (не переносится в бэкапы на другое устройство).

enum KeychainStore {
    static let appService = "medchat.app"
    static let e2eService = "medchat.e2e"
    static let ratchetService = "medchat.ratchet"
    
    @discardableResult
    static func set(_ value: String, key: String, service: String = appService) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }
    
    static func get(_ key: String, service: String = appService) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    @discardableResult
    static func delete(_ key: String, service: String = appService) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
