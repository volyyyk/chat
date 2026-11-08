import Foundation

// REST-клиент сервера MedChat (контракты — readme_for_AI.md §5):
//   GET  /health
//   POST /api/auth/login → { user, accessToken }
//   GET  /api/auth/me → sanitizeUser
//   GET  /api/chats?limit=50 → { data: [ { id, chatId, title, ... } ] }
//   GET  /api/chats/:id/messages?limit=50 → { data: [Message] } (хронология)
//   POST /api/chats/:id/messages → 201 Message / 402 PAYMENT_REQUIRED
//   GET  /api/chats/:id/keys → { data: [ChatKey] } (активные ключи)
//   POST /api/keys { keyId, publicKey, algorithm, deviceName } (upsert)
//
// accessToken живёт 30 минут; refreshToken сознательно НЕ хранится:
// при протухании access пользователь входит заново. 401 от любой
// точки API сбрасывает токен и возвращает на экран входа
// (onUnauthorized → AppState).

struct ApiError: LocalizedError {
    let status: Int
    let message: String
    
    var errorDescription: String? {
        message.isEmpty ? "HTTP " + String(status) : message
    }
}

func apiErrorMessage(_ error: Error) -> String {
    if let apiError = error as? ApiError {
        return apiError.message
    }
    return error.localizedDescription
}

final class ApiService {
    
    struct UserProfile {
        let id: String
        let email: String
        let firstName: String
        let lastName: String
        let role: String
        
        var displayName: String {
            let name = (firstName + " " + lastName).trimmingCharacters(in: .whitespaces)
            if !name.isEmpty {
                return role.isEmpty ? name : name + " · " + role
            }
            return role.isEmpty ? email : email + " · " + role
        }
    }
    
    struct ChatSummary: Identifiable {
        let id: String
        let chatId: String
        let title: String
        let lastMessageText: String
        let lastMessageAt: String
        let doctorUserId: String?
        let patientUserId: String?
    }
    
    struct ChatMessage: Identifiable {
        let id: String
        let content: String
        let type: String
        let senderId: String
        let senderFirstName: String
        let createdAt: String
        let e2eEnvelope: [String: Any]?
    }
    
    struct ChatKey {
        let userId: String
        let keyId: String
        let publicKey: String
        let algorithm: String
        let deviceName: String
    }
    
    let baseUrl: String
    var token: String?
    var onUnauthorized: (() -> Void)?
    
    init(baseUrl: String) {
        self.baseUrl = baseUrl
    }
    
    static func normalize(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasSuffix("/") {
            value.removeLast()
        }
        return value
    }
    
    private func makeUrl(_ path: String) throws -> URL {
        guard let url = URL(string: baseUrl + path) else {
            throw ApiError(status: 0, message: "некорректный адрес сервера")
        }
        return url
    }
    
