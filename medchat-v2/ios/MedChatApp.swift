import SwiftUI

// MedChat iOS — каркас SwiftUI-клиента (этап 3 ч.2 ROADMAP_NATIVE).
// Зеркалирует desktop-клиент (medchat-v2/desktop/ui/index.html):
// connect (адрес сервера, GET /health) → login (POST /api/auth/login,
// accessToken в Keychain, refresh сознательно не хранится) → main
// (чаты + переписка, E2E-конверты x25519-box при полном покрытии ключами).
// Сборка в Xcode — README_IOS.md; склейка Double Ratchet сделана
// (этап 7: RatchetService + ChatView — зеркало desktop).

enum AppScreen {
    case connect
    case login
    case main
}

@MainActor
final class AppState: ObservableObject {
    @Published var screen: AppScreen = .connect
    @Published var server: String = ""
    @Published var user: ApiService.UserProfile?
    @Published var lastError: String = ""
    @Published var e2eEnabled = false
    
    var api: ApiService?
    var crypto: CryptoService?
    
    init() {
        let savedServer = KeychainStore.get("server") ?? ""
        let savedToken = KeychainStore.get("token") ?? ""
        if !savedServer.isEmpty {
            server = savedServer
        }
        if !savedServer.isEmpty && !savedToken.isEmpty {
            _ = Task { await restoreSession(token: savedToken) }
        } else if !savedServer.isEmpty {
            screen = .login
        }
    }
    
    private func restoreSession(token: String) async {
        let service = ApiService(baseUrl: server)
        service.token = token
        wireUnauthorized(service)
        do {
            let profile = try await service.me()
            api = service
            user = profile
            await ensureE2EKey()
            screen = .main
        } catch {
            api = nil
            crypto = nil
            e2eEnabled = false
            screen = .login
        }
    }
    
    func connect(to rawUrl: String) async {
        lastError = ""
        let normalized = ApiService.normalize(rawUrl)
        guard !normalized.isEmpty else {
            lastError = "Введите адрес сервера"
            return
        }
        let probe = ApiService(baseUrl: normalized)
        do {
            try await probe.health()
        } catch {
            lastError = "Сервер недоступен: " + apiErrorMessage(error)
            return
        }
        server = normalized
        KeychainStore.set(normalized, key: "server")
        screen = .login
    }
    
    func login(email: String, password: String) async {
        lastError = ""
        guard !email.isEmpty, !password.isEmpty else {
            lastError = "Введите email и пароль"
            return
        }
        let service = ApiService(baseUrl: server)
        do {
            let profile = try await service.login(email: email, password: password)
            KeychainStore.set(service.token ?? "", key: "token")
            KeychainStore.set(email, key: "email")
            wireUnauthorized(service)
            api = service
            user = profile
            await ensureE2EKey()
            screen = .main
        } catch {
            lastError = "Ошибка входа: " + apiErrorMessage(error)
        }
    }
    
    // Пара ключей устройства в Keychain + регистрация ПУБЛИЧНОГО ключа
    // (POST /api/keys, upsert по (userId, keyId)). Не зарегистрировалась —
    // E2E отключён, чат работает в plaintext («чат никогда не ломается»).
    func ensureE2EKey() async {
        crypto = nil
        e2eEnabled = false
        guard let profile = user, let service = api else { return }
        let cryptoService = CryptoService(userId: profile.id)
        guard let pair = cryptoService.getOrCreateKeyPair() else { return }
        do {
            try await service.registerKey(keyId: pair.keyId, publicKey: pair.publicKeyB64)
            crypto = cryptoService
            e2eEnabled = true
        } catch {
            crypto = nil
            e2eEnabled = false
        }
    }
    
    func logout() {
        KeychainStore.delete("token")
        api = nil
        user = nil
        crypto = nil
        e2eEnabled = false
        lastError = ""
        screen = .login
    }
    
    private func wireUnauthorized(_ service: ApiService) {
        service.onUnauthorized = { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                KeychainStore.delete("token")
                self.api = nil
                self.user = nil
                self.crypto = nil
                self.e2eEnabled = false
                self.lastError = "Сессия истекла, войдите заново"
                self.screen = .login
            }
        }
    }
}

@main
struct MedChatApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppState
    
    var body: some View {
        switch app.screen {
        case .connect:
            ConnectView()
        case .login:
            LoginView()
        case .main:
            ChatListView()
        }
    }
}