    @discardableResult
    func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, authorized: Bool = true) async throws -> Any {
        var urlRequest = URLRequest(url: try makeUrl(path))
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authorized, let token {
            urlRequest.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        }
        if let body {
            urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse else {
            throw ApiError(status: 0, message: "нет HTTP-ответа")
        }
        var json: Any? = nil
        if !data.isEmpty {
            json = try? JSONSerialization.jsonObject(with: data)
        }
        guard (200..<300).contains(http.statusCode) else {
            if authorized, http.statusCode == 401, token != nil {
                token = nil
                onUnauthorized?()
            }
            var message = "HTTP " + String(http.statusCode)
            if let object = json as? [String: Any], let serverMessage = object["message"] as? String {
                message = serverMessage
            }
            throw ApiError(status: http.statusCode, message: message)
        }
        return json ?? [String: Any]()
    }
    
    func health() async throws {
        try await request("/health", authorized: false)
    }
    
    func login(email: String, password: String) async throws -> UserProfile {
        let json = try await request("/api/auth/login", method: "POST", body: ["email": email, "password": password], authorized: false) as? [String: Any] ?? [:]
        guard let accessToken = json["accessToken"] as? String, !accessToken.isEmpty else {
            throw ApiError(status: 0, message: "сервер не вернул accessToken")
        }
        token = accessToken
        return Self.parseUser(json["user"])
    }
    
    func me() async throws -> UserProfile {
        Self.parseUser(try await request("/api/auth/me"))
    }
    
    func chats(limit: Int = 50) async throws -> [ChatSummary] {
        let json = try await request("/api/chats?limit=" + String(limit)) as? [String: Any] ?? [:]
        let rows = json["data"] as? [[String: Any]] ?? []
        return rows.map { row in
            ChatSummary(
                id: Self.anyId(row["id"]) ?? "",
                chatId: Self.anyId(row["chatId"]) ?? Self.anyId(row["id"]) ?? "",
                title: row["title"] as? String ?? "",
                lastMessageText: row["lastMessageText"] as? String ?? "",
                lastMessageAt: row["lastMessageAt"] as? String ?? "",
                doctorUserId: Self.participantId(row["doctor"]),
                patientUserId: Self.participantId(row["patient"]))
        }
    }
    
    func messages(chatId: String, limit: Int = 50) async throws -> [ChatMessage] {
        let json = try await request("/api/chats/" + chatId + "/messages?limit=" + String(limit)) as? [String: Any] ?? [:]
        let rows = json["data"] as? [[String: Any]] ?? []
        return rows.map { row in
            let metadata = row["metadata"] as? [String: Any] ?? [:]
            let sender = row["sender"] as? [String: Any] ?? [:]
            return ChatMessage(
                id: Self.anyId(row["id"]) ?? UUID().uuidString,
                content: row["content"] as? String ?? "",
                type: row["type"] as? String ?? "text",
                senderId: Self.anyId(row["senderId"]) ?? "",
                senderFirstName: sender["firstName"] as? String ?? "",
                createdAt: row["createdAt"] as? String ?? "",
                e2eEnvelope: metadata["e2e"] as? [String: Any])
        }
    }
    
    // Отправка: при E2E content обязан быть пустым (шифр в envelope);
    // 402 PAYMENT_REQUIRED пробрасывается наверх как ApiError.
    func send(chatId: String, content: String, envelope: E2EEnvelope? = nil) async throws {
        var body: [String: Any] = ["content": content, "type": "text", "clientType": "ios"]
        if let envelope {
            body["envelope"] = envelope.json
        }
        try await request("/api/chats/" + chatId + "/messages", method: "POST", body: body)
    }
    
    func chatKeys(chatId: String) async throws -> [ChatKey] {
        let json = try await request("/api/chats/" + chatId + "/keys") as? [String: Any] ?? [:]
        let rows = json["data"] as? [[String: Any]] ?? []
        return rows.compactMap { row in
            guard let userId = Self.anyId(row["userId"]),
                  let keyId = row["keyId"] as? String,
                  let publicKey = row["publicKey"] as? String else { return nil }
            return ChatKey(
                userId: userId,
                keyId: keyId,
                publicKey: publicKey,
                algorithm: row["algorithm"] as? String ?? "x25519-box",
                deviceName: row["deviceName"] as? String ?? "")
        }
    }
    
    func registerKey(keyId: String, publicKey: String) async throws {
        try await request("/api/keys", method: "POST", body: [
            "keyId": keyId,
            "publicKey": publicKey,
            "algorithm": "x25519-box",
            "deviceName": "ios"])
    }
    
    private static func parseUser(_ value: Any?) -> UserProfile {
        let row = value as? [String: Any] ?? [:]
        return UserProfile(
            id: anyId(row["id"]) ?? "",
            email: row["email"] as? String ?? "",
            firstName: row["firstName"] as? String ?? "",
            lastName: row["lastName"] as? String ?? "",
            role: row["role"] as? String ?? "")
    }
    
    // id в JSON может прийти строкой или числом — нормализуем в String.
    private static func anyId(_ value: Any?) -> String? {
        if let string = value as? String { return string }
        if let number = value as? NSNumber { return number.stringValue }
        return nil
    }
    
    // Участник чата приходит как { userId } или { user: { id } } —
    // зеркально chatParticipants() desktop-клиента.
    private static func participantId(_ value: Any?) -> String? {
        guard let row = value as? [String: Any] else { return nil }
        if let direct = anyId(row["userId"]) { return direct }
        if let nested = row["user"] as? [String: Any] {
            return anyId(nested["id"])
        }
        return nil
    }
}
